import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { CacheService } from '../cache/cache.service';

interface SensorSnapshot {
  motorSensorId: number;
  sensorType: string;
  value: number | null;
  status: string;
  recordedAt: string | null;
}

interface LiveContext {
  motorId: number;
  motorStatus: string;
  sensors: SensorSnapshot[];
  recentAlerts: { type: string; triggeredAt: Date; resolvedAt: Date | null }[];
  recentStatusChanges: {
    fromStatus: string | null;
    toStatus: string | null;
    changedAt: Date;
  }[];
}

/**
 * Builds the live context blocks for a specific motor:
 * 1. Redis snapshot (last value + status per sensor)
 * 2. Recent alerts and status changes from MySQL
 */
@Injectable()
export class LiveContextService {
  private readonly logger = new Logger(LiveContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  /** Build live context for a motor. Returns null if motor not found. */
  async buildContext(motorId: number): Promise<LiveContext | null> {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
      include: { sensors: true },
    });

    if (!motor) return null;

    // Block 1: Redis snapshot per sensor
    const sensors: SensorSnapshot[] = [];
    for (const ms of motor.sensors) {
      const snapshot = await this.cacheService.getSnapshot(ms.id);
      sensors.push({
        motorSensorId: ms.id,
        sensorType: ms.sensorType,
        value: snapshot?.value ?? null,
        status: ms.status,
        recordedAt: snapshot?.recordedAt ?? null,
      });
    }

    // Block 2: Recent alerts (last 10, within last 4 hours)
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const recentAlerts = await this.prisma.alert.findMany({
      where: {
        motorId,
        triggeredAt: { gte: fourHoursAgo },
      },
      orderBy: { triggeredAt: 'desc' },
      take: 10,
      select: { type: true, triggeredAt: true, resolvedAt: true },
    });

    // Block 3: Recent status changes (last 10, within last 4 hours)
    const recentStatusChanges = await this.prisma.motorStatusHistory.findMany({
      where: {
        motorId,
        changedAt: { gte: fourHoursAgo },
      },
      orderBy: { changedAt: 'desc' },
      take: 10,
      select: { fromStatus: true, toStatus: true, changedAt: true },
    });

    return {
      motorId,
      motorStatus: motor.status,
      sensors,
      recentAlerts,
      recentStatusChanges,
    };
  }

  /** Format live context into a human-readable string for the LLM prompt. */
  formatForPrompt(ctx: LiveContext): string {
    const lines: string[] = [];

    lines.push(`## Motor ${ctx.motorId} — Current status: ${ctx.motorStatus}`);
    lines.push('');
    lines.push('### Sensors (live snapshot from Redis)');

    for (const s of ctx.sensors) {
      if (s.value === null) {
        lines.push(
          `- ${s.sensorType}: NO RECENT DATA (sensor status: ${s.status})`,
        );
      } else if (['fault', 'fault_persistent', 'stuck'].includes(s.status)) {
        lines.push(
          `- ${s.sensorType}: ${s.value} [⚠️ UNRELIABLE — sensor status: ${s.status}] (at ${s.recordedAt})`,
        );
      } else {
        lines.push(
          `- ${s.sensorType}: ${s.value} (status: ${s.status}, at ${s.recordedAt})`,
        );
      }
    }

    if (ctx.recentAlerts.length > 0) {
      lines.push('');
      lines.push('### Recent alerts (last 4 hours)');
      for (const a of ctx.recentAlerts) {
        const resolved = a.resolvedAt
          ? `resolved at ${a.resolvedAt.toISOString()}`
          : 'ACTIVE';
        lines.push(
          `- ${a.type} at ${a.triggeredAt.toISOString()} — ${resolved}`,
        );
      }
    }

    if (ctx.recentStatusChanges.length > 0) {
      lines.push('');
      lines.push('### Recent status changes (last 4 hours)');
      for (const sc of ctx.recentStatusChanges) {
        lines.push(
          `- ${sc.fromStatus} → ${sc.toStatus} at ${sc.changedAt.toISOString()}`,
        );
      }
    }

    return lines.join('\n');
  }
}
