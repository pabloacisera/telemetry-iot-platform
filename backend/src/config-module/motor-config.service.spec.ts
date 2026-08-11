import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { MotorConfigService } from './motor-config.service';
import { MqttProvisioningService } from './mqtt-provisioning.service';
import { CommandService } from '../command/command.service';
import { TelemetryConsumerService } from '../telemetry/telemetry-consumer.service';
import { TelemetryEvaluationService } from '../telemetry/telemetry-evaluation.service';
import { PrismaService } from '../prisma';

describe('MotorConfigService', () => {
  let service: MotorConfigService;
  let prisma: {
    motor: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    motorSensor: {
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    sensorFault: { deleteMany: jest.Mock };
    sensorStandard: { findMany: jest.Mock; findFirst: jest.Mock };
    alert: { deleteMany: jest.Mock };
    motorStatusHistory: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mqttProvisioning: {
    provisionMotor: jest.Mock;
    deprovisionMotor: jest.Mock;
  };
  let commandService: {
    notifySimulatorMotorAdded: jest.Mock;
    notifySimulatorMotorRemoved: jest.Mock;
  };
  let telemetryConsumer: {
    registerMotor: jest.Mock;
    unregisterMotor: jest.Mock;
  };
  let telemetryEvaluation: {
    updateSensorThresholds: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      motor: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      motorSensor: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      sensorFault: { deleteMany: jest.fn() },
      sensorStandard: {
        findMany: jest.fn().mockResolvedValue([
          {
            sensorType: 'temperature',
            defaultHealthyMax: 70,
            defaultWarningMax: 80,
            defaultCriticalMax: 90,
          },
          {
            sensorType: 'vibration',
            defaultHealthyMax: 1.8,
            defaultWarningMax: 2.8,
            defaultCriticalMax: 4.5,
          },
          {
            sensorType: 'current',
            defaultHealthyMax: 1.05,
            defaultWarningMax: 1.15,
            defaultCriticalMax: 1.3,
          },
        ]),
        findFirst: jest.fn(),
      },
      alert: { deleteMany: jest.fn() },
      motorStatusHistory: { deleteMany: jest.fn() },
      $transaction: jest.fn(),
    };
    mqttProvisioning = {
      provisionMotor: jest.fn().mockReturnValue('generated-password-123'),
      deprovisionMotor: jest.fn(),
    };
    commandService = {
      notifySimulatorMotorAdded: jest.fn().mockResolvedValue(undefined),
      notifySimulatorMotorRemoved: jest.fn().mockResolvedValue(undefined),
    };
    telemetryConsumer = {
      registerMotor: jest.fn().mockResolvedValue(undefined),
      unregisterMotor: jest.fn(),
    };
    telemetryEvaluation = {
      updateSensorThresholds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MotorConfigService,
        { provide: PrismaService, useValue: prisma },
        { provide: MqttProvisioningService, useValue: mqttProvisioning },
        { provide: CommandService, useValue: commandService },
        { provide: TelemetryConsumerService, useValue: telemetryConsumer },
        { provide: TelemetryEvaluationService, useValue: telemetryEvaluation },
      ],
    }).compile();

    service = module.get<MotorConfigService>(MotorConfigService);
  });

  describe('createMotor', () => {
    const dto = {
      code: 'MOT-16',
      name: 'Motor 16',
      location: 'Sector B',
      ratedCurrentA: 12.5,
      connectionType: 'Y',
    };

    it('should create motor with sensors and provision MQTT', async () => {
      prisma.motor.findUnique.mockResolvedValue(null);
      prisma.motor.create.mockResolvedValue({
        id: 16,
        ...dto,
        insulationClass: 'F',
        sensors: [
          {
            id: 46,
            sensorType: 'temperature',
            healthyMax: 80,
            warningMax: 100,
            criticalMax: 120,
          },
          {
            id: 47,
            sensorType: 'vibration',
            healthyMax: 4.5,
            warningMax: 7.1,
            criticalMax: 11,
          },
          {
            id: 48,
            sensorType: 'current',
            healthyMax: 10,
            warningMax: 14,
            criticalMax: 18,
          },
        ],
      });

      const result = await service.createMotor(dto);

      expect(result.motor.id).toBe(16);
      expect(result.motor.sensors).toHaveLength(3);
      expect(result.mqtt.username).toBe('esp32_motor16');
      expect(result.mqtt.password).toBe('generated-password-123');
      expect(mqttProvisioning.provisionMotor).toHaveBeenCalledWith(16);
      expect(commandService.notifySimulatorMotorAdded).toHaveBeenCalledWith({
        motorId: 16,
        ratedCurrentA: 12.5,
        connectionType: 'Y',
        mqttUser: 'esp32_motor16',
        mqttPass: 'generated-password-123',
      });
    });

    it('should throw ConflictException if code already exists', async () => {
      prisma.motor.findUnique.mockResolvedValue({ id: 1, code: 'MOT-16' });

      await expect(service.createMotor(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('updateMotor', () => {
    it('should update motor name and location', async () => {
      prisma.motor.findUnique.mockResolvedValue({
        id: 1,
        name: 'Old',
        location: 'A',
      });
      prisma.motor.update.mockResolvedValue({
        id: 1,
        name: 'New',
        location: 'B',
        sensors: [],
      });

      const result = await service.updateMotor(1, {
        name: 'New',
        location: 'B',
      });

      expect(result.name).toBe('New');
      expect(prisma.motor.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'New', location: 'B' },
        include: { sensors: true },
      });
    });

    it('should throw NotFoundException if motor does not exist', async () => {
      prisma.motor.findUnique.mockResolvedValue(null);

      await expect(service.updateMotor(99, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteMotor', () => {
    it('should delete motor and deprovision MQTT', async () => {
      prisma.motor.findFirst.mockResolvedValue({ id: 5, code: 'MOT-5' });
      prisma.$transaction.mockResolvedValue([]);

      const result = await service.deleteMotor(5);

      expect(result.message).toContain('MOT-5');
      expect(commandService.notifySimulatorMotorRemoved).toHaveBeenCalledWith(
        5,
      );
      expect(mqttProvisioning.deprovisionMotor).toHaveBeenCalledWith(5);
    });

    it('should throw NotFoundException if motor does not exist', async () => {
      prisma.motor.findFirst.mockResolvedValue(null);

      await expect(service.deleteMotor(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateThresholds', () => {
    it('should update sensor thresholds', async () => {
      prisma.motorSensor.findFirst.mockResolvedValue({
        id: 10,
        motorId: 1,
        healthyMax: 80,
        warningMax: 100,
        criticalMax: 120,
      });
      prisma.motorSensor.update.mockResolvedValue({
        id: 10,
        healthyMax: 75,
        warningMax: 100,
        criticalMax: 120,
      });

      const result = await service.updateThresholds(1, 10, { healthyMax: 75 });

      expect(result.healthyMax).toBe(75);
      expect(telemetryEvaluation.updateSensorThresholds).toHaveBeenCalledWith(
        10,
        { healthyMax: 75, warningMax: undefined, criticalMax: undefined },
      );
    });

    it('should throw NotFoundException if sensor not found for motor', async () => {
      prisma.motorSensor.findFirst.mockResolvedValue(null);

      await expect(
        service.updateThresholds(1, 99, { healthyMax: 50 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if thresholds are not in ascending order', async () => {
      prisma.motorSensor.findFirst.mockResolvedValue({
        id: 10,
        motorId: 1,
        healthyMax: 80,
        warningMax: 100,
        criticalMax: 120,
      });

      // healthyMax > warningMax is invalid
      await expect(
        service.updateThresholds(1, 10, { healthyMax: 105 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('resetThresholds', () => {
    it('should restore current sensor thresholds as rated × standard multiplier', async () => {
      prisma.motorSensor.findFirst.mockResolvedValue({
        id: 10,
        motorId: 1,
        sensorType: 'current',
        healthyMax: 30,
        warningMax: 35,
        criticalMax: 40,
      });
      prisma.motor.findUnique.mockResolvedValue({ id: 1, ratedCurrentA: 16 });
      prisma.sensorStandard.findFirst.mockResolvedValue({
        sensorType: 'current',
        defaultHealthyMax: 1.05,
        defaultWarningMax: 1.15,
        defaultCriticalMax: 1.3,
      });
      prisma.motorSensor.update.mockResolvedValue({
        id: 10,
        healthyMax: 16.8,
        warningMax: 18.4,
        criticalMax: 20.8,
      });

      const result = await service.resetThresholds(1, 10);

      expect(prisma.motorSensor.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { healthyMax: 16.8, warningMax: 18.4, criticalMax: 20.8 },
      });
      expect(telemetryEvaluation.updateSensorThresholds).toHaveBeenCalledWith(
        10,
        { healthyMax: 16.8, warningMax: 18.4, criticalMax: 20.8 },
      );
      expect(result.healthyMax).toBe(16.8);
    });

    it('should restore non-current sensor thresholds as standard values', async () => {
      prisma.motorSensor.findFirst.mockResolvedValue({
        id: 11,
        motorId: 1,
        sensorType: 'temperature',
        healthyMax: 60,
        warningMax: 75,
        criticalMax: 95,
      });
      prisma.motor.findUnique.mockResolvedValue({ id: 1, ratedCurrentA: 16 });
      prisma.sensorStandard.findFirst.mockResolvedValue({
        sensorType: 'temperature',
        defaultHealthyMax: 70,
        defaultWarningMax: 80,
        defaultCriticalMax: 90,
      });
      prisma.motorSensor.update.mockResolvedValue({
        id: 11,
        healthyMax: 70,
        warningMax: 80,
        criticalMax: 90,
      });

      const result = await service.resetThresholds(1, 11);

      expect(result).toEqual({ id: 11, healthyMax: 70, warningMax: 80, criticalMax: 90 });
      expect(telemetryEvaluation.updateSensorThresholds).toHaveBeenCalledWith(11, {
        healthyMax: 70,
        warningMax: 80,
        criticalMax: 90,
      });
    });

    it('should throw NotFoundException if sensor not found for motor', async () => {
      prisma.motorSensor.findFirst.mockResolvedValue(null);

      await expect(service.resetThresholds(1, 99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAllMotors', () => {
    it('should return all motors ordered by id', async () => {
      prisma.motor.findMany.mockResolvedValue([
        { id: 1, code: 'MOT-1', sensors: [] },
        { id: 2, code: 'MOT-2', sensors: [] },
      ]);

      const result = await service.getAllMotors();

      expect(result).toHaveLength(2);
      expect(prisma.motor.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        include: { sensors: { where: { deletedAt: null } } },
        orderBy: { id: 'asc' },
      });
    });
  });
});
