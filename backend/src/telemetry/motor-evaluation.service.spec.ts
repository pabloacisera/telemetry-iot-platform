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
  const PARAMS = { alarmConsecutiveReadings: 3, alarmGracePeriodMs: 500 };
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
      getAutoRestartUsed: jest.fn().mockResolvedValue(false),
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
    const motorSensorIds = new Map([[MOTOR_ID, [SENSOR_1, SENSOR_2, SENSOR_3]]]);
    const motorParams = new Map([[MOTOR_ID, PARAMS]]);

    await service.init(motorStatuses, motorSensorIds, motorParams);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────
  describe('consecutive anomaly counter → alarm', () => {
    it('should NOT trigger alarm with fewer than N consecutive readings', async () => {
      // Push N-1 anomalous readings (2 out of 3 required)
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings - 1; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      expect(statusTransition.transitionMotor).not.toHaveBeenCalledWith(
        MOTOR_ID, 'healthy', 'alarm',
      );
      expect(statusTransition.createAlert).not.toHaveBeenCalledWith(MOTOR_ID, 'motor_alarm');
    });

    it('should trigger alarm after N consecutive anomalous readings on one sensor', async () => {
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID, 'healthy', 'alarm',
      );
      expect(statusTransition.createAlert).toHaveBeenCalledWith(MOTOR_ID, 'motor_alarm');
    });

    it('should reset counter when a normal reading arrives', async () => {
      // Push N-1 anomalous
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings - 1; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }
      // Normal reading → reset counter
      await service.pushReading(SENSOR_1, MOTOR_ID, false, false);
      // Push N-1 anomalous again (not enough)
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings - 1; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      expect(statusTransition.transitionMotor).not.toHaveBeenCalledWith(
        MOTOR_ID, 'healthy', 'alarm',
      );
    });

    it('should not trigger alarm on a motor already in alarm', async () => {
      // Trigger first alarm
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }
      const callCount = statusTransition.transitionMotor.mock.calls.length;

      // More anomalous readings — should not trigger again
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
        MOTOR_ID, 'healthy', 'shutting_down',
      );
      expect(statusTransition.createAlert).toHaveBeenCalledWith(MOTOR_ID, 'motor_trip');
      expect(commandService.publishRestart).toHaveBeenCalledWith(MOTOR_ID, 'system');
    });

    it('should disable motor on critical reading if auto-restart already used', async () => {
      cache.getAutoRestartUsed.mockResolvedValue(true);

      await service.pushReading(SENSOR_1, MOTOR_ID, true, true);

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID, 'healthy', 'disabled',
      );
      expect(statusTransition.createAlert).toHaveBeenCalledWith(MOTOR_ID, 'motor_disabled');
      expect(commandService.publishRestart).not.toHaveBeenCalled();
    });

    it('should trip immediately on critical reading when motor is in alarm', async () => {
      // First trigger alarm
      service.setMotorStatus(MOTOR_ID, 'alarm');

      await service.pushReading(SENSOR_1, MOTOR_ID, true, true);

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID, 'alarm', 'shutting_down',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('grace timer expiry → trip', () => {
    it('should trip after grace timer expires without resolution', async () => {
      // Trigger alarm
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      expect(statusTransition.createAlert).toHaveBeenCalledWith(MOTOR_ID, 'motor_alarm');

      // Advance time past grace period
      jest.advanceTimersByTime(PARAMS.alarmGracePeriodMs + 100);
      await flushPromises();

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID, 'alarm', 'shutting_down',
      );
      expect(statusTransition.createAlert).toHaveBeenCalledWith(MOTOR_ID, 'motor_trip');
      expect(commandService.publishRestart).toHaveBeenCalledWith(MOTOR_ID, 'system');
    });

    it('should disable motor if grace timer expires after previous auto-restart', async () => {
      cache.getAutoRestartUsed.mockResolvedValue(true);

      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      jest.advanceTimersByTime(PARAMS.alarmGracePeriodMs + 100);
      await flushPromises();

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID, 'alarm', 'disabled',
      );
      expect(statusTransition.createAlert).toHaveBeenCalledWith(MOTOR_ID, 'motor_disabled');
      expect(commandService.publishRestart).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('auto-recovery (alarm → healthy when all sensors normalize)', () => {
    it('should recover to healthy when all sensor counters reach 0', async () => {
      // Trigger alarm on SENSOR_1
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }
      expect(service.getMotorStatus(MOTOR_ID)).toBe('alarm');

      // Normal readings on all sensors → counters reset
      await service.pushReading(SENSOR_1, MOTOR_ID, false, false);
      await service.pushReading(SENSOR_2, MOTOR_ID, false, false);
      await service.pushReading(SENSOR_3, MOTOR_ID, false, false);

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        MOTOR_ID, 'alarm', 'healthy',
      );
    });

    it('should NOT recover if another sensor still has anomalous count', async () => {
      // First, build up SENSOR_2 anomalous counter so it's > 0
      await service.pushReading(SENSOR_2, MOTOR_ID, true, false);

      // Now trigger alarm on SENSOR_1
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }
      expect(service.getMotorStatus(MOTOR_ID)).toBe('alarm');

      // SENSOR_1 normalizes — but SENSOR_2 still has count=1
      await service.pushReading(SENSOR_1, MOTOR_ID, false, false);

      // Should not recover because SENSOR_2 counter > 0
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
        MOTOR_ID, 'alarm', 'healthy',
      );

      // Grace timer should be cancelled — no trip after timeout
      jest.advanceTimersByTime(PARAMS.alarmGracePeriodMs + 100);
      await flushPromises();

      expect(commandService.publishRestart).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('motor restart lifecycle', () => {
    it('should reset all counters on motor restarting', async () => {
      // Build up some counters
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings - 1; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      service.onMotorRestarting(MOTOR_ID);

      expect(service.getMotorStatus(MOTOR_ID)).toBe('restarting');
      // onMotorRestarting clears in-memory counters and grace timer (not Redis windows)
      expect(cache.clearEscalationTimer).toHaveBeenCalledWith(MOTOR_ID);
    });

    it('should reset autoRestartUsed in Redis on resetWindow', async () => {
      await service.resetWindow(MOTOR_ID);

      expect(cache.persistAutoRestartUsed).toHaveBeenCalledWith(MOTOR_ID, false);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('manual reactivation', () => {
    it('should reset all state when operator reactivates a disabled motor', async () => {
      service.setMotorStatus(MOTOR_ID, 'disabled');

      await service.onMotorReactivated(MOTOR_ID);

      expect(service.getMotorStatus(MOTOR_ID)).toBe('healthy');
      expect(cache.persistAutoRestartUsed).toHaveBeenCalledWith(MOTOR_ID, false);
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
      // SENSOR_1 triggers alarm
      for (let i = 0; i < PARAMS.alarmConsecutiveReadings; i++) {
        await service.pushReading(SENSOR_1, MOTOR_ID, true, false);
      }

      expect(statusTransition.createAlert).toHaveBeenCalledWith(MOTOR_ID, 'motor_alarm');

      // SENSOR_2 and SENSOR_3 readings are normal — motor stays in alarm but no second alarm
      const alertCallsBefore = statusTransition.createAlert.mock.calls.length;
      await service.pushReading(SENSOR_2, MOTOR_ID, false, false);
      await service.pushReading(SENSOR_3, MOTOR_ID, false, false);

      // No new alarm triggered
      expect(statusTransition.createAlert.mock.calls.length).toBe(alertCallsBefore);
    });
  });
});
