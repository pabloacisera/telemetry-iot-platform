import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import * as mqtt from 'mqtt';
import { TelemetryEventDto } from './dto/telemetry-event.dto';
import { TelemetryEvaluationService } from './telemetry-evaluation.service';
import { StatusTransitionService } from './status-transition.service';
import { CommandService } from '../command/command.service';
import { RealtimeGateway } from '../realtime';
import { PrismaService } from '../prisma';

/**
 * MQTT subscriber — the backend's connection to the broker.
 *
 * Subscribes to telemetry, status (LWT), command acks, and restart-progress.
 * Validates incoming payloads via DTO and delegates evaluation to the
 * TelemetryEvaluationService orchestrator.
 *
 * Configured with clean_session=false for QoS 1 redelivery on reconnection.
 */
@Injectable()
export class TelemetryConsumerService implements OnModuleInit, OnModuleDestroy {
  private client!: mqtt.MqttClient;
  private readonly logger = new Logger(TelemetryConsumerService.name);

  /** Grace window timers: motor_id → timeout handle. */
  private disconnectionTimers: Map<number, NodeJS.Timeout> = new Map();

  /**
   * Motors that sent an "online" status but whose health is not yet confirmed
   * by real telemetry. An "online" claim alone is NOT proof of health: a device
   * can reconnect to the broker while its firmware is stuck/powered off. Only
   * actual telemetry (handled in handleTelemetry) clears this set and moves the
   * motor to healthy.
   */
  private pendingOnlineConfirmation: Set<number> = new Set();

  /** Lookup: "motorId:sensorType" → motor_sensor_id. */
  private sensorLookup: Map<string, number> = new Map();

  /** Motor connection types: motor_id → "wifi" | "lan". */
  private connectionTypes: Map<number, string> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly evaluationService: TelemetryEvaluationService,
    private readonly statusTransition: StatusTransitionService,
    private readonly commandService: CommandService,
    private readonly realtime: RealtimeGateway,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.buildLookups();
    // Arm the liveness watchdog for every known motor from the start, so a
    // backend restart immediately begins detecting motors that report nothing.
    for (const motorId of this.connectionTypes.keys()) {
      this.startDisconnectionTimer(motorId);
    }
    this.connectToBroker();
  }

  onModuleDestroy(): void {
    if (this.client) this.client.end();
  }

  /** Build lookup maps from the database (motor_sensor_id and connection types). */
  private async buildLookups(): Promise<void> {
    const sensors = await this.prisma.motorSensor.findMany({
      include: { motor: true },
    });

    for (const sensor of sensors) {
      this.sensorLookup.set(
        `${sensor.motorId}:${sensor.sensorType}`,
        sensor.id,
      );
      this.connectionTypes.set(sensor.motorId, sensor.motor.connectionType);
    }

    this.logger.log(`Lookups built: ${this.sensorLookup.size} sensors`);
  }

  /**
   * Register a newly created motor into the lookup maps (hot-reload).
   * Called by MotorConfigService after creating a motor, so we can
   * process its telemetry without restarting the backend.
   */
  async registerMotor(motorId: number): Promise<void> {
    const sensors = await this.prisma.motorSensor.findMany({
      where: { motorId },
      include: { motor: true },
    });

    for (const sensor of sensors) {
      this.sensorLookup.set(
        `${sensor.motorId}:${sensor.sensorType}`,
        sensor.id,
      );
      this.connectionTypes.set(sensor.motorId, sensor.motor.connectionType);
    }

    // Also register in the evaluation service
    await this.evaluationService.registerMotor(motorId);

    this.logger.log(
      `Hot-registered motor ${motorId}: ${sensors.length} sensors added to lookups`,
    );
  }

  /**
   * Unregister a motor from lookups (hot-reload on delete).
   */
  unregisterMotor(motorId: number): void {
    for (const sensorType of ['temperature', 'vibration', 'current']) {
      this.sensorLookup.delete(`${motorId}:${sensorType}`);
    }
    this.connectionTypes.delete(motorId);
    this.evaluationService.unregisterMotor(motorId);
    this.logger.log(`Hot-unregistered motor ${motorId} from lookups`);
  }

  /** Connect to MQTT broker with persistent session. */
  private connectToBroker(): void {
    const host = this.configService.get<string>(
      'MQTT_BROKER_HOST',
      'localhost',
    );
    const port = this.configService.get<number>('MQTT_BROKER_PORT', 1883);
    const user = this.configService.get<string>(
      'MQTT_BACKEND_USER',
      'backend_service',
    );
    const pass = this.configService.get<string>(
      'MQTT_BACKEND_PASS',
      'backend_dev_pass',
    );

    this.client = mqtt.connect(`mqtt://${host}:${port}`, {
      clientId: 'backend_service',
      username: user,
      password: pass,
      clean: false,
      reconnectPeriod: 1000,
      keepalive: 30,
    });

    this.client.on('connect', () => {
      this.logger.log('Connected to MQTT broker');
      this.subscribe();
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT error: ${err.message}`);
    });

    this.client.on('message', (topic: string, payload: Buffer) => {
      this.handleMessage(topic, payload).catch((err: unknown) => {
        this.logger.error(
          `Message handling error on ${topic}: ${(err as Error).message}`,
        );
      });
    });
  }

  /** Subscribe to all relevant topics. */
  private subscribe(): void {
    this.client.subscribe('plant/motor/+/telemetry', { qos: 1 });
    this.client.subscribe('plant/motor/+/status', { qos: 1 });
    this.client.subscribe('plant/motor/+/restart-progress', { qos: 0 });
    this.client.subscribe('plant/motor/+/cmd/ack', { qos: 1 });
    this.client.subscribe('plant/motor/+/sensor/+/cmd/ack', { qos: 1 });
    this.logger.log(
      'Subscribed to telemetry, status, restart-progress, cmd/ack',
    );
  }

  /** Route messages to the correct handler based on topic. */
  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(payload.toString()) as Record<string, unknown>;
    } catch {
      return;
    }

    if (topic.includes('/telemetry')) {
      await this.handleTelemetry(data);
    } else if (topic.includes('/status') && !topic.includes('/cmd')) {
      await this.handleStatus(data);
    } else if (topic.includes('/restart-progress')) {
      await this.handleRestartProgress(data);
    } else if (topic.includes('/cmd/ack')) {
      this.handleCommandAck(data);
    }
  }

  /** Validate and process a telemetry message. */
  private async handleTelemetry(data: Record<string, unknown>): Promise<void> {
    const dto = plainToInstance(TelemetryEventDto, data);
    const errors = await validate(dto, { whitelist: true });
    if (errors.length > 0) return;

    const recordedAt = new Date(dto.timestamp);
    const motorId = dto.motor_id;

    // Real telemetry is the ground truth for health. If the motor reported
    // "online" earlier but no data had been seen yet, this confirms it.
    if (this.pendingOnlineConfirmation.delete(motorId)) {
      const motor = await this.prisma.motor.findUnique({
        where: { id: motorId },
      });
      if (
        motor &&
        (motor.status === 'manual_shutdown' ||
          motor.status === 'restarting' ||
          motor.status === 'shutting_down')
      ) {
        await this.statusTransition.transitionMotor(
          motorId,
          motor.status,
          'healthy',
        );
        // Update in-memory status + reset evaluation window
        this.evaluationService.setMotorStatus(motorId, 'healthy');
        this.evaluationService.resetWindow(motorId);
        this.logger.log(`Motor ${motorId}: healthy confirmed by telemetry`);
      }
    }

    // Motor is alive: (re)arm the liveness watchdog.
    this.startDisconnectionTimer(motorId);

    if (dto.temperature_c !== undefined) {
      const id = this.sensorLookup.get(`${motorId}:temperature`);
      if (id)
        await this.evaluationService.evaluateReading(
          id,
          dto.temperature_c,
          recordedAt,
        );
    }
    if (dto.vibration_mm_s !== undefined) {
      const id = this.sensorLookup.get(`${motorId}:vibration`);
      if (id)
        await this.evaluationService.evaluateReading(
          id,
          dto.vibration_mm_s,
          recordedAt,
        );
    }
    if (dto.current_a !== undefined) {
      const id = this.sensorLookup.get(`${motorId}:current`);
      if (id)
        await this.evaluationService.evaluateReading(
          id,
          dto.current_a,
          recordedAt,
        );
    }
  }

  /** Handle LWT online/offline status messages. */
  private async handleStatus(data: Record<string, unknown>): Promise<void> {
    const motorId = data.motor_id as number;
    const state = data.state as string;

    if (!motorId) return;

    if (state === 'offline') {
      // Get current motor status from DB for proper transition
      const motor = await this.prisma.motor.findUnique({
        where: { id: motorId },
      });
      if (motor && motor.status !== 'manual_shutdown') {
        await this.statusTransition.transitionMotor(
          motorId,
          motor.status,
          'manual_shutdown',
        );
        // Update in-memory status in evaluation service
        this.evaluationService.setMotorStatus(motorId, 'manual_shutdown');
      }
    } else if (state === 'online') {
      // An "online" claim alone is not proof of health: a device can reconnect
      // while its firmware is stuck or it was left powered off. Require the
      // first real telemetry message to transition the motor to healthy.
      this.pendingOnlineConfirmation.add(motorId);
      // Arm the liveness watchdog: if no telemetry arrives within the grace
      // window, the motor is marked offline again.
      this.startDisconnectionTimer(motorId);
      this.logger.log(
        `Motor ${motorId}: online received, awaiting telemetry to confirm healthy`,
      );
    }
  }

  /** Forward restart-progress to WebSocket clients and update motor status. */
  private async handleRestartProgress(
    data: Record<string, unknown>,
  ): Promise<void> {
    const motorId = data.motor_id as number;
    const secondsRemaining = data.seconds_remaining as number;

    if (!motorId) return;

    // On first progress event, transition to 'restarting' in DB
    if (secondsRemaining >= 99) {
      const motor = await this.prisma.motor.findUnique({
        where: { id: motorId },
      });
      if (motor && motor.status !== 'restarting') {
        await this.statusTransition.transitionMotor(
          motorId,
          motor.status,
          'restarting',
        );
      }
    }

    this.realtime.emitRestartProgress(motorId, {
      motorId,
      secondsRemaining,
    });

    // Motor is alive while the countdown runs: keep the watchdog armed.
    // (Each progress message re-arms the timer, so a stalled countdown with no
    // further progress lets the watchdog fire and mark the motor offline.)
    this.startDisconnectionTimer(motorId);

    // When countdown finishes, the 'online' status message will trigger transition to 'healthy'
  }

  /**
   * Arm the liveness watchdog for a motor. Each time real data arrives
   * (telemetry or restart-progress) the timer is re-armed. If it fires, the
   * motor has been silent beyond the grace window and is marked offline.
   *
   * The grace window must exceed the telemetry interval (15s) to avoid false
   * positives.
   */
  private startDisconnectionTimer(motorId: number): void {
    this.clearDisconnectionTimer(motorId);

    const graceMs = this.configService.get<number>(
      'MQTT_DISCONNECT_GRACE_MS',
      30_000,
    );

    const timer = setTimeout(() => {
      void (async () => {
        const motor = await this.prisma.motor.findUnique({
          where: { id: motorId },
          select: { status: true },
        });
        if (!motor) return;

        // Already offline: nothing to do.
        if (motor.status === 'manual_shutdown') return;

        // In restarting/shutting_down this means the countdown stalled (no
        // progress re-armed the timer): treat the motor as gone.
        await this.statusTransition.transitionMotor(
          motorId,
          motor.status,
          'manual_shutdown',
        );
        // Update in-memory status in evaluation service
        this.evaluationService.setMotorStatus(motorId, 'manual_shutdown');
        this.pendingOnlineConfirmation.delete(motorId);

        for (const [key, sensorId] of this.sensorLookup.entries()) {
          if (key.startsWith(`${motorId}:`)) {
            await this.evaluationService.onSensorDisconnected(sensorId);
          }
        }

        this.logger.warn(
          `Motor ${motorId}: no telemetry for ${graceMs}ms, marked manual_shutdown`,
        );
      })();
    }, graceMs);

    this.disconnectionTimers.set(motorId, timer);
  }

  /** Clear disconnection timer (motor reconnected within grace window). */
  private clearDisconnectionTimer(motorId: number): void {
    const timer = this.disconnectionTimers.get(motorId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectionTimers.delete(motorId);
    }
  }

  /**
   * Handle command acknowledgment from ESP32.
   * Correlates request_id, resolves the pending command, and logs the result.
   * This is confirmation-only — the actual state transition still happens
   * via restart-progress and status (LWT) topics.
   */
  private handleCommandAck(data: Record<string, unknown>): void {
    const requestId = data.request_id as string;
    const status = data.status as string;

    if (!requestId || !status) {
      this.logger.warn(`Malformed cmd/ack: ${JSON.stringify(data)}`);
      return;
    }

    const pending = this.commandService.resolveAck(requestId, status);
    if (!pending) {
      this.logger.debug(`ACK for unknown/expired request_id: ${requestId}`);
      return;
    }

    this.realtime.emitStatusChange(pending.motorId, {
      motorId: pending.motorId,
      event: 'command_ack',
      action: pending.action,
      request_id: requestId,
      status,
      timestamp: new Date().toISOString(),
    });
  }
}
