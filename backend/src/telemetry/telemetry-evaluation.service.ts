import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TelemetryRepository } from './telemetry.repository';
import { MotorEvaluationService } from './motor-evaluation.service';
import { SensorEvaluationService } from './sensor-evaluation.service';
import { CacheService } from '../cache';
import { RealtimeGateway } from '../realtime';

/** Sensor metadata loaded on boot. */
interface SensorMeta {
  motorId: number;
  sensorType: string;
  healthyMax: number;
  warningMax: number;
  criticalMax: number;
  plausibleMin: number;
  plausibleMax: number;
  connectionType: string;
}

/**
 * Orchestrator — receives validated telemetry readings and delegates to:
 * - MotorEvaluationService (sliding window, escalation, restart logic).
 * - SensorEvaluationService (fault detection: stuck, OOR, disconnected).
 *
 * Also handles persistence, Redis write-through, and WebSocket emission.
 * This is the single entry point for all telemetry processing.
 */
@Injectable()
export class TelemetryEvaluationService implements OnModuleInit {
  private readonly logger = new Logger(TelemetryEvaluationService.name);

  /** Sensor metadata keyed by motor_sensor_id. */
  private sensorMeta: Map<number, SensorMeta> = new Map();

  /** Plausible ranges by sensor type. */
  private readonly plausibleRanges: Record<
    string,
    { min: number; max: number }
  > = {
    temperature: { min: 10, max: 150 },
    vibration: { min: 0, max: 20 },
    current: { min: 0, max: 100 },
  };

  constructor(
    private readonly repository: TelemetryRepository,
    private readonly motorEval: MotorEvaluationService,
    private readonly sensorEval: SensorEvaluationService,
    private readonly cache: CacheService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Load all sensor metadata on boot and initialize sub-services. */
  async onModuleInit(): Promise<void> {
    const sensors = await this.repository.getAllMotorSensors();

    const motorStatuses = new Map<number, string>();
    const sensorStatuses = new Map<number, string>();
    const motorSensorIds = new Map<number, number[]>();

    for (const sensor of sensors) {
      const range = this.plausibleRanges[sensor.sensorType] || {
        min: 0,
        max: 100,
      };

      this.sensorMeta.set(sensor.id, {
        motorId: sensor.motorId,
        sensorType: sensor.sensorType,
        healthyMax: sensor.healthyMax,
        warningMax: sensor.warningMax,
        criticalMax: sensor.criticalMax,
        plausibleMin: range.min,
        plausibleMax: range.max,
        connectionType: sensor.motor.connectionType,
      });

      sensorStatuses.set(sensor.id, sensor.status);

      if (!motorSensorIds.has(sensor.motorId)) {
        motorSensorIds.set(sensor.motorId, []);
        motorStatuses.set(sensor.motorId, sensor.motor.status);
      }
      motorSensorIds.get(sensor.motorId)!.push(sensor.id);
    }

    await this.motorEval.init(motorStatuses, motorSensorIds);

    // Build simplified sensor meta for SensorEvaluationService
    const sensorMetaSimple = new Map<
      number,
      { motorId: number; sensorType: string }
    >();
    for (const sensor of sensors) {
      sensorMetaSimple.set(sensor.id, {
        motorId: sensor.motorId,
        sensorType: sensor.sensorType,
      });
    }
    this.sensorEval.init(sensorStatuses, motorSensorIds, sensorMetaSimple);

    this.logger.log(
      `Initialized: ${this.sensorMeta.size} sensors, ${motorStatuses.size} motors`,
    );
  }

  /**
   * Main entry point: evaluate a single sensor reading.
   * Called by TelemetryConsumerService for each sensor value in the message.
   */
  async evaluateReading(
    motorSensorId: number,
    value: number,
    recordedAt: Date,
  ): Promise<void> {
    const meta = this.sensorMeta.get(motorSensorId);
    if (!meta) return;

    const motorStatus = this.motorEval.getMotorStatus(meta.motorId);

    // Sensor fault evaluation (paused during motor restart)
    if (motorStatus !== 'shutting_down' && motorStatus !== 'restarting') {
      await this.sensorEval.evaluateReading(
        motorSensorId,
        meta.motorId,
        value,
        meta.plausibleMin,
        meta.plausibleMax,
      );
    }

    // Classify the reading
    const isImplausible =
      value < meta.plausibleMin || value > meta.plausibleMax;
    const isCritical = !isImplausible && value > meta.criticalMax;
    const isAnomalous =
      !isImplausible && !isCritical && value > meta.warningMax;

    // Persist
    await this.repository.persistReading({
      motorSensorId,
      value,
      isAnomalous: isAnomalous || isCritical,
      isImplausible,
      recordedAt,
    });

    // Redis write-through
    await this.cache.updateSnapshot(
      motorSensorId,
      value,
      this.sensorEval.getSensorStatus(motorSensorId),
      recordedAt,
    );

    // WebSocket emission
    this.realtime.emitTelemetry(meta.motorId, {
      motorSensorId,
      motorId: meta.motorId,
      sensorType: meta.sensorType,
      value,
      isAnomalous: isAnomalous || isCritical,
      recordedAt: recordedAt.toISOString(),
    });

    // Motor evaluation (only healthy sensors, not during restart)
    if (this.sensorEval.isInFault(motorSensorId)) return;
    if (motorStatus === 'shutting_down' || motorStatus === 'restarting') return;
    if (isImplausible) return;

    await this.motorEval.pushReading(
      motorSensorId,
      meta.motorId,
      isAnomalous || isCritical,
      isCritical,
    );
  }

  /** Handle sensor disconnection (called when grace window expires). */
  async onSensorDisconnected(motorSensorId: number): Promise<void> {
    const meta = this.sensorMeta.get(motorSensorId);
    if (!meta) return;
    await this.sensorEval.onSensorDisconnected(motorSensorId, meta.motorId);
  }

  /** Update in-memory motor status (called by consumer on manual stop/restart). */
  setMotorStatus(motorId: number, status: string): void {
    this.motorEval.setMotorStatus(motorId, status);
  }

  /** Reset evaluation window for a motor (called after restart completes). */
  resetWindow(motorId: number): void {
    void this.motorEval.resetWindow(motorId);
  }

  /**
   * Register a newly created motor into evaluation maps (hot-reload).
   * Loads sensor metadata from DB and registers in sub-services.
   */
  async registerMotor(motorId: number): Promise<void> {
    const sensors = await this.repository.getMotorSensors(motorId);

    const sensorIds: number[] = [];

    for (const sensor of sensors) {
      const range = this.plausibleRanges[sensor.sensorType] || {
        min: 0,
        max: 100,
      };

      this.sensorMeta.set(sensor.id, {
        motorId: sensor.motorId,
        sensorType: sensor.sensorType,
        healthyMax: sensor.healthyMax,
        warningMax: sensor.warningMax,
        criticalMax: sensor.criticalMax,
        plausibleMin: range.min,
        plausibleMax: range.max,
        connectionType: sensor.motor.connectionType,
      });

      sensorIds.push(sensor.id);
    }

    // Register in motor evaluation
    this.motorEval.registerMotor(motorId, sensorIds);

    // Register in sensor evaluation
    for (const sensor of sensors) {
      this.sensorEval.registerSensor(sensor.id, motorId, sensor.sensorType);
    }

    this.logger.log(
      `Hot-registered motor ${motorId}: ${sensors.length} sensors in evaluation`,
    );
  }

  /**
   * Unregister a motor from evaluation maps (hot-reload on delete).
   */
  unregisterMotor(motorId: number): void {
    // Remove all sensor metadata for this motor
    for (const [sensorId, meta] of this.sensorMeta.entries()) {
      if (meta.motorId === motorId) {
        this.sensorMeta.delete(sensorId);
        this.sensorEval.unregisterSensor(sensorId);
      }
    }
    this.motorEval.unregisterMotor(motorId);
    this.logger.log(`Hot-unregistered motor ${motorId} from evaluation`);
  }

  /**
   * Update sensor thresholds in-memory (hot-reload on config change).
   * Called by MotorConfigService after persisting new thresholds to DB.
   */
  updateSensorThresholds(
    sensorId: number,
    thresholds: { healthyMax?: number; warningMax?: number; criticalMax?: number },
  ): void {
    const meta = this.sensorMeta.get(sensorId);
    if (!meta) return;

    if (thresholds.healthyMax !== undefined) meta.healthyMax = thresholds.healthyMax;
    if (thresholds.warningMax !== undefined) meta.warningMax = thresholds.warningMax;
    if (thresholds.criticalMax !== undefined) meta.criticalMax = thresholds.criticalMax;

    this.logger.log(
      `Thresholds updated in-memory for sensor ${sensorId}: ` +
      `healthy<${meta.healthyMax} warning<${meta.warningMax} critical<${meta.criticalMax}`,
    );
  }
}
