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

    // Sync sensor statuses to keep frontend consistent
    if (
      toStatus === 'shutting_down' ||
      toStatus === 'restarting' ||
      toStatus === 'disabled'
    ) {
      await this.transitionMotorSensors(motorId, 'fault');
    } else if (toStatus === 'healthy') {
      await this.transitionMotorSensors(motorId, 'ok');
      // Auto-resolve this motor's open alerts once it recovers to healthy.
      await this.resolveMotorAlerts(motorId);
    }
  }

  /**
   * Resolve all open motor-level alerts (alarm/trip/disabled) for a motor.
   * Called when the motor recovers to healthy. Uses resolvedBy=null so the
   * frontend shows the resolution as "Automática". Emits 'alert-resolved'.
   */
  private async resolveMotorAlerts(motorId: number): Promise<void> {
    const alerts = await this.prisma.alert.findMany({
      where: {
        motorId,
        resolvedAt: null,
        deletedAt: null,
        type: { in: ['motor_alarm', 'motor_trip', 'motor_disabled'] },
      },
      select: { id: true },
    });

    if (alerts.length === 0) return;

    await this.prisma.alert.updateMany({
      where: { id: { in: alerts.map((a) => a.id) } },
      data: {
        resolvedAt: new Date(),
        resolvedBy: null,
        resolutionNote: 'Auto-resuelta al recuperarse el motor',
      },
    });

    for (const alert of alerts) {
      this.realtime.emitAlertResolved(motorId, {
        id: alert.id,
        motorId,
        resolvedAt: new Date().toISOString(),
      });
    }

    this.logger.log(
      `Motor ${motorId}: auto-resolved ${alerts.length} alert(s) on recovery to healthy`,
    );
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

  /** Transition all sensors of a motor to a new status. */
  async transitionMotorSensors(
    motorId: number,
    toStatus: string,
  ): Promise<void> {
    const sensors = await this.prisma.motorSensor.findMany({
      where: { motorId, deletedAt: null },
    });

    const now = new Date();

    for (const sensor of sensors) {
      await this.prisma.motorSensor.update({
        where: { id: sensor.id },
        data: { status: toStatus, statusChangedAt: now },
      });

      this.realtime.emitStatusChange(motorId, {
        motorSensorId: sensor.id,
        motorId,
        sensorStatus: toStatus,
        changedAt: now.toISOString(),
      });
    }
  }

  /**
   * Create a motor-level alert and emit it via WebSocket.
   *
   * Anti-flood: a new alert is skipped if the motor already has an OPEN alert
   * of the same type, or if the most recent alert of that type (even if it was
   * already resolved, e.g. auto-resolved on recovery to healthy) was created
   * within the last ALERT_THROTTLE_MS (default 5 minutes). This prevents alert
   * spam when a fault recurs in quick cycles while the previous window was
   * closed. Escalations are preserved because they use different types
   * (motor_alarm → motor_trip, sensor_fault → sensor_fault_persistent).
   */
  async createAlert(
    motorId: number,
    type: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.prisma.alert.findFirst({
      where: { motorId, type, deletedAt: null },
      orderBy: { triggeredAt: 'desc' },
      select: { id: true, resolvedAt: true, triggeredAt: true },
    });

    if (existing) {
      const throttleMs = Number(process.env.ALERT_THROTTLE_MS) || 300_000;
      const withinThrottle =
        Date.now() - existing.triggeredAt.getTime() < throttleMs;
      if (existing.resolvedAt === null || withinThrottle) {
        this.logger.debug(
          `Alert skipped (throttled): motor ${motorId}, type ${type} (alert ${existing.id})`,
        );
        return;
      }
    }

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
