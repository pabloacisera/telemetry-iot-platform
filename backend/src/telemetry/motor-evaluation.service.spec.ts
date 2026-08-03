import { MotorEvaluationService } from './motor-evaluation.service';

describe('MotorEvaluationService', () => {
  let service: MotorEvaluationService;
  let statusTransition: {
    transitionMotor: jest.Mock;
    createAlert: jest.Mock;
  };
  let commandService: { publishRestart: jest.Mock };

  beforeEach(async () => {
    statusTransition = {
      transitionMotor: jest.fn().mockResolvedValue(undefined),
      createAlert: jest.fn().mockResolvedValue(undefined),
    };
    commandService = {
      publishRestart: jest.fn().mockResolvedValue(undefined),
    };

    service = new MotorEvaluationService(
      statusTransition as any,
      commandService as any,
      {
        restoreWindows: jest.fn().mockResolvedValue(new Map()),
        restoreAutoRestartUsed: jest.fn().mockResolvedValue(new Map()),
        restoreEscalationTimers: jest.fn().mockResolvedValue(new Map()),
        persistWindow: jest.fn().mockResolvedValue(undefined),
        persistAutoRestartUsed: jest.fn().mockResolvedValue(undefined),
        persistEscalationTimer: jest.fn().mockResolvedValue(undefined),
        clearEscalationTimer: jest.fn().mockResolvedValue(undefined),
      } as any,
    );

    // Init with motor 1 having 3 sensors (IDs: 1, 2, 3)
    const motorStatuses = new Map<number, string>([[1, 'healthy']]);
    const motorSensorIds = new Map<number, number[]>([[1, [1, 2, 3]]]);
    await service.init(motorStatuses, motorSensorIds);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('sliding window (5/8 rule)', () => {
    it('should NOT trigger under_review with 4/8 anomalous readings', async () => {
      // Push 4 anomalous + 4 normal
      for (let i = 0; i < 4; i++) {
        await service.pushReading(1, 1, true, false);
      }
      for (let i = 0; i < 4; i++) {
        await service.pushReading(1, 1, false, false);
      }

      expect(statusTransition.transitionMotor).not.toHaveBeenCalled();
    });

    it('should trigger under_review with 5/8 anomalous readings', async () => {
      // Push 5 anomalous + 3 normal (window = 8)
      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, true, false);
      }

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        1,
        'healthy',
        'under_review',
      );
      expect(statusTransition.createAlert).toHaveBeenCalledWith(1, 'warning');
    });

    it('should trigger under_review when window slides to 5 anomalous', async () => {
      // 3 anomalous, 5 normal (total 8, only 3 anomalous — no trigger)
      for (let i = 0; i < 3; i++) {
        await service.pushReading(1, 1, true, false);
      }
      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, false, false);
      }
      expect(statusTransition.transitionMotor).not.toHaveBeenCalled();

      // Now push 5 more anomalous — window shifts, oldest normal drops
      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, true, false);
      }
      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        1,
        'healthy',
        'under_review',
      );
    });
  });

  describe('critical zone (immediate trigger)', () => {
    it('should trigger under_review immediately on a single critical reading', async () => {
      await service.pushReading(1, 1, true, true); // isCritical = true

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        1,
        'healthy',
        'under_review',
      );
    });

    it('should not trigger if motor is already in under_review', async () => {
      // First critical triggers
      await service.pushReading(1, 1, true, true);
      statusTransition.transitionMotor.mockClear();

      // Second critical should not re-trigger (motor is now under_review)
      await service.pushReading(1, 1, true, true);
      expect(statusTransition.transitionMotor).not.toHaveBeenCalled();
    });
  });

  describe('ring buffer reset on restart', () => {
    it('should clear all sensor windows when motor enters restarting', async () => {
      // Fill window with 4 anomalous
      for (let i = 0; i < 4; i++) {
        await service.pushReading(1, 1, true, false);
      }

      // Motor enters restarting → buffers reset
      service.onMotorRestarting(1);

      // Now push 4 anomalous again — should NOT trigger because window was reset
      // (only 4 in the fresh window, need 5)
      service.onMotorHealthy(1); // back to healthy for evaluation
      for (let i = 0; i < 4; i++) {
        await service.pushReading(1, 1, true, false);
      }

      expect(statusTransition.transitionMotor).not.toHaveBeenCalled();
    });

    it('pre-restart readings do NOT contaminate post-restart evaluation', async () => {
      // Push 4 anomalous readings pre-restart
      for (let i = 0; i < 4; i++) {
        await service.pushReading(1, 1, true, false);
      }

      service.onMotorRestarting(1);
      service.onMotorHealthy(1);

      // After restart, need full 5/8 from scratch to trigger
      for (let i = 0; i < 3; i++) {
        await service.pushReading(1, 1, false, false);
      }
      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, true, false);
      }

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        1,
        'healthy',
        'under_review',
      );
    });
  });

  /** Helper to flush all pending microtasks/promises after advancing timers. */
  async function flushPromises(): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  describe('post-restart recurrence → disabled', () => {
    it('should disable motor if anomaly recurs after auto-restart', async () => {
      jest.useFakeTimers();

      // First escalation: 5/8 anomalous → under_review
      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, true, false);
      }
      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        1,
        'healthy',
        'under_review',
      );

      // Advance 2 minutes → escalation fires → forced restart
      jest.advanceTimersByTime(2 * 60 * 1000);
      jest.useRealTimers();
      await flushPromises();
      jest.useFakeTimers();

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        1,
        'under_review',
        'shutting_down',
      );
      expect(commandService.publishRestart).toHaveBeenCalledWith(1, 'system');

      // Simulate restart completing
      service.onMotorRestarting(1);
      service.onMotorHealthy(1);
      statusTransition.transitionMotor.mockClear();

      // Second episode: another 5/8 → under_review again
      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, true, false);
      }
      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        1,
        'healthy',
        'under_review',
      );

      // Advance 2 minutes again → should DISABLE (autoRestartUsed = true)
      jest.advanceTimersByTime(2 * 60 * 1000);
      jest.useRealTimers();
      await flushPromises();

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        1,
        'under_review',
        'disabled',
      );
    });
  });

  describe('manual reactivation resets counter', () => {
    it('should reset autoRestartUsed on manual reactivation', async () => {
      jest.useFakeTimers();

      // Trigger first auto-restart
      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, true, false);
      }
      jest.advanceTimersByTime(2 * 60 * 1000);
      jest.useRealTimers();
      await flushPromises();
      jest.useFakeTimers();

      service.onMotorRestarting(1);
      service.onMotorHealthy(1);

      // Manual reactivation resets the counter
      await service.onMotorReactivated(1);
      statusTransition.transitionMotor.mockClear();
      commandService.publishRestart.mockClear();

      // New episode → should get another auto-restart (not disabled)
      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, true, false);
      }
      jest.advanceTimersByTime(2 * 60 * 1000);
      jest.useRealTimers();
      await flushPromises();

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        1,
        'under_review',
        'shutting_down',
      );
      expect(commandService.publishRestart).toHaveBeenCalled();
    });
  });
});
