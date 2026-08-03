import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { CacheService } from '../cache/cache.service';

interface SensorSnapshot {
  motorSensorId: number;
  sensorType: string;
  value: number | null;
  status: string;
  recordedAt: string | null;
  healthyMax: number;
  warningMax: number;
  criticalMax: number;
}

interface LiveContext {
  motorId: number;
  motorCode: string;
  motorName: string;
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
 * 1. Redis snapshot (last value + status + thresholds per sensor)
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

    // Block 1: Redis snapshot per sensor WITH thresholds
    const sensors: SensorSnapshot[] = [];
    for (const ms of motor.sensors) {
      const snapshot = await this.cacheService.getSnapshot(ms.id);
      sensors.push({
        motorSensorId: ms.id,
        sensorType: ms.sensorType,
        value: snapshot?.value ?? ms.lastValue ?? null,
        status: ms.status,
        recordedAt: snapshot?.recordedAt ?? null,
        healthyMax: ms.healthyMax,
        warningMax: ms.warningMax,
        criticalMax: ms.criticalMax,
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
      motorCode: motor.code,
      motorName: motor.name,
      motorStatus: motor.status,
      sensors,
      recentAlerts,
      recentStatusChanges,
    };
  }

  /** Format a Date to a friendly Spanish string. */
  private formatDate(date: Date): string {
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  /** Format live context into a human-readable string for the LLM prompt. */
  formatForPrompt(ctx: LiveContext): string {
    const lines: string[] = [];

    const statusMap: Record<string, string> = {
      healthy: 'Saludable',
      under_review: 'En revisión',
      shutting_down: 'Deteniendo',
      restarting: 'Reiniciando',
      disabled: 'Deshabilitado',
      manual_shutdown: 'Parada manual',
    };

    const sensorStatusMap: Record<string, string> = {
      ok: 'Normal',
      fault: 'Falla',
      fault_persistent: 'Falla persistente',
    };

    lines.push(`## Motor ${ctx.motorCode} (${ctx.motorName}) — Estado actual: ${statusMap[ctx.motorStatus] || ctx.motorStatus}`);
    lines.push('');
    lines.push('### Sensores (datos en tiempo real)');

    for (const s of ctx.sensors) {
      const unit = s.sensorType === 'temperature' ? '°C' : s.sensorType === 'vibration' ? 'mm/s' : 'A';
      const sensorName = s.sensorType === 'temperature' ? 'Temperatura' : s.sensorType === 'vibration' ? 'Vibración' : 'Corriente';
      const sStatus = sensorStatusMap[s.status] || s.status;

      if (s.value === null) {
        lines.push(`- ${sensorName}: SIN DATOS RECIENTES (estado: ${sStatus})`);
      } else {
        let evaluation = '';
        if (s.value > s.criticalMax) {
          evaluation = '⚠️ CRÍTICO (supera umbral crítico)';
        } else if (s.value > s.warningMax) {
          evaluation = '⚠️ EN ZONA DE ADVERTENCIA';
        } else if (s.value > s.healthyMax) {
          evaluation = '↗️ Por encima del máximo saludable';
        } else {
          evaluation = '✅ Normal';
        }

        if (['fault', 'fault_persistent'].includes(s.status)) {
          evaluation = `🔴 SENSOR EN FALLA (valor no confiable)`;
        }

        lines.push(`- ${sensorName}: ${s.value.toFixed(1)} ${unit} — ${evaluation}`);
        lines.push(`  Umbrales: normal ≤${s.healthyMax} ${unit} | advertencia ≤${s.warningMax} ${unit} | crítico >${s.criticalMax} ${unit}`);
      }
    }

    if (ctx.recentAlerts.length > 0) {
      lines.push('');
      lines.push('### Alertas recientes (últimas 4 horas)');
      const alertLabels: Record<string, string> = {
        warning: 'Advertencia',
        forced_restart: 'Reinicio forzado',
        disabled: 'Deshabilitado',
        sensor_failure_widespread: 'Falla general de sensores',
      };
      for (const a of ctx.recentAlerts) {
        const label = alertLabels[a.type] || a.type;
        const resolved = a.resolvedAt ? `resuelta ${this.formatDate(a.resolvedAt)}` : 'ACTIVA';
        lines.push(`- ${label} — ${this.formatDate(a.triggeredAt)} — ${resolved}`);
      }
    }

    if (ctx.recentStatusChanges.length > 0) {
      lines.push('');
      lines.push('### Cambios de estado recientes');
      for (const sc of ctx.recentStatusChanges) {
        const from = statusMap[sc.fromStatus || ''] || sc.fromStatus || '?';
        const to = statusMap[sc.toStatus || ''] || sc.toStatus || '?';
        lines.push(`- ${from} → ${to} — ${this.formatDate(sc.changedAt)}`);
      }
    }

    return lines.join('\n');
  }
}
