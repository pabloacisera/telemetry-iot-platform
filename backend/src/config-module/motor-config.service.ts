import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { MqttProvisioningService } from './mqtt-provisioning.service';
import { CommandService } from '../command/command.service';
import { TelemetryConsumerService } from '../telemetry/telemetry-consumer.service';
import { CreateMotorDto, UpdateMotorDto, UpdateThresholdsDto } from './dto';

/** Default sensor types created for every new motor — loaded from sensor_standards table. */
const FALLBACK_SENSORS = [
  {
    sensorType: 'temperature',
    healthyMax: 70,
    warningMax: 80,
    criticalMax: 90,
  },
  {
    sensorType: 'vibration',
    healthyMax: 1.8,
    warningMax: 2.8,
    criticalMax: 4.5,
  },
  { sensorType: 'current', healthyMax: 10, warningMax: 11.5, criticalMax: 13 },
];

/**
 * Service for motor configuration CRUD.
 * Orchestrates database operations + MQTT provisioning.
 */
@Injectable()
export class MotorConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mqttProvisioning: MqttProvisioningService,
    private readonly commandService: CommandService,
    private readonly telemetryConsumer: TelemetryConsumerService,
  ) {}

  /**
   * Load sensor standards from DB to use as defaults for new motors.
   * Falls back to hardcoded values if standards table is empty.
   */
  private async getSensorDefaults(ratedCurrentA: number) {
    const standards = await this.prisma.sensorStandard.findMany();

    if (standards.length === 0) {
      // Fallback: use constants (adjusting current by rated)
      return FALLBACK_SENSORS.map((s) => {
        if (s.sensorType === 'current') {
          return {
            sensorType: s.sensorType,
            healthyMax: Math.round(ratedCurrentA * 1.05 * 100) / 100,
            warningMax: Math.round(ratedCurrentA * 1.15 * 100) / 100,
            criticalMax: Math.round(ratedCurrentA * 1.3 * 100) / 100,
          };
        }
        return s;
      });
    }

    return standards.map((std) => {
      if (std.sensorType === 'current') {
        // Current thresholds are multipliers of rated current
        return {
          sensorType: std.sensorType,
          healthyMax:
            Math.round(ratedCurrentA * std.defaultHealthyMax * 100) / 100,
          warningMax:
            Math.round(ratedCurrentA * std.defaultWarningMax * 100) / 100,
          criticalMax:
            Math.round(ratedCurrentA * std.defaultCriticalMax * 100) / 100,
        };
      }
      return {
        sensorType: std.sensorType,
        healthyMax: std.defaultHealthyMax,
        warningMax: std.defaultWarningMax,
        criticalMax: std.defaultCriticalMax,
      };
    });
  }

  /**
   * Create a new motor with default sensors and provision MQTT credentials.
   * Sensor thresholds are loaded from the sensor_standards table.
   * @returns Created motor data + MQTT password (shown once).
   */
  async createMotor(dto: CreateMotorDto) {
    // Check for duplicate code
    const existing = await this.prisma.motor.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Motor con código "${dto.code}" ya existe`);
    }

    // Load sensor defaults from standards table
    const sensorDefaults = await this.getSensorDefaults(dto.ratedCurrentA);

    // Create motor + sensors in a transaction
    const motor = await this.prisma.motor.create({
      data: {
        code: dto.code,
        name: dto.name,
        location: dto.location ?? null,
        ratedCurrentA: dto.ratedCurrentA,
        insulationClass: dto.insulationClass ?? 'F',
        connectionType: dto.connectionType,
        sensors: {
          create: sensorDefaults.map((s) => ({
            sensorType: s.sensorType,
            healthyMax: s.healthyMax,
            warningMax: s.warningMax,
            criticalMax: s.criticalMax,
          })),
        },
      },
      include: { sensors: true },
    });

    // Provision MQTT credentials
    const mqttPassword = this.mqttProvisioning.provisionMotor(motor.id);

    // Register in telemetry pipeline (hot-reload lookups + evaluation maps)
    await this.telemetryConsumer.registerMotor(motor.id);

    // Notify simulator to start generating data for the new motor
    const mqttUser = `esp32_motor${motor.id}`;
    await this.commandService.notifySimulatorMotorAdded({
      motorId: motor.id,
      ratedCurrentA: dto.ratedCurrentA,
      connectionType: dto.connectionType,
      mqttUser,
      mqttPass: mqttPassword,
    });

    return {
      motor,
      mqtt: {
        username: mqttUser,
        password: mqttPassword,
        note: 'Esta contraseña se muestra una sola vez. Guardarla para configurar el ESP32.',
      },
    };
  }

  /**
   * Update motor metadata (name, location, connectionType).
   */
  async updateMotor(motorId: number, dto: UpdateMotorDto) {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
    });
    if (!motor) {
      throw new NotFoundException(`Motor ${motorId} no encontrado`);
    }

    return this.prisma.motor.update({
      where: { id: motorId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.connectionType !== undefined && {
          connectionType: dto.connectionType,
        }),
      },
      include: { sensors: true },
    });
  }

  /**
   * Delete a motor, its sensors, and deprovision MQTT credentials.
   */
  async deleteMotor(motorId: number) {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
    });
    if (!motor) {
      throw new NotFoundException(`Motor ${motorId} no encontrado`);
    }

    // Delete related data in order (due to FK constraints)
    await this.prisma.$transaction([
      this.prisma.sensorFault.deleteMany({
        where: { motorSensor: { motorId } },
      }),
      this.prisma.motorSensor.deleteMany({ where: { motorId } }),
      this.prisma.alert.deleteMany({ where: { motorId } }),
      this.prisma.motorStatusHistory.deleteMany({ where: { motorId } }),
      this.prisma.motor.delete({ where: { id: motorId } }),
    ]);

    // Unregister from telemetry pipeline
    this.telemetryConsumer.unregisterMotor(motorId);

    // Notify simulator to stop generating data for this motor
    await this.commandService.notifySimulatorMotorRemoved(motorId);

    // Deprovision MQTT
    this.mqttProvisioning.deprovisionMotor(motorId);

    return { message: `Motor ${motor.code} eliminado correctamente` };
  }

  /**
   * Update sensor thresholds for a specific sensor.
   */
  async updateThresholds(
    motorId: number,
    sensorId: number,
    dto: UpdateThresholdsDto,
  ) {
    const sensor = await this.prisma.motorSensor.findFirst({
      where: { id: sensorId, motorId },
    });
    if (!sensor) {
      throw new NotFoundException(
        `Sensor ${sensorId} no encontrado en motor ${motorId}`,
      );
    }

    // Validate threshold ordering if all three are provided
    const newHealthy = dto.healthyMax ?? sensor.healthyMax;
    const newWarning = dto.warningMax ?? sensor.warningMax;
    const newCritical = dto.criticalMax ?? sensor.criticalMax;

    if (newHealthy >= newWarning || newWarning >= newCritical) {
      throw new ConflictException(
        `Los umbrales deben cumplir: healthyMax (${newHealthy}) < warningMax (${newWarning}) < criticalMax (${newCritical})`,
      );
    }

    return this.prisma.motorSensor.update({
      where: { id: sensorId },
      data: {
        ...(dto.healthyMax !== undefined && { healthyMax: dto.healthyMax }),
        ...(dto.warningMax !== undefined && { warningMax: dto.warningMax }),
        ...(dto.criticalMax !== undefined && { criticalMax: dto.criticalMax }),
      },
    });
  }

  /**
   * Get all motors with sensors (for the config page listing).
   */
  async getAllMotors() {
    return this.prisma.motor.findMany({
      include: { sensors: true },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Get sensor standards (recommended thresholds per sensor type).
   * Used by the frontend to show recommendations when editing thresholds.
   */
  async getSensorStandards() {
    return this.prisma.sensorStandard.findMany();
  }
}
