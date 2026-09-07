# API — Architecture & Logic

## Overview

NestJS REST API. Port 4000. Har request `/api/v1/` prefix se start hoti hai.

```
Client → HTTP → Guards (ApiKey → Tenant → Throttle → JWT → Roles) → Controller → Service → MongoDB / Redis Queue
```

---

## Startup Flow

```
main.ts
  ├── Helmet (security headers)
  ├── Compression (gzip)
  ├── CORS (FRONTEND_URL allow)
  ├── Global prefix: /api
  ├── URI versioning: /v1
  ├── ValidationPipe (whitelist + transform)
  ├── Swagger docs: /api/docs (dev only)
  └── Bull Board dashboard: /admin/queues (token protected)
```

---

## Global Guard Chain (har request par, is order mein)

```
1. ApiKeyGuard       → X-API-Key header check (programmatic access)
2. TenantIsolationGuard → resource orgId === JWT orgId verify
3. ThrottlerGuard    → 100 req/60s per IP (default)
4. JwtAuthGuard      → Bearer token verify, @Public() routes skip
5. RolesGuard        → @Roles() decorator check
```

### JwtAuthGuard
- Har route by default protected hai
- `@Public()` decorator se bypass hota hai (login, register)
- JWT payload mein: `{ sub: userId, email, orgId, role }`

### TenantIsolationGuard
- Multi-tenancy ka sabse important security guard
- `@TenantResource("project")` decorator wale routes par DB query se ownership verify hoti hai
- Agar resource doosre org ka ho → **403** (404 nahi — resource existence reveal nahi hoti)

### RateLimitMiddleware
- Per-org rate limiting (JWT se orgId lo, Redis counter increment)
- `/api/v1/health` par skip hota hai

---

## Response Format

Har response `ResponseInterceptor` wrap karta hai:

```json
{ "success": true, "data": { ... } }
```

Errors `GlobalExceptionFilter` handle karta hai:
```json
{ "success": false, "error": "message", "statusCode": 400 }
```

---

## Modules aur Routes

### Auth — `/api/v1/auth`

| Method | Route | Guard | Description |
|---|---|---|---|
| POST | /register | Public | User + Org + Membership create |
| POST | /login | Public | JWT + refresh token return |
| POST | /refresh | Public | Access token renew |

**Register flow:**
```
email unique check
→ bcrypt.hash(password, 12)
→ User create
→ Organization create (slug auto-generate)
→ OrgMember create (role: ORG_OWNER)
→ JWT + refreshToken return
```

**Login flow:**
- Constant-time password comparison (timing attack prevention — dummy hash use hota hai agar user nahi mila)
- SUSPENDED org → 401
- `lastLoginAt` fire-and-forget update

**JWT:**
- Access token: `JWT_SECRET`, `JWT_EXPIRES_IN`
- Refresh token: `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN` (alag secret — agar access secret leak ho toh refresh safe rahe)

---

### Projects — `/api/v1/projects`

| Method | Route | Role | Description |
|---|---|---|---|
| GET | / | any | List (paginated) |
| GET | /:id | any | Single project |
| POST | / | ORG_MEMBER+ | Create |
| PATCH | /:id | ORG_MEMBER+ | Update |
| DELETE | /:id | ORG_ADMIN+ | Soft delete |

- Create par plan limit enforce hota hai (`PLAN_LIMITS[org.plan].maxProjects`)
- Soft delete: `deletedAt = new Date()`
- Har action audit log (fire-and-forget) mein record hota hai

---

### Templates — `/api/v1/projects/:projectId/templates`

| Method | Route | Description |
|---|---|---|
| GET | / | List templates |
| GET | /:id | Single template |
| POST | / | Create template + version snapshot |
| PATCH | /:id | Update + new version snapshot |
| DELETE | /:id | Soft delete |
| GET | /:id/versions | Version history |
| POST | /validate | Syntax check (no save) |
| POST | /preview | Render preview against sample data |
| POST | /extract-variables | Extract {{variable}} names |

**Create/Update flow:**
```
$transaction:
  template create/update
  → TemplateVersion snapshot save (rollback ke liye)
```

Note: `$transaction` yahan use hota hai kyunki API MongoDB Atlas / replica set use kar sakti hai. Worker mein use nahi hota (local standalone).

---

### Data Sources — `/api/v1/projects/:projectId/data-sources`

| Method | Route | Description |
|---|---|---|
| GET | / | List |
| GET | /:id | Single |
| POST | / | Create record |
| POST | /upload | CSV/Excel file upload (multer) |
| PATCH | /column-map | Column mapping update |
| GET | /import/:importId/status | Import progress |
| DELETE | /:id | Soft delete |

**Upload flow:**
```
multer → disk par save (uploads/)
→ CsvImport record create
→ DataSource.sourceUrl = filePath
→ csvImport.processAsync() background mein (Redis nahi, direct async)
→ rowCount update
```

File disk par rehti hai — rows MongoDB mein store nahi hote. Generation ke waqt directly file se read hota hai.

---

### Pages — `/api/v1/projects/:projectId/pages`

| Method | Route | Description |
|---|---|---|
| GET | / | All pages (paginated + filter) |
| GET | /by-template | Template groups with counts |
| GET | /template/:templateId | Pages by template |
| GET | /stats | Generation stats |
| GET | /recent | Recent activity |
| POST | /generate | Generation enqueue |
| POST | /apply-canonicals | Canonical URLs apply |
| DELETE | /bulk | Bulk delete by IDs |
| DELETE | /cleanup-drafts | Empty draft pages delete |
| DELETE | /template/:templateId | All pages of template delete |
| GET | /:id | Single page (HTML disk se read) |

**Generate flow:**
```
1. Duplicate run check (QUEUED/PROCESSING already exists? → 409)
2. Template validate (content empty nahi hona chahiye)
3. DataSource validate (file disk par exist kare, rowCount > 0)
4. Plan limit check
5. Disk space check (pageCount × 50KB + 500MB buffer)
6. GenerationRun create (QUEUED)
7. Chunks queue mein enqueue (1000 rows/chunk)
8. GenerationRun → PROCESSING
```

**Single page GET:**
- DB se metadata lo
- `filePath` se HTML disk par padhlo
- `content: html` response mein return

---

### Export — `/api/v1/projects/:projectId/export`

| Method | Route | Description |
|---|---|---|
| POST | / | Export trigger → ExportJob create → queue |
| GET | /:exportJobId/status | Poll status |
| GET | /:exportJobId/report | Validation report JSON |
| GET | /:exportJobId/download | ZIP stream download |

**Flow:**
```
POST → project exist check (OR deletedAt pattern) → pages count check
→ ExportJob create (QUEUED) → export queue mein add
→ { exportJobId, status: "QUEUED", totalPages }

Worker ZIP banata hai (async)

Frontend polls GET /status every 3s
→ COMPLETED + downloadReady? → GET /download → ZIP stream
```

---

### Publish — `/api/v1/projects/:projectId/publish`

| Method | Route | Description |
|---|---|---|
| POST | / | Publish job create |
| GET | /:jobId | Job status |
| GET | / | Job list (last 20) |
| DELETE | /:jobId/cancel | Cancel job |

**Flow:**
```
config validate (WP credentials, webhook URL, etc.)
→ pages resolve (specific IDs ya sab GENERATED pages)
→ PublishJob create
→ pages → PUBLISHING status
→ 100 pages/batch → publish queue
→ Worker publishes → page → PUBLISHED/FAILED
→ All batches done? → sitemap queue trigger
```

**Targets:** WORDPRESS, STATIC_HTML, WEBHOOK

---

### SEO — `/api/v1/projects/:projectId/seo`

| Method | Route | Description |
|---|---|---|
| GET | /robots | robots.txt generate |
| GET | /audit | SEO audit (score distribution) |
| PATCH | /settings | SEO settings save |
| GET | /pages/:pageId/meta | Meta tag preview |
| PATCH | /pages/:pageId | Page SEO override |
| GET | /pages/:pageId/schemas | Schema markups |
| POST | /sitemap/regenerate | Sitemap queue trigger |

---

### Generation Runs — `/api/v1/projects/:projectId/generation-runs`

| Method | Route | Description |
|---|---|---|
| GET | / | List runs (last 20) |
| GET | /:runId | Single run progress |
| DELETE | /:runId/cancel | Cancel QUEUED/PROCESSING run |

---

### Linking — `/api/v1/projects/:projectId/linking`

| Method | Route | Description |
|---|---|---|
| GET | /graph | Internal link graph |
| POST | /rebuild | Full link rebuild queue mein |

---

### Audit — `/api/v1/audit`

| Method | Route | Role | Description |
|---|---|---|---|
| GET | / | ORG_ADMIN+ | Audit log list (paginated) |

---

### Health — `/api/v1/health`

```
GET /health → { status: "ok", db: "ok", redis: "ok" }
```

No auth required. Load balancer health check ke liye.

---

## Security Architecture

### Multi-tenancy
- Har DB query mein `orgId` filter mandatory hai
- JWT ka `orgId` trusted source — client se accept nahi hota
- `TenantIsolationGuard` resource-level ownership verify karta hai

### Password Security
- bcrypt cost factor 12 (~300ms) — brute force slow
- Timing attack prevention: user not found par bhi bcrypt.compare run hoti hai

### XSS Prevention
- `escapeHtml()` page title aur slug par apply hota hai before API response
- `ValidationPipe` unknown properties strip karta hai (mass assignment prevent)

### API Keys
- `X-API-Key` header → SHA-256 hash DB se match
- Scoped access: `["pages:read", "pages:write", "publish"]`

---

## MongoDB Compatibility Notes

Jahan bhi soft delete filter hai, `deletedAt: null` ki jagah yeh pattern use hota hai:
```ts
OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
```

Kyunki MongoDB mein missing field `null` se alag hoti hai — `deletedAt: null` alone kaam nahi karta naye documents par.

---

## Queue Integration

API sirf jobs enqueue karta hai — processing worker karta hai:

| Action | Queue |
|---|---|
| POST /pages/generate | page_generation |
| POST /export | export |
| POST /publish | publish |
| POST /seo/sitemap/regenerate | sitemap |
| POST /linking/rebuild | sitemap (rebuild-links job) |
| File upload | (direct async, no queue) |

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | MongoDB connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Access token signing secret |
| `JWT_REFRESH_SECRET` | Refresh token signing secret |
| `JWT_EXPIRES_IN` | e.g. `15m` |
| `JWT_REFRESH_EXPIRES_IN` | e.g. `7d` |
| `FRONTEND_URL` | CORS allowed origin |
| `PORT` | API port (default 4000) |
| `DASHBOARD_ENABLED` | Bull Board on/off |
| `QUEUE_DASHBOARD_TOKEN` | Bull Board auth token |
| `PAGES_DIST_ROOT` | Disk path for generated HTML |
