export declare enum OrgPlan {
    FREE = "FREE",
    STARTER = "STARTER",
    GROWTH = "GROWTH",
    BUSINESS = "BUSINESS",
    ENTERPRISE = "ENTERPRISE"
}
export declare enum UserRole {
    SUPER_ADMIN = "SUPER_ADMIN",
    ORG_OWNER = "ORG_OWNER",
    ORG_ADMIN = "ORG_ADMIN",
    ORG_MEMBER = "ORG_MEMBER",
    ORG_VIEWER = "ORG_VIEWER"
}
export declare enum AuditAction {
    CREATE = "CREATE",
    UPDATE = "UPDATE",
    DELETE = "DELETE",
    PUBLISH = "PUBLISH",
    IMPORT = "IMPORT",
    EXPORT = "EXPORT",
    LOGIN = "LOGIN",
    LOGOUT = "LOGOUT",
    INVITE = "INVITE",
    REVOKE = "REVOKE"
}
export declare enum PageStatus {
    DRAFT = "DRAFT",
    GENERATING = "GENERATING",
    GENERATED = "GENERATED",
    PUBLISHING = "PUBLISHING",
    PUBLISHED = "PUBLISHED",
    FAILED = "FAILED",
    ARCHIVED = "ARCHIVED"
}
export declare enum ProjectStatus {
    ACTIVE = "ACTIVE",
    ARCHIVED = "ARCHIVED",
    DELETED = "DELETED"
}
export declare enum DataSourceType {
    CSV = "CSV",
    EXCEL = "EXCEL",
    GOOGLE_SHEETS = "GOOGLE_SHEETS",
    AIRTABLE = "AIRTABLE",
    JSON = "JSON",
    API_ENDPOINT = "API_ENDPOINT"
}
export declare enum ImportStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    CANCELLED = "CANCELLED"
}
export declare enum GenerationRunStatus {
    QUEUED = "QUEUED",
    PROCESSING = "PROCESSING",
    COMPLETED = "COMPLETED",
    PARTIAL = "PARTIAL",// some chunks succeeded, some failed
    FAILED = "FAILED",
    CANCELLED = "CANCELLED"
}
export declare const PLAN_LIMITS: Record<OrgPlan, {
    maxProjects: number;
    maxPagesPerMonth: number;
    maxAiTokensPerMonth: number;
    maxDataSources: number;
    maxTeamMembers: number;
    canUseCustomDomains: boolean;
    canUseWebhooks: boolean;
    canUseApiKeys: boolean;
}>;
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
export interface PaginationParams {
    page: number;
    limit: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
}
export interface JwtPayload {
    sub: string;
    email: string;
    orgId: string;
    role: string;
    iat?: number;
    exp?: number;
}
//# sourceMappingURL=index.d.ts.map