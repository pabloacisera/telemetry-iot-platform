import { MotorEvaluationService } from './motor-evaluation.service';

/** Helper to flush microtask queue (await pending Promises). */
async function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
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

  /** Simulated window state per sensor (mimics Redis behavior). */
  let windowState: Map<number, boolean[]>;

  beforeEach(async () => {
    windowState = new Map([[1, []], [2, []], [3, []]]);

    statusTransition = {
      transitionMotor: jest.fn().mockResolvedValue(undefined),
      createAlert: jest.fn().mockResolvedValue(undefined),
    };
    commandService = {
      publishRestart: jest.fn().mockResolvedValue(undefined),
    };
    cache = {
      acquireMotorLock: jest.fn().mockResolvedValue(true),
      releaseMotorLock: jest.fn().mockResolvedValue(undefined),
      pushToWindow: jest.fn().mockImplementation((sensorId: number, isAnomalous: boolean) => {
        const win = windowState.get(sensorId) || [];
        win.push(isAnomalous);
        if (win.length > 8) win.shift();
        windowState.set(sensorId, win);
        return Promise.resolve([...win]);
      }),
      getWindow: jest.fn().mockImplementation((sensorId: number) => {
        return Promise.resolve(windowState.get(sensorId) || []);
      }),
      clearWindow: jest.fn().mockImplementation((sensorId: number) => {
        windowState.set(sensorId, []);
        return Promise.resolve();
      }),
      getAutoRestartUsed: jest.fn().mockResolvedValue(false),
      persistAutoRestartUsed: jest.fn().mockResolvedValue(undefined),
      persistEscalationTimer: jest.fn().mockResolvedValue(undefined),
      clearEscalationTimer: jest.fn().mockResolvedValue(undefined),
      restoreEscalationTimers: jest.fn().mockResolvedValue(new Map()),
    };

    service = new MotorEvaluationService(
      statusTransition as any,
      commandService as any,
      cache as any,
    );

    const motorStatuses = new Map<number, string>([[1, 'healthy']]);
    const motorSensorIds = new Map<number, number[]>([[1, [1, 2, 3]]]);
    await service.init(motorStatuses, motorSensorIds);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('sliding window (5/8 rule)', () => {
    it('should NOT trigger under_review with 4/8 anomalous readings', async () => {
      for (let i = 0; i < 4; i++) {
        await service.pushReading(1, 1, true, false);
      }
      for (let i = 0; i < 4; i++) {
        await service.pushReading(1, 1, false, false);
      }
      expect(statusTransition.transitionMotor).not.toHaveBeenCalled();
    });

    it('should trigger under_review with 5/8 anomalous (no alert yet)', async () => {
      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, true, false);
      }
      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        1, 'healthy', 'under_review',
      );
      // No alert at this stage — only internal observation
      expect(statusTransition.createAlert).not.toHaveBeenCalled();
    });

    it('should trigger under_review immediately on a single critical reading', async () => {
      await service.pushReading(1, 1, true, true);
      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        1, 'healthy', 'under_review',
      );
    });

    it('should not trigger if motor is already in under_review', async () => {
      // First trigger
      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, true, false);
      }
      statusTransition.transitionMotor.mockClear();

      // More anomalous readings — should not re-trigger
      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, true, false);
      }
      expect(statusTransition.transitionMotor).not.toHaveBeenCalled();
    });
  });

  describe('distributed lock', () => {
    it('should skip evaluation if lock is not acquired', async () => {
      cache.acquireMotorLock.mockResolvedValue(false);

      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, true, false);
      }

      expect(cache.pushToWindow).not.toHaveBeenCalled();
      expect(statusTransition.transitionMotor).not.toHaveBeenCalled();
    });

    it('should always release lock after evaluation', async () => {
      await service.pushReading(1, 1, true, false);
      expect(cache.releaseMotorLock).toHaveBeenCalledWith(1);
    });
  });

  describe('auto-recovery (under_review → healthy when normalized)', () => {
    it('should recover to healthy when all sensor windows drop below 5/8', async () => {
      // Push anomalous to ALL 3 sensors so checkAllWindowsNormalized is meaningful
      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, true, false);
        await service.pushReading(2, 1, true, false);
        await service.pushReading(3, 1, true, false);
      }
      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(1, 'healthy', 'under_review');
      statusTransition.transitionMotor.mockClear();

      // Push 3 normals per sensor → window: [T,T,T,T,T,F,F,F] = 5/8 still anomalous (window capped to 8)
      for (let i = 0; i < 3; i++) {
        await service.pushReading(1, 1, false, false);
        await service.pushReading(2, 1, false, false);
        await service.pushReading(3, 1, false, false);
      }
      // At 8 entries: [T,T,T,T,T,F,F,F] = 5 anomalous → NOT recovered
      expect(statusTransition.transitionMotor).not.toHaveBeenCalledWith(1, 'under_review', 'healthy');

      // 4th normal → shifts: [T,T,T,T,F,F,F,F] = 4 anomalous → recovered
      await service.pushReading(1, 1, false, false);
      await service.pushReading(2, 1, false, false);
      await service.pushReading(3, 1, false, false);

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(1, 'under_review', 'healthy');
    });

    it('should NOT recover if any sensor still has >=5/8 anomalous', async () => {
      // Trigger under_review via sensor 1
      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, true, false);
      }
      statusTransition.transitionMotor.mockClear();

      // Sensor 1 normalizes but sensor 2 has anomalies
      cache.getWindow.mockImplementation((sensorId: number) => {
        if (sensorId === 2) return Promise.resolve([true, true, true, true, true, false, false, false]);
        return Promise.resolve(windowState.get(sensorId) || []);
      });

      await service.pushReading(1, 1, false, false);
      expect(statusTransition.transitionMotor).not.toHaveBeenCalledWith(1, 'under_review', 'healthy');
    });
  });

  describe('escalation (2 min timer)', () => {
    it('should disable motor if anomaly recurs after auto-restart', async () => {
      jest.useFakeTimers();

      // First episode → under_review
      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, true, false);
      }

      // Escalation timer fires → force restart
      cache.getAutoRestartUsed.mockResolvedValue(false);
      jest.advanceTimersByTime(2 * 60 * 1000);
      jest.useRealTimers();
      await flushPromises();

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        1, 'under_review', 'shutting_down',
      );

      // Simulate restart complete → back to healthy
      service.onMotorRestarting(1);
      service.onMotorHealthy(1);
      statusTransition.transitionMotor.mockClear();
      windowState.set(1, []);

      jest.useFakeTimers();

      // Second episode → under_review again
      for (let i = 0; i < 5; i++) {
        await service.pushReading(1, 1, true, false);
      }

      // This time auto-restart was already used → disabled
      cache.getAutoRestartUsed.mockResolvedValue(true);
      jest.advanceTimersByTime(2 * 60 * 1000);
      jest.useRealTimers();
      await flushPromises();

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        1, 'under_review', 'disabled',
      );
    });
  });

  describe('window reset on restart', () => {
    it('should clear all sensor windows in Redis on restart', async () => {
      service.onMotorRestarting(1);
      expect(cache.clearWindow).toHaveBeenCalledWith(1);
      expect(cache.clearWindow).toHaveBeenCalledWith(2);
      expect(cache.clearWindow).toHaveBeenCalledWith(3);
    });
  });

  describe('manual reactivation', () => {
    it('should reset autoRestartUsed in Redis', async () => {
      await service.onMotorReactivated(1);
      expect(cache.persistAutoRestartUsed).toHaveBeenCalledWith(1, false);
      expect(cache.clearWindow).toHaveBeenCalledTimes(3);
    });
  });
});
