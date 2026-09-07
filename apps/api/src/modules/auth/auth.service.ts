import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { RegisterDto, LoginDto } from "./dto/auth.dto";
import { JwtPayload } from "@mpc/shared";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService
  ) {}

  async register(dto: RegisterDto) {
    // Check email uniqueness before hashing — cheap DB read vs expensive bcrypt
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("Email already registered");
    }

    // bcrypt cost factor 12 — ~300ms on modern hardware.
    // High enough to slow brute force, low enough for good UX.
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create user, org, and membership sequentially.
    // MongoDB transactions require replica set — sequential writes are safer
    // and atomic enough for registration (unique email check already done above).
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
      },
    });

    const org = await this.prisma.organization.create({
      data: {
        name: dto.orgName,
        slug: await this.generateOrgSlug(dto.orgName, this.prisma),
      },
    });

    await this.prisma.orgMember.create({
      data: {
        userId: user.id,
        orgId: org.id,
        role: UserRole.ORG_OWNER,
      },
    });

    this.logger.log(`New registration: ${user.email} / org: ${org.slug}`);

    const tokens = this.generateTokens(user.id, user.email, org.id, UserRole.ORG_OWNER);
    return {
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email, mode: "insensitive" } },
      include: {
        memberships: {
          where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
          include: { org: { select: { id: true, name: true, slug: true, plan: true, status: true } } },
          orderBy: { joinedAt: "asc" },
          take: 1, // default to first org; multi-org switching handled separately
        },
      },
    });

    // Use constant-time comparison even when user doesn't exist
    // to prevent timing attacks that reveal valid emails
    const dummyHash = "$2a$12$dummyhashfordummycomparison000000000000000000";
    const passwordToCheck = user?.passwordHash ?? dummyHash;
    const isValid = await bcrypt.compare(dto.password, passwordToCheck);

    if (!user || !isValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (user.deletedAt) {
      throw new UnauthorizedException("Account has been deactivated");
    }

    const membership = user.memberships[0];
    if (!membership) {
      throw new UnauthorizedException("No organization found for this user");
    }

    if (membership.org.status === "SUSPENDED") {
      throw new ForbiddenException("Organization is suspended");
    }

    // Update lastLoginAt without awaiting — fire and forget
    this.prisma.user
      .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      .catch((e: Error) => this.logger.error("Failed to update lastLoginAt", e));

    const tokens = this.generateTokens(user.id, user.email, membership.orgId, membership.role as UserRole);
    return {
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      org: {
        id: membership.org.id,
        name: membership.org.name,
        slug: membership.org.slug,
        plan: membership.org.plan,
      },
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwt.verify<JwtPayload>(refreshToken, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
      });

      // Verify user still exists and membership is still valid
      const membership = await this.prisma.orgMember.findFirst({
        where: {
          userId: payload.sub,
          orgId: payload.orgId,
          OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        },
        select: { role: true },
      });

      if (!membership) {
        throw new UnauthorizedException("Membership revoked");
      }

      return this.generateTokens(payload.sub, payload.email, payload.orgId, membership.role as UserRole);
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private generateTokens(
    userId: string,
    email: string,
    orgId: string,
    role: UserRole
  ) {
    const payload: JwtPayload = { sub: userId, email, orgId, role };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>("JWT_SECRET"),
      expiresIn: this.config.get<string>("JWT_EXPIRES_IN"),
    });

    // Refresh token has longer TTL and different secret
    // If access token secret leaks, refresh tokens are still safe
    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get<string>("JWT_REFRESH_SECRET"),
      expiresIn: this.config.get<string>("JWT_REFRESH_EXPIRES_IN"),
    });

    return { accessToken, refreshToken };
  }

  private async generateOrgSlug(
    name: string,
    db: PrismaService
  ): Promise<string> {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);

    const suffix = Math.random().toString(36).slice(2, 6);
    const slug = `${base}-${suffix}`;

    const exists = await db.organization.findUnique({ where: { slug } });
    return exists ? this.generateOrgSlug(name, db) : slug;
  }
}
