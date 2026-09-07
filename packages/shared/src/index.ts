// Enums mirrored here so shared package doesn't depend on generated Prisma client.
// These must stay in sync with packages/database/prisma/schema.prisma
export enum OrgPlan {
  FREE = "FREE",
  STARTER = "STARTER",
  GROWTH = "GROWTH",
  BUSINESS = "BUSINESS",
  ENTERPRISE = "ENTERPRISE",
}

export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  ORG_OWNER = "ORG_OWNER",
  ORG_ADMIN = "ORG_ADMIN",
  ORG_MEMBER = "ORG_MEMBER",
  ORG_VIEWER = "ORG_VIEWER",
}

export enum AuditAction {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  PUBLISH = "PUBLISH",
  IMPORT = "IMPORT",
  EXPORT = "EXPORT",
  LOGIN = "LOGIN",
  LOGOUT = "LOGOUT",
  INVITE = "INVITE",
  REVOKE = "REVOKE",
}

export enum PageStatus {
  DRAFT = "DRAFT",
  GENERATING = "GENERATING",
  GENERATED = "GENERATED",
  PUBLISHING = "PUBLISHING",
  PUBLISHED = "PUBLISHED",
  FAILED = "FAILED",
  ARCHIVED = "ARCHIVED",
}

export enum ProjectStatus {
  ACTIVE = "ACTIVE",
  ARCHIVED = "ARCHIVED",
  DELETED = "DELETED",
}

export enum DataSourceType {
  CSV = "CSV",
  EXCEL = "EXCEL",
  GOOGLE_SHEETS = "GOOGLE_SHEETS",
  AIRTABLE = "AIRTABLE",
  JSON = "JSON",
  API_ENDPOINT = "API_ENDPOINT",
}

export enum ImportStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum GenerationRunStatus {
  QUEUED = "QUEUED",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  PARTIAL = "PARTIAL",   // some chunks succeeded, some failed
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}


// Both the API (enforcement) and frontend (UI hints) import from here.
// Changing a limit here propagates everywhere automatically.
export const PLAN_LIMITS: Record<
  OrgPlan,
  {
    maxProjects: number;
    maxPagesPerMonth: number;
    maxAiTokensPerMonth: number;
    maxDataSources: number;
    maxTeamMembers: number;
    canUseCustomDomains: boolean;
    canUseWebhooks: boolean;
    canUseApiKeys: boolean;
  }
> = {
  FREE: {
    maxProjects: 3,
    maxPagesPerMonth: 500,
    maxAiTokensPerMonth: 50_000,
    maxDataSources: 3,
    maxTeamMembers: 1,
    canUseCustomDomains: false,
    canUseWebhooks: false,
    canUseApiKeys: false,
  },
  STARTER: {
    maxProjects: 10,
    maxPagesPerMonth: 5_000,
    maxAiTokensPerMonth: 500_000,
    maxDataSources: 10,
    maxTeamMembers: 3,
    canUseCustomDomains: true,
    canUseWebhooks: false,
    canUseApiKeys: false,
  },
  GROWTH: {
    maxProjects: 50,
    maxPagesPerMonth: 50_000,
    maxAiTokensPerMonth: 2_000_000,
    maxDataSources: 50,
    maxTeamMembers: 10,
    canUseCustomDomains: true,
    canUseWebhooks: true,
    canUseApiKeys: true,
  },
  BUSINESS: {
    maxProjects: 200,
    maxPagesPerMonth: 250_000,
    maxAiTokensPerMonth: 10_000_000,
    maxDataSources: 200,
    maxTeamMembers: 50,
    canUseCustomDomains: true,
    canUseWebhooks: true,
    canUseApiKeys: true,
  },
  ENTERPRISE: {
    maxProjects: Infinity,
    maxPagesPerMonth: Infinity,
    maxAiTokensPerMonth: Infinity,
    maxDataSources: Infinity,
    maxTeamMembers: Infinity,
    canUseCustomDomains: true,
    canUseWebhooks: true,
    canUseApiKeys: true,
  },
};

// Standard API response envelope — every response follows this shape
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

// Pagination query params — reused across all list endpoints
export interface PaginationParams {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// JWT payload shape — what we encode into the token
export interface JwtPayload {
  sub: string;       // userId
  email: string;
  orgId: string;     // active org context
  role: string;      // role within that org
  iat?: number;
  exp?: number;
}
