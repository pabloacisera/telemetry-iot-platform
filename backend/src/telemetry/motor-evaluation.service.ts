import { Injectable, Logger } from '@nestjs/common';
import { StatusTransitionService } from './status-transition.service';
import { CommandService } from '../command/command.service';

/**
 * Motor state machine evaluation.
 *
 * Manages the sliding window of 8 readings per motor_sensor_id and decides
 * motor state transitions: healthy → under_review → shutting_down → restarting.
 *
 * Key rules:
 * - Warning zone (5/8 anomalous) → under_review.
 * - Critical zone (single reading > critical_max) → immediate under_review.
 * - 2-minute escalation without operator action → forced restart.
 * - 1 auto-restart attempt per episode; recurrence → disabled.
 * - Ring buffer resets when motor enters restarting.
 */
@Injectable()
export class MotorEvaluationService {
  private readonly logger = new Logger(MotorEvaluationService.name);

  /** Sliding window: motor_sensor_id → circular buffer of booleans. */
  private windows: Map<number, boolean[]> = new Map();

  /** Escalation timers: motor_id → timeout handle. */
  private escalationTimers: Map<number, NodeJS.Timeout> = new Map();

  /** Whether auto-restart was already used this episode: motor_id → boolean. */
  private autoRestartUsed: Map<number, boolean> = new Map();

  /** Current motor statuses (in-memory cache to avoid DB reads per reading). */
  private motorStatuses: Map<number, string> = new Map();

  /** Motor → sensor IDs mapping. */
  private motorSensorIds: Map<number, number[]> = new Map();

  constructor(
    private readonly statusTransition: StatusTransitionService,
    private readonly commandService: CommandService,
  ) {}

  /** Initialize internal state from loaded metadata. */
  init(
    motorStatuses: Map<number, string>,
    motorSensorIds: Map<number, number[]>,
  ): void {
    this.motorStatuses = motorStatuses;
    this.motorSensorIds = motorSensorIds;

    for (const sensorIds of motorSensorIds.values()) {
      for (const id of sensorIds) {
        this.windows.set(id, []);
      }
    }
  }

  /** Get current motor status from in-memory cache. */
  getMotorStatus(motorId: number): string {
    return this.motorStatuses.get(motorId) || 'healthy';
  }

  /** Push a reading result into the sliding window and evaluate transitions. */
  async pushReading(
    motorSensorId: number,
    motorId: number,
    isAnomalous: boolean,
    isCritical: boolean,
  ): Promise<void> {
    const window = this.windows.get(motorSensorId);
    if (!window) return;

    window.push(isAnomalous);
    if (window.length > 8) window.shift();

    const motorStatus = this.motorStatuses.get(motorId);

    if (isCritical && motorStatus === 'healthy') {
      await this.triggerUnderReview(motorId);
      return;
    }

    if (motorStatus === 'healthy') {
      const anomalousCount = window.filter(Boolean).length;
      if (anomalousCount >= 5) {
        await this.triggerUnderReview(motorId);
      }
    }
  }

  /** Transition motor to under_review and start the 2-min escalation timer. */
  private async triggerUnderReview(motorId: number): Promise<void> {
    const current = this.motorStatuses.get(motorId);
    if (current !== 'healthy') return;

    await this.statusTransition.transitionMotor(motorId, current, 'under_review');
    await this.statusTransition.createAlert(motorId, 'warning');
    this.motorStatuses.set(motorId, 'under_review');

    this.startEscalationTimer(motorId);
  }

  /** Start a 2-minute timer; if still anomalous at expiry → forced restart. */
  private startEscalationTimer(motorId: number): void {
    const existing = this.escalationTimers.get(motorId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.checkEscalation(motorId).catch((err) => {
        this.logger.error(`Escalation check failed for motor ${motorId}: ${err.message}`);
      });
    }, 2 * 60 * 1000);

    this.escalationTimers.set(motorId, timer);
  }

  /** Check if motor should be force-restarted or disabled. */
  private async checkEscalation(motorId: number): Promise<void> {
    if (this.motorStatuses.get(motorId) !== 'under_review') return;

    const sensorIds = this.motorSensorIds.get(motorId) || [];
    const stillAnomalous = sensorIds.some((id) => {
      const window = this.windows.get(id) || [];
      return window.filter(Boolean).length >= 5;
    });

    if (!stillAnomalous) return;

    if (this.autoRestartUsed.get(motorId)) {
      await this.statusTransition.transitionMotor(motorId, 'under_review', 'disabled');
      await this.statusTransition.createAlert(motorId, 'disabled');
      this.motorStatuses.set(motorId, 'disabled');
      return;
    }

    await this.statusTransition.transitionMotor(motorId, 'under_review', 'shutting_down');
    await this.statusTransition.createAlert(motorId, 'forced_restart');
    this.motorStatuses.set(motorId, 'shutting_down');
    await this.commandService.publishRestart(motorId, 'system');
    this.autoRestartUsed.set(motorId, true);
  }

  /** Called when motor enters restarting — resets ring buffers. */
  onMotorRestarting(motorId: number): void {
    this.motorStatuses.set(motorId, 'restarting');
    const sensorIds = this.motorSensorIds.get(motorId) || [];
    for (const id of sensorIds) {
      this.windows.set(id, []);
    }
    const timer = this.escalationTimers.get(motorId);
    if (timer) {
      clearTimeout(timer);
      this.escalationTimers.delete(motorId);
    }
  }

  /** Called when motor returns to healthy after restart. */
  onMotorHealthy(motorId: number): void {
    this.motorStatuses.set(motorId, 'healthy');
  }

  /** Called when admin/operator manually reactivates a disabled motor. */
  onMotorReactivated(motorId: number): void {
    this.motorStatuses.set(motorId, 'healthy');
    this.autoRestartUsed.set(motorId, false);
    const sensorIds = this.motorSensorIds.get(motorId) || [];
    for (const id of sensorIds) {
      this.windows.set(id, []);
    }
  }
}
