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

interface SensorReadingHistory {
  sensorType: string;
  readings: { value: number; recordedAt: Date }[];
  avgValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  anomalyCount: number;
}

interface LiveContext {
  motorId: number;
  motorCode: string;
  motorName: string;
  motorStatus: string;
  sensors: SensorSnapshot[];
  sensorHistory: SensorReadingHistory[];
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
 * 2. MySQL readings history (last 4 hours — aggregated stats + last 40 readings)
 * 3. Recent alerts and status changes from MySQL
 */
@Injectable()
export class LiveContextService {
  private readonly logger = new Logger(LiveContextService.name);

  /** Readings context window in hours. */
  private readonly contextWindowHours = 4;

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

    const contextWindowStart = new Date(
      Date.now() - this.contextWindowHours * 60 * 60 * 1000,
    );

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

    // Block 2: MySQL readings history (last 4 hours per sensor)
    const sensorHistory: SensorReadingHistory[] = [];
    for (const ms of motor.sensors) {
      // Get last 40 readings (≈10 minutes of data at 15s intervals)
      const readings = await this.prisma.reading.findMany({
        where: {
          motorSensorId: ms.id,
          recordedAt: { gte: contextWindowStart },
        },
        orderBy: { recordedAt: 'desc' },
        take: 40,
        select: { value: true, recordedAt: true, isAnomalous: true },
      });

      // Compute aggregates
      const values = readings.map((r) => r.value);
      const anomalyCount = readings.filter((r) => r.isAnomalous).length;

      sensorHistory.push({
        sensorType: ms.sensorType,
        readings: readings.reverse(), // chronological order
        avgValue:
          values.length > 0
            ? values.reduce((a, b) => a + b, 0) / values.length
            : null,
        minValue: values.length > 0 ? Math.min(...values) : null,
        maxValue: values.length > 0 ? Math.max(...values) : null,
        anomalyCount,
      });
    }

    // Block 3: Recent alerts (last 10, within context window)
    const recentAlerts = await this.prisma.alert.findMany({
      where: {
        motorId,
        triggeredAt: { gte: contextWindowStart },
      },
      orderBy: { triggeredAt: 'desc' },
      take: 10,
      select: { type: true, triggeredAt: true, resolvedAt: true },
    });

    // Block 4: Recent status changes (last 10, within context window)
    const recentStatusChanges = await this.prisma.motorStatusHistory.findMany({
      where: {
        motorId,
        changedAt: { gte: contextWindowStart },
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
      sensorHistory,
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

  /** Format time only (HH:MM:SS). */
  private formatTime(date: Date): string {
    return date.toLocaleTimeString('es-AR', {
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

    const sensorNames: Record<string, string> = {
      temperature: 'Temperatura',
      vibration: 'Vibración',
      current: 'Corriente',
    };

    const sensorUnits: Record<string, string> = {
      temperature: '°C',
      vibration: 'mm/s',
      current: 'A',
    };

    lines.push(
      `## Motor ${ctx.motorCode} (${ctx.motorName}) — Estado actual: ${statusMap[ctx.motorStatus] || ctx.motorStatus}`,
    );
    lines.push('');
    lines.push('### Sensores (valor actual)');

    for (const s of ctx.sensors) {
      const unit = sensorUnits[s.sensorType] || '';
      const name = sensorNames[s.sensorType] || s.sensorType;
      const sStatus = sensorStatusMap[s.status] || s.status;

      if (s.value === null) {
        lines.push(`- ${name}: SIN DATOS RECIENTES (estado: ${sStatus})`);
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
          evaluation = '🔴 SENSOR EN FALLA (valor no confiable)';
        }

        lines.push(`- ${name}: ${s.value.toFixed(1)} ${unit} — ${evaluation}`);
        lines.push(
          `  Umbrales: normal ≤${s.healthyMax} ${unit} | advertencia ≤${s.warningMax} ${unit} | crítico >${s.criticalMax} ${unit}`,
        );
      }
    }

    // Sensor history (last 4 hours from MySQL)
    if (ctx.sensorHistory.some((h) => h.readings.length > 0)) {
      lines.push('');
      lines.push(
        `### Historial de lecturas (últimas ${this.contextWindowHours} horas desde MySQL)`,
      );

      for (const h of ctx.sensorHistory) {
        const name = sensorNames[h.sensorType] || h.sensorType;
        const unit = sensorUnits[h.sensorType] || '';

        if (h.readings.length === 0) {
          lines.push(
            `- ${name}: sin lecturas en las últimas ${this.contextWindowHours} horas`,
          );
          continue;
        }

        lines.push(
          `- ${name}: ${h.readings.length} lecturas | promedio: ${h.avgValue?.toFixed(2)} ${unit} | mín: ${h.minValue?.toFixed(2)} ${unit} | máx: ${h.maxValue?.toFixed(2)} ${unit} | anomalías: ${h.anomalyCount}`,
        );

        // Include last 10 readings as a mini-table for the LLM
        const last10 = h.readings.slice(-10);
        const readingsStr = last10
          .map(
            (r) =>
              `${this.formatTime(r.recordedAt)}=${r.value.toFixed(1)}${unit}`,
          )
          .join(', ');
        lines.push(`  Últimas 10: [${readingsStr}]`);
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
        const resolved = a.resolvedAt
          ? `resuelta ${this.formatDate(a.resolvedAt)}`
          : 'ACTIVA';
        lines.push(
          `- ${label} — ${this.formatDate(a.triggeredAt)} — ${resolved}`,
        );
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
