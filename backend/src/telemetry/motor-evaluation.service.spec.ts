import { MotorEvaluationService } from './motor-evaluation.service';
import type { StatusTransitionService } from './status-transition.service';
import type { CommandService } from '../command/command.service';
import type { CacheService } from '../cache';

async function flushPromises(): Promise<void> {
  // Each await drains one microtask queue. Multiple chained awaits in async
  // functions create multiple queues, so we flush several times.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('MotorEvaluationService', () => {
  let service: MotorEvaluationService;
  let statusTransition: {
    transitionMotor: jest.Mock;
    createAlert: jest.Mock;
  };
  let commandService: { publishRestart: jest.Mock };
  let cache: {
    acquireMotorLock: jest.Mock;
    releaseMotorLock: jest.Mock;
    pushToWindow: jest.Mock;
    getWindow: jest.Mock;
    clearWindow: jest.Mock;
    getAutoRestartUsed: jest.Mock;
    persistAutoRestartUsed: jest.Mock;
    persistEscalationTimer: jest.Mock;
    clearEscalationTimer: jest.Mock;
    restoreEscalationTimers: jest.Mock;
  };

  // Default protection params: 3 consecutive readings, 500ms grace (for fast tests)
  const PARAMS = {
    alarmConsecutiveReadings: 3,
    alarmGracePeriodMs: 500,
    postRestartCooldownMs: 60000,
    maxAutoRestarts: 1,
  };
  const MOTOR_ID = 1;
  const SENSOR_1 = 1;
  const SENSOR_2 = 2;
  const SENSOR_3 = 3;

  beforeEach(async () => {
    jest.useFakeTimers();

    statusTransition = {
      transitionMotor: jest.fn().mockResolvedValue(undefined),
      createAlert: jest.fn().mockResolvedValue(undefined),
    };
    commandService = {
      publishRestart: jest.fn().mockResolvedValue('req-id'),
    };
    cache = {
      acquireMotorLock: jest.fn().mockResolvedValue(true),
      releaseMotorLock: jest.fn().mockResolvedValue(undefined),
      pushToWindow: jest.fn().mockResolvedValue([]),
      getWindow: jest.fn().mockResolvedValue([]),
      clearWindow: jest.fn().mockResolvedValue(undefined),
      getAutoRestartUsed: jest.fn().mockResolvedValue(0),
      persistAutoRestartUsed: jest.fn().mockResolvedValue(undefined),
      persistEscalationTimer: jest.fn().mockResolvedValue(undefined),
      clearEscalationTimer: jest.fn().mockResolvedValue(undefined),
      restoreEscalationTimers: jest.fn().mockResolvedValue(new Map()),
    };

    service = new MotorEvaluationService(
      statusTransition as unknown as StatusTransitionService,
      commandService as unknown as CommandService,
      cache as unknown as CacheService,
    );

    const motorStatuses = new Map([[MOTOR_ID, 'healthy']]);
    const motorSensorIds = new Map([
      [MOTOR_ID, [SENSOR_1, SENSOR_2, SENSOR_3]],
    ]);
    const motorParams = new Map([[MOTOR_ID, PARAMS]]);

    await service.init(motorStatuses, motorSensorIds, motorParams);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────
  describe('consecutive anomaly counter → alarm', () => {
    it('should NOT trigger alarm with fewer than N consecutive readings', async () => {
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings - 1; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      expect(statusTransition.transitionMotor).not.toHaveBeenCalledWith(
        MOTOR_ID,
        'healthy',
        'alarm',
      );
      expect(statusTransition.createAlert).not.toHaveBeenCalledWith(
        MOTOR_ID,
        'motor_alarm',
        expect.anything(),
      );
    });

    it('should trigger alarm after N consecutive anomalous readings on one sensor', async () => {
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID,
        'healthy',
        'alarm',
      );
      expect(statusTransition.createAlert).toHaveBeenCalledWith(
        MOTOR_ID,
        'motor_alarm',
        expect.objectContaining({
          triggerSensorId: SENSOR_1,
          consecutiveReadings: PARAMS.alarmConsecutiveReadings,
        }),
      );
    });

    it('should reset counter when a normal reading arrives', async () => {
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings - 1; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }
      await service.pushReading(SENSOR_1, MOTOR_ID, false, false);
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings - 1; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      expect(statusTransition.transitionMotor).not.toHaveBeenCalledWith(
        MOTOR_ID,
        'healthy',
        'alarm',
      );
    });

    it('should not trigger alarm on a motor already in alarm', async () => {
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }
      const callCount = statusTransition.transitionMotor.mock.calls.length;

      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      expect(statusTransition.transitionMotor).toHaveBeenCalledTimes(callCount);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('critical reading → immediate trip', () => {
    it('should trip immediately on critical reading (no grace timer)', async () => {
      await service.pushReading(SENSOR_1, MOTOR_ID, true, true);

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID,
        'healthy',
        'shutting_down',
      );
      expect(statusTransition.createAlert).toHaveBeenCalledWith(
        MOTOR_ID,
        'motor_trip',
        expect.objectContaining({ reason: 'critical_reading' }),
      );
      expect(commandService.publishRestart).toHaveBeenCalledWith(
        MOTOR_ID,
        'system',
      );
    });

    it('should disable motor on critical reading if auto-restart already used', async () => {
      cache.getAutoRestartUsed.mockResolvedValue(1);

      await service.pushReading(SENSOR_1, MOTOR_ID, true, true);

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID,
        'healthy',
        'disabled',
      );
      expect(statusTransition.createAlert).toHaveBeenCalledWith(
        MOTOR_ID,
        'motor_disabled',
        expect.objectContaining({ reason: 'critical_reading' }),
      );
      expect(commandService.publishRestart).not.toHaveBeenCalled();
    });

    it('should trip immediately on critical reading when motor is in alarm', async () => {
      service.setMotorStatus(MOTOR_ID, 'alarm');

      await service.pushReading(SENSOR_1, MOTOR_ID, true, true);

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID,
        'alarm',
        'shutting_down',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('grace timer expiry → trip', () => {
    it('should trip after grace timer expires without resolution', async () => {
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      expect(statusTransition.createAlert).toHaveBeenCalledWith(
        MOTOR_ID,
        'motor_alarm',
        expect.anything(),
      );

      jest.advanceTimersByTime(PARAMS.alarmGracePeriodMs + 100);
      await flushPromises();

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID,
        'alarm',
        'shutting_down',
      );
      expect(statusTransition.createAlert).toHaveBeenCalledWith(
        MOTOR_ID,
        'motor_trip',
        expect.objectContaining({ reason: 'grace_timer_expired' }),
      );
      expect(commandService.publishRestart).toHaveBeenCalledWith(
        MOTOR_ID,
        'system',
      );
    });

    it('should disable motor if grace timer expires after previous auto-restart', async () => {
      cache.getAutoRestartUsed.mockResolvedValue(1);

      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      jest.advanceTimersByTime(PARAMS.alarmGracePeriodMs + 100);
      await flushPromises();

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID,
        'alarm',
        'disabled',
      );
      expect(statusTransition.createAlert).toHaveBeenCalledWith(
        MOTOR_ID,
        'motor_disabled',
        expect.objectContaining({ reason: 'grace_timer_expired' }),
      );
      expect(commandService.publishRestart).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('auto-recovery (alarm → healthy when all sensors normalize)', () => {
    it('should recover to healthy when all sensor counters reach 0', async () => {
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }
      expect(service.getMotorStatus(MOTOR_ID)).toBe('alarm');

      await service.pushReading(SENSOR_1, MOTOR_ID, false, false);
      await service.pushReading(SENSOR_2, MOTOR_ID, false, false);
      await service.pushReading(SENSOR_3, MOTOR_ID, false, false);

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID,
        'alarm',
        'healthy',
      );
    });

    it('should NOT recover if another sensor still has anomalous count', async () => {
      await service.pushReading(SENSOR_2, MOTOR_ID, true, false);

      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }
      expect(service.getMotorStatus(MOTOR_ID)).toBe('alarm');

      await service.pushReading(SENSOR_1, MOTOR_ID, false, false);

      const calls = statusTransition.transitionMotor.mock.calls;
      const recoveredToHealthy = calls.some(
        ([id, from, to]: [number, string, string]) =>
          id === MOTOR_ID && from === 'alarm' && to === 'healthy',
      );
      expect(recoveredToHealthy).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('operator resolves alarm', () => {
    it('should cancel grace timer and return to healthy', async () => {
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }
      expect(service.getMotorStatus(MOTOR_ID)).toBe('alarm');

      await service.resolveAlarm(MOTOR_ID);

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID,
        'alarm',
        'healthy',
      );

      jest.advanceTimersByTime(PARAMS.alarmGracePeriodMs + 100);
      await flushPromises();

      expect(commandService.publishRestart).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('motor restart lifecycle', () => {
    it('should reset all counters on motor restarting', async () => {
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings - 1; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      service.onMotorRestarting(MOTOR_ID);

      expect(service.getMotorStatus(MOTOR_ID)).toBe('restarting');
      expect(cache.clearEscalationTimer).toHaveBeenCalledWith(MOTOR_ID);
    });

    it('should reset autoRestartUsed in Redis on resetWindow', async () => {
      await service.resetWindow(MOTOR_ID);

      expect(cache.persistAutoRestartUsed).toHaveBeenCalledWith(MOTOR_ID, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('post-restart cooldown', () => {
    it('should require double readings to alarm during cooldown period', async () => {
      // Simulate a restart
      await service.resetWindow(MOTOR_ID);

      // Push N readings (normal threshold) — should NOT trigger alarm during cooldown
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }
      expect(statusTransition.transitionMotor).not.toHaveBeenCalledWith(
        MOTOR_ID,
        'healthy',
        'alarm',
      );

      // Push N more (total 2N) — should trigger alarm now
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }
      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID,
        'healthy',
        'alarm',
      );
    });

    it('should not require double readings after cooldown expires', async () => {
      // Simulate a restart
      await service.resetWindow(MOTOR_ID);

      // Advance past cooldown (60s)
      jest.advanceTimersByTime(61_000);

      // Push N readings — should trigger alarm (normal threshold)
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }
      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID,
        'healthy',
        'alarm',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('alert metadata', () => {
    it('should include trigger sensor ID in alarm metadata', async () => {
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_2, MOTOR_ID, true, false);
      }

      expect(statusTransition.createAlert).toHaveBeenCalledWith(
        MOTOR_ID,
        'motor_alarm',
        expect.objectContaining({ triggerSensorId: SENSOR_2 }),
      );
    });

    it('should include cause in trip metadata', async () => {
      await service.pushReading(SENSOR_1, MOTOR_ID, true, true);

      expect(statusTransition.createAlert).toHaveBeenCalledWith(
        MOTOR_ID,
        'motor_trip',
        expect.objectContaining({
          cause: 'critical_reading',
          triggerSensorId: SENSOR_1,
        }),
      );
    });

    it('should include grace period info in alarm metadata', async () => {
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      expect(statusTransition.createAlert).toHaveBeenCalledWith(
        MOTOR_ID,
        'motor_alarm',
        expect.objectContaining({ gracePeriodMs: PARAMS.alarmGracePeriodMs }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('manual reactivation', () => {
    it('should reset all state when operator reactivates a disabled motor', async () => {
      service.setMotorStatus(MOTOR_ID, 'disabled');

      await service.onMotorReactivated(MOTOR_ID);

      expect(service.getMotorStatus(MOTOR_ID)).toBe('healthy');
      expect(cache.persistAutoRestartUsed).toHaveBeenCalledWith(MOTOR_ID, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('lock not acquired', () => {
    it('should skip evaluation if lock is not acquired', async () => {
      cache.acquireMotorLock.mockResolvedValue(false);

      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      expect(statusTransition.transitionMotor).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('per-sensor independence', () => {
    it('should alarm based on one sensor without affecting others', async () => {
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      expect(statusTransition.createAlert).toHaveBeenCalledWith(
        MOTOR_ID,
        'motor_alarm',
        expect.anything(),
      );

      const alertCallsBefore = statusTransition.createAlert.mock.calls.length;
      await service.pushReading(SENSOR_2, MOTOR_ID, false, false);
      await service.pushReading(SENSOR_3, MOTOR_ID, false, false);

      expect(statusTransition.createAlert.mock.calls.length).toBe(
        alertCallsBefore,
      );
    });
  });
});
