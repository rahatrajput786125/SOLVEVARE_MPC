"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAN_LIMITS = exports.GenerationRunStatus = exports.ImportStatus = exports.DataSourceType = exports.ProjectStatus = exports.PageStatus = exports.AuditAction = exports.UserRole = exports.OrgPlan = void 0;
// Enums mirrored here so shared package doesn't depend on generated Prisma client.
// These must stay in sync with packages/database/prisma/schema.prisma
var OrgPlan;
(function (OrgPlan) {
    OrgPlan["FREE"] = "FREE";
    OrgPlan["STARTER"] = "STARTER";
    OrgPlan["GROWTH"] = "GROWTH";
    OrgPlan["BUSINESS"] = "BUSINESS";
    OrgPlan["ENTERPRISE"] = "ENTERPRISE";
})(OrgPlan || (exports.OrgPlan = OrgPlan = {}));
var UserRole;
(function (UserRole) {
    UserRole["SUPER_ADMIN"] = "SUPER_ADMIN";
    UserRole["ORG_OWNER"] = "ORG_OWNER";
    UserRole["ORG_ADMIN"] = "ORG_ADMIN";
    UserRole["ORG_MEMBER"] = "ORG_MEMBER";
    UserRole["ORG_VIEWER"] = "ORG_VIEWER";
})(UserRole || (exports.UserRole = UserRole = {}));
var AuditAction;
(function (AuditAction) {
    AuditAction["CREATE"] = "CREATE";
    AuditAction["UPDATE"] = "UPDATE";
    AuditAction["DELETE"] = "DELETE";
    AuditAction["PUBLISH"] = "PUBLISH";
    AuditAction["IMPORT"] = "IMPORT";
    AuditAction["EXPORT"] = "EXPORT";
    AuditAction["LOGIN"] = "LOGIN";
    AuditAction["LOGOUT"] = "LOGOUT";
    AuditAction["INVITE"] = "INVITE";
    AuditAction["REVOKE"] = "REVOKE";
})(AuditAction || (exports.AuditAction = AuditAction = {}));
var PageStatus;
(function (PageStatus) {
    PageStatus["DRAFT"] = "DRAFT";
    PageStatus["GENERATING"] = "GENERATING";
    PageStatus["GENERATED"] = "GENERATED";
    PageStatus["PUBLISHING"] = "PUBLISHING";
    PageStatus["PUBLISHED"] = "PUBLISHED";
    PageStatus["FAILED"] = "FAILED";
    PageStatus["ARCHIVED"] = "ARCHIVED";
})(PageStatus || (exports.PageStatus = PageStatus = {}));
var ProjectStatus;
(function (ProjectStatus) {
    ProjectStatus["ACTIVE"] = "ACTIVE";
    ProjectStatus["ARCHIVED"] = "ARCHIVED";
    ProjectStatus["DELETED"] = "DELETED";
})(ProjectStatus || (exports.ProjectStatus = ProjectStatus = {}));
var DataSourceType;
(function (DataSourceType) {
    DataSourceType["CSV"] = "CSV";
    DataSourceType["EXCEL"] = "EXCEL";
    DataSourceType["GOOGLE_SHEETS"] = "GOOGLE_SHEETS";
    DataSourceType["AIRTABLE"] = "AIRTABLE";
    DataSourceType["JSON"] = "JSON";
    DataSourceType["API_ENDPOINT"] = "API_ENDPOINT";
})(DataSourceType || (exports.DataSourceType = DataSourceType = {}));
var ImportStatus;
(function (ImportStatus) {
    ImportStatus["PENDING"] = "PENDING";
    ImportStatus["PROCESSING"] = "PROCESSING";
    ImportStatus["COMPLETED"] = "COMPLETED";
    ImportStatus["FAILED"] = "FAILED";
    ImportStatus["CANCELLED"] = "CANCELLED";
})(ImportStatus || (exports.ImportStatus = ImportStatus = {}));
var GenerationRunStatus;
(function (GenerationRunStatus) {
    GenerationRunStatus["QUEUED"] = "QUEUED";
    GenerationRunStatus["PROCESSING"] = "PROCESSING";
    GenerationRunStatus["COMPLETED"] = "COMPLETED";
    GenerationRunStatus["PARTIAL"] = "PARTIAL";
    GenerationRunStatus["FAILED"] = "FAILED";
    GenerationRunStatus["CANCELLED"] = "CANCELLED";
})(GenerationRunStatus || (exports.GenerationRunStatus = GenerationRunStatus = {}));
// Both the API (enforcement) and frontend (UI hints) import from here.
// Changing a limit here propagates everywhere automatically.
exports.PLAN_LIMITS = {
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
//# sourceMappingURL=index.js.map