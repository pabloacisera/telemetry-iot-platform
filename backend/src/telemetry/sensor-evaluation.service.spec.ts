import { SensorEvaluationService } from './sensor-evaluation.service';

describe('SensorEvaluationService', () => {
  let service: SensorEvaluationService;
  let statusTransition: {
    transitionSensor: jest.Mock;
    createSensorFault: jest.Mock;
    transitionMotor: jest.Mock;
    createAlert: jest.Mock;
  };
  let motorEvaluation: { getMotorStatus: jest.Mock };
  let commandService: { publishSensorRestart: jest.Mock };
  let cache: {
    getStuckTracker: jest.Mock;
    persistStuckTracker: jest.Mock;
    getSensorAutoRestartUsed: jest.Mock;
    persistSensorAutoRestartUsed: jest.Mock;
  };

  /** Simulated stuck tracker state. */
  let stuckState: Map<number, { value: number; count: number }>;

  beforeEach(async () => {
    stuckState = new Map([
      [1, { value: NaN, count: 0 }],
      [2, { value: NaN, count: 0 }],
      [3, { value: NaN, count: 0 }],
    ]);

    statusTransition = {
      transitionSensor: jest.fn().mockResolvedValue(undefined),
      createSensorFault: jest.fn().mockResolvedValue(undefined),
      transitionMotor: jest.fn().mockResolvedValue(undefined),
      createAlert: jest.fn().mockResolvedValue(undefined),
    };
    motorEvaluation = {
      getMotorStatus: jest.fn().mockReturnValue('healthy'),
    };
    commandService = {
      publishSensorRestart: jest.fn().mockResolvedValue(undefined),
    };
    cache = {
      getStuckTracker: jest.fn().mockImplementation((id: number) => {
        return Promise.resolve(stuckState.get(id) || { value: NaN, count: 0 });
      }),
      persistStuckTracker: jest.fn().mockImplementation((id: number, value: number, count: number) => {
        stuckState.set(id, { value, count });
        return Promise.resolve();
      }),
      getSensorAutoRestartUsed: jest.fn().mockResolvedValue(false),
      persistSensorAutoRestartUsed: jest.fn().mockResolvedValue(undefined),
    };

    service = new SensorEvaluationService(
      statusTransition as any,
      motorEvaluation as any,
      commandService as any,
      cache as any,
    );

    const sensorStatuses = new Map<number, string>([
      [1, 'ok'], [2, 'ok'], [3, 'ok'],
    ]);
    const motorSensorIds = new Map<number, number[]>([[1, [1, 2, 3]]]);
    const sensorMeta = new Map<number, { motorId: number; sensorType: string }>([
      [1, { motorId: 1, sensorType: 'temperature' }],
      [2, { motorId: 1, sensorType: 'vibration' }],
      [3, { motorId: 1, sensorType: 'current' }],
    ]);
    await service.init(sensorStatuses, motorSensorIds, sensorMeta);
  });

  describe('out_of_range detection', () => {
    it('should trigger fault when value exceeds plausible max', async () => {
      await service.evaluateReading(1, 1, 200, 10, 150);

      expect(statusTransition.transitionSensor).toHaveBeenCalledWith(1, 1, 'fault');
      expect(statusTransition.createSensorFault).toHaveBeenCalledWith(1, 'out_of_range');
      expect(statusTransition.createAlert).toHaveBeenCalledWith(1, 'sensor_fault');
    });

    it('should trigger fault when value is below plausible min', async () => {
      await service.evaluateReading(1, 1, -5, 0, 20);

      expect(statusTransition.transitionSensor).toHaveBeenCalledWith(1, 1, 'fault');
      expect(statusTransition.createSensorFault).toHaveBeenCalledWith(1, 'out_of_range');
    });

    it('should NOT trigger for values within plausible range', async () => {
      await service.evaluateReading(1, 1, 55, 10, 150);

      expect(statusTransition.transitionSensor).not.toHaveBeenCalled();
    });
  });

  describe('stuck detection (20 consecutive same value)', () => {
    it('should trigger fault after 20 consecutive identical readings', async () => {
      for (let i = 0; i < 19; i++) {
        await service.evaluateReading(1, 1, 55.1, 10, 150);
      }
      expect(statusTransition.createSensorFault).not.toHaveBeenCalled();

      await service.evaluateReading(1, 1, 55.1, 10, 150);
      expect(statusTransition.createSensorFault).toHaveBeenCalledWith(1, 'stuck');
    });

    it('should reset counter when value changes', async () => {
      for (let i = 0; i < 18; i++) {
        await service.evaluateReading(1, 1, 55.1, 10, 150);
      }
      // Different value resets
      await service.evaluateReading(1, 1, 55.3, 10, 150);

      // 18 more — not yet 20
      for (let i = 0; i < 18; i++) {
        await service.evaluateReading(1, 1, 55.3, 10, 150);
      }
      expect(statusTransition.createSensorFault).not.toHaveBeenCalled();

      // 20th triggers
      await service.evaluateReading(1, 1, 55.3, 10, 150);
      expect(statusTransition.createSensorFault).toHaveBeenCalledWith(1, 'stuck');
    });
  });

  describe('fault_persistent on recurrence', () => {
    it('should mark fault_persistent if auto-restart was already used', async () => {
      cache.getSensorAutoRestartUsed.mockResolvedValue(true);

      await service.evaluateReading(1, 1, 200, 10, 150);

      expect(statusTransition.transitionSensor).toHaveBeenCalledWith(1, 1, 'fault_persistent');
      expect(statusTransition.createAlert).toHaveBeenCalledWith(1, 'sensor_fault_persistent');
    });
  });

  describe('disconnected detection', () => {
    it('should trigger fault on disconnection when motor is healthy', async () => {
      await service.onSensorDisconnected(1, 1);

      expect(statusTransition.transitionSensor).toHaveBeenCalledWith(1, 1, 'fault');
      expect(statusTransition.createSensorFault).toHaveBeenCalledWith(1, 'disconnected');
    });

    it('should NOT trigger during motor shutting_down', async () => {
      motorEvaluation.getMotorStatus.mockReturnValue('shutting_down');
      await service.onSensorDisconnected(1, 1);
      expect(statusTransition.transitionSensor).not.toHaveBeenCalled();
    });
  });

  describe('widespread failure', () => {
    it('should transition motor to under_review when all 3 sensors fault', async () => {
      await service.evaluateReading(1, 1, 200, 10, 150);
      await service.evaluateReading(2, 1, 200, 10, 150);
      await service.evaluateReading(3, 1, 200, 10, 150);

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(1, 'healthy', 'under_review');
      expect(statusTransition.createAlert).toHaveBeenCalledWith(1, 'sensor_failure_widespread');
    });
  });

  describe('manual restart', () => {
    it('should restore sensor and clear auto-restart flag', async () => {
      // Put sensor in fault first
      await service.evaluateReading(1, 1, 200, 10, 150);

      const result = await service.manualRestart(1);

      expect(result).toBe(true);
      expect(commandService.publishSensorRestart).toHaveBeenCalledWith(1, 'temperature');
      expect(cache.persistSensorAutoRestartUsed).toHaveBeenCalledWith(1, false);
    });

    it('should return false if sensor is not in fault', async () => {
      const result = await service.manualRestart(1);
      expect(result).toBe(false);
    });
  });
});
