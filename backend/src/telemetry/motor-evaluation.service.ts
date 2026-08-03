import { Injectable, Logger } from '@nestjs/common';
import { StatusTransitionService } from './status-transition.service';
import { CommandService } from '../command/command.service';
import { CacheService } from '../cache';

/**
 * Motor health evaluation — sliding window + escalation logic.
 *
 * State is persisted to Redis (write-through) so it survives process restarts.
 * On boot, state is restored from Redis. If no state exists, starts fresh.
 */
@Injectable()
export class MotorEvaluationService {
  private readonly logger = new Logger(MotorEvaluationService.name);

  /** Sliding window: motor_sensor_id → circular buffer of booleans. */
  private windows: Map<number, boolean[]> = new Map();

  /** Escalation timers: motor_id → timeout handle. */
  private escalationTimers: Map<number, NodeJS.Timeout> = new Map();

  /** Escalation expiry: motor_id → timestamp (for persistence). */
  private escalationExpiry: Map<number, number> = new Map();

  /** Whether auto-restart was already used this episode: motor_id → boolean. */
  private autoRestartUsed: Map<number, boolean> = new Map();

  /** Current motor statuses (in-memory cache to avoid DB reads per reading). */
  private motorStatuses: Map<number, string> = new Map();

  /** Motor → sensor IDs mapping. */
  private motorSensorIds: Map<number, number[]> = new Map();

  constructor(
    private readonly statusTransition: StatusTransitionService,
    private readonly commandService: CommandService,
    private readonly cache: CacheService,
  ) {}

  /** Initialize internal state from loaded metadata and restore from Redis. */
  async init(
    motorStatuses: Map<number, string>,
    motorSensorIds: Map<number, number[]>,
  ): Promise<void> {
    this.motorStatuses = motorStatuses;
    this.motorSensorIds = motorSensorIds;

    // Initialize empty windows for all sensors
    for (const sensorIds of motorSensorIds.values()) {
      for (const id of sensorIds) {
        this.windows.set(id, []);
      }
    }

    // Restore state from Redis
    await this.restoreState();
  }

  /** Restore persisted state from Redis. */
  private async restoreState(): Promise<void> {
    try {
      // Restore sliding windows
      const savedWindows = await this.cache.restoreWindows();
      for (const [sensorId, window] of savedWindows) {
        if (this.windows.has(sensorId)) {
          this.windows.set(sensorId, window);
        }
      }

      // Restore auto-restart flags
      const savedAutoRestart = await this.cache.restoreAutoRestartUsed();
      for (const [motorId, used] of savedAutoRestart) {
        this.autoRestartUsed.set(motorId, used);
      }

      // Restore and re-schedule escalation timers
      const savedTimers = await this.cache.restoreEscalationTimers();
      for (const [motorId, expiresAt] of savedTimers) {
        const remaining = expiresAt - Date.now();
        if (remaining > 0) {
          this.scheduleEscalation(motorId, remaining);
          this.escalationExpiry.set(motorId, expiresAt);
        } else {
          // Timer already expired while process was down — execute now
          this.checkEscalation(motorId).catch((err) => {
            this.logger.error(`Restored escalation failed for motor ${motorId}: ${err.message}`);
          });
        }
      }

      if (savedWindows.size > 0 || savedAutoRestart.size > 0 || savedTimers.size > 0) {
        this.logger.log(
          `State restored: ${savedWindows.size} windows, ${savedAutoRestart.size} auto-restart flags, ${savedTimers.size} escalation timers`,
        );
      }
    } catch (err) {
      this.logger.warn(`Failed to restore state from Redis (starting fresh): ${(err as Error).message}`);
    }
  }

  /** Get current motor status from in-memory cache. */
  getMotorStatus(motorId: number): string {
    return this.motorStatuses.get(motorId) || 'healthy';
  }

  /** Update in-memory motor status (called when external events change status). */
  setMotorStatus(motorId: number, status: string): void {
    this.motorStatuses.set(motorId, status);
  }

  /** Reset the sliding window for all sensors of a motor (called after restart). */
  async resetWindow(motorId: number): Promise<void> {
    const sensorIds = this.motorSensorIds.get(motorId);
    if (sensorIds) {
      for (const id of sensorIds) {
        this.windows.set(id, []);
        await this.cache.persistWindow(id, []);
      }
    }
    // Reset auto-restart counter for this motor
    this.autoRestartUsed.delete(motorId);
    await this.cache.persistAutoRestartUsed(motorId, false);

    // Clear escalation timer if any
    this.clearEscalationTimer(motorId);
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

    // Persist window to Redis (fire-and-forget for performance)
    this.cache.persistWindow(motorSensorId, window).catch(() => {});

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
    this.clearEscalationTimer(motorId);

    const durationMs = 2 * 60 * 1000;
    const expiresAt = Date.now() + durationMs;

    this.scheduleEscalation(motorId, durationMs);
    this.escalationExpiry.set(motorId, expiresAt);

    // Persist to Redis
    this.cache.persistEscalationTimer(motorId, expiresAt).catch(() => {});
  }

  /** Schedule the escalation check with a given delay. */
  private scheduleEscalation(motorId: number, delayMs: number): void {
    const timer = setTimeout(() => {
      this.escalationTimers.delete(motorId);
      this.escalationExpiry.delete(motorId);
      this.cache.clearEscalationTimer(motorId).catch(() => {});

      this.checkEscalation(motorId).catch((err) => {
        this.logger.error(`Escalation check failed for motor ${motorId}: ${err.message}`);
      });
    }, delayMs);

    this.escalationTimers.set(motorId, timer);
  }

  /** Clear escalation timer (in-memory + Redis). */
  private clearEscalationTimer(motorId: number): void {
    const existing = this.escalationTimers.get(motorId);
    if (existing) {
      clearTimeout(existing);
      this.escalationTimers.delete(motorId);
    }
    this.escalationExpiry.delete(motorId);
    this.cache.clearEscalationTimer(motorId).catch(() => {});
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
    await this.cache.persistAutoRestartUsed(motorId, true);
  }

  /** Called when motor enters restarting — resets ring buffers. */
  onMotorRestarting(motorId: number): void {
    this.motorStatuses.set(motorId, 'restarting');
    const sensorIds = this.motorSensorIds.get(motorId) || [];
    for (const id of sensorIds) {
      this.windows.set(id, []);
      this.cache.persistWindow(id, []).catch(() => {});
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
    this.autoRestartUsed.set(motorId, false);
    await this.cache.persistAutoRestartUsed(motorId, false);
    const sensorIds = this.motorSensorIds.get(motorId) || [];
    for (const id of sensorIds) {
      this.windows.set(id, []);
      await this.cache.persistWindow(id, []);
    }
  }
}
