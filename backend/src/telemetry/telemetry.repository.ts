import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';

/**
 * Persistence layer for telemetry readings.
 * Only this class touches Prisma directly for reading-related operations.
 */
@Injectable()
export class TelemetryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Persist a single reading. */
  async persistReading(data: {
    motorSensorId: number;
    value: number;
    isAnomalous: boolean;
    isImplausible: boolean;
    recordedAt: Date;
  }) {
    return this.prisma.reading.create({
      data: {
        motorSensorId: data.motorSensorId,
        value: data.value,
        isAnomalous: data.isAnomalous,
        isImplausible: data.isImplausible,
        recordedAt: data.recordedAt,
      },
    });
  }

  /** Get the last N readings for a motor_sensor (used on boot to restore window). */
  async getLastReadings(motorSensorId: number, count: number) {
    return this.prisma.reading.findMany({
      where: { motorSensorId },
      orderBy: { recordedAt: 'desc' },
      take: count,
    });
  }

  /** Get all motor_sensors with their motor info (for boot initialization). */
  async getAllMotorSensors() {
    return this.prisma.motorSensor.findMany({
      include: { motor: true },
    });
  }
}
