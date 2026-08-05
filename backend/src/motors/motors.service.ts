import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { CacheService } from '../cache';

/**
 * Service for motor queries and snapshot operations.
 *
 * GET /motors reads live data from Redis (write-through cache) enriched with
 * static motor info from MySQL. Falls back to MySQL if Redis has no data (cold start).
 */
@Injectable()
export class MotorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Get all motors with their sensors and last values (for the grid view). */
  async getAll() {
    const motors = await this.prisma.motor.findMany({
      where: { deletedAt: null },
      include: { sensors: { where: { deletedAt: null } } },
    });

    const snapshots = await this.cache.getAllSnapshots();

    return motors.map((motor) => ({
      id: motor.id,
      code: motor.code,
      name: motor.name,
      location: motor.location,
      connectionType: motor.connectionType,
      status: motor.status,
      statusChangedAt: motor.statusChangedAt,
      sensors: motor.sensors.map((sensor) => {
        const snapshot = snapshots.get(sensor.id);
        return {
          id: sensor.id,
          sensorType: sensor.sensorType,
          status: sensor.status,
          healthyMax: sensor.healthyMax,
          warningMax: sensor.warningMax,
          criticalMax: sensor.criticalMax,
          lastValue: snapshot?.value ?? sensor.lastValue ?? null,
          lastReadingAt:
            snapshot?.recordedAt ?? sensor.lastReadingAt?.toISOString() ?? null,
        };
      }),
    }));
  }

  /** Get a single motor with detailed sensor info, active alerts, and recent history. */
  async getById(motorId: number) {
    const motor = await this.prisma.motor.findFirst({
      where: { id: motorId, deletedAt: null },
      include: {
        sensors: { where: { deletedAt: null } },
        alerts: {
          where: { resolvedAt: null, deletedAt: null },
          orderBy: { triggeredAt: 'desc' },
          take: 5,
        },
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!motor) return null;

    // Fetch all sensor snapshots and recent readings in parallel
    const [snapshots, recentReadingsMap] = await Promise.all([
      Promise.all(motor.sensors.map((s) => this.cache.getSnapshot(s.id))),
      Promise.all(motor.sensors.map((s) => this.cache.getRecentReadings(s.id))),
    ]);

    const sensors = motor.sensors.map((sensor, i) => {
      const snapshot = snapshots[i];
      const recentValues = recentReadingsMap[i];
      return {
        id: sensor.id,
        sensorType: sensor.sensorType,
        status: sensor.status,
        healthyMax: sensor.healthyMax,
        warningMax: sensor.warningMax,
        criticalMax: sensor.criticalMax,
        lastValue: snapshot?.value ?? sensor.lastValue ?? null,
        lastReadingAt:
          snapshot?.recordedAt ?? sensor.lastReadingAt?.toISOString() ?? null,
        recentValues,
      };
    });

    return {
      id: motor.id,
      code: motor.code,
      name: motor.name,
      location: motor.location,
      connectionType: motor.connectionType,
      status: motor.status,
      statusChangedAt: motor.statusChangedAt,
      sensors,
      activeAlerts: motor.alerts,
      recentHistory: motor.statusHistory,
    };
  }
}
