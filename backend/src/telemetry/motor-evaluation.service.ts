import { Injectable, Logger } from '@nestjs/common';
import { StatusTransitionService } from './status-transition.service';
import { CommandService } from '../command/command.service';
import { CacheService } from '../cache';

/**
 * Motor health evaluation — industrial alarm/trip model.
 *
 * DESIGN: Each sensor is evaluated independently. When a single sensor sustains
 * anomalous readings (> warningMax) for N consecutive readings, the motor enters
 * ALARM state. A grace timer gives the operator time to intervene. If nobody acts,
 * the system trips (forced restart). A critical reading (> criticalMax) triggers
 * immediate trip without waiting.
 *
 * FLOW:
 *   healthy → alarm (N consecutive anomalous on any sensor)
 *   alarm   → trip  (grace timer expires without resolution)
 *   alarm   → healthy (operator resolves OR readings normalize)
 *   healthy → trip  (critical reading = immediate trip)
 *   trip    → restarting (command sent to motor)
 *   restarting → healthy (motor comes back online)
 *   trip after previous trip → disabled (requires manual reactivation)
 *
 * COOLDOWN: After a restart, the motor enters a 60s cooldown period where the
 * alarm threshold is doubled (2N consecutive readings required). This prevents
 * the trip→restart→trip cycle from happening too rapidly. During cooldown,
 * critical readings ALSO do NOT trip immediately: they feed the consecutive
 * counter instead, so a re-trip can only happen via the alarm + grace timer
 * (giving the operator time). A critical reading only trips immediately once
 * the cooldown has expired.
 *
 * METADATA: Every alarm/trip alert includes cause information (which sensor,
 * what value, what threshold) so the operator always knows what happened.
 */
@Injectable()
export class MotorEvaluationService {
  private readonly logger = new Logger(MotorEvaluationService.name);

  /** Grace timers: motor_id → timeout handle (restored from Redis on boot). */
  private graceTimers: Map<number, NodeJS.Timeout> = new Map();

  /** Current motor statuses (in-memory, synced with DB via transitions). */
  private motorStatuses: Map<number, string> = new Map();

  /** Motor → sensor IDs mapping. */
  private motorSensorIds: Map<number, number[]> = new Map();

  /** Motor → protection params. */
  private motorParams: Map<
    number,
    {
      alarmConsecutiveReadings: number;
      alarmGracePeriodMs: number;
      postRestartCooldownMs: number;
      maxAutoRestarts: number;
    }
  > = new Map();

  /** Per-sensor consecutive anomalous counter (in-memory, backed by Redis). */
  private consecutiveCounters: Map<number, number> = new Map();

  /** Timestamp of last restart per motor (for cooldown). */
  private lastRestartTime: Map<number, number> = new Map();

  constructor(
    private readonly statusTransition: StatusTransitionService,
    private readonly commandService: CommandService,
    private readonly cache: CacheService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════

  async init(
    motorStatuses: Map<number, string>,
    motorSensorIds: Map<number, number[]>,
    motorParams?: Map<
      number,
      {
        alarmConsecutiveReadings: number;
        alarmGracePeriodMs: number;
        postRestartCooldownMs: number;
        maxAutoRestarts: number;
      }
    >,
  ): Promise<void> {
    this.motorStatuses = motorStatuses;
    this.motorSensorIds = motorSensorIds;
    if (motorParams) this.motorParams = motorParams;

    await this.restoreGraceTimers();
  }

  private async restoreGraceTimers(): Promise<void> {
    try {
      const savedTimers = await this.cache.restoreEscalationTimers();
      for (const [motorId, expiresAt] of savedTimers) {
        const remaining = expiresAt - Date.now();
        if (remaining > 0) {
          this.scheduleGraceExpiry(motorId, remaining);
        } else {
          // Expired while backend was down — execute trip now
          this.onGraceExpired(motorId).catch((err: unknown) => {
            this.logger.error(
              `Restored grace timer failed motor ${motorId}: ${(err as Error).message}`,
            );
          });
        }
      }
      if (savedTimers.size > 0) {
        this.logger.log(
          `Restored ${savedTimers.size} grace timer(s) from Redis`,
        );
      }
    } catch (err) {
      this.logger.warn(`Failed to restore timers: ${(err as Error).message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════

  getMotorStatus(motorId: number): string {
    return this.motorStatuses.get(motorId) || 'healthy';
  }

  setMotorStatus(motorId: number, status: string): void {
    this.motorStatuses.set(motorId, status);
  }

  /**
   * Main entry point — called for each non-implausible reading from a healthy sensor.
   * Evaluates whether the motor should alarm or trip based on this individual sensor's behavior.
   */
  async pushReading(
    motorSensorId: number,
    motorId: number,
    isAnomalous: boolean,
    isCritical: boolean,
  ): Promise<void> {
    const locked = await this.cache.acquireMotorLock(motorId);
    if (!locked) return;

    try {
      const motorStatus = this.motorStatuses.get(motorId);

      // ── IMMEDIATE TRIP: critical reading on healthy/alarm motor ──
      // Suppressed during the post-restart cooldown: a critical reading then
      // counts as an anomalous reading (falls through to the counter logic),
      // so the motor can still alarm and trip via the grace timer, but not
      // instantly again right after a restart.
      if (
        isCritical &&
        (motorStatus === 'healthy' || motorStatus === 'alarm') &&
        !this.isInCooldown(motorId)
      ) {
        await this.triggerTrip(motorId, 'critical_reading', motorSensorId);
        return;
      }

      // ── CONSECUTIVE COUNTER LOGIC ──
      if (isAnomalous) {
        const count = (this.consecutiveCounters.get(motorSensorId) || 0) + 1;
        this.consecutiveCounters.set(motorSensorId, count);

        const params = this.motorParams.get(motorId) || {
          alarmConsecutiveReadings: 5,
          alarmGracePeriodMs: 120_000,
        };

        // Post-restart cooldown: require double readings to trigger alarm
        const effectiveThreshold = this.isInCooldown(motorId)
          ? params.alarmConsecutiveReadings * 2
          : params.alarmConsecutiveReadings;

        if (motorStatus === 'healthy' && count >= effectiveThreshold) {
          await this.triggerAlarm(
            motorId,
            motorSensorId,
            params.alarmGracePeriodMs,
            count,
          );
        }
      } else {
        // Normal reading → reset this sensor's counter
        this.consecutiveCounters.set(motorSensorId, 0);

        // If motor is in alarm, check if ALL sensors normalized → cancel alarm
        if (motorStatus === 'alarm') {
          const allNormalized = this.checkAllSensorsNormalized(motorId);
          if (allNormalized) {
            await this.recoverFromAlarm(motorId);
          }
        }
      }
    } finally {
      await this.cache.releaseMotorLock(motorId);
    }
  }

  /** Reset all state for a motor (after restart completes). */
  async resetWindow(motorId: number): Promise<void> {
    const sensorIds = this.motorSensorIds.get(motorId) || [];
    for (const id of sensorIds) {
      this.consecutiveCounters.set(id, 0);
      await this.cache.clearWindow(id);
    }
    await this.cache.persistAutoRestartUsed(motorId, 0);
    this.clearGraceTimer(motorId);
    this.lastRestartTime.set(motorId, Date.now());
    const params = this.motorParams.get(motorId);
    const cooldownFloorMs =
      Number(process.env.POST_RESTART_COOLDOWN_MS) || 300_000;
    const cooldownSec =
      Math.max(params?.postRestartCooldownMs ?? 60_000, cooldownFloorMs) / 1000;
    this.logger.log(
      `Motor ${motorId}: window reset, cooldown started (${cooldownSec}s)`,
    );
  }

  /** Called when motor enters restarting state. */
  onMotorRestarting(motorId: number): void {
    this.motorStatuses.set(motorId, 'restarting');
    const sensorIds = this.motorSensorIds.get(motorId) || [];
    for (const id of sensorIds) {
      this.consecutiveCounters.set(id, 0);
    }
    this.clearGraceTimer(motorId);
  }

  /** Called when motor returns to healthy after restart. */
  onMotorHealthy(motorId: number): void {
    this.motorStatuses.set(motorId, 'healthy');
    this.lastRestartTime.set(motorId, Date.now());
  }

  /** Called when operator manually reactivates a disabled motor. */
  async onMotorReactivated(motorId: number): Promise<void> {
    this.motorStatuses.set(motorId, 'healthy');
    await this.cache.persistAutoRestartUsed(motorId, 0);
    const sensorIds = this.motorSensorIds.get(motorId) || [];
    for (const id of sensorIds) {
      this.consecutiveCounters.set(id, 0);
      await this.cache.clearWindow(id);
    }
    this.lastRestartTime.set(motorId, Date.now());
  }

  /** Operator resolves the alarm manually (cancels grace timer). */
  async resolveAlarm(motorId: number): Promise<void> {
    const status = this.motorStatuses.get(motorId);
    if (status !== 'alarm') return;

    await this.statusTransition.transitionMotor(motorId, 'alarm', 'healthy');
    this.motorStatuses.set(motorId, 'healthy');
    this.clearGraceTimer(motorId);

    // Reset all consecutive counters
    const sensorIds = this.motorSensorIds.get(motorId) || [];
    for (const id of sensorIds) {
      this.consecutiveCounters.set(id, 0);
    }

    this.logger.log(`Motor ${motorId}: alarm resolved by operator`);
  }

  /** Register a new motor (hot-reload). */
  registerMotor(motorId: number, sensorIds: number[]): void {
    this.motorStatuses.set(motorId, 'healthy');
    this.motorSensorIds.set(motorId, sensorIds);
  }

  /** Register motor protection params (hot-reload). */
  setMotorParams(
    motorId: number,
    params: {
      alarmConsecutiveReadings: number;
      alarmGracePeriodMs: number;
      postRestartCooldownMs: number;
      maxAutoRestarts: number;
    },
  ): void {
    this.motorParams.set(motorId, params);
  }

  /** Unregister a motor (hot-reload on delete). */
  unregisterMotor(motorId: number): void {
    this.motorStatuses.delete(motorId);
    this.motorSensorIds.delete(motorId);
    this.motorParams.delete(motorId);
    this.lastRestartTime.delete(motorId);
    this.clearGraceTimer(motorId);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE — ALARM & TRIP LOGIC
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Transition motor to ALARM state.
   * Creates a visible alert with metadata and starts the grace timer.
   */
  private async triggerAlarm(
    motorId: number,
    triggerSensorId: number,
    gracePeriodMs: number,
    consecutiveReadings: number,
  ): Promise<void> {
    const current = this.motorStatuses.get(motorId);
    if (current !== 'healthy') return;

    await this.statusTransition.transitionMotor(motorId, current, 'alarm');
    this.motorStatuses.set(motorId, 'alarm');

    const metadata = {
      triggerSensorId,
      consecutiveReadings,
      gracePeriodMs,
      cause: 'sustained_anomaly',
    };
    await this.statusTransition.createAlert(motorId, 'motor_alarm', metadata);

    this.startGraceTimer(motorId, gracePeriodMs);

    this.logger.warn(
      `Motor ${motorId}: ALARM triggered (sensor ${triggerSensorId}, ${consecutiveReadings} consecutive readings)`,
    );
  }

  /**
   * Transition motor to TRIP — forced restart.
   * If already tripped before, DISABLE instead.
   */
  private async triggerTrip(
    motorId: number,
    reason: string,
    triggerSensorId?: number,
  ): Promise<void> {
    const current = this.motorStatuses.get(motorId);
    this.clearGraceTimer(motorId);

    const params = this.motorParams.get(motorId);
    const maxRestarts = params?.maxAutoRestarts ?? 1;
    const restartCount = await this.cache.getAutoRestartUsed(motorId);

    if (restartCount >= maxRestarts) {
      // Reached max restarts → disable, do NOT restart again
      const metadata = {
        reason,
        triggerSensorId,
        cause: 'recurrence_after_restart',
      };
      await this.statusTransition.transitionMotor(
        motorId,
        current || 'alarm',
        'disabled',
      );
      await this.statusTransition.createAlert(
        motorId,
        'motor_disabled',
        metadata,
      );
      this.motorStatuses.set(motorId, 'disabled');
      this.logger.error(
        `Motor ${motorId}: DISABLED (recurrence after auto-restart, reason: ${reason})`,
      );
      return;
    }

    // First trip → restart
    const metadata = { reason, triggerSensorId, cause: reason };
    await this.statusTransition.transitionMotor(
      motorId,
      current || 'healthy',
      'shutting_down',
    );
    await this.statusTransition.createAlert(motorId, 'motor_trip', metadata);
    this.motorStatuses.set(motorId, 'shutting_down');
    await this.commandService.publishRestart(motorId, 'system');
    await this.cache.persistAutoRestartUsed(motorId, restartCount + 1);

    this.logger.warn(`Motor ${motorId}: TRIP executed (reason: ${reason})`);
  }

  /** Recover from alarm to healthy (readings normalized before grace expired). */
  private async recoverFromAlarm(motorId: number): Promise<void> {
    await this.statusTransition.transitionMotor(motorId, 'alarm', 'healthy');
    this.motorStatuses.set(motorId, 'healthy');
    this.clearGraceTimer(motorId);
    this.logger.log(
      `Motor ${motorId}: alarm auto-cleared (all sensors normalized)`,
    );
  }

  /** Check if all sensors of a motor have 0 consecutive anomalous readings. */
  private checkAllSensorsNormalized(motorId: number): boolean {
    const sensorIds = this.motorSensorIds.get(motorId) || [];
    for (const id of sensorIds) {
      if ((this.consecutiveCounters.get(id) || 0) > 0) return false;
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE — COOLDOWN
  // ═══════════════════════════════════════════════════════════════════

  private isInCooldown(motorId: number): boolean {
    const lastRestart = this.lastRestartTime.get(motorId);
    if (!lastRestart) return false;
    const params = this.motorParams.get(motorId);
    const cooldownFloorMs =
      Number(process.env.POST_RESTART_COOLDOWN_MS) || 300_000;
    const cooldownMs = Math.max(
      params?.postRestartCooldownMs ?? 60_000,
      cooldownFloorMs,
    );
    return Date.now() - lastRestart < cooldownMs;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE — GRACE TIMER
  // ═══════════════════════════════════════════════════════════════════

  private startGraceTimer(motorId: number, durationMs: number): void {
    this.clearGraceTimer(motorId);

    const expiresAt = Date.now() + durationMs;
    this.scheduleGraceExpiry(motorId, durationMs);
    this.cache.persistEscalationTimer(motorId, expiresAt).catch(() => {});
  }

  private scheduleGraceExpiry(motorId: number, delayMs: number): void {
    const timer = setTimeout(() => {
      this.graceTimers.delete(motorId);
      this.cache.clearEscalationTimer(motorId).catch(() => {});
      this.onGraceExpired(motorId).catch((err: unknown) => {
        this.logger.error(
          `Grace expiry failed motor ${motorId}: ${(err as Error).message}`,
        );
      });
    }, delayMs);

    this.graceTimers.set(motorId, timer);
  }

  /** Grace timer expired — operator didn't intervene → TRIP. */
  private async onGraceExpired(motorId: number): Promise<void> {
    const status = this.motorStatuses.get(motorId);
    if (status !== 'alarm') return;

    await this.triggerTrip(motorId, 'grace_timer_expired');
  }

  private clearGraceTimer(motorId: number): void {
    const existing = this.graceTimers.get(motorId);
    if (existing) {
      clearTimeout(existing);
      this.graceTimers.delete(motorId);
    }
    this.cache.clearEscalationTimer(motorId).catch(() => {});
  }
}
