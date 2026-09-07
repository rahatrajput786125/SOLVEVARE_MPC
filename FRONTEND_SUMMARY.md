# MPC (Mass Page Creator) - Frontend Summary

## 📁 Project Structure Overview
**Location:** `apps/web/`
**Framework:** Next.js 14+ with App Router
**Styling:** TailwindCSS
**State Management:** Zustand + React Query
**UI Components:** Custom components with Radix UI primitives

---

## 🎯 Application Architecture

### Core Layout Structure

#### 1. **Root Layout** (`src/app/layout.tsx`)
- Global metadata: "MPC — Mass Page Creator"
- Inter font setup
- Wraps entire app with `<Providers>` component
- Includes global CSS (Tailwind + custom variables)

#### 2. **Root Page** (`src/app/page.tsx`)
- Root page (`/`) automatically redirects to `/dashboard`
- Entry point for authenticated users

#### 3. **Global Providers** (`src/components/providers.tsx`)
- React Query Client setup (30s stale time, no window refocus)
- Theme Provider (light/dark mode support)
- Toast notifications system

---

## 🔐 Authentication Flow

### Auth Layout (`src/app/(auth)/layout.tsx`)
- Centered card layout with MPC logo
- Background: `bg-muted/30`
- Contains Login and Register pages

### Login Page (`src/app/(auth)/login/page.tsx`)
- Form validation with Zod schema
- Email + Password fields
- Uses React Hook Form
- API call to `/auth/login`
- On success: stores JWT token, user data, org data in Zustand store
- Redirects to `/dashboard`
- Link to register page

### Register Page (`src/app/(auth)/register/page.tsx`)
- Fields: Name, Email, Password, Organization Name
- Zod validation (min 2 chars name, min 8 chars password)
- API call to `/auth/register`
- Creates new org on registration
- Auto-login after registration
- Redirects to `/dashboard`

---

## 🏠 Dashboard Layout

### Dashboard Layout (`src/app/(dashboard)/layout.tsx`)
- Protected route: checks for JWT token
- If no token → redirects to `/login`
- Two-panel layout:
  - Left: Sidebar component
  - Right: Dynamic content area
- Hydration check to prevent SSR issues

### Sidebar Component (`src/components/layout/sidebar.tsx`)
- Fixed width: `w-60`
- Logo + Organization badge (shows plan: FREE/STARTER/GROWTH/BUSINESS)
- Navigation items:
  - Dashboard
  - Projects
  - Settings (AI Settings, Team, Billing)
- User footer with logout button
- Shows user avatar/initial + email + org name

---

## 📊 Dashboard Page (`src/app/(dashboard)/dashboard/page.tsx`)

### Stats Cards:
1. Total Pages (published count)
2. Projects (active count)
3. AI Tokens Used (with cost in USD)
4. Avg SEO Score (color-coded)

### Recent Pages Section:
- Lists latest generated pages across all projects
- Shows: Title, Slug, Project name, Status badge, SEO score, Time ago
- Empty state if no pages exist
- Link to create first project

### API Calls:
- `GET /projects` - Fetches all projects with page counts
- Aggregates stats client-side

---

## 📁 Projects Management

### Projects Page (`src/app/(dashboard)/projects/page.tsx`)

**Features:**
- Grid view of all projects (responsive: 1-3 columns)
- Each project card shows:
  - Project name + description
  - Status badge (ACTIVE/INACTIVE)
  - Page count, Template count
  - FolderOpen icon
  - Hover effect with primary border
- "New Project" button opens inline form
- Create form fields:
  - Project Name (required, min 2 chars)
  - Description (optional)
- API: `POST /projects`
- Empty state with "Create Project" CTA

---

## 🗂️ Project Detail Pages

### Project Layout (`src/app/(dashboard)/projects/[id]/layout.tsx`)

**Header:**
- Project name + status badge
- Meta info: X pages · Y templates · Z data sources

**Tab Navigation:**
- Overview
- Templates
- Data Sources
- Pages
- SEO
- Linking

Each tab has an icon (Lucide React)

**API:** `GET /projects/{id}` - Fetches project details

---

### 1. **Overview Tab** (`src/app/(dashboard)/projects/[id]/page.tsx`)

**Action Buttons:**
- "Upload Data" → redirects to Data Sources tab
- "Generate Pages" → redirects to Pages tab

**Stats Cards:**
- Total Pages
- Published
- Generated
- Avg SEO Score

**Recent Pages:**
- Lists last few pages with SEO score, status
- Link to view all pages
- Empty state with "Upload data to start" CTA

**APIs:**
- `GET /projects/{id}/pages/stats`
- `GET /projects/{id}/pages/recent`

---

### 2. **Templates Tab** (`src/app/(dashboard)/projects/[id]/templates/page.tsx`)

**Purpose:** Manage HTML/Markdown templates with variable placeholders like `{{city}}`, `{{service}}`

**Features:**
- Grid of template cards (2 columns)
- Each card shows:
  - Template name
  - Version number
  - Pages using this template
  - Created date
  - Edit button
- Modal for Create/Edit:
  - Name (required)
  - Description (optional)
  - Title Template (e.g., "Best {{service}} in {{city}}")
  - Meta Description Template
  - Slug Template (e.g., "{{service}}-in-{{city}}")
  - Content (textarea, HTML/Markdown with variables)
- Empty state with placeholder explanation

**APIs:**
- `GET /projects/{id}/templates`
- `POST /projects/{id}/templates`
- `PATCH /projects/{id}/templates/{templateId}`
- `DELETE /projects/{id}/templates/{templateId}`

---

### 3. **Data Sources Tab** (`src/app/(dashboard)/projects/[id]/data-sources/page.tsx`)

**Purpose:** Upload CSV/Excel files or connect external APIs

**Features:**
- "Upload CSV" button (accepts .csv, .xlsx, .xls)
- List of uploaded data sources:
  - File icon (green)
  - Name
  - Row count
  - Import status (COMPLETED/PENDING/FAILED)
  - Created date
- Click on data source → opens preview modal showing:
  - Type (CSV/EXCEL)
  - Created date
  - Source file URL
  - Latest import details (status, rows, processed rows)
- Placeholder card for "Connect External API" (not implemented)

**Upload Flow:**
1. User selects file
2. Creates data source record: `POST /projects/{id}/data-sources`
3. Uploads file: `POST /projects/{id}/data-sources/{dsId}/upload` (FormData)
4. Shows toast notification
5. Refreshes list

**APIs:**
- `GET /projects/{id}/data-sources`
- `GET /projects/{id}/data-sources/{dsId}`
- `POST /projects/{id}/data-sources`
- `POST /projects/{id}/data-sources/{dsId}/upload`

---

### 4. **Pages Tab** (`src/app/(dashboard)/projects/[id]/pages/page.tsx`)

**Purpose:** View and manage all generated pages

**Features:**
- Search bar (debounced 400ms)
- Status filter buttons: ALL, DRAFT, GENERATING, GENERATED, PUBLISHING, PUBLISHED, FAILED
- Data table with columns:
  - Title / Slug
  - Status badge (color-coded)
  - SEO Score (progress bar + number)
  - Updated date
  - Published URL (external link icon)
- Pagination (50 pages per page)
- "Export" button (not implemented)

**Status Colors:**
- PUBLISHED: green
- GENERATED: blue
- GENERATING: yellow
- PUBLISHING: purple
- DRAFT: gray
- FAILED: red

**APIs:**
- `GET /projects/{id}/pages?page=1&limit=50&search=query&status=PUBLISHED`

---

### 5. **SEO Tab** (`src/app/(dashboard)/projects/[id]/seo/page.tsx`)

**Purpose:** Configure global SEO settings for the project

**SEO Audit Summary:**
- Total Pages
- Avg SEO Score
- Missing Titles count
- No Schema Markup count

**Settings Sections:**

**1. Site Settings:**
- Site Name (required)
- Base URL (required, must start with http/https)
- Twitter Handle
- Default OG Image URL

**2. Robots & Indexing:**
- Checkboxes:
  - Block AI Bots (GPTBot, CCBot)
  - Default NoIndex on all pages
  - Default NoFollow on all pages

**3. SEO Tools:**
- "Generate Robots.txt" button → `POST /seo/projects/{id}/robots`
- "Regenerate Sitemap" button → `POST /seo/projects/{id}/sitemap/regenerate`

**4. Best Practices:**
- Tips section with 4 best practices

**APIs:**
- `GET /projects/{id}` (for settings.seo)
- `GET /seo/projects/{id}/audit`
- `PATCH /seo/projects/{id}/settings`
- `POST /seo/projects/{id}/robots`
- `POST /seo/projects/{id}/sitemap/regenerate`

---

### 6. **Linking Tab** (`src/app/(dashboard)/projects/[id]/linking/page.tsx`)

**Purpose:** Internal linking graph overview

**Features:**
- "Rebuild Links" button
- Stats cards:
  - Total Links
  - Total Pages
  - Avg Links per Page
  - Orphan Pages (pages with no inbound links)
- "Links by Type" section:
  - Shows distribution with progress bars
  - Types: CONTEXTUAL, NAVIGATION, FOOTER, etc.
- "Orphan Pages" section:
  - Lists pages with no internal links
  - Shows title, slug, SEO score
  - Empty state: "No orphan pages — great internal linking!"

**APIs:**
- `GET /linking/projects/{id}/overview`
- `GET /linking/projects/{id}/orphans`
- `POST /linking/projects/{id}/rebuild`

---

## ⚙️ Settings Pages

### Settings Layout (`src/app/(dashboard)/settings/layout.tsx`)
- Sidebar navigation:
  - Billing
  - Team
  - AI Settings

---

### 1. **Billing Page** (`src/app/(dashboard)/settings/billing/page.tsx`)

**Current Plan Card:**
- Shows plan name (FREE/STARTER/GROWTH/BUSINESS/ENTERPRISE)
- Billing interval (MONTHLY/YEARLY)
- Renewal date
- Trial end date (if applicable)
- "Manage subscription" button (opens Stripe portal)
- "Upgrade" button (opens Stripe checkout)
- Toggle: Monthly ↔ Yearly

**Usage This Month:**
- Pages generated (progress bar)
- AI tokens used (progress bar)
- Color-coded: green (<70%), yellow (70-90%), red (>90%)

**Plan Features:**
- Max Projects
- Max Team Members
- Custom Domains (Yes/No)
- Webhooks (Yes/No)

**APIs:**
- `GET /billing/status`
- `POST /billing/checkout` (returns Stripe checkout URL)
- `POST /billing/portal` (returns Stripe portal URL)

---

### 2. **Team Page** (`src/app/(dashboard)/settings/team/page.tsx`)

**Features:**
- Invite member by email
- Input field + "Invite" button
- List of team members:
  - Name + Email
  - Role badge (OWNER/ADMIN/MEMBER)
  - Remove button (trash icon)
  - Cannot remove self
- Pending invites:
  - Email
  - "pending" badge (yellow)
  - Grayed out background

**APIs:**
- `GET /team` (returns members + invites)
- `POST /team/invite` (sends invite email)
- `DELETE /team/members/{memberId}`

---

### 3. **AI Settings Page** (`src/app/(dashboard)/settings/ai/page.tsx`)

**Features:**
- Model selection dropdown:
  - Claude 3.5 Sonnet
  - GPT-4o
  - GPT-4o Mini
  - Claude 3 Haiku
  - Gemini 1.5 Flash
- Temperature slider (0-2, default 0.7)
  - Label shows current value
  - Description: "Lower = focused, Higher = creative"
- Max Tokens input (100-4000, default 1000)
- "Save Preferences" button

**APIs:**
- `GET /projects/{id}` (for settings.ai)
- `PATCH /ai/projects/{id}/settings`

---

## 🧩 Reusable UI Components

### 1. **Button** (`src/components/ui/button.tsx`)
- Variants: default, destructive, outline, secondary, ghost, link
- Sizes: default, sm, lg, icon
- Loading state: shows spinner + disables button
- Built with Radix Slot + CVA

### 2. **Card Components** (`src/components/ui/card.tsx`)
- Card (container)
- CardHeader
- CardTitle
- CardDescription
- CardContent
- CardFooter
- Badge (variants: default, secondary, destructive, outline, success, warning)
- Input (text input with focus ring)
- Label (form labels)
- Separator (horizontal/vertical divider)

### 3. **Toaster** (`src/components/ui/toaster.tsx`)
- Simple toast notification system
- `toast({ title, description, variant })` function
- Variants: default, destructive
- Auto-dismiss on close
- Fixed position: top-right on desktop, top-center on mobile

---

## 🔧 Utility Libraries

### 1. **API Client** (`src/lib/api.ts`)
- Axios instance with base URL: `http://localhost:4000/api/v1`
- Request interceptor: injects JWT token from localStorage
- Response interceptor:
  - 401 → clears token, redirects to `/login`
  - Normalizes error messages
- Helper functions:
  - `apiGet<T>(url, params)` - GET request
  - `apiPost<T>(url, body)` - POST request
  - `apiPatch<T>(url, body)` - PATCH request
  - `apiDelete<T>(url)` - DELETE request
- All helpers unwrap `{ data: T }` envelope

### 2. **Utils** (`src/lib/utils.ts`)
- `cn()` - Tailwind class merger (clsx + twMerge)
- `formatNumber(n)` - 1234567 → "1.2M"
- `formatCost(usd)` - 0.00123 → "$0.001"
- `scoreColor(score)` - Returns Tailwind color class based on SEO score
- `scoreBadge(score)` - Returns badge variant based on score
- `truncate(str, max)` - Truncates string with "…"
- `statusColor(status)` - Returns badge color for page status

### 3. **Auth Store** (`src/store/auth.store.ts`)
- Zustand store with persistence (localStorage)
- State:
  - `token`: JWT token
  - `refreshToken`: Refresh token
  - `user`: { id, email, name, avatarUrl }
  - `org`: { id, name, slug, plan }
- Actions:
  - `setAuth(token, refreshToken, user, org)` - Stores auth data
  - `clearAuth()` - Clears auth data + localStorage
  - `isAuthenticated()` - Returns boolean

---

## 🎨 Styling System

### Global CSS (`src/app/globals.css`)
- Tailwind directives: @tailwind base, components, utilities
- CSS variables for theming:
  - Light mode: white background, blue primary
  - Dark mode: dark background, lighter blue primary
- Custom properties:
  - `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`

### Color System:
- **Primary:** Blue (221.2 83.2% 53.3%)
- **Success:** Green (for good SEO scores, published status)
- **Warning:** Yellow (for generating status, medium SEO)
- **Destructive:** Red (for failed status, low SEO)
- **Muted:** Gray (for draft status, secondary text)

---

## 🔄 Data Flow

### Authentication Flow:
1. User enters credentials
2. Form validation (Zod)
3. API call to `/auth/login` or `/auth/register`
4. Response: `{ token, refreshToken, user, org }`
5. Store in Zustand + localStorage
6. Redirect to `/dashboard`

### Protected Routes:
1. Dashboard layout checks for token
2. If no token → redirect to `/login`
3. Sidebar shows org name + plan badge
4. All API calls include `Authorization: Bearer {token}`

### Data Fetching Pattern:
1. React Query for server state
2. 30s stale time (no unnecessary refetches)
3. No retries (for fast offline feedback)
4. Optimistic updates with `useMutation`
5. Query invalidation after mutations

### File Upload Flow:
1. User selects CSV/Excel file
2. Create data source record: `POST /projects/{id}/data-sources`
3. Upload file as FormData: `POST /projects/{id}/data-sources/{dsId}/upload`
4. Backend processes file, creates import record
5. Frontend polls or refetches to show updated status

---

## 📦 Key Dependencies

- **Next.js** - React framework with App Router
- **React Query** - Server state management
- **Zustand** - Client state management (auth)
- **Tailwind CSS** - Utility-first styling
- **Radix UI** - Headless UI primitives (toast)
- **React Hook Form** - Form state management
- **Zod** - Schema validation
- **Axios** - HTTP client
- **Lucide React** - Icon library
- **CVA** - Class Variance Authority (component variants)

---

## 🚀 Key Features Summary

1. **Authentication:** Login, Register, Protected Routes, JWT-based
2. **Projects:** Create, List, View projects with stats
3. **Templates:** CRUD templates with variable placeholders
4. **Data Sources:** Upload CSV/Excel, view import status
5. **Pages:** List, search, filter generated pages with pagination
6. **SEO:** Configure global settings, view audit, generate robots.txt/sitemap
7. **Internal Linking:** View link graph, orphan pages, rebuild links
8. **Billing:** View plan, usage, upgrade via Stripe
9. **Team:** Invite members, manage roles, remove members
10. **AI Settings:** Configure AI model, temperature, max tokens

---

## 🎯 User Journey

1. **Signup** → Create account + organization
2. **Dashboard** → See overview of all projects
3. **Create Project** → Name + description
4. **Upload Data** → CSV with columns like "city", "service"
5. **Create Template** → HTML with `{{city}}`, `{{service}}` placeholders
6. **Generate Pages** → Combine template + data = pages
7. **Review SEO** → Check scores, configure settings
8. **Publish** → Deploy pages (external integration)
9. **Monitor** → View stats, usage, internal linking

---

## 🔑 Important Notes

- **Base API URL:** `http://localhost:4000/api/v1`
- **Token Storage:** localStorage key = `mpc_token`
- **Auth Store:** Zustand with localStorage persistence
- **Toast System:** Simple queue-based implementation
- **Error Handling:** Axios interceptor normalizes all errors
- **Routing:** Next.js App Router (file-system based)
- **Protected Routes:** Manual auth check in layout components
- **No SSR for auth:** Hydration check prevents SSR issues
- **React Query Config:** 30s stale time, 0 retries, no window refocus
- **File Uploads:** Uses FormData (not JSON) for CSV/Excel uploads

---

## 📝 File Count Summary

- **Total Pages:** 15+ route pages
- **Layout Files:** 3 (root, auth, dashboard)
- **Components:** 5+ reusable components
- **Utilities:** 3 (api, utils, store)
- **Config Files:** tailwind.config.js, next.config.js, tsconfig.json

---

This frontend is designed for programmatic SEO at scale, allowing users to generate thousands of pages from templates + data sources with built-in SEO optimization and team collaboration features.
