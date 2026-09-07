import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AuditAction } from "@mpc/shared";

// =============================================================================
// AUDIT SERVICE
//
// Append-only log of every significant action in the system.
// Used for:
//   - Security investigations ("who deleted this project?")
//   - Compliance (SOC2, GDPR data access logs)
//   - Billing disputes ("we generated X pages on this date")
//   - Debugging ("what changed before this broke?")
//
// Design principles:
//   1. Append-only — audit records are NEVER updated or deleted
//   2. Async — never blocks the main request (fire and forget)
//   3. Structured — before/after snapshots for UPDATE actions
//   4. IP + User Agent — for security investigations
//
// What to log:
//   ✅ CREATE/UPDATE/DELETE on projects, templates, pages
//   ✅ PUBLISH actions
//   ✅ LOGIN/LOGOUT
//   ✅ INVITE/REVOKE team members
//   ✅ Billing changes
//   ❌ Read operations (too noisy, use access logs instead)
//   ❌ Health checks, pagination queries
//
// Storage: PostgreSQL audit_logs table (partitioned by created_at monthly)
// Retention: 90 days for FREE, 1 year for BUSINESS+, forever for ENTERPRISE
// =============================================================================

export interface AuditContext {
  orgId: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditEntry {
  action: AuditAction;
  resource: string;
  resourceId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Log an audit event — fire and forget (never awaited by callers)
  log(ctx: AuditContext, entry: AuditEntry): void {
    this.writeLog(ctx, entry).catch((err) =>
      this.logger.error(`Audit log failed: ${err.message}`, entry)
    );
  }

  // Awaitable version — use when you need to guarantee the log is written
  async logAsync(ctx: AuditContext, entry: AuditEntry): Promise<void> {
    await this.writeLog(ctx, entry);
  }

  // Query audit logs for a resource
  async getLogs(
    orgId: string,
    options: {
      resource?: string;
      resourceId?: string;
      userId?: string;
      action?: AuditAction;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const { resource, resourceId, userId, action, limit = 50, offset = 0 } = options;

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({
        where: {
          orgId,
          ...(resource && { resource }),
          ...(resourceId && { resourceId }),
          ...(userId && { userId }),
          ...(action && { action }),
        },
      }),
      this.prisma.auditLog.findMany({
        where: {
          orgId,
          ...(resource && { resource }),
          ...(resourceId && { resourceId }),
          ...(userId && { userId }),
          ...(action && { action }),
        },
        select: {
          id: true, action: true, resource: true, resourceId: true,
          before: true, after: true, ipAddress: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
    ]);

    return { items, total, limit, offset };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async writeLog(ctx: AuditContext, entry: AuditEntry): Promise<void> {
    // Sanitize before/after — remove sensitive fields
    const before = entry.before ? this.sanitize(entry.before) : undefined;
    const after = entry.after ? this.sanitize(entry.after) : undefined;

    await this.prisma.auditLog.create({
      data: {
        orgId: ctx.orgId,
        userId: ctx.userId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        before: before as object | undefined,
        after: after as object | undefined,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent?.slice(0, 255), // truncate long UAs
      },
    });
  }

  // Remove sensitive fields from before/after snapshots
  private sanitize(obj: Record<string, unknown>): Record<string, unknown> {
    const SENSITIVE_KEYS = [
      "passwordHash", "password", "appPassword",
      "secret", "token", "apiKey", "accessToken",
      "refreshToken", "stripeCustomerId",
    ];

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
