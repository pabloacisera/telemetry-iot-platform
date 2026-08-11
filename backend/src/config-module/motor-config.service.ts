import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { MqttProvisioningService } from './mqtt-provisioning.service';
import { CommandService } from '../command/command.service';
import { TelemetryConsumerService } from '../telemetry/telemetry-consumer.service';
import { TelemetryEvaluationService } from '../telemetry/telemetry-evaluation.service';
import {
  CreateMotorDto,
  UpdateMotorDto,
  UpdateThresholdsDto,
  UpdateAlertConfigDto,
  UpsertAlertOverrideDto,
  UpdateSensorStandardDto,
} from './dto';

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
    private readonly telemetryEvaluation: TelemetryEvaluationService,
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

    return standards.map((std) => ({
      sensorType: std.sensorType,
      ...this.computeStandardThresholds(std.sensorType, ratedCurrentA, std),
    }));
  }

  /**
   * Compute the effective default thresholds for a sensor type given the
   * motor's rated current. Current thresholds are multipliers of rated
   * current (per sensor_standards); other sensor types use the standard
   * values directly. Mirrors the logic used when creating a new motor.
   */
  private computeStandardThresholds(
    sensorType: string,
    ratedCurrentA: number,
    std: {
      defaultHealthyMax: number;
      defaultWarningMax: number;
      defaultCriticalMax: number;
    },
  ): { healthyMax: number; warningMax: number; criticalMax: number } {
    if (sensorType === 'current') {
      return {
        healthyMax:
          Math.round(ratedCurrentA * std.defaultHealthyMax * 100) / 100,
        warningMax:
          Math.round(ratedCurrentA * std.defaultWarningMax * 100) / 100,
        criticalMax:
          Math.round(ratedCurrentA * std.defaultCriticalMax * 100) / 100,
      };
    }
    return {
      healthyMax: std.defaultHealthyMax,
      warningMax: std.defaultWarningMax,
      criticalMax: std.defaultCriticalMax,
    };
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

    const updated = await this.prisma.motor.update({
      where: { id: motorId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.connectionType !== undefined && {
          connectionType: dto.connectionType,
        }),
        ...(dto.alarmConsecutiveReadings !== undefined && {
          alarmConsecutiveReadings: dto.alarmConsecutiveReadings,
        }),
        ...(dto.alarmGracePeriodMs !== undefined && {
          alarmGracePeriodMs: dto.alarmGracePeriodMs,
        }),
        ...(dto.postRestartCooldownMs !== undefined && {
          postRestartCooldownMs: dto.postRestartCooldownMs,
        }),
        ...(dto.maxAutoRestarts !== undefined && {
          maxAutoRestarts: dto.maxAutoRestarts,
        }),
      },
      include: { sensors: true },
    });

    // Hot-reload protection params in evaluation service
    const protectionChanged =
      dto.alarmConsecutiveReadings !== undefined ||
      dto.alarmGracePeriodMs !== undefined ||
      dto.postRestartCooldownMs !== undefined ||
      dto.maxAutoRestarts !== undefined;

    if (protectionChanged) {
      this.telemetryEvaluation.updateMotorParams(motorId, {
        alarmConsecutiveReadings: updated.alarmConsecutiveReadings,
        alarmGracePeriodMs: updated.alarmGracePeriodMs,
        postRestartCooldownMs: updated.postRestartCooldownMs,
        maxAutoRestarts: updated.maxAutoRestarts,
      });
    }

    return updated;
  }

  /**
   * Soft-delete a motor, its sensors, and deprovision MQTT credentials.
   */
  async deleteMotor(motorId: number) {
    const motor = await this.prisma.motor.findFirst({
      where: { id: motorId, deletedAt: null },
    });
    if (!motor) {
      throw new NotFoundException(`Motor ${motorId} no encontrado`);
    }

    const now = new Date();

    // Soft-delete motor + sensors
    await this.prisma.$transaction([
      this.prisma.motorSensor.updateMany({
        where: { motorId },
        data: { deletedAt: now },
      }),
      this.prisma.motor.update({
        where: { id: motorId },
        data: { deletedAt: now },
      }),
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

    const updated = await this.prisma.motorSensor.update({
      where: { id: sensorId },
      data: {
        ...(dto.healthyMax !== undefined && { healthyMax: dto.healthyMax }),
        ...(dto.warningMax !== undefined && { warningMax: dto.warningMax }),
        ...(dto.criticalMax !== undefined && { criticalMax: dto.criticalMax }),
      },
    });

    // Hot-reload: update in-memory thresholds so evaluation uses new values immediately
    this.telemetryEvaluation.updateSensorThresholds(sensorId, {
      healthyMax: dto.healthyMax,
      warningMax: dto.warningMax,
      criticalMax: dto.criticalMax,
    });

    return updated;
  }

  /**
   * Reset a sensor's thresholds to the current global standard.
   * Current sensors are recomputed as ratedCurrentA × standard multiplier,
   * matching the values a motor would get if created today.
   */
  async resetThresholds(motorId: number, sensorId: number) {
    const sensor = await this.prisma.motorSensor.findFirst({
      where: { id: sensorId, motorId },
    });
    if (!sensor) {
      throw new NotFoundException(
        `Sensor ${sensorId} no encontrado en motor ${motorId}`,
      );
    }

    const motor = await this.prisma.motor.findUnique({
      where: { id: sensor.motorId },
    });
    if (!motor) {
      throw new NotFoundException(`Motor ${motorId} no encontrado`);
    }

    const standard = await this.prisma.sensorStandard.findFirst({
      where: { sensorType: sensor.sensorType },
    });
    if (!standard) {
      throw new NotFoundException(
        `Standard para sensor tipo ${sensor.sensorType} no encontrado`,
      );
    }

    const defaults = this.computeStandardThresholds(
      sensor.sensorType,
      motor.ratedCurrentA,
      standard,
    );

    const updated = await this.prisma.motorSensor.update({
      where: { id: sensorId },
      data: defaults,
    });

    // Hot-reload: evaluation uses the restored thresholds immediately
    this.telemetryEvaluation.updateSensorThresholds(sensorId, defaults);

    return updated;
  }

  /**
   * Get all motors with sensors (for the config page listing).
   * Excludes soft-deleted motors.
   */
  async getAllMotors() {
    return this.prisma.motor.findMany({
      where: { deletedAt: null },
      include: { sensors: { where: { deletedAt: null } } },
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

  /**
   * Update the global default thresholds for a sensor type (sensor standard).
   * These values are used as defaults when creating new motors and as reference
   * in the Sensors config tab. Validates healthyMax < warningMax < criticalMax.
   */
  async updateSensorStandard(standardId: number, dto: UpdateSensorStandardDto) {
    const standard = await this.prisma.sensorStandard.findUnique({
      where: { id: standardId },
    });
    if (!standard) {
      throw new NotFoundException(
        `Sensor standard ${standardId} no encontrado`,
      );
    }

    const newHealthy = dto.defaultHealthyMax ?? standard.defaultHealthyMax;
    const newWarning = dto.defaultWarningMax ?? standard.defaultWarningMax;
    const newCritical = dto.defaultCriticalMax ?? standard.defaultCriticalMax;

    if (newHealthy >= newWarning || newWarning >= newCritical) {
      throw new ConflictException(
        `Los umbrales deben cumplir: defaultHealthyMax (${newHealthy}) < defaultWarningMax (${newWarning}) < defaultCriticalMax (${newCritical})`,
      );
    }

    return this.prisma.sensorStandard.update({
      where: { id: standardId },
      data: {
        ...(dto.defaultHealthyMax !== undefined && {
          defaultHealthyMax: dto.defaultHealthyMax,
        }),
        ...(dto.defaultWarningMax !== undefined && {
          defaultWarningMax: dto.defaultWarningMax,
        }),
        ...(dto.defaultCriticalMax !== undefined && {
          defaultCriticalMax: dto.defaultCriticalMax,
        }),
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // ALERT CONFIGURATION (global + per-motor overrides)
  // ═══════════════════════════════════════════════════════════════════

  /** Get global alert configuration. */
  async getAlertConfig(): Promise<{
    alarmConsecutiveReadings: number;
    alarmGracePeriodMs: number;
    postRestartCooldownMs: number;
    maxAutoRestarts: number;
  }> {
    const row = await this.prisma.systemConfig.findUnique({
      where: { key: 'alert_config' },
    });
    if (!row) {
      return {
        alarmConsecutiveReadings: 5,
        alarmGracePeriodMs: 120000,
        postRestartCooldownMs: 60000,
        maxAutoRestarts: 1,
      };
    }
    const v = row.value as Record<string, number>;
    return {
      alarmConsecutiveReadings: v.alarmConsecutiveReadings ?? 5,
      alarmGracePeriodMs: v.alarmGracePeriodMs ?? 120000,
      postRestartCooldownMs: v.postRestartCooldownMs ?? 60000,
      maxAutoRestarts: v.maxAutoRestarts ?? 1,
    };
  }

  /** Update global alert configuration. */
  async updateAlertConfig(dto: UpdateAlertConfigDto) {
    const current = await this.getAlertConfig();
    const updated = { ...current, ...dto };

    await this.prisma.systemConfig.upsert({
      where: { key: 'alert_config' },
      create: { key: 'alert_config', value: updated },
      update: { value: updated },
    });

    // Hot-reload: apply global config to all motors that don't have an override
    await this.telemetryEvaluation.applyGlobalAlertConfig(updated);

    return updated;
  }

  /** List all per-motor alert overrides. */
  async listAlertOverrides() {
    return this.prisma.motorAlertOverride.findMany({
      include: { motor: { select: { id: true, code: true, name: true } } },
    });
  }

  /** Create or update a per-motor alert override. */
  async upsertAlertOverride(dto: UpsertAlertOverrideDto) {
    const motor = await this.prisma.motor.findUnique({
      where: { id: dto.motorId },
    });
    if (!motor)
      throw new NotFoundException(`Motor ${dto.motorId} no encontrado`);

    const override = await this.prisma.motorAlertOverride.upsert({
      where: { motorId: dto.motorId },
      create: {
        motorId: dto.motorId,
        alarmConsecutiveReadings: dto.alarmConsecutiveReadings,
        alarmGracePeriodMs: dto.alarmGracePeriodMs,
        postRestartCooldownMs: dto.postRestartCooldownMs,
        maxAutoRestarts: dto.maxAutoRestarts,
      },
      update: {
        alarmConsecutiveReadings: dto.alarmConsecutiveReadings,
        alarmGracePeriodMs: dto.alarmGracePeriodMs,
        postRestartCooldownMs: dto.postRestartCooldownMs,
        maxAutoRestarts: dto.maxAutoRestarts,
      },
      include: { motor: { select: { id: true, code: true, name: true } } },
    });

    // Hot-reload: apply override to this specific motor
    this.telemetryEvaluation.updateMotorParams(dto.motorId, {
      alarmConsecutiveReadings: dto.alarmConsecutiveReadings,
      alarmGracePeriodMs: dto.alarmGracePeriodMs,
      postRestartCooldownMs: dto.postRestartCooldownMs,
      maxAutoRestarts: dto.maxAutoRestarts,
    });

    return override;
  }

  /** Delete a per-motor alert override (motor reverts to global config). */
  async deleteAlertOverride(motorId: number) {
    const override = await this.prisma.motorAlertOverride.findUnique({
      where: { motorId },
    });
    if (!override)
      throw new NotFoundException(
        `Override for motor ${motorId} no encontrado`,
      );

    await this.prisma.motorAlertOverride.delete({ where: { motorId } });

    // Hot-reload: revert motor to global config
    const globalConfig = await this.getAlertConfig();
    this.telemetryEvaluation.updateMotorParams(motorId, globalConfig);

    return { deleted: true };
  }
}
