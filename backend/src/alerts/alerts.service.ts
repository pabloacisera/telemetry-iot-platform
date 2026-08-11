import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { Prisma } from '@prisma/client';

export interface AlertHistoryParams {
  page: number;
  limit: number;
  motorId?: number;
  from?: Date;
  to?: Date;
  status?: 'all' | 'active' | 'resolved';
  cause?: string;
}

export interface AlertHistoryResult {
  data: AlertHistoryRow[];
  total: number;
  page: number;
  limit: number;
}

export interface AlertHistoryRow {
  id: number;
  motorId: number;
  motor: { id: number; code: string; name: string } | null;
  type: string;
  metadata: Record<string, unknown> | null;
  triggeredAt: Date;
  resolvedAt: Date | null;
  resolvedBy: number | null;
  resolvedByUser: { id: number; email: string } | null;
  resolutionNote: string | null;
}

/**
 * Service for alert management (query and resolution).
 *
 * Resolution uses optimistic locking:
 * UPDATE ... WHERE resolved_at IS NULL → if 0 rows affected, another user resolved it first.
 * This avoids race conditions without pessimistic locks or extra DB round-trips.
 */
@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Get all unresolved (active) alerts, newest first. */
  async getActive() {
    return this.prisma.alert.findMany({
      where: { resolvedAt: null },
      orderBy: { triggeredAt: 'desc' },
    });
  }

  /** Get alerts for a specific motor (resolved and unresolved), newest first. */
  async getByMotor(motorId: number) {
    return this.prisma.alert.findMany({
      where: { motorId },
      orderBy: { triggeredAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Get paginated alert history with optional filters.
   * Includes motor info and resolvedByUser for the history table.
   */
  async getHistory(params: AlertHistoryParams): Promise<AlertHistoryResult> {
    const { page, limit, motorId, from, to, status, cause } = params;

    const where: Record<string, unknown> = { deletedAt: null };

    if (motorId) where.motorId = motorId;

    if (from || to) {
      where.triggeredAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    if (status === 'active') where.resolvedAt = null;
    if (status === 'resolved') where.resolvedAt = { not: null };

    // Causa = valor de metadata.cause (JSON). 'none' = alertas sin metadata.
    if (cause === 'none') {
      where.metadata = { equals: Prisma.DbNull };
    } else if (cause) {
      where.metadata = { path: '$.cause', string_contains: cause };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.alert.findMany({
        where,
        orderBy: { triggeredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          motor: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.alert.count({ where }),
    ]);

    // Resolve user info separately (avoid exposing password hash via relation)
    const userIds = [
      ...new Set(
        data.map((a) => a.resolvedBy).filter((id): id is number => id !== null),
      ),
    ];
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const rows: AlertHistoryRow[] = data.map((a) => ({
      id: a.id,
      motorId: a.motorId,
      motor: a.motor,
      type: a.type,
      metadata: a.metadata as Record<string, unknown> | null,
      triggeredAt: a.triggeredAt,
      resolvedAt: a.resolvedAt,
      resolvedBy: a.resolvedBy,
      resolvedByUser: a.resolvedBy ? (userMap.get(a.resolvedBy) ?? null) : null,
      resolutionNote: a.resolutionNote,
    }));

    return { data: rows, total, page, limit };
  }

  /**
   * Resolve an alert with optimistic locking.
   * Throws 409 Conflict if already resolved by another user.
   */
  async resolve(alertId: number, userId: number, note?: string): Promise<void> {
    const result = await this.prisma.$executeRaw`
      UPDATE alerts
      SET resolved_at = NOW(), resolved_by = ${userId}, resolution_note = ${note || null}
      WHERE id = ${alertId} AND resolved_at IS NULL
    `;

    if (result === 0) {
      throw new ConflictException('Alert already resolved by another user');
    }
  }
}
