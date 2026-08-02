import { Injectable, Logger } from '@nestjs/common';
import { StatusTransitionService } from './status-transition.service';
import { MotorEvaluationService } from './motor-evaluation.service';

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

  constructor(
    private readonly statusTransition: StatusTransitionService,
    private readonly motorEvaluation: MotorEvaluationService,
  ) {}

  /** Initialize internal state from loaded metadata. */
  init(
    sensorStatuses: Map<number, string>,
    motorSensorIds: Map<number, number[]>,
  ): void {
    this.sensorStatuses = sensorStatuses;
    this.motorSensorIds = motorSensorIds;

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

  /** Transition sensor to fault and check for widespread failure. */
  private async triggerFault(
    motorSensorId: number,
    motorId: number,
    faultType: string,
  ): Promise<void> {
    await this.statusTransition.transitionSensor(motorSensorId, motorId, 'fault');
    await this.statusTransition.createSensorFault(motorSensorId, faultType);
    this.sensorStatuses.set(motorSensorId, 'fault');

    this.logger.warn(
      `Sensor ${motorSensorId} (motor ${motorId}): fault → ${faultType}`,
    );

    await this.checkWidespreadFailure(motorId);
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
