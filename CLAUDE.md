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

### 2. Supervisory Hub: Next.js 15 App Router (`/src/app/admin/*`, `/src/app/dashboard/*`)

- **Super Admin Portal (`/src/app/admin/dashboard`)**:
  - Executive workspace administration: Organization provisioning, Team creation, color styling, and settings.
  - **Manager Approvals**: Review and approve or reject newly self-registered managers (`approval_status`: `'pending'` → `'approved'` or `'rejected'`).
  - **Team & Manager Assignments**: Assign and unassign approved managers across teams (full support for Co-Managers / Multi-Manager teams via `organization_members` and `team_members`).
  - **Executive Report Oversight**: Review daily team progress reports and export audit logs.
  - **Strict Boundaries**: Super Admin scope is strictly limited to Organization/Team structure, Manager approvals/assignments, and Daily Executive Report oversight.
  - **Absolute Prohibitions**:
    - ZERO direct management, assignment, invitation, or CRUD actions over individual employees (Employees are managed exclusively by their assigned team Managers).
    - CANNOT manually create, invite, or pre-provision manager accounts or placeholder slots.
    - CANNOT assign unregistered users or placeholder accounts to any team.
- **Manager Dashboard (`/src/app/dashboard/manager`)**:
  - Accessible only to approved managers (`approval_status = 'approved'`).
  - Live team status overview (Working, On Break, Offline) for assigned teams.
  - Real-time employee active application & website monitoring.
  - Activity timelines, timesheets, time audit approval workflows, and CSV export capabilities.
  - Direct employee management: Issue Team Registration Codes for employee onboarding.
  - Daily report uploads for Super Admin executive review.
  - **Gated Access**: Newly registered managers start with `approval_status = 'pending'` and are strictly blocked from viewing team telemetry, timesheets, employee data, and manager tools until approved by Super Admin.
- **Employee Web Dashboard (`/src/app/dashboard`)**:
  - Personal session stats, active work duration, and app/website usage breakdowns.
  - Real-time Supabase subscriptions updating personal metrics without manual polling.

### 3. Ingestion, Session & Admin API Surface (`/src/app/api/v1/*`)

- `POST /api/v1/events/sync`: High-throughput batch event ingestion with UUID idempotency key deduplication.
- `POST /api/v1/sessions/clock-in`: Starts active work session.
- `POST /api/v1/sessions/break`: Manages break state transitions (`break_start`, `break_end`).
- `POST /api/v1/sessions/clock-out`: Concludes work session and creates immutable `time_entries` record.
- `POST /api/v1/admin/export-audit`: Super Admin endpoint for platform-wide audit log exports.
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

- `profiles`: User information, full name, email, avatar URL, `role` (`super_admin`, `manager`, `member`), and `approval_status` (`pending`, `approved`, `rejected`).
- `organizations`: Multi-tenant organization / team container definitions (`name`, `slug`, `team_code`, `color`, `require_approval`).
- `organization_members`: User organization membership, role assignments (`super_admin`, `manager`, `member`), and membership `approval_status`. Supports multiple managers per organization.
- `teams`: Teams belonging to an organization.
- `team_members`: Relational team membership and manager assignments. Explicitly supports multiple managers assigned to a single team (Co-Managers / Multi-Manager teams).
- `invitations`: Hashed, expiring, revocable registration codes created by Managers for employee onboarding, scoped to specific teams and organizations. Manager onboarding does NOT use invitation codes.
- `daily_reports`: Daily team reports uploaded by managers for Super Admin executive review.
- `work_sessions`: Active/completed employee sessions (`active`, `paused`, `completed`).
- `activity_events`: High-frequency telemetry events (`active_tick`, `idle_tick`, `window_change`, etc.) with `idempotency_key` and `recorded_at`.
- `time_entries`: Finalized aggregated time records for payroll, timesheets, and manager approvals.
- `projects`: Assignable client / internal project entities.

**Role Mapping:**
- **Super Admin (`super_admin`)**: Platform & organization executive administrator. Manages organizations, teams, manager approvals, manager-team assignments, and executive reports. Strictly excluded from direct employee management.
- **Manager (`manager`)**: Team manager. Self-registers, enters `pending` state, approved by Super Admin, assigned to one or more teams (co-managers supported). Directly invites and manages team employees.
- **Employee (`member`)**: Team member. Registers via a Manager-issued Team Registration Code. Telemetry is monitored and approved by assigned team managers.

---

## Engineering Guidelines & Standards

1. **Idempotency & Resilience**:
   - All event sync payloads must supply `idempotency_key` (UUID) to guarantee at-most-once storage on retries.
2. **Supabase Row-Level Security (RLS)**:
   - All queries and mutations must respect tenant isolation and role boundaries enforced by `organization_members`, `team_members`, and `profiles`.
3. **Realtime Channels**:
   - Scope Realtime subscriptions strictly with filters (e.g. `organization_id=eq.${organizationId}`) and unsubscribe cleanly on component unmount.
4. **Server Components & Performance**:
   - Parallelize database queries using `Promise.all` in Server Components.
   - Use page-scoped `revalidatePath` to preserve UI state.

---

## Authentication, Organization Management & Role-Based Access Control (RBAC)

### 1. Core Architecture

TrackMe provides a multi-tenant, role-governed operational telemetry platform with strict access boundaries:

- Multiple companies (organizations) use the same application with isolated workspaces and data.
- Supabase Auth manages identities and credentials, with `profiles`, `organization_members`, and `team_members` serving as application-level identity, role, and assignment records.
- One Supabase Auth identity per person. Do not create separate authentication systems or credential tables for Super Admins, Managers, and Employees.
- A user's verified role and team assignments determine resource access.
- Backend authorization checks and Supabase RLS policies are the sole authorities for access control. The frontend must never be trusted as proof of authorization.

### 2. Supported Roles & Hierarchy

TrackMe enforces three distinct roles with explicit boundaries:

1. **Super Admin (`super_admin`):**
   - Platform/executive administrator managing organizations, teams, manager approvals, and executive reports.
   - Controls team creation, organization configuration, and manager team assignments.
   - Has **NO direct interaction, assignment, or management scope with individual employees**.
2. **Manager (`manager`):**
   - Self-registered team supervisor.
   - Enters a `pending` state upon registration and cannot view team telemetry or manager tools until approved by Super Admin.
   - Once approved and assigned to one or more teams, manages team employees directly, issues employee registration invitations, monitors team telemetry, and submits daily reports for executive review.
   - Teams support **Co-Managers / Multi-Manager configurations**, allowing multiple managers to oversee a shared team.
3. **Employee (`member`):**
   - Team worker registered via a Manager-issued Team Registration Code.
   - Telemetry (ticks, sessions, breaks) is captured via the WebExtension and accessible to assigned team managers.
   - Cannot access manager or super admin dashboards.

---

### 3. Strict Super Admin Scope & Boundaries

Super Admin capabilities are strictly limited to organizational governance, manager approvals, team assignments, and executive report oversight:

**Permitted Super Admin Operations:**
- Create, configure, style (color accents), and manage Organizations and Teams.
- Review pending self-registered managers in the Admin Portal (`/admin/dashboard`) and transition their status: grant approval (`approved`) or rejection (`rejected`).
- Assign and unassign approved managers across teams (supporting multiple co-managers per team and multi-team manager assignments via `organization_members` and `team_members`).
- Review executive daily team progress reports and export platform-wide audit logs (`/api/v1/admin/export-audit`).

**Strict Super Admin Boundaries & Absolute Prohibitions:**
- **ZERO Direct Employee Scope**: Super Admin has **NO direct interaction, assignment, or CRUD actions over individual employees**. Super Admin cannot create employee accounts, issue employee invitations, assign employees to teams, edit employee time records, or view individual employee telemetry sessions. Employees are managed exclusively by their assigned team Managers.
- **NO Manual Manager Account Creation or Pre-Provisioning**: Super Admin **CANNOT manually create, invite, or pre-provision manager accounts or placeholder slots**. All managers must self-register.
- **NO Assignment of Unregistered / Placeholder Users**: Super Admin **CANNOT assign an unregistered user, pending manager, or placeholder account to any team**. Only registered users with verified `approval_status = 'approved'` and `role = 'manager'` can be assigned to teams.

---

### 4. Manager Onboarding & Approval Flow

Managers follow an autonomous self-registration and administrative approval pipeline:

1. **Mandatory Self-Registration (`/register`)**:
   - Managers **MUST self-register** via the public registration flow (`/register`).
   - Super Admin cannot create, pre-create, pre-seed, or provision manager credentials or profile slots.
   - During signup, the registrant provides full name, username, email, and password.
2. **Initial `pending` Gated State**:
   - Upon successful signup, the manager account is initialized with `role = 'manager'` and `approval_status = 'pending'`.
   - **Gated Restrictions**: Newly registered managers start with `approval_status = 'pending'` and are strictly blocked from viewing team telemetry, timesheets, employee data, or manager controls until approved by Super Admin.
   - Attempts to access `/dashboard/manager` or telemetry APIs return a pending approval notice.
3. **Super Admin Review & Approval (`/admin/dashboard`)**:
   - Super Admin reviews pending manager signups in the Admin Portal approval queue.
   - Super Admin evaluates applicant details and approves (`approved`) or rejects (`rejected`) the registration.
   - Approval transitions `approval_status` from `'pending'` to `'approved'`.
4. **Team Assignment**:
   - Only after approval can the manager be assigned to one or more teams by the Super Admin.
   - Super Admin **CANNOT assign an unregistered user, pending applicant, or placeholder account to any team**.

---

### 5. Multi-Manager Team Support (Co-Managers)

- **Elimination of 1-to-1 Manager Constraint**: Multiple approved managers can be assigned to a single team or organization via `organization_members` (`role = 'manager'`, `approval_status = 'approved'`) and `team_members` (`role = 'manager'`).
- **Flexible Hierarchy**: An individual approved manager can be assigned to multiple teams.
- **Super Admin Governance**: Super Admin handles assigning and unassigning approved managers across teams from `/admin/dashboard`.
- **Shared Supervisory Scope**: All managers assigned to a team share managerial authority for that team:
  - Access to live telemetry, timesheets, and active status for all employees in that team.
  - Ability to generate Team Registration Codes for onboarding employees into that team.
  - Ability to review and approve time audits for that team.
  - Ability to upload daily team progress reports for Super Admin executive review.
- **Immediate Revocation**: When a manager is unassigned from a team by Super Admin, access to that team's employee telemetry, timesheets, and management tools is immediately revoked.

---

### 6. Employee Invitation & Registration Flow

Employees are managed entirely at the team level by assigned managers:

1. **Manager Invitation Creation**:
   - An approved manager selects their assigned team and generates a Team Registration Code.
   - The code is cryptographically random, hashed in the database, and scoped specifically to the manager's organization and team.
   - The manager configures code expiration and usage limits.
   - Super Admin does not issue employee invitation codes.
2. **Employee Registration (`/register`)**:
   - The employee navigates to `/register` and provides the Team Registration Code, full name, username, and password.
   - The backend validates the code (ensuring it is unexpired, unrevoked, and within usage limits).
   - Upon successful creation, the employee is assigned `role = 'member'`, automatically linked to the team and organization from the invitation, and granted access to the employee dashboard (`/dashboard`).
3. **Employee Team Boundaries**:
   - Employees belong to their assigned team and are managed directly by that team's assigned managers.
   - Employees cannot modify their role, organization, or team assignment.

---

### 7. Single Shared Login System & Routing

TrackMe uses a unified login page (`/login`) for all users regardless of role:

**Credentials**: Username (or email) and Password. Users do not select a role on login.

**Server-Side Authentication & Routing Workflow**:
1. User submits credentials.
2. Server authenticates identity against Supabase Auth.
3. Server queries `profiles` and `organization_members` for the verified role and `approval_status`.
4. Route decision:
   - `super_admin` → Redirect to Super Admin Portal (`/admin/dashboard`).
   - `manager`:
     - If `approval_status === 'approved'` → Redirect to Manager Dashboard (`/dashboard/manager`).
     - If `approval_status === 'pending'` → Routed to a Pending Approval notice page; access to `/dashboard/manager` and all telemetry APIs is blocked.
   - `member` → Redirect to Employee Dashboard (`/dashboard`).
5. Inactive or suspended accounts are denied access.

---

### 8. Role-Based Permissions Matrix

| Capability | Super Admin (`super_admin`) | Manager (`manager` - Approved) | Employee (`member`) |
|---|---|---|---|
| Manage Organizations & Teams | Full control | None | None |
| Approve Pending Managers | Full control (`/admin/dashboard`) | None | None |
| Assign Managers to Teams (Co-Managers) | Full control | None | None |
| Create / Pre-create Manager Accounts | **Prohibited** (Self-registration only) | None | None |
| Direct Employee Assignment / Management | **Prohibited** (Manager scope only) | Full control (Assigned teams) | None |
| Issue Employee Registration Codes | None | Full control (Assigned teams) | None |
| View Team Telemetry & Timelines | None | Full control (Assigned teams) | None |
| Time Audit Approvals | None | Full control (Assigned teams) | None |
| Upload Daily Team Reports | None | Full control (Assigned teams) | None |
| Review Executive Reports & Audit Logs | Full control | None | None |
| Personal Telemetry (Clock In/Out/Break) | None | Optional | Own sessions only |

---

### 9. Database Model & Supabase Schema Requirements

Extend the Supabase schema maintaining strict relational integrity:

- `auth.users`: Supabase Auth identity records.
- `profiles`:
  - `id` (UUID references `auth.users.id`)
  - `full_name`, `username`, `email`, `avatar_url`
  - `role`: `'super_admin' | 'manager' | 'member'`
  - `approval_status`: `'pending' | 'approved' | 'rejected'`
- `organizations`:
  - `id`, `name`, `slug`, `team_code`, `color`, `require_approval`, timestamps
- `organization_members`:
  - `organization_id`, `user_id`, `role`, `approval_status`
  - Unique composite key on `(organization_id, user_id)`
  - Supports multiple managers per organization.
- `teams`:
  - `id`, `organization_id`, `name`, `description`, `status`, timestamps
- `team_members`:
  - `team_id`, `user_id`, `role` (`'manager' | 'member'`)
  - Unique composite key on `(team_id, user_id)`
  - Allows multiple managers per team (co-managers) and managers assigned to multiple teams.
- `invitations`:
  - `id`, `code_hash`, `organization_id`, `team_id`, `created_by`, `role` (`'member'`), `expires_at`, `max_uses`, `uses_count`, `is_revoked`, timestamps
  - Reserved exclusively for Employee team invitations.
- `daily_reports`:
  - `id`, `organization_id`, `team_id`, `manager_id`, `file_url`, `file_name`, `file_type`, `file_size`, `notes`, `created_at`

---

### 10. Multi-Tenant Isolation & Supabase RLS

Tenant and role isolation must be guaranteed at the database layer via PostgreSQL Row Level Security:

- **Super Admin Access**:
  - Validated via `public.is_super_admin()` helper function checking authenticated user role.
  - Can read and manage `organizations`, `teams`, `organization_members`, and manager `profiles`.
  - Can read `daily_reports` and audit tables for executive oversight.
  - RLS policies must prevent Super Admin from directly modifying or inserting into employee-exclusive tables (`work_sessions`, `activity_events`, `time_entries`) on behalf of employees.
- **Manager Access**:
  - Gated by `approval_status = 'approved'` and assignment in `team_members` or `organization_members`.
  - Can view telemetry, activity events, and sessions **only** for employees in their assigned teams.
  - Can insert invitations only for teams where they are an assigned manager.
  - Cannot access data belonging to other managers' unassigned teams or other organizations.
- **Employee Access**:
  - Can view and manage only their own telemetry, sessions, and time records (`user_id = auth.uid()`).
  - Cannot view team-wide telemetry or other employees' data.

---

### 11. Account, Membership, and Assignment Lifecycle

1. **Manager Lifecycle**:
   - Register (`/register`) → Status: `pending` (blocked from telemetry/tools).
   - Super Admin reviews in `/admin/dashboard` → Status: `approved`.
   - Super Admin assigns to Team A (and optionally Team B) → Co-Manager relationship created in `team_members`.
   - Active: Manager oversees team, invites employees, uploads daily reports.
   - Deassignment / Deactivation: Super Admin unassigns or deactivates; team access is revoked immediately.
2. **Employee Lifecycle**:
   - Manager generates Team Registration Code.
   - Employee registers (`/register`) using code → Immediate team assignment as `member`.
   - Active: Telemetry collected via WebExtension and reviewed by assigned team managers.
   - Removal: Manager removes employee from team; access to team data revoked immediately while preserving telemetry history for audit and payroll compliance.

---

### 12. Legacy Architecture Deprecation & Clean Up Rules

The following legacy patterns are strictly deprecated, abolished, and prohibited across all code and database layers:

1. **NO Pre-Approved Manager Slots**:
   - Abolished: Pre-creating profile rows or slots before auth user signup (`provision_manager_slot`).
   - All manager rows in `profiles` and `organization_members` must originate from authentic Supabase Auth self-registration (`auth.users.id`).
2. **NO Slot Claiming Flows**:
   - Abolished: Claiming pre-approved manager slots upon registration (`claim_preapproved_manager`).
   - Registration creates a standard manager profile with `approval_status = 'pending'`.
3. **NO Placeholder Accounts**:
   - Abolished: Placeholder or mock manager accounts (e.g., "Bob Manager", placeholder profiles without corresponding `auth.users` identities).
   - Super Admin dashboard must never render or manage placeholder slots.
4. **NO Admin-Created or Pre-Provisioned Manager Credentials**:
   - Super Admin cannot create manager accounts, invite managers, or generate manager credentials. Managers MUST self-register via `/register`.
5. **NO Unregistered User Team Assignments**:
   - Super Admin cannot assign an unregistered user or placeholder account to any team. Only users with an active `auth.users` account, `role = 'manager'`, and `approval_status = 'approved'` can be assigned.
6. **NO 1-to-1 Manager Constraint**:
   - Multiple approved managers can be assigned to a single team/organization via `organization_members` (`role = 'manager'`, `approval_status = 'approved'`) and `team_members`.
7. **NO Super Admin Employee CRUD**:
   - Super Admin has ZERO direct management, assignment, or CRUD actions over individual employees. Employees are managed exclusively by their team's Managers.

---

### 13. Verification & Testing Requirements

Autonomous workflows and developer verification must validate:
1. `npx tsc --noEmit`: Typecheck passes across the entire project.
2. `npm run lint`: ESLint passes with 0 errors and 0 warnings.
3. `npm test`: Vitest test suite passes all unit, RBAC, telemetry, and time accounting tests.
4. `npm run build`: Next.js production build succeeds.
5. **RBAC Verification**:
   - Verify self-registration leaves manager in `pending` status.
   - Verify pending manager cannot access `/dashboard/manager`, telemetry sync, or timesheets.
   - Verify Super Admin cannot manually create or pre-provision manager accounts.
   - Verify Super Admin cannot assign unregistered, pending, or placeholder accounts to teams.
   - Verify Super Admin can assign multiple managers (co-managers) to a team via `organization_members` & `team_members`.
   - Verify Super Admin has no direct employee management actions or endpoints.
