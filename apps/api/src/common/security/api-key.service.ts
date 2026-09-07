import { Injectable, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../../modules/database/prisma.service";

// =============================================================================
// API KEY SERVICE
//
// API keys allow programmatic access without OAuth/JWT.
// Used for: CI/CD pipelines, third-party integrations, webhooks.
//
// Security design:
//   1. Key format: "mpc_live_<32 random bytes hex>" (72 chars total)
//      Prefix "mpc_live_" makes keys identifiable in logs/code reviews.
//      GitHub-style: easy to grep for accidental commits.
//
//   2. Storage: only SHA-256 hash stored in DB — never the raw key.
//      If DB is compromised, attacker gets hashes, not usable keys.
//      Raw key shown ONCE at creation — user must copy it.
//
//   3. Prefix stored: first 16 chars shown in UI for identification.
//      User can see "mpc_live_abc12345..." without exposing the full key.
//
//   4. Scopes: fine-grained permissions per key.
//      ["pages:read"] — read-only access
//      ["pages:write", "publish"] — can generate and publish
//      ["*"] — full access (admin keys only)
//
//   5. Expiry: optional expiry date. Expired keys rejected at auth time.
//
// Lookup performance:
//   SHA-256 hash is computed on every request (fast, ~0.1ms).
//   Indexed on keyHash column — O(log n) lookup.
// =============================================================================

const KEY_PREFIX = "mpc_live_";
const KEY_BYTES = 32; // 32 random bytes = 64 hex chars

export const API_KEY_SCOPES = [
  "pages:read",
  "pages:write",
  "templates:read",
  "templates:write",
  "publish",
  "data-sources:read",
  "data-sources:write",
  "*",
] as const;

export type ApiKeyScope = typeof API_KEY_SCOPES[number];

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  // Generate a new API key — returns the raw key (shown once) + DB record
  async createKey(
    orgId: string,
    userId: string,
    name: string,
    scopes: ApiKeyScope[],
    expiresAt?: Date
  ) {
    const rawKey = KEY_PREFIX + randomBytes(KEY_BYTES).toString("hex");
    const keyHash = this.hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 16) + "...";

    const record = await this.prisma.apiKey.create({
      data: {
        orgId,
        userId,
        name,
        keyHash,
        keyPrefix,
        scopes,
        expiresAt,
      },
      select: {
        id: true, name: true, keyPrefix: true,
        scopes: true, expiresAt: true, createdAt: true,
      },
    });

    // Return raw key ONCE — never stored, never retrievable again
    return { ...record, key: rawKey };
  }

  // Validate an API key from request header — returns org context
  async validateKey(rawKey: string): Promise<{
    orgId: string;
    userId: string;
    scopes: string[];
    keyId: string;
  }> {
    if (!rawKey.startsWith(KEY_PREFIX)) {
      throw new UnauthorizedException("Invalid API key format");
    }

    const keyHash = this.hashKey(rawKey);

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      select: {
        id: true, orgId: true, userId: true,
        scopes: true, expiresAt: true, revokedAt: true,
        org: { select: { status: true } },
      },
    });

    if (!apiKey) {
      throw new UnauthorizedException("Invalid API key");
    }

    if (apiKey.revokedAt) {
      throw new UnauthorizedException("API key has been revoked");
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new UnauthorizedException("API key has expired");
    }

    if (apiKey.org.status !== "ACTIVE") {
      throw new UnauthorizedException("Organization is suspended");
    }

    // Update lastUsedAt — fire and forget
    this.prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    return {
      orgId: apiKey.orgId,
      userId: apiKey.userId,
      scopes: apiKey.scopes,
      keyId: apiKey.id,
    };
  }

  // Check if a key has a required scope
  hasScope(scopes: string[], required: ApiKeyScope): boolean {
    return scopes.includes("*") || scopes.includes(required);
  }

  // Revoke a key
  async revokeKey(keyId: string, orgId: string): Promise<void> {
    await this.prisma.apiKey.updateMany({
      where: { id: keyId, orgId },
      data: { revokedAt: new Date() },
    });
  }

  // List keys for an org (never returns hashes)
  async listKeys(orgId: string) {
    return this.prisma.apiKey.findMany({
      where: { orgId, revokedAt: null },
      select: {
        id: true, name: true, keyPrefix: true,
        scopes: true, lastUsedAt: true,
        expiresAt: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private hashKey(rawKey: string): string {
    return createHash("sha256").update(rawKey).digest("hex");
  }
}
