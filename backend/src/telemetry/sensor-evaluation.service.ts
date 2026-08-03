import { Injectable, Logger } from '@nestjs/common';
import { StatusTransitionService } from './status-transition.service';
import { MotorEvaluationService } from './motor-evaluation.service';
import { CommandService } from '../command/command.service';

/**
 * Sensor fault detection — independent from motor evaluation.
 *
 * Detects 3 fault types:
 * - out_of_range: reading outside plausible_min/max.
 * - stuck: same value (rounded 1 decimal) for 20 consecutive readings (5 min).
 * - disconnected: no data within grace window (triggered externally).
 *
 * Key rules:
 * - Sensor evaluation is PAUSED during motor shutting_down/restarting.
 * - If all 3 sensors are in fault simultaneously → motor to under_review.
 * - A sensor in fault is auto-restarted (5s); if recurs → fault_persistent.
 */
@Injectable()
export class SensorEvaluationService {
  private readonly logger = new Logger(SensorEvaluationService.name);

  /** Stuck detection: motor_sensor_id → { value, count }. */
  private stuckTrackers: Map<number, { value: number; count: number }> = new Map();

  /** In-memory sensor status cache. */
  private sensorStatuses: Map<number, string> = new Map();

  /** Motor → sensor IDs mapping (shared reference from init). */
  private motorSensorIds: Map<number, number[]> = new Map();

  /** Sensor metadata: motor_sensor_id → { motorId, sensorType }. */
  private sensorMeta: Map<number, { motorId: number; sensorType: string }> = new Map();

  /** Track whether a sensor already used its auto-restart this episode. */
  private autoRestartUsed: Map<number, boolean> = new Map();

  /** Active restart timers: motor_sensor_id → timeout handle. */
  private restartTimers: Map<number, NodeJS.Timeout> = new Map();

  constructor(
    private readonly statusTransition: StatusTransitionService,
    private readonly motorEvaluation: MotorEvaluationService,
    private readonly commandService: CommandService,
  ) {}

  /** Initialize internal state from loaded metadata. */
  init(
    sensorStatuses: Map<number, string>,
    motorSensorIds: Map<number, number[]>,
    sensorMeta?: Map<number, { motorId: number; sensorType: string }>,
  ): void {
    this.sensorStatuses = sensorStatuses;
    this.motorSensorIds = motorSensorIds;
    if (sensorMeta) {
      this.sensorMeta = sensorMeta;
    }

    for (const sensorIds of motorSensorIds.values()) {
      for (const id of sensorIds) {
        this.stuckTrackers.set(id, { value: NaN, count: 0 });
      }
    }
  }

  /** Get current sensor status from in-memory cache. */
  getSensorStatus(motorSensorId: number): string {
    return this.sensorStatuses.get(motorSensorId) || 'ok';
  }

  /** Check if sensor is in fault (readings should be excluded from motor evaluation). */
  isInFault(motorSensorId: number): boolean {
    const status = this.sensorStatuses.get(motorSensorId);
    return status === 'fault' || status === 'fault_persistent';
  }

  /**
   * Evaluate a reading for sensor fault conditions.
   * Should NOT be called if motor is in shutting_down/restarting.
   */
  async evaluateReading(
    motorSensorId: number,
    motorId: number,
    value: number,
    plausibleMin: number,
    plausibleMax: number,
  ): Promise<void> {
    if (this.isInFault(motorSensorId)) return;

    // Out of range check
    if (value < plausibleMin || value > plausibleMax) {
      await this.triggerFault(motorSensorId, motorId, 'out_of_range');
      return;
    }

    // Stuck check: same rounded value for 20 consecutive readings
    const tracker = this.stuckTrackers.get(motorSensorId);
    if (!tracker) return;

    const rounded = Math.round(value * 10) / 10;
    if (rounded === tracker.value) {
      tracker.count++;
      if (tracker.count >= 20) {
        await this.triggerFault(motorSensorId, motorId, 'stuck');
        tracker.count = 0;
      }
    } else {
      tracker.value = rounded;
      tracker.count = 1;
    }
  }

  /** Handle sensor disconnection (called when grace window expires). */
  async onSensorDisconnected(motorSensorId: number, motorId: number): Promise<void> {
    const motorStatus = this.motorEvaluation.getMotorStatus(motorId);
    if (motorStatus === 'shutting_down' || motorStatus === 'restarting') return;

    await this.triggerFault(motorSensorId, motorId, 'disconnected');
  }

  /**
   * Manually restart a sensor that is in fault_persistent.
   * Called from the controller when an operator requests reactivation.
   */
  async manualRestart(motorSensorId: number): Promise<boolean> {
    const status = this.sensorStatuses.get(motorSensorId);
    if (status !== 'fault' && status !== 'fault_persistent') return false;

    const meta = this.sensorMeta.get(motorSensorId);
    if (!meta) return false;

    await this.restoreSensor(motorSensorId, meta.motorId, meta.sensorType);
    this.autoRestartUsed.delete(motorSensorId);
    return true;
  }

  /** Transition sensor to fault, create alert, and schedule auto-restart. */
  private async triggerFault(
    motorSensorId: number,
    motorId: number,
    faultType: string,
  ): Promise<void> {
    // If auto-restart was already used this episode → fault_persistent
    if (this.autoRestartUsed.get(motorSensorId)) {
      await this.statusTransition.transitionSensor(motorSensorId, motorId, 'fault_persistent');
      await this.statusTransition.createSensorFault(motorSensorId, faultType);
      await this.statusTransition.createAlert(motorId, `sensor_fault_persistent`);
      this.sensorStatuses.set(motorSensorId, 'fault_persistent');

      this.logger.warn(
        `Sensor ${motorSensorId} (motor ${motorId}): fault_persistent → ${faultType} (requires manual intervention)`,
      );
      return;
    }

    // First fault: mark as fault, create alert, schedule auto-restart
    await this.statusTransition.transitionSensor(motorSensorId, motorId, 'fault');
    await this.statusTransition.createSensorFault(motorSensorId, faultType);
    await this.statusTransition.createAlert(motorId, `sensor_fault`);
    this.sensorStatuses.set(motorSensorId, 'fault');

    this.logger.warn(
      `Sensor ${motorSensorId} (motor ${motorId}): fault → ${faultType}, auto-restart in 5s`,
    );

    // Schedule auto-restart in 5 seconds
    this.scheduleAutoRestart(motorSensorId, motorId);

    await this.checkWidespreadFailure(motorId);
  }

  /** Schedule automatic sensor restart after 5 seconds. */
  private scheduleAutoRestart(motorSensorId: number, motorId: number): void {
    // Clear any existing timer
    const existing = this.restartTimers.get(motorSensorId);
    if (existing) clearTimeout(existing);

    const meta = this.sensorMeta.get(motorSensorId);
    const sensorType = meta?.sensorType || 'unknown';

    const timer = setTimeout(async () => {
      this.restartTimers.delete(motorSensorId);

      // Only restart if still in fault (not already manually handled)
      if (this.sensorStatuses.get(motorSensorId) !== 'fault') return;

      this.autoRestartUsed.set(motorSensorId, true);
      await this.restoreSensor(motorSensorId, motorId, sensorType);

      this.logger.log(
        `Sensor ${motorSensorId} (motor ${motorId}): auto-restarted`,
      );
    }, 5_000);

    this.restartTimers.set(motorSensorId, timer);
  }

  /** Restore sensor to ok status and publish restart command. */
  private async restoreSensor(
    motorSensorId: number,
    motorId: number,
    sensorType: string,
  ): Promise<void> {
    await this.commandService.publishSensorRestart(motorId, sensorType);
    await this.statusTransition.transitionSensor(motorSensorId, motorId, 'ok');
    this.sensorStatuses.set(motorSensorId, 'ok');

    // Reset stuck tracker
    this.stuckTrackers.set(motorSensorId, { value: NaN, count: 0 });
  }

  /** If all 3 sensors of a motor are in fault → motor transitions to under_review. */
  private async checkWidespreadFailure(motorId: number): Promise<void> {
    const sensorIds = this.motorSensorIds.get(motorId) || [];
    if (sensorIds.length !== 3) return;

    const allFaulted = sensorIds.every((id) => this.isInFault(id));
    if (!allFaulted) return;

    const motorStatus = this.motorEvaluation.getMotorStatus(motorId);
    if (motorStatus !== 'healthy') return;

    await this.statusTransition.transitionMotor(motorId, motorStatus, 'under_review');
    await this.statusTransition.createAlert(motorId, 'sensor_failure_widespread');
    this.logger.warn(`Motor ${motorId}: all 3 sensors in fault → under_review`);
  }
}
