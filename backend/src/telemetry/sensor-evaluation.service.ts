import { Injectable, Logger } from '@nestjs/common';
import { StatusTransitionService } from './status-transition.service';
import { MotorEvaluationService } from './motor-evaluation.service';
import { CommandService } from '../command/command.service';
import { CacheService } from '../cache';

/**
 * Sensor fault detection — independent from motor evaluation.
 *
 * ARCHITECTURE: Redis is the source of truth for stuck trackers and
 * auto-restart flags. Multiple instances can evaluate concurrently.
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

  /** In-memory sensor status cache (updated by transitions). */
  private sensorStatuses: Map<number, string> = new Map();

  /** Motor → sensor IDs mapping (static metadata from DB). */
  private motorSensorIds: Map<number, number[]> = new Map();

  /** Sensor metadata: motor_sensor_id → { motorId, sensorType }. */
  private sensorMeta: Map<number, { motorId: number; sensorType: string }> = new Map();

  /** Active restart timers (local — restored from Redis on boot). */
  private restartTimers: Map<number, NodeJS.Timeout> = new Map();

  constructor(
    private readonly statusTransition: StatusTransitionService,
    private readonly motorEvaluation: MotorEvaluationService,
    private readonly commandService: CommandService,
    private readonly cache: CacheService,
  ) {}

  /** Initialize from DB metadata. */
  async init(
    sensorStatuses: Map<number, string>,
    motorSensorIds: Map<number, number[]>,
    sensorMeta?: Map<number, { motorId: number; sensorType: string }>,
  ): Promise<void> {
    this.sensorStatuses = sensorStatuses;
    this.motorSensorIds = motorSensorIds;
    if (sensorMeta) {
      this.sensorMeta = sensorMeta;
    }
  }

  /** Get current sensor status from in-memory cache. */
  getSensorStatus(motorSensorId: number): string {
    return this.sensorStatuses.get(motorSensorId) || 'ok';
  }

  /** Check if sensor is in fault (readings excluded from motor evaluation). */
  isInFault(motorSensorId: number): boolean {
    const status = this.sensorStatuses.get(motorSensorId);
    return status === 'fault' || status === 'fault_persistent';
  }

  /**
   * Evaluate a reading for sensor fault conditions.
   * Reads stuck tracker from Redis (source of truth).
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

    // Stuck check: read tracker from Redis (single key, O(1))
    const tracker = await this.cache.getStuckTracker(motorSensorId);

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

    await this.cache.persistStuckTracker(motorSensorId, tracker.value, tracker.count);
  }

  /** Handle sensor disconnection (called when grace window expires). */
  async onSensorDisconnected(motorSensorId: number, motorId: number): Promise<void> {
    const motorStatus = this.motorEvaluation.getMotorStatus(motorId);
    if (motorStatus === 'shutting_down' || motorStatus === 'restarting') return;

    await this.triggerFault(motorSensorId, motorId, 'disconnected');
  }

  /**
   * Manually restart a sensor in fault/fault_persistent.
   * Called from controller when operator requests reactivation.
   */
  async manualRestart(motorSensorId: number): Promise<boolean> {
    const status = this.sensorStatuses.get(motorSensorId);
    if (status !== 'fault' && status !== 'fault_persistent') return false;

    const meta = this.sensorMeta.get(motorSensorId);
    if (!meta) return false;

    await this.restoreSensor(motorSensorId, meta.motorId, meta.sensorType);
    await this.cache.persistSensorAutoRestartUsed(motorSensorId, false);
    return true;
  }

  /** Transition sensor to fault, create alert, and schedule auto-restart. */
  private async triggerFault(
    motorSensorId: number,
    motorId: number,
    faultType: string,
  ): Promise<void> {
    // Check auto-restart flag from Redis (source of truth)
    const alreadyRestarted = await this.cache.getSensorAutoRestartUsed(motorSensorId);

    if (alreadyRestarted) {
      // Recurrence after auto-restart → fault_persistent
      await this.statusTransition.transitionSensor(motorSensorId, motorId, 'fault_persistent');
      await this.statusTransition.createSensorFault(motorSensorId, faultType);
      await this.statusTransition.createAlert(motorId, 'sensor_fault_persistent');
      this.sensorStatuses.set(motorSensorId, 'fault_persistent');

      this.logger.warn(
        `Sensor ${motorSensorId} (motor ${motorId}): fault_persistent → ${faultType} (requires manual intervention)`,
      );
      return;
    }

    // First fault: mark, alert, schedule auto-restart
    await this.statusTransition.transitionSensor(motorSensorId, motorId, 'fault');
    await this.statusTransition.createSensorFault(motorSensorId, faultType);
    await this.statusTransition.createAlert(motorId, 'sensor_fault');
    this.sensorStatuses.set(motorSensorId, 'fault');

    this.logger.warn(
      `Sensor ${motorSensorId} (motor ${motorId}): fault → ${faultType}, auto-restart in 5s`,
    );

    this.scheduleAutoRestart(motorSensorId, motorId);
    await this.checkWidespreadFailure(motorId);
  }

  /** Schedule automatic sensor restart after 5 seconds. */
  private scheduleAutoRestart(motorSensorId: number, motorId: number): void {
    const existing = this.restartTimers.get(motorSensorId);
    if (existing) clearTimeout(existing);

    const meta = this.sensorMeta.get(motorSensorId);
    const sensorType = meta?.sensorType || 'unknown';

    const timer = setTimeout(async () => {
      this.restartTimers.delete(motorSensorId);

      if (this.sensorStatuses.get(motorSensorId) !== 'fault') return;

      await this.cache.persistSensorAutoRestartUsed(motorSensorId, true);
      await this.restoreSensor(motorSensorId, motorId, sensorType);

      this.logger.log(`Sensor ${motorSensorId} (motor ${motorId}): auto-restarted`);
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

    // Reset stuck tracker in Redis
    await this.cache.persistStuckTracker(motorSensorId, NaN, 0);
  }

  /** If all 3 sensors of a motor are in fault → motor to under_review. */
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
