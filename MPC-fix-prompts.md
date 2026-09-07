# MPC — Fix Prompts (Docs vs Code Inconsistencies)

Har prompt standalone hai — directly copy-paste karke Claude Code (ya kisi bhi dev/AI assistant) ko de sakte hain. Har prompt mein context already included hai.

---

## 1. CSV Import — Queue vs Direct Async Contradiction

```
In the MPC backend, API.md states CSV/Excel uploads are processed via direct in-process async call (csvImport.processAsync(), no Redis queue) — confirmed by the "Queue Integration" table which lists file upload as "(direct async, no queue)".

WORKER.md contradicts this: it lists a `csv_import` queue with a `CsvImportProcessor` (concurrency 2), and says the API "enqueues" a job for it.

Please inspect the actual data-sources upload controller/service in the codebase to find the real behavior, then:
1. If upload truly runs in-process (no queue) → remove the csv_import queue/processor entry from WORKER.md, since it doesn't exist in this flow.
2. If it actually enqueues a Bull job → fix API.md's upload flow description and the Queue Integration table to say it IS queued.

Also flag whether the current real implementation has a problem: if a large CSV blocks the HTTP request thread synchronously, that's worth raising as a perf/scalability issue regardless of which doc is wrong.
```

---

## 2. Guard Order Bug — TenantIsolationGuard Runs Before JWT Verification

```
In the MPC API, the global guard chain is documented as:
1. ApiKeyGuard
2. TenantIsolationGuard (verifies resource orgId === JWT orgId)
3. ThrottlerGuard
4. JwtAuthGuard (verifies/decodes the JWT)
5. RolesGuard

This is a logical bug: TenantIsolationGuard depends on request.user.orgId, but that field is only populated after JwtAuthGuard runs — and JwtAuthGuard is guard #4, after TenantIsolationGuard.

Please check the actual NestJS guard registration order in the codebase (app module / main.ts / global guards setup):
1. If the code's real order already puts JwtAuthGuard before TenantIsolationGuard, fix API.md's documented order to match.
2. If the code genuinely runs TenantIsolationGuard before JWT verification, this is a real bug — reorder the guards so JwtAuthGuard runs first, then TenantIsolationGuard, and add a regression test confirming a request with a valid JWT but mismatched orgId gets a 403.
```

---

## 3. 403 vs 404 Reasoning Is Backwards

```
API.md's TenantIsolationGuard section says: "Agar resource doosre org ka ho → 403 (404 nahi — resource existence reveal nahi hoti)."

This reasoning is inverted. Returning 403 when a resource belongs to another org actually DOES reveal that the resource exists (just not to this user) — that's an information leak. Returning 404 is the standard way to avoid leaking existence, since the requester can't distinguish "doesn't exist" from "exists but not yours."

Please check the actual TenantIsolationGuard implementation:
1. If it returns 403 on cross-org access, change it to return 404 instead, to avoid the resource-existence leak — and update the doc comment to correctly explain why.
2. If it actually already returns 404, just fix the doc text in API.md, which currently says the opposite of what's correct/implemented.

Decide which approach the security team wants going forward (403-with-leak vs 404-no-leak) and make code + docs consistent with that decision.
```

---

## 4. MongoDB Transaction Assumption Mismatch (API vs Worker)

```
API.md states (Templates section) that `$transaction` is used in the API because "MongoDB Atlas / replica set" supports it, while explicitly noting the Worker does NOT use transactions because it assumes a "local standalone" MongoDB.

Both API and Worker connect to the same DATABASE_URL — they can't have different deployment topology assumptions about the same database. If the actual DB is a standalone MongoDB instance (as Worker assumes), the API's $transaction() calls will throw a runtime error ("Transaction numbers are only allowed on a replica set member or mongos").

Please:
1. Confirm the real MongoDB deployment type used in production/staging (standalone vs replica set).
2. If it's standalone — remove/replace the $transaction() calls in the API's template create/update flow (Template + TemplateVersion snapshot) with a non-transactional pattern consistent with how Worker already avoids transactions (e.g. sequential writes with manual rollback-on-failure logic, similar to InternalLinkingService's approach).
3. If it's actually a replica set — update WORKER.md's reasoning, and consider whether Worker SHOULD be using transactions too (e.g. in InternalLinkingService's deleteMany + createMany, which currently has no transaction and risks partial writes).
4. Update both docs so they state one consistent fact about the DB topology instead of contradicting each other.
```

---

## 5. Generation Runs — Three Frontend/Backend Mismatches

```
Comparing API.md and WEB.md for the generation-runs feature, I found three mismatches:

1. Polling: WEB.md's GenerationRunsBanner polls `GET /generation-runs?projectId=xxx` (flat path + query param). API.md documents the route as nested: `GET /projects/:projectId/generation-runs`. These don't match — confirm which route actually exists in the API and fix the wrong side (either the frontend's axios call or the API.md route table).

2. Missing SSE route: WEB.md describes an EventSource connecting to `/generation-runs/:runId/stream?token=<jwt>` for live progress, but this route is completely absent from API.md's route tables. Please check the API codebase for this controller/route. If it exists, add it to API.md (note: token-in-query-param is needed because EventSource can't set custom headers — flag this as a security note, since tokens in URLs can leak via logs/referrer headers). If it doesn't exist, this is a broken feature on the frontend — flag for a dev decision (implement the SSE endpoint or fall back to polling-only).

3. Cancel method mismatch: API.md documents run cancellation as `DELETE /:runId/cancel`. WEB.md's cancel button calls `PATCH /generation-runs/:runId/cancel`. Check the actual route decorator in the controller and fix whichever doc is wrong — and note that Publish job cancellation elsewhere in the same API uses DELETE for the same cancel pattern, so for consistency DELETE is likely the intended method.
```

---

## 6. SEO Robots/Sitemap — Path Order and Method Mismatch

```
API.md documents SEO routes as nested under project: `GET /projects/:projectId/seo/robots` and `POST /projects/:projectId/seo/sitemap/regenerate`.

WEB.md's frontend calls reversed paths: `POST /seo/projects/:id/robots` and `POST /seo/projects/:id/sitemap/regenerate` — note "seo" comes before "projects" here, opposite of API.md's order. Also note the robots endpoint method differs: API.md says GET, WEB.md's frontend call uses POST.

Please check the actual @Controller() and route decorators for the SEO module in the API codebase, then:
1. Fix the path order in whichever doc doesn't match the real controller route prefix.
2. Fix the HTTP method for the robots.txt endpoint to match — if robots.txt generation has no side effects, GET is more correct REST-wise (idempotent, cacheable); if it's actually a forced-regenerate action with side effects, POST may be intentional, but it should then be consistent in both docs.
```

---

## Minor / Confirm-with-team prompts

### 7. RateLimitMiddleware vs ThrottlerGuard — unclear overlap
```
API.md mentions two separate rate-limiting mechanisms: ThrottlerGuard (100 req/60s per IP, in the global guard chain) and RateLimitMiddleware (per-org, using Redis, reads orgId from JWT). It's unclear if these are two independent layers or if one description is stale.

Please check the codebase to confirm: are both actually registered and active? If RateLimitMiddleware reads orgId from the JWT, confirm it runs after JWT verification (same ordering concern as the TenantIsolationGuard issue above). Update API.md to clearly document both layers, their order relative to each other and to JwtAuthGuard, and what happens at /health (which RateLimitMiddleware skips — confirm whether ThrottlerGuard also skips it, since frequent load-balancer health checks could otherwise get throttled).
```

### 8. SUSPENDED org returns 401 instead of 403
```
API.md's login flow says a SUSPENDED organization returns 401 Unauthorized. Semantically this should likely be 403 Forbidden — the credentials are valid (the user IS authenticated), but access is being denied due to org status, which is what 403 is for. 401 should be reserved for "who are you" failures (bad credentials/missing token).

Check the actual login service code for this case, and align the status code with whichever the team decides is correct, then update API.md to match.
```

### 9. Audit log endpoint has no frontend consumer
```
API.md documents a GET /api/v1/audit endpoint (ORG_ADMIN+ role) for listing audit logs, but WEB.md's routes, sidebar, and settings pages show no corresponding UI page that calls it.

Confirm with the team whether an audit log page is planned/missing from the frontend, or whether this endpoint is intentionally API-only (e.g. for external tooling) and should be noted as such in API.md.
```
