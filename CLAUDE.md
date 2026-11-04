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
- `organizations`: Multi-tenant organization definitions.
- `organization_members`: Organization membership and role assignments (`owner`, `admin`, `manager`, `member`).
- `teams`: Teams belonging to an organization.
- `team_members`: Team membership and manager-to-team assignments. Use explicit membership/assignment records so managers can belong to multiple teams and team membership can be managed independently.
- `invitations`: Hashed, expiring, revocable registration invitations for managers and employees, including invitation type, organization/team scope, creator, usage limits, and usage count.
- `work_sessions`: Active/completed employee sessions (`active`, `paused`, `completed`).
- `activity_events`: High-frequency telemetry events (`active_tick`, `idle_tick`, `window_change`, etc.) with `idempotency_key` and `recorded_at`.
- `time_entries`: Finalized aggregated time records for payroll, timesheets, and manager approvals.
- `projects`: Assignable client / internal project entities.

**Role mapping:** The organization owner is represented by the `owner` role; managers use `manager`; employees use `member`. Keep `admin` reserved for any distinct organization-administration or platform-administration role that the existing product genuinely needs. Do not create separate authentication tables for these roles.

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

---

## Authentication, Organization Management & Role-Based Access Control (RBAC)

### 1. Core Architecture

Implement a secure, multi-tenant authentication and access-management system for TrackMe.

- Multiple companies (organizations) use the same application.
- Every organization has its own isolated workspace and data.
- Use one shared authentication system for all users.
- Use Supabase Auth for identity and credentials, with `profiles` and `organization_members` as the application-level user and role records.
- Do not create separate authentication systems or separate login tables for owners, managers, and employees.
- A user's role and organization/team relationships determine what the user can access.
- The backend and database policies are the source of truth for identity, roles, permissions, and resource access.

### 2. Supported Roles

TrackMe has three primary organization roles:

- **Owner (Admin):** The company owner who initializes and controls the organization's workspace. Use the existing `owner` role in `organization_members` for this role.
- **Manager:** A user assigned by the Owner to manage one or more specific teams. Use the `manager` role.
- **Employee:** A user who joins a team through an invitation and uses the employee dashboard. Use the `member` role.

Keep the existing `admin` role only if the application has a distinct need for an additional organization administrator. Do not confuse a platform-level administrator with an organization owner. Do not let users select or assign their own roles.

### 3. Organization Initialization and Owner Registration

- Provide a secure organization-initialization flow.
- The first user who creates an organization becomes its `owner`.
- Collect the required organization details and the owner's account details.
- Create the organization and its owner membership safely and atomically where practical.
- The owner receives access to the organization-wide dashboard and management features.
- Prevent an ordinary visitor from claiming an existing organization or creating an owner membership for an organization they do not own.
- If the product supports multiple organizations per user, make the active organization context explicit and validate membership in it on every request.

**Owner permissions:**

- View and manage organization-wide information.
- Create, edit, deactivate, and delete teams, subject to data-retention requirements.
- Create manager invitations and assign managers to teams before they register.
- Change manager-to-team assignments.
- Manage organization members and their active status.
- Manage organization-level settings.
- Access all teams and their data within their own organization, but never another organization's data.

### 4. Team Management and Relationships

- An Owner can create multiple teams within their organization.
- Every team must belong to exactly one organization.
- A team should have a name, optional description, status, and timestamps.
- A team can have multiple managers.
- A manager can be assigned to multiple teams.
- Employees should belong to one team by default. Keep the data model extensible if future requirements allow employees to belong to multiple teams.
- Store team membership and manager assignments in explicit relational records (for example, `team_members` or separate `team_managers` and `team_employees` tables).
- Validate that the team, user, and organization all belong together before creating or changing an assignment.

### 5. Manager Invitation and Registration

Managers cannot register freely or choose their own team assignments.

**Owner workflow:**

- The Owner creates a manager invitation.
- The Owner can specify the intended manager's email or other identity details if the product requires it.
- The Owner selects one or more existing teams to assign to that manager.
- The system generates a unique, high-entropy Manager Registration Code.
- The Owner shares the invitation securely with the intended manager.
- The invitation must be associated with the Owner's organization and the selected team assignments.

**Manager workflow:**

- The manager opens the registration page and enters the invitation code.
- The manager provides the required account details, including a username and password (and email if required by Supabase Auth configuration).
- The backend validates the invitation before allowing registration.
- If the invitation is valid, active, unexpired, and has available uses, registration may proceed.
- If the code is invalid, expired, revoked, or exhausted, reject registration with a clear error.
- After successful registration, create the user's profile and `manager` organization membership, then apply the team assignments stored in the invitation.
- Never accept team assignments or a role supplied by the registration form as authoritative.
- A manager cannot promote themselves, change their own role, or assign themselves to additional teams.
- Managers can access only the teams currently assigned to them.

### 6. Employee Invitation and Registration

Employees cannot register without a valid team invitation.

**Manager workflow:**

- A manager selects a team to which they are currently assigned.
- The manager creates an Employee Registration Code for that specific team.
- The invitation is scoped to the manager's organization and the selected team.
- The manager can set an expiration date and usage limit where supported.
- The manager shares the code securely with the intended employee.
- The backend must verify that the manager is still authorized to invite employees to that team.

**Employee workflow:**

- The employee opens the registration page and enters the Team Registration Code.
- The employee provides the required account details, including a username and password (and email if required by Supabase Auth configuration).
- The backend validates the invitation.
- If valid, the employee can complete registration.
- After successful registration, create the user's profile and `member` organization membership, and automatically associate the employee with the team linked to the invitation.
- Never accept an organization ID, team ID, or role from the registration form as authoritative.
- If the code is invalid, expired, revoked, or exhausted, reject registration with a clear error.
- Employees cannot choose or change their own organization, role, or team assignments during registration.

### 7. Single Login System

Use one login page and one authentication flow for Owners, Managers, and Employees.

**Login fields:**

- Username
- Password

Do not ask users to select their role during login. A role selector is unnecessary and must never be used as an authorization mechanism.

**Login flow:**

1. The user enters their username and password.
2. Resolve the username to the corresponding Supabase Auth identity using a secure server-side mechanism, or use email as the Supabase Auth identifier if that is the established project convention. Never expose privileged service-role credentials to the browser.
3. Authenticate using Supabase Auth.
4. Retrieve the user's profile, organization membership, role, account status, and team assignments from trusted database records.
5. Establish the authenticated session using the project's secure Supabase SSR/session pattern.
6. Redirect the user according to their actual role:
   - `owner` → Owner/Admin Dashboard.
   - `manager` → Manager Dashboard.
   - `member` → Employee Dashboard.
7. If the account is inactive, suspended, or no longer a member of the organization, deny access to protected functionality and handle the session appropriately.

The frontend may use the role to choose a dashboard experience, but every backend operation and database query must independently enforce authorization.

### 8. Role-Based Permissions

**Owner (`owner`):**

- Access organization-wide information and all teams within that organization.
- Create and manage teams.
- Create manager invitations and assign managers to teams.
- Manage organization members, assignments, and settings.
- Perform owner-only administrative actions.

**Manager (`manager`):**

- Access only teams assigned to them.
- View the live status and permitted telemetry of employees in those teams.
- View team activity timelines and time records.
- Create employee invitations only for teams assigned to them.
- Perform permitted employee and time-audit management actions for their assigned teams.
- Cannot access organization-wide owner functionality.
- Cannot modify their own role or manager-team assignments.
- Cannot access another manager's teams unless separately assigned.

**Employee (`member`):**

- Access their own employee dashboard, session statistics, and permitted personal information.
- Access only team resources explicitly permitted to employees.
- Cannot access owner or manager functionality.
- Cannot view another team's restricted information.
- Cannot change their own role, organization membership, or team assignment.

Define permissions explicitly and enforce them on the server/database. Hiding frontend links or protecting frontend routes alone is not sufficient.

### 9. Invitation Code Security and Lifecycle

- Generate invitation codes using a cryptographically secure random generator with sufficient entropy.
- Display the raw code only when it is created, so it can be shared with the intended recipient.
- Store only a secure hash of each code; never store or return raw codes in normal database reads.
- Support expiration, revocation, and configurable usage limits.
- Track invitation type (`manager` or `employee`), organization, associated team(s), creator, status, usage count, and timestamps.
- Validate the invitation and consume a use atomically with account creation to prevent concurrent requests from exceeding the usage limit.
- Prevent reuse of revoked, expired, or exhausted invitations.
- Do not expose invitation codes, hashes, or privileged details in logs, analytics, client responses, or error messages.
- Verify that the invitation creator is authorized for the organization and team scope.
- Provide clear but non-sensitive registration errors.

### 10. Database Model and Existing Supabase Schema

Extend the existing schema rather than creating a parallel authentication model.

- `auth.users` (Supabase Auth): Authentication identities and credential management.
- `profiles`: Application profile data linked to `auth.users.id`.
- `organizations`: Company/workspace records.
- `organization_members`: User-to-organization membership and role (`owner`, `admin` if genuinely needed, `manager`, `member`).
- `teams`: Teams linked to an organization.
- `team_members` (or separate `team_managers` and `team_employees`): Explicit user-to-team relationships and assignment records.
- `invitations`: Hashed registration codes, invitation type, organization/team scope, creator, assigned team IDs for manager invitations, expiration, usage limit/count, status, and timestamps.
- Existing telemetry tables (`work_sessions`, `activity_events`, `time_entries`, and `projects`) must retain their organization/team ownership relationships and be protected by the same access rules.

Use foreign keys, indexes, unique constraints, and database validation where appropriate. Avoid duplicating authentication credentials in `profiles` or any other application table. Passwords must remain managed by Supabase Auth.

For the initial product behavior, employees should belong to one team. Managers may belong to multiple teams. Choose the simplest relational schema that supports these rules without blocking future extension.

### 11. Multi-Tenant Isolation and Supabase RLS

Tenant isolation is a critical security requirement.

- Every organization-owned resource must be associated with an `organization_id`.
- Every team must be associated with exactly one organization.
- Every membership and team assignment must be validated against the same organization.
- Owners can access resources only within their own organization.
- Managers can access only resources belonging to their assigned teams within their organization.
- Employees can access only their own permitted data and resources belonging to their assigned team.
- Enforce these rules with Supabase Row-Level Security (RLS) policies and server-side authorization checks.
- Never trust an `organization_id`, `team_id`, `user_id`, or role sent by the browser as proof of access.
- Derive the authenticated user identity from the verified Supabase session.
- Validate resource ownership and team assignment in every protected query and mutation.
- Prevent IDOR vulnerabilities, including attempts to access another organization's records by changing URL parameters or request payload IDs.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client-side code. Any server-side use of the service role must be narrowly scoped and must perform explicit authorization checks because it bypasses RLS.
- Keep Realtime subscriptions scoped to authorized organization/team data, and ensure RLS also protects the underlying rows.

### 12. Account, Membership, and Assignment Lifecycle

Support the following administrative operations:

- Activate and deactivate organization members.
- Revoke unused invitations.
- Expire invitations automatically based on their expiration timestamp.
- Change manager-to-team assignments through the Owner.
- Remove employees from teams through authorized management actions.
- Remove or deactivate managers and employees.
- Immediately deny protected access when a user is deactivated or loses the relevant organization/team membership.
- Preserve telemetry and time records according to the product's retention and audit requirements when a membership is removed.
- Record important security and administrative actions in an audit log where appropriate.

When a manager loses assignment to a team, their access to that team's data must be revoked immediately. When an employee is removed from a team, their access to that team's restricted resources must also be revoked.

### 13. Implementation Expectations

Before changing code or database schema:

- Inspect the existing Supabase schema, migrations, RLS policies, authentication utilities, middleware/proxy, server actions, API routes, and dashboard routing.
- Reuse the existing project architecture and conventions.
- Do not create duplicate tables or a second authentication system if equivalent structures already exist.
- Identify conflicts between the current schema and these requirements, then propose the smallest safe migration.
- Implement schema changes through version-controlled Supabase migrations.
- Add or update RLS policies and indexes as part of the migrations.
- Keep authentication, authorization, invitation management, organization management, and team management logically separated.
- Validate all inputs on the server.
- Use secure password and session handling through Supabase Auth.
- Never trust frontend-supplied roles, organization IDs, or team assignments.
- Add tests for valid/invalid/expired/revoked invitations, usage limits, role permissions, cross-tenant access, cross-team access, inactive accounts, and concurrent invitation redemption.
- Ensure the browser extension's authentication and event ingestion use the same verified user identity and enforce organization/team authorization.
- Do not weaken existing telemetry idempotency, RLS, or privacy controls while implementing authentication.

Implement the complete registration, invitation, login, dashboard-routing, and authorization workflows—not just their UI screens.

**Final architectural principle:** TrackMe must use one Supabase Auth identity per user, one shared application user/profile model, organization memberships for roles, explicit team assignments, invitation-based registration, and backend/database-enforced authorization. The frontend must never be the source of truth for a user's role or access.
