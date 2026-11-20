# AGENTS.md - Agent Operating Standards & Repository Guidelines

Welcome to the TrackMe repository. This document outlines the operating principles, architectural conventions, coding style guidelines, and execution rules for AI assistants and autonomous coding agents working on this project.

---

## 1. Role of AI Agents & Tools

### Primary Objective

Agents working in this codebase are expected to act as senior software engineers:

- Build reliable, maintainable, and type-safe features without introducing bloat or technical debt.
- Adhere strictly to the chosen architecture:
  - **Employee Telemetry Collector**: WebExtension (Manifest V3 in `/extension`) targeting Chrome, Firefox, and Brave.
  - **Supervisory Hub**: Next.js 15 App Router in `/src`:
    - **Super Admin Portal** (`/src/app/admin/dashboard`): Organization and team configuration, manager approvals/rejections, multi-manager team assignments via `organization_members` & `team_members`, and executive report oversight.
    - **Manager Dashboard** (`/src/app/dashboard/manager`): Real-time team telemetry, employee live context, timesheets, time audit approvals, employee onboarding via team registration codes, and daily report submissions.
    - **Employee Dashboard** (`/src/app/dashboard`): Personal metrics, active work session statistics, and time accounting.
  - **Backend / Database**: Supabase PostgreSQL with Row Level Security (RLS) and Realtime subscriptions.
  - **Authentication & Authorization**:
    - One Supabase Auth identity per user.
    - Managers **MUST self-register** via `/register`, enter a `pending` state upon signup, and are strictly blocked from viewing team telemetry, timesheets, or manager controls until approved by Super Admin.
    - Super Admin **CANNOT manually create or pre-provision manager accounts**, and **CANNOT assign unregistered users or placeholder accounts to any team**.
    - Teams support **Co-Managers / Multi-Manager assignments** via `organization_members` and `team_members` managed by Super Admin (removing the 1-to-1 manager constraint).
    - Super Admin scope is strictly limited to Organization/Team structure, Manager approvals/assignments, and Daily Executive Report oversight. Super Admin has **ZERO direct management, assignment, or CRUD actions over individual employees** (employees are managed exclusively within teams by their assigned Managers).
- Keep dependency additions minimal and verify security, bundle impact, and compatibility.
- Inspect the existing implementation before changing it. Prefer extending existing patterns over introducing parallel systems or duplicate abstractions.

### Verification Discipline

Never declare a task complete without running and passing, where applicable:

1. `npx tsc --noEmit` — strict type check across the entire codebase.
2. `npm run lint` — ESLint validation with 0 errors and 0 warnings.
3. `npm test` — Vitest unit and business logic test suite.
4. `npm run build` — Next.js production build verification.

If a command cannot be run, explain why and report the checks that were and were not completed. Do not claim a check passed unless it was actually run and passed.

---

## 2. Architecture & File Organization

```text
TrackMe/
├── src/
│   ├── app/                      # Next.js 15 App Router pages & API routes
│   │   ├── admin/                # Super Admin Portal (/admin/dashboard - Org, Team, Manager approval & assignments)
│   │   ├── api/v1/               # Ingestion, session, and application API endpoints
│   │   │   ├── admin/            # Super Admin audit exports and administrative APIs
│   │   │   ├── events/           # Batch telemetry ingestion (/sync)
│   │   │   └── sessions/         # Clock-in, break, and clock-out endpoints
│   │   ├── dashboard/            # Manager (/dashboard/manager) & Employee (/dashboard) dashboards
│   │   ├── login/ / register/    # Shared authentication and registration flows
│   │   └── globals.css           # Tailwind CSS & design tokens
│   ├── components/               # React components (UI primitives & dashboard widgets)
│   ├── lib/                      # Core helpers, Supabase clients, auth/RBAC, authorization, time accounting
│   ├── proxy.ts                  # Edge middleware (CORS & session/role routing)
│   └── tests/                    # Vitest unit tests & Playwright e2e specs
├── extension/                    # Manifest V3 Browser Extension
│   ├── manifest.json             # Manifest V3 configuration (Chrome/Firefox/Brave)
│   ├── src/                      # Background service worker, popup UI, content scripts
│   └── icons/                    # Extension action & store icons
├── supabase/
│   └── migrations/               # PostgreSQL schema, RLS policies, and migration scripts
└── package.json                  # Scripts & dependencies
```

Treat this as a conceptual guide. Inspect the actual repository before assuming every listed path or file exists.

---

## 3. Coding Style & TypeScript Guidelines

### TypeScript

- **Strict Typing**: Strict mode is enabled. Do not use `any`. Use `unknown` with type guards or define explicit interfaces.
- **Shared Contracts**: When writing API routes or telemetry payloads, keep types synchronized between the extension collector and the Next.js API endpoints.
- **Dead Code & Imports**: Remove unused imports, variables, and unused helper functions immediately.
- **Validation**: Validate all untrusted input at system boundaries, especially API routes, Server Actions, invitation redemption, and extension event ingestion.
- **Database Types**: Prefer generated Supabase database types where available. Keep application types aligned with the actual schema and migrations.

### Next.js & React

- **Server Components by Default**: Keep components on the server unless client-side interactivity (`useState`, `useEffect`, event listeners) is required.
- **Client Components**: Mark client files with `'use client'` at the top. Clean up event listeners, timers, and Realtime channels in `useEffect` cleanup return functions.
- **Optimistic Updates**: For critical user feedback (clocking in/out, pausing), leverage React 19's `useOptimistic` and `useTransition` where appropriate.
- **CORS & Middleware**: Extension API requests are routed through `src/proxy.ts`. Ensure CORS headers accommodate `chrome-extension://` and `moz-extension://` protocols without weakening origin validation.
- **Server-Side Authorization**: Protect every server route, Server Action, and data-access operation. A protected frontend route or hidden UI element is not an authorization boundary.

### WebExtension (Manifest V3) Standards

- **Service Worker Lifetime**: Background service workers in Manifest V3 are ephemeral and will terminate when idle. Never rely on in-memory global state for persistence; use `chrome.storage.local`.
- **Offline Buffering**: Telemetry ticks must be buffered in `chrome.storage.local` and synchronized in batches to `/api/v1/events/sync`.
- **Least Privilege Permissions**: Request only essential permissions (`storage`, `idle`, `alarms`, `tabs`).
- **Idempotency**: Every telemetry event generated by the extension must include a unique `idempotency_key` (UUID v4) to prevent duplication during network retries.
- **Authenticated Events**: Associate telemetry with the verified authenticated user and derive organization/team scope on the server. Never trust organization, team, role, or user identifiers supplied by the extension as proof of authorization.

### Database & Migrations

- **Safe Migrations**: Write version-controlled migrations that are safe to apply to the current schema. Use `IF NOT EXISTS` and `DROP POLICY IF EXISTS` where appropriate, but do not blindly add these clauses if they would hide an unexpected schema conflict.
- **Row Level Security**: Every table containing user-, organization-, or team-scoped data must have RLS enabled and policies tested against role authorization rules.
- **Generated Columns**: Be mindful of PostgreSQL generated columns (e.g. `timestamp` generated from `recorded_at`). Always write to the source column.
- **Constraints & Indexes**: Use foreign keys, unique constraints, check constraints, and indexes to enforce important data invariants at the database level.
- **Service Role**: Never expose `SUPABASE_SERVICE_ROLE_KEY` to client-side code. Service-role operations bypass RLS and must be narrowly scoped with explicit server-side authorization checks.

---

## 4. Authentication, Organizations & Authorization Standards

### 4.1 Core Architecture

TrackMe is a multi-tenant platform used by multiple organizations with explicit organizational boundaries and role hierarchies:

- Use **one Supabase Auth identity per person**.
- Use `profiles` for application profile information linked to `auth.users.id`, including `role` and `approval_status`.
- Use `organization_members` and `team_members` for organization and team assignments.
- Do not create separate authentication systems, login pages, or credential tables for Super Admins, Managers, and Employees.
- Do not duplicate passwords or password hashes in application tables. Supabase Auth owns credential storage and verification.
- Treat the verified Supabase session and trusted database records as the source of truth for identity, role, organization, and team access.

### 4.2 Role Mapping & Hierarchy

The platform defines three distinct primary roles:

| Product Role | Database Role | Scope & Authority |
|---|---|---|
| **Super Admin** | `super_admin` | Platform & executive administrator. Strictly manages Organizations, Teams, Manager approvals, Manager-team assignments, and executive reports. **NO direct employee interaction or management scope.** |
| **Manager** | `manager` | Team supervisor. **Must self-register via `/register`**; enters `pending` state until approved by Super Admin in `/admin/dashboard`. Once approved, assigned to one or more teams (supports multi-manager/co-manager setups). Directly manages team employees, issues employee invitations, monitors team telemetry, and uploads daily reports. |
| **Employee** | `member` | Team worker. Registers via a Manager-issued Team Registration Code. Monitored and managed directly within their team by assigned Managers. |

- Users must never choose or assign their own role.
- Never trust role values supplied by the browser, extension, URL, or request body.

---

### 4.3 Strict Super Admin Scope & Boundaries

Super Admin operations are strictly limited to Organization and Team structure, Manager approvals/assignments, and executive report oversight:

**Permitted Super Admin Capabilities:**
1. **Organization & Team Structure**: Create organizations and teams, configure team settings, custom colors, and organization options.
2. **Manager Approval & Rejection**: Review pending self-registered managers in the Admin Portal (`/admin/dashboard`) and transition their status: grant approval (`approved`) or rejection (`rejected`).
3. **Team Assignments**: Assign and unassign approved managers across teams (supporting multiple co-managers per team and multi-team manager assignments via `organization_members` and `team_members`).
4. **Executive Oversight**: Review uploaded daily team progress reports and export platform-wide audit data (`/api/v1/admin/export-audit`).

**Strict Super Admin Boundaries & Absolute Prohibitions:**
1. **ZERO Direct Management, Assignment, or CRUD Actions Over Employees**:
   - Super Admin has **ZERO direct management, assignment, or CRUD actions over individual employees**.
   - Super Admin cannot create employee accounts, issue employee invitations, assign employees to teams, edit employee time records, or conduct telemetry audits.
   - Employees are managed exclusively within teams by their assigned Managers.
2. **NO Manual Manager Account Creation or Pre-Provisioning**:
   - Super Admin **CANNOT manually create, invite, or pre-provision manager accounts or placeholder slots**.
   - Managers MUST self-register via the public registration flow (`/register`).
3. **NO Assignment of Unregistered / Placeholder Users**:
   - Super Admin **CANNOT assign an unregistered user, pending applicant, or placeholder account to any team**.
   - Only registered users with verified `role = 'manager'` and `approval_status = 'approved'` can be assigned to teams.

---

### 4.4 Multi-Manager Team Support (Co-Managers)

- **Elimination of 1-to-1 Manager Constraint**: Remove the 1-to-1 manager constraint. Multiple approved managers can be assigned to a single team or organization via `organization_members` (`role = 'manager'`, `approval_status = 'approved'`) and `team_members` (`role = 'manager'`).
- **Multiple Team Assignments**: An individual approved manager can be assigned to multiple teams.
- **Assignment Authority**: Super Admin handles assigning and unassigning approved managers across teams from `/admin/dashboard`.
- **Shared Supervisory Scope**: All managers assigned to a team share managerial authority for that team:
  - Access to live telemetry, timesheets, timelines, and active status for all employees in that team.
  - Ability to generate Team Registration Codes for onboarding employees into that team.
  - Ability to review and approve time audits for that team.
  - Ability to upload daily team progress reports for Super Admin executive review.
- **Immediate Revocation**: When a manager is unassigned from a team by Super Admin, access to that team's employee telemetry, timesheets, and management tools is immediately revoked.

---

### 4.5 Manager Onboarding & Approval Flow

Managers must follow an autonomous self-registration and administrative approval pipeline:

1. **Mandatory Self-Registration (`/register`)**:
   - Managers **MUST self-register** via the registration flow (`/register`).
   - Super Admin cannot manually create, pre-create, pre-seed, or provision manager accounts or slots.
   - The registrant provides full name, username, email, and password.
2. **Initial `pending` Gated State**:
   - Upon signup, the account is created with `role = 'manager'` and `approval_status = 'pending'`.
   - **Gated Restrictions**: Newly registered managers start with `approval_status = 'pending'` and are **strictly blocked from viewing team telemetry, timesheets, employee data, or manager controls** until approved by Super Admin.
   - Attempts to access `/dashboard/manager` or telemetry APIs return a pending approval notice.
3. **Super Admin Approval & Rejection (`/admin/dashboard`)**:
   - Super Admin reviews pending manager signups in the Admin Portal approval queue.
   - Super Admin approves (`approved`) or rejects (`rejected`) the registration.
   - Approval transitions `approval_status` to `'approved'`.
4. **Team Assignment**:
   - Only after approval can the manager be assigned to one or more teams by the Super Admin.
   - Super Admin **CANNOT assign an unregistered user, pending applicant, or placeholder account to any team**.

---

### 4.6 Employee Invitation and Registration

Employees are invited and managed exclusively at the team level by their assigned Managers:

1. **Manager-Issued Team Invitations**:
   - An assigned, approved manager generates an Employee Registration Code for their team.
   - The code is scoped to that specific team and organization, with configurable expiration and usage limits.
   - Super Admin does not issue employee invitation codes or assign employees.
2. **Employee Registration (`/register`)**:
   - The employee enters the Team Registration Code along with their full name, username, and password.
   - The backend validates the code and associates the user with the specified team as a `member`.
   - The employee is directed to the Employee Dashboard (`/dashboard`).
3. **Manager-Directed Team Scope**:
   - Employees are managed directly within teams by their assigned Managers.
   - Employees cannot alter their role, organization, or team assignments.

---

### 4.7 Shared Login Flow & Routing

Use one shared login page (`/login`) and authentication flow for all users.

**User-facing credentials:**
- Username (or email)
- Password

Do not ask users to select a role during login. The role and approval status are retrieved from trusted database records after authentication.

**Login behavior & routing:**
1. The user submits username and password.
2. Authenticate through Supabase Auth.
3. Retrieve verified `role` and `approval_status` from `profiles` and `organization_members`.
4. Establish session using Supabase SSR cookies.
5. Route by role and status:
   - `super_admin` → Super Admin Portal (`/admin/dashboard`).
   - `manager`:
     - If `approval_status === 'approved'` → Manager Dashboard (`/dashboard/manager`).
     - If `approval_status === 'pending'` → Pending Approval view (telemetry & manager tools strictly blocked).
   - `member` → Employee Dashboard (`/dashboard`).
6. Deny protected access to inactive or suspended accounts.

---

### 4.8 Authorization Rules & Boundary Enforcement

**Super Admin (`super_admin`):**
- Manage organizations, teams, and team color styling.
- Approve/reject pending self-registered managers.
- Manage team assignments for approved managers (including multi-manager teams).
- Review executive daily team reports and export audit logs.
- **Strictly Prohibited**: Direct employee interaction, manual manager creation, assigning unregistered users, viewing/modifying individual employee telemetry.

**Manager (`manager` - Approved):**
- Access only teams assigned to them.
- View live employee status, telemetry, application/website context, and activity timelines for assigned teams.
- Create employee registration codes scoped to assigned teams.
- Approve/reject time audit requests for assigned team employees.
- Upload daily team progress reports for Super Admin review.
- **Strictly Prohibited**: Organization creation, Super Admin portal access, managing unassigned teams, self-assigning to new teams.

**Employee (`member`):**
- Access personal employee dashboard (`/dashboard`), session history, and personal stats.
- Clock in/out, start breaks, and resume sessions via the WebExtension or web dashboard.
- **Strictly Prohibited**: Viewing other employees' telemetry, accessing manager tools, accessing the Super Admin portal, changing team or role assignments.

---

### 4.9 Invitation Code Security

- Registration codes are used **exclusively for Employee onboarding** created by assigned team managers.
- Managers do not use invitation codes; they self-register at `/register` and await Super Admin approval.
- Generate employee registration codes using cryptographically secure random values.
- Store only secure hashes of registration codes in `invitations`.
- Never expose stored hashes or raw codes through ordinary public API responses.
- Enforce expiration, revocation, and atomic usage limit decrementing upon employee signup.

---

### 4.10 Multi-Tenant Isolation and Supabase RLS

Tenant and role isolation is a critical security requirement:

- Every team belongs to an organization (`organization_id`).
- All employee telemetry (`work_sessions`, `activity_events`, `time_entries`) is strictly isolated.
- Enable and enforce RLS on all tables:
  - Super Admin access is governed by `public.is_super_admin()` to manage organizations, teams, manager profiles, and review daily reports.
  - Managers can access telemetry and employee records **only** for teams they are explicitly assigned to in `team_members` or `organization_members`, and only when `approval_status = 'approved'`.
  - Employees can access only their own records (`user_id = auth.uid()`).
- Never trust browser- or extension-supplied `organization_id`, `team_id`, `user_id`, or `role` values as proof of authorization.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client-side code.

---

### 4.11 Account and Assignment Lifecycle

1. **Manager Lifecycle**:
   - Self-registration via `/register` → Status `pending`.
   - Super Admin reviews and approves in `/admin/dashboard` → Status `approved`.
   - Super Admin assigns manager to one or more teams (supports co-managers).
   - Manager actively manages assigned teams and employees.
   - If unassigned or deactivated, team telemetry and management access is immediately revoked.
2. **Employee Lifecycle**:
   - Manager generates Team Registration Code.
   - Employee registers via `/register` with team code → Assigned to team as `member`.
   - Telemetry captured via WebExtension.
   - Manager manages and audits time; removal by manager immediately revokes team access while preserving historical telemetry for audit compliance.

---

### 4.12 Expected Data Model

- `auth.users`: Supabase Auth identities.
- `profiles`: Application profile data (`id`, `full_name`, `username`, `email`, `role`, `approval_status`).
- `organizations`: Multi-tenant organization records (`name`, `slug`, `team_code`, `color`, `require_approval`).
- `organization_members`: User-to-organization membership, role (`super_admin`, `manager`, `member`), and `approval_status`. Supports multiple managers per organization.
- `teams`: Teams linked to organizations.
- `team_members`: User-to-team assignments supporting **multiple managers per team (co-managers)** and multiple team assignments per manager.
- `invitations`: Hashed employee registration codes scoped to organization and team, created by managers.
- `daily_reports`: Daily team reports uploaded by managers for Super Admin executive review.
- Telemetry tables (`work_sessions`, `activity_events`, `time_entries`, `projects`): Retain team/user relationships protected by RLS.

---

### 4.13 Legacy Architecture Deprecation & Prohibited Anti-Patterns

The following legacy patterns are strictly deprecated, abolished, and prohibited across all code and database layers:

1. **NO Pre-Approved Manager Profile Slots**:
   - Abolished: Pre-creating profile rows or slots before auth user signup (`provision_manager_slot`).
   - Every manager profile in `profiles` and `organization_members` must be tied directly to a real Supabase Auth identity created via `/register`.
2. **NO Slot Claiming Flows**:
   - Abolished: Claiming pre-approved manager slots upon registration (`claim_preapproved_manager`).
   - Manager signup creates a standard manager profile with `approval_status = 'pending'`.
3. **NO Placeholder Accounts**:
   - Abolished: Placeholder or mock manager accounts (e.g., "Bob Manager", placeholder profiles without corresponding `auth.users` identities).
   - The UI and backend must never create, display, or assign placeholder manager slots.
4. **NO Admin-Created or Pre-Provisioned Manager Credentials**:
   - Super Admin cannot create manager accounts, invite managers, or generate manager credentials. Managers MUST self-register via `/register`.
5. **NO Unregistered User Team Assignments**:
   - Super Admin cannot assign an unregistered user, pending applicant, or placeholder account to any team. Only users with an active `auth.users` account, `role = 'manager'`, and `approval_status = 'approved'` can be assigned.
6. **NO 1-to-1 Manager Constraint**:
   - Multiple approved managers can be assigned to a single team/organization via `organization_members` (`role = 'manager'`, `approval_status = 'approved'`) and `team_members`.
7. **NO Super Admin Direct Employee Scope**:
   - Super Admin has ZERO direct management, assignment, or CRUD actions over individual employees. Employees are managed exclusively by their team's Managers.

---

## 5. Execution Rules for Autonomous Workflows

1. **Verify Before and After**: Run the relevant test and lint suites before making alterations to establish the baseline, then rerun them after edits. Run the full verification set before declaring completion when feasible.
2. **Inspect Before Changing**: Review the existing schema, migrations, RLS policies, authentication utilities, proxy/middleware, API routes, and dashboard routing before modifying authentication or authorization.
3. **Atomic, Intentional Changes**: Modify only the code necessary to solve the task. Do not reformat unrelated files.
4. **No Placeholders**: Never write placeholder functions (`// TODO: implement later`) or mock data in production paths without explicit user instruction.
5. **Migration Discipline**: Implement database changes through version-controlled Supabase migrations. Review existing schema and policies first; do not create duplicate tables or policies that conflict with the current design.
6. **Security Tests**: For authentication and authorization changes, test manager self-registration, pending status blocking, Super Admin approval flow, multi-manager team assignments, prohibition of direct employee management by Super Admin, cross-tenant access, and concurrent employee registration.
7. **Telemetry Compatibility**: Do not weaken existing event idempotency, RLS, extension authentication, or privacy controls while implementing account and team management.
8. **Transparent Communication**: Summarize architectural changes concisely and reference affected files using clickable Markdown links. Report commands run and their actual outcomes. Clearly identify anything not tested or not completed.

---

## 6. Final Engineering Principles

- Prefer the smallest safe change that fits the existing architecture.
- Keep the extension, Next.js application, and Supabase schema aligned through shared types and clear API contracts.
- Treat the server and database as the authority for identity, roles, permissions, and tenant boundaries.
- Enforce the RBAC model:
  - Super Admin: Organization, Team, and Manager management and executive report oversight (zero direct employee scope).
  - Manager: Self-registers, requires Super Admin approval, manages assigned teams (co-managers supported) and employees directly.
  - Employee: Onboards via manager team code, monitored within assigned team.
- Enforce authorization on every protected backend operation and through Supabase RLS.
- Never trust the frontend as the source of truth for a user's role, organization, or team access.
- Prioritize security, correctness, maintainability, and user privacy over implementation shortcuts.
