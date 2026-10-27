# TrackMe

Privacy-conscious, multi-tenant engineering time tracking and productivity intelligence platform. Built with Next.js 16 (App Router), Supabase SSR, and a lightweight Tauri 2 desktop background agent.

---

## What is TrackMe?

TrackMe helps distributed engineering teams track billable time and project velocity without invasive tracking tools. It captures active work sessions and idle states at the operating system level, stores them locally, and syncs them to a multi-tenant cloud dashboard.

- **No surveillance telemetry**: Tracks window application classes and idle intervals. Does not record keystrokes, screen captures, or sensitive window contents.
- **Row-Level Security by default**: Organizations and projects are strictly partitioned in PostgreSQL using Supabase RLS.
- **Offline buffering**: Desktop agent collects ticks into an offline local buffer and synchronizes in batches when an internet connection is available.
- **Idempotent ingestion**: API prevents duplicate event inserts on connection drops or retries via unique SHA-256 / UUID event keys.

---

## Tech Stack

- **Web Frontend**: Next.js 16, React 19, Tailwind CSS v4, Lucide React
- **UI Components**: Radix / Base UI primitive components
- **Visualizations**: Recharts
- **Database & Auth**: Supabase (PostgreSQL, Row-Level Security, Auth Helpers for SSR)
- **Desktop Agent**: Tauri 2 (Rust system-tray daemon + lightweight web client)
- **Testing**: Vitest, JSDOM, React Testing Library, Playwright

---

## Architecture

```
+-----------------------------------------------------------+
|                    Desktop Agent (Tauri 2)                |
|  - System idle detection & active window monitoring       |
|  - Local offline buffer (in-memory / local storage)       |
+-----------------------------+-----------------------------+
                              |
                     POST /api/v1/events/sync
                     (Bearer Session Token)
                              |
                              v
+-----------------------------------------------------------+
|                   Next.js Web Service                     |
|  - /api/v1/events/sync (Batch ingestion + upsert)         |
|  - /dashboard (Server-rendered analytics & approvals)     |
+-----------------------------+-----------------------------+
                              |
                    PostgreSQL Connection
                              |
                              v
+-----------------------------------------------------------+
|                    Supabase PostgreSQL                    |
|  - Tables: organizations, members, projects, sessions     |
|  - activity_events (ON CONFLICT DO NOTHING via key)       |
|  - RLS Policies enforcing organization isolation          |
+-----------------------------------------------------------+
```

### Data Model

```
organizations (id, name, slug, created_at)
  |-- organization_members (organization_id, user_id, role)
  |-- projects (id, organization_id, name, color)
  |-- sessions (id, organization_id, user_id, project_id, status, started_at, ended_at)
        |-- activity_events (id, session_id, user_id, idempotency_key, event_type, recorded_at)
```

---

## Key Features

1. **Live Work Session Tracker**: Real-time timer with pause, resume, and clock-out actions wired to Next.js server actions.
2. **Timesheets & Approvals**: Review submitted timesheet records, filter by date, add manual time entries, and approve/reject entries as an organization manager.
3. **Analytics Dashboard**: Weekly logged hours breakdown, project distribution charts, and CSV report export.
4. **Idempotent Batch Sync**: Custom API endpoint (`POST /api/v1/events/sync`) handling batch event arrays with duplicate prevention.
5. **Native Desktop Daemon**: Tauri 2 application running in the background with local event queue inspection and manual force-sync triggers.

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- (Optional) Rust & Cargo if compiling the Tauri desktop client

### 1. Clone & Configure Environment

```bash
git clone https://github.com/pikacoder44/TrackMe.git
cd TrackMe
cp .env.local.example .env.local
```

Set your Supabase project values in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
```

### 2. Database Migrations

Apply the migration scripts in your Supabase SQL editor or CLI:

1. `supabase/migrations/00001_initial_schema.sql` (Tables, views, RLS policies)
2. `supabase/migrations/00002_add_idempotency_key_to_activity_events.sql` (Unique constraint for deduplication)
3. *(Optional)* `supabase/seed.sql` (Demo organization, projects, and users)

### 3. Install & Run Web App

```bash
npm install --legacy-peer-deps
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to log in or create an organization.

### 4. Running the Desktop Agent

```bash
cd desktop
npm install
npm run tauri dev
```

---

## Testing

```bash
# Run unit tests (time accounting, state machine, idempotency deduplication)
npm test

# Run linter
npm run lint

# Build production bundle
npm run build
```

---

## License

MIT
