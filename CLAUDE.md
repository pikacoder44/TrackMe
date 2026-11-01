# TrackMe - Enterprise Employee Monitoring & Telemetry Platform

## Current Strategy & System Architecture

### 1. Primary Employee Telemetry Collector: WebExtension (`/extension`)
- **Target Browsers**: Chrome, Firefox, Brave (built on Manifest V3).
- **Core Responsibilities**:
  - Live active/idle user status detection (using `chrome.idle` and tab activity).
  - Domain & active tab context monitoring with user privacy controls.
  - Offline event buffering & retry queue for batch synchronization.
  - Heartbeat / active ticks dispatched to the supervisory hub (`POST /api/v1/events/sync`).
  - Quick action popup for Clock In, Take Break, Resume, and Clock Out.

### 2. Primary Supervisory Hub: Next.js 15 App Router (`/src/app/dashboard/*`)
- **Manager & Admin Dashboard (`/src/app/dashboard/manager`)**:
  - Live team status overview (Working, On Break, Offline).
  - Real-time employee active application & website monitoring.
  - Activity timelines, time audit approval workflows, and CSV export capabilities.
- **Employee Web Dashboard (`/src/app/dashboard`)**:
  - Personal session stats, active work duration, and app/website usage breakdowns.
  - Real-time Supabase subscriptions updating metrics without manual polling.

### 3. Ingestion & Session API Surface (`/src/app/api/v1/*`)
- `POST /api/v1/events/sync`: High-throughput batch event ingestion with UUID idempotency key deduplication.
- `POST /api/v1/sessions/clock-in`: Starts active work session.
- `POST /api/v1/sessions/break`: Manages break state transitions (`break_start`, `break_end`).
- `POST /api/v1/sessions/clock-out`: Concludes work session and creates immutable `time_entries` record.
- **CORS Support**: Handled via `src/proxy.ts` supporting `chrome-extension://`, `moz-extension://`, and `localhost` origins.

---

## Local Developer Setup

### Prerequisites
- Node.js 20+ (Node 22 / Node 26 supported)
- Local or hosted Supabase project instance (PostgreSQL with RLS & Realtime enabled)

### Environment Configuration (`.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 # or your hosted Supabase URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

### Essential Commands
- `npm run dev`: Start Next.js development server on `http://localhost:3000`
- `npm run build`: Production Next.js build
- `npm run lint`: Lint TypeScript & React codebase via ESLint
- `npm test`: Run unit and business logic tests with Vitest
- `npm run test:e2e`: Execute Playwright end-to-end tests
- `npm run extension:lint`: Lint browser extension manifest and files via `web-ext`

---

## Database Schema Overview
- `profiles`: User information, full name, email, avatar URL.
- `organizations`: Multi-tenant org definitions.
- `organization_members`: Role-based membership (`owner`, `admin`, `manager`, `member`).
- `work_sessions`: Active/completed employee sessions (`active`, `paused`, `completed`).
- `activity_events`: High-frequency telemetry events (`active_tick`, `idle_tick`, `window_change`, etc.) with `idempotency_key` and `recorded_at`.
- `time_entries`: Finalized aggregated time records for payroll, timesheets, and manager approvals.
- `projects`: Assignable client / internal project entities.

---

## Engineering Guidelines & Standards
1. **Idempotency & Resilience**:
   - All event sync payloads must supply `idempotency_key` (UUID) to guarantee at-most-once storage on retries.
2. **Supabase Row-Level Security (RLS)**:
   - All queries and mutations must respect tenant isolation enforced by `organization_members`.
3. **Realtime Channels**:
   - Scope Realtime subscriptions strictly with filters (e.g. `organization_id=eq.${organizationId}`) and unsubscribe cleanly on component unmount.
4. **Server Components & Performance**:
   - Parallelize database queries using `Promise.all` in Server Components.
   - Use page-scoped `revalidatePath` to preserve UI state.
