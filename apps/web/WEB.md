# Web — Architecture & Logic

## Overview

Next.js 14 App Router frontend. Port 3000. Client-side rendering (`"use client"`) dominant — no SSR (auth token localStorage mein hai).

```
Browser → Next.js (port 3000) → api.ts (axios) → API (port 4000)
```

---

## Tech Stack

| Library | Use |
|---|---|
| Next.js 14 (App Router) | Routing + rendering |
| TanStack Query v5 | Server state, caching, refetch |
| Zustand + persist | Auth state (localStorage) |
| Axios | HTTP client |
| Zod + react-hook-form | Form validation |
| Tailwind CSS | Styling |
| next-themes | Dark/light mode |

---

## Folder Structure

```
src/
├── app/
│   ├── (auth)/          ← login, register (no sidebar)
│   ├── (dashboard)/     ← sidebar layout, auth required
│   │   ├── dashboard/
│   │   ├── projects/
│   │   │   └── [id]/    ← project tabs layout
│   │   │       ├── templates/
│   │   │       ├── data-sources/
│   │   │       ├── pages/
│   │   │       ├── seo/
│   │   │       └── linking/
│   │   └── settings/
│   ├── globals.css
│   └── layout.tsx       ← root: Providers wrap
├── components/
│   ├── layout/sidebar.tsx
│   ├── shared/GenerationRunsBanner.tsx
│   └── ui/              ← button, card, toaster
├── hooks/
├── lib/
│   ├── api.ts           ← axios instance + helpers
│   └── utils.ts
└── store/
    └── auth.store.ts    ← Zustand auth
```

---

## Route Groups

### (auth) — No sidebar, centered layout
- `/login` — email + password, Zod validation, redirect if already logged in
- `/register` — user + org create

### (dashboard) — Requires auth, has sidebar
- `/dashboard` — overview stats + projects list
- `/projects` — all projects list
- `/projects/[id]` — project overview (tab layout)
- `/projects/[id]/templates` — template CRUD
- `/projects/[id]/data-sources` — CSV upload + preview
- `/projects/[id]/pages` — generated pages (two-level: template groups → page list)
- `/projects/[id]/seo` — SEO settings + audit
- `/projects/[id]/linking` — internal link graph
- `/settings/ai` — AI config
- `/settings/billing` — plan + billing
- `/settings/team` — team members

---

## Auth Flow

### State — Zustand + localStorage

```ts
useAuthStore {
  token, refreshToken, user, org
  setAuth()   → localStorage.setItem("mpc_token") + Zustand set
  clearAuth() → localStorage remove + Zustand clear
  isAuthenticated() → token && user dono hone chahiye
}
```

**Dual storage kyun:**
- `mpc-auth` → Zustand persist middleware (state rehydration)
- `mpc_token` → api.ts axios interceptor (Authorization header)

### Login Flow
```
form submit → POST /auth/login
→ setAuth(token, refreshToken, user, org)
→ router.replace("/dashboard")
```

### Auth Guard (Dashboard Layout)
```
isHydrated check (Zustand rehydration wait)
→ !isAuthenticated → router.replace("/login")
→ Loading spinner jab tak hydrate nahi hota (blank screen avoid)
```

### Token Inject (api.ts)
```
axios request interceptor:
  localStorage.getItem("mpc_token") → Authorization: Bearer <token>
  Cache-Control: no-cache (304 stale responses prevent)
```

### 401 Global Handler (api.ts)
```
axios response interceptor:
  401 && not auth route → localStorage.clear() → redirect /login
```

---

## API Client (lib/api.ts)

```ts
api = axios.create({ baseURL: NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1" })

// Typed helpers — unwrap { success, data } envelope
apiGet<T>(url, params?)   → api.get  → res.data.data
apiPost<T>(url, body?, params?) → api.post → res.data.data
apiPatch<T>(url, body?)   → api.patch → res.data.data
apiDelete<T>(url)         → api.delete → res.data.data
```

Error normalize: `res.data.error ?? res.data.message ?? err.message`

---

## TanStack Query Config

```ts
QueryClient {
  staleTime: 30_000       // 30s fresh — API call reduce
  retry: 0                // fail fast (auth errors loop avoid)
  refetchOnWindowFocus: false
}
```

---

## Pages — Key Logic

### Dashboard (`/dashboard`)
- Projects list fetch → stats calculate client-side (total pages, templates)
- Stats: totalProjects, totalPages, AI tokens, avg SEO score

### Project Layout (`/projects/[id]/layout.tsx`)
- Project detail fetch on mount
- 6 tabs: Overview, Templates, Data Sources, Pages, SEO, Linking
- Active tab: `pathname.startsWith(href)` check
- Project not found → fallback UI with "Back to Projects" link

### Templates (`/projects/[id]/templates`)

**Two modes:**
1. Manual create — HTML content + `{{variable}}` placeholders enter karo
2. Import HTML — file upload → auto-extract title, description, slug from `<head>`

**HTML Import Logic:**
```
FileReader.readAsText()
→ regex se title, meta description, slug extract
→ <head> inner content save (CSS/JS links preserve, <style> remove)
→ <body> inner content extract
→ form populate
→ user {{variables}} manually add karta hai
```

**Save:** `apiPost` (create) ya `apiPatch` (update) → fetch refresh

### Data Sources (`/projects/[id]/data-sources`)

**Upload Flow:**
```
1. apiPost → DataSource record create (name, type)
2. fetch (raw, FormData) → POST /upload (multipart)
   - axios use nahi hota — FormData ke saath axios Content-Type override issue
3. fetchDataSource(id) → preview modal open
```

**Preview modal:** import status, row count, source file path

### Pages (`/projects/[id]/pages`)

**Two-level navigation:**

Level 1 — Template Groups:
- `GET /pages/by-template` → TemplateGroup[] (templateId, templateName, totalPages)
- Har group card par: Export ZIP button, Delete button
- Group click → Level 2

Level 2 — Pages list:
- `GET /pages/template/:templateId` → paginated list
- Search (400ms debounce)
- Row click → page preview modal

**Page Preview Modal:**
- Meta tab: title, description, slug, canonical, focus keyword, SEO score, SERP preview
- Content tab: HTML body render (`dangerouslySetInnerHTML`)
- `if (p.content)` check → API call skip, nahi toh `GET /pages/:id` (disk se HTML read)

**Export ZIP:**
```
useServerExport hook:
  POST /export?templateId=xxx → { exportJobId }
  → setInterval 3s poll GET /export/:id/status
  → COMPLETED + downloadReady → GET /export/:id/download (blob)
  → URL.createObjectURL → <a> click → ZIP download
  → FAILED → exportError state
```

**Delete all pages (template):**
```
DELETE /pages/template/:templateId → { deleted: N }
→ queryClient.invalidateQueries (pages-by-template)
```

### SEO (`/projects/[id]/seo`)

**On load:** parallel fetch project settings + SEO audit
**Settings:** siteName, baseUrl, twitterSite, defaultOgImage, blockAiBots, noIndex, noFollow
**Tools:**
- Apply Canonicals → `POST /pages/apply-canonicals`
- Robots.txt → `POST /seo/projects/:id/robots`
- Sitemap → `POST /seo/projects/:id/sitemap/regenerate`

### GenerationRunsBanner (shared component)

**Live generation progress — dual mechanism:**

1. Initial poll: `GET /generation-runs?projectId=xxx` every 5s (active) ya 30s (idle)
2. SSE stream: har active run ke liye `EventSource` open hota hai
   ```
   /generation-runs/:runId/stream?token=<jwt>
   (EventSource custom headers support nahi karta — token query param mein)
   ```

**State merge:** server list + SSE live patches merge hote hain
**Auto-hide:** completed runs 15s baad banner se gayab hote hain
**Cancel button:** `PATCH /generation-runs/:runId/cancel`
**Throughput:** `processedRows / elapsed seconds` real-time calculate

**Run card stats:**
- Progress bar (animated)
- Chunks done/total
- Pages generated / failed
- ETA (`estimatedRemainingMs`)
- Throughput (pages/s ya pages/min)

---

## Sidebar

```
Top: Logo + org plan badge
Nav: Dashboard, Projects
Settings: AI Settings, Team, Billing
Bottom: User avatar (initials), org name, logout button
```

Logout = `clearAuth()` → localStorage clear → Zustand clear → dashboard layout guard → `/login` redirect

---

## Providers (Root)

```
QueryClientProvider
  └── ThemeProvider (light default)
        └── {children}
        └── Toaster
```

---

## Key Design Decisions

| Decision | Reason |
|---|---|
| `"use client"` everywhere | Auth token localStorage mein hai — SSR se access nahi hota |
| Zustand persist | Page refresh par auth state survive kare |
| Dual token storage | Zustand rehydration (mpc-auth) + axios interceptor (mpc_token) |
| `retry: 0` in QueryClient | 401 errors loop nahi karein |
| `staleTime: 30s` | Unnecessary API calls reduce |
| SSE for generation progress | Polling se better — server push, no extra requests |
| `skipDuplicates` nahi (MongoDB) | MongoDB standalone support nahi karta |
| FormData ke liye raw fetch | Axios multipart Content-Type headers override karta hai |

---

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | API base URL (default: `http://localhost:4000/api/v1`) |
