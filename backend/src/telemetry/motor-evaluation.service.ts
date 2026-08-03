import { Injectable, Logger } from '@nestjs/common';
import { StatusTransitionService } from './status-transition.service';
import { CommandService } from '../command/command.service';
import { CacheService } from '../cache';

/**
 * Motor health evaluation — sliding window + escalation logic.
 *
 * ARCHITECTURE: Redis is the source of truth for all evaluation state.
 * Multiple backend instances can evaluate concurrently without conflicts
 * thanks to Redis atomic operations and distributed locking per motor.
 *
 * Local Maps only hold static metadata (motor statuses, sensor mappings)
 * which are loaded from DB on boot and updated via event handlers.
 *
 * Timers (escalation 2min) still use local setTimeout — on process restart,
 * they are restored from Redis expiry timestamps. For full multi-instance
 * timer coordination, see docs/23-scaling-guide.md (keyspace notifications).
 */
@Injectable()
export class MotorEvaluationService {
  private readonly logger = new Logger(MotorEvaluationService.name);

  /** Escalation timers: motor_id → timeout handle (local, restored from Redis on boot). */
  private escalationTimers: Map<number, NodeJS.Timeout> = new Map();

  /** Current motor statuses (in-memory cache, updated by event handlers). */
  private motorStatuses: Map<number, string> = new Map();

  /** Motor → sensor IDs mapping (static metadata from DB). */
  private motorSensorIds: Map<number, number[]> = new Map();

  constructor(
    private readonly statusTransition: StatusTransitionService,
    private readonly commandService: CommandService,
    private readonly cache: CacheService,
  ) {}

  /** Initialize from DB metadata and restore active timers from Redis. */
  async init(
    motorStatuses: Map<number, string>,
    motorSensorIds: Map<number, number[]>,
  ): Promise<void> {
    this.motorStatuses = motorStatuses;
    this.motorSensorIds = motorSensorIds;

    // Restore escalation timers from Redis
    await this.restoreEscalationTimers();
  }

  /** Restore and re-schedule escalation timers from Redis. */
  private async restoreEscalationTimers(): Promise<void> {
    try {
      const savedTimers = await this.cache.restoreEscalationTimers();
      for (const [motorId, expiresAt] of savedTimers) {
        const remaining = expiresAt - Date.now();
        if (remaining > 0) {
          this.scheduleEscalation(motorId, remaining);
        } else {
          // Expired while down — execute now
          this.checkEscalation(motorId).catch((err) => {
            this.logger.error(`Restored escalation failed motor ${motorId}: ${err.message}`);
          });
        }
      }
      if (savedTimers.size > 0) {
        this.logger.log(`Restored ${savedTimers.size} escalation timers from Redis`);
      }
    } catch (err) {
      this.logger.warn(`Failed to restore timers: ${(err as Error).message}`);
    }
  }

  /** Get current motor status from in-memory cache. */
  getMotorStatus(motorId: number): string {
    return this.motorStatuses.get(motorId) || 'healthy';
  }

  /** Update in-memory motor status. */
  setMotorStatus(motorId: number, status: string): void {
    this.motorStatuses.set(motorId, status);
  }

  /** Reset sliding windows for all sensors of a motor (after restart). */
  async resetWindow(motorId: number): Promise<void> {
    const sensorIds = this.motorSensorIds.get(motorId) || [];
    for (const id of sensorIds) {
      await this.cache.clearWindow(id);
    }
    await this.cache.persistAutoRestartUsed(motorId, false);
    this.clearEscalationTimer(motorId);
  }

  /**
   * Push a reading result and evaluate motor transitions.
   * Uses distributed lock to prevent concurrent evaluation of the same motor.
   */
  async pushReading(
    motorSensorId: number,
    motorId: number,
    isAnomalous: boolean,
    isCritical: boolean,
  ): Promise<void> {
    // Acquire lock (short TTL — just for this evaluation cycle)
    const locked = await this.cache.acquireMotorLock(motorId);
    if (!locked) return; // Another instance is evaluating this motor right now

    try {
      // Push to sliding window in Redis (atomic, keeps max 8)
      const window = await this.cache.pushToWindow(motorSensorId, isAnomalous);
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
    } finally {
      await this.cache.releaseMotorLock(motorId);
    }
  }

  /** Transition motor to under_review and start escalation timer. */
  private async triggerUnderReview(motorId: number): Promise<void> {
    const current = this.motorStatuses.get(motorId);
    if (current !== 'healthy') return;

    await this.statusTransition.transitionMotor(motorId, current, 'under_review');
    await this.statusTransition.createAlert(motorId, 'warning');
    this.motorStatuses.set(motorId, 'under_review');

    this.startEscalationTimer(motorId);
  }

  /** Start 2-minute escalation timer (persisted to Redis for restore). */
  private startEscalationTimer(motorId: number): void {
    this.clearEscalationTimer(motorId);

    const durationMs = 2 * 60 * 1000;
    const expiresAt = Date.now() + durationMs;

    this.scheduleEscalation(motorId, durationMs);
    this.cache.persistEscalationTimer(motorId, expiresAt).catch(() => {});
  }

  /** Schedule the escalation check with a given delay. */
  private scheduleEscalation(motorId: number, delayMs: number): void {
    const timer = setTimeout(() => {
      this.escalationTimers.delete(motorId);
      this.cache.clearEscalationTimer(motorId).catch(() => {});
      this.checkEscalation(motorId).catch((err) => {
        this.logger.error(`Escalation check failed motor ${motorId}: ${err.message}`);
      });
    }, delayMs);

    this.escalationTimers.set(motorId, timer);
  }

  /** Clear escalation timer (local + Redis). */
  private clearEscalationTimer(motorId: number): void {
    const existing = this.escalationTimers.get(motorId);
    if (existing) {
      clearTimeout(existing);
      this.escalationTimers.delete(motorId);
    }
    this.cache.clearEscalationTimer(motorId).catch(() => {});
  }

  /** Check if motor should be force-restarted or disabled. */
  private async checkEscalation(motorId: number): Promise<void> {
    if (this.motorStatuses.get(motorId) !== 'under_review') return;

    // Check all sensor windows directly from Redis
    const sensorIds = this.motorSensorIds.get(motorId) || [];
    let stillAnomalous = false;
    for (const id of sensorIds) {
      const window = await this.cache.getWindow(id);
      if (window.filter(Boolean).length >= 5) {
        stillAnomalous = true;
        break;
      }
    }

    if (!stillAnomalous) return;

    const alreadyRestarted = await this.cache.getAutoRestartUsed(motorId);

    if (alreadyRestarted) {
      await this.statusTransition.transitionMotor(motorId, 'under_review', 'disabled');
      await this.statusTransition.createAlert(motorId, 'disabled');
      this.motorStatuses.set(motorId, 'disabled');
      return;
    }

    await this.statusTransition.transitionMotor(motorId, 'under_review', 'shutting_down');
    await this.statusTransition.createAlert(motorId, 'forced_restart');
    this.motorStatuses.set(motorId, 'shutting_down');
    await this.commandService.publishRestart(motorId, 'system');
    await this.cache.persistAutoRestartUsed(motorId, true);
  }

  /** Called when motor enters restarting — clears windows in Redis. */
  onMotorRestarting(motorId: number): void {
    this.motorStatuses.set(motorId, 'restarting');
    const sensorIds = this.motorSensorIds.get(motorId) || [];
    for (const id of sensorIds) {
      this.cache.clearWindow(id).catch(() => {});
    }
    this.clearEscalationTimer(motorId);
  }

  /** Called when motor returns to healthy after restart. */
  onMotorHealthy(motorId: number): void {
    this.motorStatuses.set(motorId, 'healthy');
  }

  /** Called when admin/operator manually reactivates a disabled motor. */
  async onMotorReactivated(motorId: number): Promise<void> {
    this.motorStatuses.set(motorId, 'healthy');
    await this.cache.persistAutoRestartUsed(motorId, false);
    const sensorIds = this.motorSensorIds.get(motorId) || [];
    for (const id of sensorIds) {
      await this.cache.clearWindow(id);
    }
  }
}
