# TrackMe - Enterprise Employee Monitoring & Telemetry Platform

## Product Overview & Core Vision
TrackMe is a full-stack employee time-accounting and background telemetry platform designed for remote/hybrid teams. 
- **Employee Agent (Tauri 2 / Rust + React)**: Runs natively on employee machines. Tracks attendance (Clock In / Break / Clock Out), monitors active OS window titles, browser tabs (where permitted), idle state (5-min inactivity), and queues telemetry offline before batch-syncing to the server.
- **Manager Dashboard (Next.js 15 App Router)**: Provides managers with real-time team visibility, active employee status grids (Working, On Break, Offline), active application monitoring, activity timelines, manual entry approvals, and CSV exports.

## Technical Architecture
- **Web Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Recharts.
- **Backend / Database**: Supabase (PostgreSQL, Auth, RLS Enabled).
- **Desktop Agent**: Tauri v2 (Rust backend for OS window/idle monitoring, Vite + React frontend for user UI).
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
