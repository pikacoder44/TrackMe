# TrackMe - Enterprise Employee Monitoring & Telemetry Platform

## Current Phase Strategy & Focus
- **Desktop Agent Paused**: Tauri desktop agent development (`/desktop`) is currently paused.
- **100% Web App Focus**: Primary focus is building the Web Application Employee & Manager Dashboards (`src/app/dashboard/*`).
- **Real-Time Telemetry & Simulation**: Real-time activity tracking enabled via Supabase Realtime subscriptions and web-based telemetry simulation (simulating desktop agent data ingestion for development and end-to-end testing).

## Product Overview & Core Vision
TrackMe is a full-stack employee time-accounting and background telemetry platform designed for remote/hybrid teams.
- **Web Employee Dashboard (`src/app/dashboard/employee`)**: Live attendance tracking (Clock In / Start Break / End Break / Clock Out), current session status, personal activity stats, and real-time app & website usage reporting.
- **Manager Dashboard (`src/app/dashboard/manager`)**: Live team visibility with real-time status updates, active employee status grids (Working, On Break, Offline), active application monitoring, activity timelines, manual entry approvals, and CSV exports.
- **Desktop Agent (`/desktop`)** *(Paused)*: Tauri v2 (Rust + React) native background tracker for OS window/idle monitoring and offline event queueing.

## Key Feature Requirements
- **Live Attendance & Break Management**: Web-based clock-in/out, session state handling, and break tracking.
- **Supabase Realtime Subscriptions**: Subscribe to Supabase Realtime changes on `activity_events` and `work_sessions` so manager and employee dashboards update live without polling or manual refreshes.
- **App & Website Usage Report (WebWork Inspired)**:
  - Comprehensive usage breakdown table: App / Website Name, Category Type, Productivity Rating (`Productive`, `Neutral`, `Non-productive`), Activity Level %, Inactive %, and Duration (`HH:MM`).

## Technical Architecture
- **Web Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Recharts.
- **Backend / Database / Realtime**: Supabase (PostgreSQL, Realtime subscriptions, Auth, RLS Enabled).
- **Desktop Agent (Paused)**: Tauri v2 (Rust backend for OS window/idle monitoring, Vite + React frontend for user UI).
- **Testing & CI**: Vitest (node environment/polyfilled), GitHub Actions (Node 22).

## Key Database Tables
- `profiles` (id, email, full_name)
- `organizations` (id, name, slug)
- `organization_members` (organization_id, user_id, role: 'owner'|'admin'|'manager'|'member')
- `work_sessions` (id, user_id, organization_id, status: 'active'|'paused'|'completed', started_at, ended_at)
- `activity_events` (id, session_id, user_id, organization_id, event_type: 'active_tick'|'idle_tick'|'window_change'|'break_start'|'break_end', window_title, app_name, timestamp)

## Development & Security Guidelines
- Keep SQL migrations idempotent (`DROP POLICY IF EXISTS`).
- Always use `Promise.all` for parallel database queries in Server Components.
- Use page-scoped `revalidatePath` to avoid unnecessary layout re-renders.
- Ensure all user access respects Supabase RLS policies based on `organization_members` roles.
- Configure and clean up Supabase Realtime channel subscriptions with appropriate filters (e.g. `organization_id=eq...`) on unmount.
