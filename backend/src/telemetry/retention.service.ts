import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma';

/**
 * Retention service — scheduled jobs for data lifecycle management.
 *
 * Two responsibilities:
 * 1. Hourly aggregation: condense raw readings into readings_hourly_agg.
 * 2. Purge: delete raw readings older than RETENTION_DAYS (default 7).
 *
 * Runs every hour at minute 5 (avoids exact hour boundary race conditions).
 * Logs results to retention_job_log for observability.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  /** Raw readings retention in days. After this, only hourly aggregates remain. */
  private readonly retentionDays = Number(process.env.RETENTION_DAYS) || 7;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Main retention job — runs every hour at :05.
   * 1. Aggregate the previous hour's readings into hourly buckets.
   * 2. Purge raw readings older than retentionDays.
   */
  @Cron('5 * * * *') // minute 5 of every hour
  async handleRetention(): Promise<void> {
    const runAt = new Date();
    this.logger.log('Retention job started');

    let partitionsAggregated = 0;
    let partitionsDropped = 0;
    let error: string | null = null;

    try {
      partitionsAggregated = await this.aggregateLastHour();
      partitionsDropped = await this.purgeOldReadings();

      this.logger.log(
        `Retention job complete: aggregated=${partitionsAggregated}, purged=${partitionsDropped}`,
      );
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Retention job failed: ${error}`);
    }

    // Log the run result
    await this.prisma.retentionJobLog.create({
      data: {
        runAt,
        status: error ? 'error' : 'ok',
        partitionsAggregated,
        partitionsDropped,
        error,
      },
    });
  }

  /**
   * Aggregate raw readings from the previous full hour into readings_hourly_agg.
   * Groups by motor_sensor_id, computes avg/min/max and anomaly/fault counts.
   * Uses upsert to be idempotent (safe to re-run).
   */
  private async aggregateLastHour(): Promise<number> {
    const now = new Date();
    // Previous full hour: e.g., if now is 14:05, aggregate 13:00–13:59
    const hourEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);
    const hourStart = new Date(hourEnd.getTime() - 60 * 60 * 1000);

    // Get all sensor IDs that have readings in the last hour
    const sensorGroups = await this.prisma.reading.groupBy({
      by: ['motorSensorId'],
      where: {
        recordedAt: { gte: hourStart, lt: hourEnd },
      },
      _avg: { value: true },
      _min: { value: true },
      _max: { value: true },
      _count: { id: true },
    });

    let aggregated = 0;

    for (const group of sensorGroups) {
      // Count anomalies and faults separately
      const anomalyCount = await this.prisma.reading.count({
        where: {
          motorSensorId: group.motorSensorId,
          recordedAt: { gte: hourStart, lt: hourEnd },
          isAnomalous: true,
        },
      });

      const faultCount = await this.prisma.sensorFault.count({
        where: {
          motorSensorId: group.motorSensorId,
          detectedAt: { gte: hourStart, lt: hourEnd },
        },
      });

      await this.prisma.readingHourlyAgg.upsert({
        where: {
          motorSensorId_hourBucket: {
            motorSensorId: group.motorSensorId,
            hourBucket: hourStart,
          },
        },
        update: {
          avgValue: group._avg.value,
          minValue: group._min.value,
          maxValue: group._max.value,
          anomalyCount,
          faultCount,
        },
        create: {
          motorSensorId: group.motorSensorId,
          hourBucket: hourStart,
          avgValue: group._avg.value,
          minValue: group._min.value,
          maxValue: group._max.value,
          anomalyCount,
          faultCount,
        },
      });

      aggregated++;
    }

    return aggregated;
  }

  /**
   * Delete raw readings older than retentionDays.
   * Returns the number of deleted rows.
   */
  private async purgeOldReadings(): Promise<number> {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);

    const result = await this.prisma.reading.deleteMany({
      where: {
        recordedAt: { lt: cutoff },
      },
    });

    return result.count;
  }
}
