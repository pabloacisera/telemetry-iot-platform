import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { RealtimeGateway } from '../realtime';
import type { Prisma } from '@prisma/client';

/**
 * Applies and audits state transitions for motors and sensors.
 *
 * Every transition is recorded in motor_status_history or sensor_faults.
 * Also emits WebSocket events so the frontend updates in real-time.
 * This is the ONLY service that writes to motors.status or motor_sensors.status.
 */
@Injectable()
export class StatusTransitionService {
  private readonly logger = new Logger(StatusTransitionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Transition a motor to a new status with full audit trail. */
  async transitionMotor(
    motorId: number,
    fromStatus: string,
    toStatus: string,
    changedBy: number | null = null,
  ): Promise<void> {
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.motor.update({
        where: { id: motorId },
        data: { status: toStatus, statusChangedAt: now },
      }),
      this.prisma.motorStatusHistory.create({
        data: { motorId, fromStatus, toStatus, changedAt: now, changedBy },
      }),
    ]);

    this.logger.log(
      `Motor ${motorId}: ${fromStatus} → ${toStatus}` +
        (changedBy ? ` (user ${changedBy})` : ' (system)'),
    );

    this.realtime.emitStatusChange(motorId, {
      motorId,
      fromStatus,
      toStatus,
      changedAt: now.toISOString(),
      changedBy,
    });
  }

  /** Transition a sensor to a new status. */
  async transitionSensor(
    motorSensorId: number,
    motorId: number,
    toStatus: string,
  ): Promise<void> {
    const now = new Date();

    await this.prisma.motorSensor.update({
      where: { id: motorSensorId },
      data: { status: toStatus, statusChangedAt: now },
    });

    this.realtime.emitStatusChange(motorId, {
      motorSensorId,
      motorId,
      sensorStatus: toStatus,
      changedAt: now.toISOString(),
    });
  }

  /** Create a motor-level alert and emit it via WebSocket. */
  async createAlert(motorId: number, type: string, metadata?: Record<string, unknown>): Promise<void> {
    const jsonMeta = metadata ? (metadata as Prisma.InputJsonValue) : undefined;
    const alert = await this.prisma.alert.create({
      data: { motorId, type, metadata: jsonMeta, triggeredAt: new Date() },
    });

    this.realtime.emitAlert(motorId, {
      id: alert.id,
      motorId,
      type,
      metadata: metadata ?? null,
      triggeredAt: alert.triggeredAt.toISOString(),
    });

    const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
    this.logger.warn(`Alert: motor ${motorId}, type ${type}${metaStr}`);
  }

  /** Create a sensor-level fault record. */
  async createSensorFault(
    motorSensorId: number,
    faultType: string,
  ): Promise<void> {
    await this.prisma.sensorFault.create({
      data: { motorSensorId, faultType, detectedAt: new Date() },
    });
  }
}
