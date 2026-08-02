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

  beforeEach(() => {
    statusTransition = {
      transitionSensor: jest.fn().mockResolvedValue(undefined),
      createSensorFault: jest.fn().mockResolvedValue(undefined),
      transitionMotor: jest.fn().mockResolvedValue(undefined),
      createAlert: jest.fn().mockResolvedValue(undefined),
    };
    motorEvaluation = {
      getMotorStatus: jest.fn().mockReturnValue('healthy'),
    };

    service = new SensorEvaluationService(
      statusTransition as any,
      motorEvaluation as any,
    );

    // Motor 1 with sensors 1, 2, 3
    const sensorStatuses = new Map<number, string>([
      [1, 'ok'],
      [2, 'ok'],
      [3, 'ok'],
    ]);
    const motorSensorIds = new Map<number, number[]>([[1, [1, 2, 3]]]);
    service.init(sensorStatuses, motorSensorIds);
  });

  describe('out_of_range detection', () => {
    it('should trigger fault when value exceeds plausible max', async () => {
      await service.evaluateReading(1, 1, 200, 10, 150); // 200 > 150

      expect(statusTransition.transitionSensor).toHaveBeenCalledWith(1, 1, 'fault');
      expect(statusTransition.createSensorFault).toHaveBeenCalledWith(
        1,
        'out_of_range',
      );
    });

    it('should trigger fault when value is below plausible min', async () => {
      await service.evaluateReading(1, 1, -5, 0, 20); // -5 < 0

      expect(statusTransition.transitionSensor).toHaveBeenCalledWith(1, 1, 'fault');
      expect(statusTransition.createSensorFault).toHaveBeenCalledWith(
        1,
        'out_of_range',
      );
    });

    it('should NOT trigger for values within plausible range', async () => {
      await service.evaluateReading(1, 1, 55, 10, 150);

      expect(statusTransition.transitionSensor).not.toHaveBeenCalled();
    });
  });

  describe('stuck detection (20 consecutive same value)', () => {
    it('should trigger fault after 20 consecutive identical readings (1 decimal)', async () => {
      // 20 readings all rounding to 55.1
      for (let i = 0; i < 19; i++) {
        await service.evaluateReading(1, 1, 55.1, 10, 150);
      }
      expect(statusTransition.createSensorFault).not.toHaveBeenCalled();

      // 20th reading triggers
      await service.evaluateReading(1, 1, 55.1, 10, 150);
      expect(statusTransition.createSensorFault).toHaveBeenCalledWith(1, 'stuck');
    });

    it('should reset counter when value changes', async () => {
      for (let i = 0; i < 18; i++) {
        await service.evaluateReading(1, 1, 55.1, 10, 150);
      }
      // Different value resets counter (this is reading #1 of the new value)
      await service.evaluateReading(1, 1, 55.3, 10, 150);

      // 18 more of the new value (total 19 of 55.3) — should NOT trigger
      for (let i = 0; i < 18; i++) {
        await service.evaluateReading(1, 1, 55.3, 10, 150);
      }
      expect(statusTransition.createSensorFault).not.toHaveBeenCalled();

      // 20th of the new value triggers
      await service.evaluateReading(1, 1, 55.3, 10, 150);
      expect(statusTransition.createSensorFault).toHaveBeenCalledWith(1, 'stuck');
    });

    it('should consider values equal when rounded to 1 decimal', async () => {
      // 55.11, 55.12, 55.14 all round to 55.1
      for (let i = 0; i < 20; i++) {
        await service.evaluateReading(1, 1, 55.1 + i * 0.001, 10, 150);
      }
      // All round to 55.1 → should trigger
      expect(statusTransition.createSensorFault).toHaveBeenCalledWith(1, 'stuck');
    });
  });

  describe('disconnected detection', () => {
    it('should trigger fault on sensor disconnection when motor is healthy', async () => {
      await service.onSensorDisconnected(1, 1);

      expect(statusTransition.transitionSensor).toHaveBeenCalledWith(1, 1, 'fault');
      expect(statusTransition.createSensorFault).toHaveBeenCalledWith(
        1,
        'disconnected',
      );
    });

    it('should NOT trigger during motor shutting_down', async () => {
      motorEvaluation.getMotorStatus.mockReturnValue('shutting_down');

      await service.onSensorDisconnected(1, 1);

      expect(statusTransition.transitionSensor).not.toHaveBeenCalled();
    });

    it('should NOT trigger during motor restarting', async () => {
      motorEvaluation.getMotorStatus.mockReturnValue('restarting');

      await service.onSensorDisconnected(1, 1);

      expect(statusTransition.transitionSensor).not.toHaveBeenCalled();
    });
  });

  describe('sensor evaluation paused during motor restart', () => {
    it('should not evaluate already-faulted sensor', async () => {
      // Trigger fault first
      await service.evaluateReading(1, 1, 200, 10, 150);
      statusTransition.transitionSensor.mockClear();
      statusTransition.createSensorFault.mockClear();

      // Further readings should be ignored (sensor already in fault)
      await service.evaluateReading(1, 1, 55, 10, 150);
      expect(statusTransition.transitionSensor).not.toHaveBeenCalled();
    });
  });

  describe('widespread failure (all 3 sensors in fault)', () => {
    it('should transition motor to under_review when all 3 sensors fault', async () => {
      // Fault all 3 sensors
      await service.evaluateReading(1, 1, 200, 10, 150); // sensor 1: OOR
      await service.evaluateReading(2, 1, 200, 10, 150); // sensor 2: OOR
      await service.evaluateReading(3, 1, 200, 10, 150); // sensor 3: OOR

      expect(statusTransition.transitionMotor).toHaveBeenCalledWith(
        1,
        'healthy',
        'under_review',
      );
      expect(statusTransition.createAlert).toHaveBeenCalledWith(
        1,
        'sensor_failure_widespread',
      );
    });

    it('should NOT trigger widespread if only 2/3 sensors are in fault', async () => {
      await service.evaluateReading(1, 1, 200, 10, 150); // sensor 1: OOR
      await service.evaluateReading(2, 1, 200, 10, 150); // sensor 2: OOR

      expect(statusTransition.transitionMotor).not.toHaveBeenCalled();
    });
  });
});
