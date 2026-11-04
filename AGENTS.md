# AGENTS.md - Agent Operating Standards & Repository Guidelines

Welcome to the TrackMe repository. This document outlines the operating principles, architectural conventions, coding style guidelines, and execution rules for AI assistants and autonomous coding agents working on this project.

---

## 1. Role of AI Agents & Tools

### Primary Objective

Agents working in this codebase are expected to act as senior software engineers:

- Build reliable, maintainable, and type-safe features without introducing bloat or technical debt.
- Adhere strictly to the chosen architecture:
  - **Employee Telemetry Collector**: WebExtension (Manifest V3 in `/extension`) targeting Chrome, Firefox, and Brave.
  - **Supervisory Hub**: Next.js 15 App Router in `/src` (Owner, Manager, and Employee dashboards).
  - **Backend / Database**: Supabase PostgreSQL with Row Level Security (RLS) and Realtime subscriptions.
  - **Authentication & Authorization**: One Supabase Auth identity per user, organization memberships for roles, explicit team assignments, invitation-based registration, and backend/database-enforced RBAC.
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
│   │   ├── api/v1/               # Ingestion, session, and application API endpoints
│   │   ├── dashboard/            # Owner, Manager, and Employee dashboards
│   │   ├── login/ / signup/      # Shared authentication and invitation registration pages
│   │   └── globals.css           # Tailwind CSS & design tokens
│   ├── components/               # React components (UI primitives & dashboard widgets)
│   ├── lib/                      # Core helpers, Supabase clients, auth, authorization, time accounting
│   ├── proxy.ts                  # Edge middleware (CORS & session handling)
│   └── tests/                    # Vitest unit tests & Playwright e2e specs
├── extension/                    # Manifest V3 Browser Extension (Phase 1+)
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
- **Row Level Security**: Every table containing user- or organization-scoped data must have RLS enabled and policies tested against organization and team authorization rules.
- **Generated Columns**: Be mindful of PostgreSQL generated columns (e.g. `timestamp` generated from `recorded_at`). Always write to the source column.
- **Constraints & Indexes**: Use foreign keys, unique constraints, check constraints, and indexes to enforce important data invariants at the database level.
- **Service Role**: Never expose `SUPABASE_SERVICE_ROLE_KEY` to client-side code. Service-role operations bypass RLS and must be narrowly scoped with explicit server-side authorization checks.

---

## 4. Authentication, Organizations & Authorization Standards

### 4.1 Core Architecture

TrackMe is a multi-tenant platform used by multiple companies (organizations). Each organization has an isolated workspace and its own data.

- Use **one Supabase Auth identity per person**.
- Use the existing `profiles` table for application profile information linked to `auth.users.id`.
- Use `organization_members` for the user's organization membership and role.
- Use `teams` and explicit team-membership/assignment records to represent team access.
- Use invitation records for controlled manager and employee registration.
- Do not create separate authentication systems, login pages, or credential tables for Owners, Managers, and Employees.
- Do not duplicate passwords or password hashes in application tables. Supabase Auth owns credential storage and verification.
- Treat the verified Supabase session and trusted database records as the source of truth for identity, role, organization, and team access.

### 4.2 Role Mapping

The three primary organization roles are:

| Product role | Database role | Meaning |
|---|---|---|
| Organization Admin / Owner | `owner` | Company owner who initializes and manages the organization |
| Manager | `manager` | User assigned to manage one or more teams |
| Employee | `member` | User who joins a team through an invitation |

- Keep `admin` only if the existing product genuinely needs a distinct organization-administrator role.
- Do not confuse a platform-level administrator with an organization owner.
- Users must never choose or assign their own role.
- Never trust role values supplied by the browser, extension, URL, or request body.

### 4.3 Organization Initialization

- The first user creating a new organization becomes its `owner`.
- Collect the required organization details and owner account details.
- Create the organization and its owner membership safely and atomically where practical.
- Prevent users from claiming existing organizations or creating owner memberships for organizations they do not own.
- Ensure every organization-owned resource has an `organization_id`.
- If users can belong to multiple organizations, make the active organization context explicit and verify membership in it on every request.

**Owner permissions:**

- Access organization-wide information and all teams within their organization.
- Create, edit, deactivate, and manage teams.
- Create manager invitations and assign managers to teams before registration.
- Change manager-to-team assignments.
- Manage organization members and organization settings.
- Never access another organization's data.

### 4.4 Team and Membership Rules

- Every team belongs to exactly one organization.
- An organization can have multiple teams.
- A team can have multiple managers.
- A manager can be assigned to multiple teams.
- By default, an employee belongs to one team. Keep the model extensible if future requirements permit multiple team memberships.
- Represent team membership and manager assignments using explicit relational records (for example, `team_members`, or separate `team_managers` and `team_employees` tables).
- Validate that the user, team, and organization belong together before creating or changing an assignment.
- Managers cannot assign themselves to additional teams or change their own role.
- Only an authorized Owner can change manager-to-team assignments.

### 4.5 Manager Invitation and Registration

Managers cannot register freely or choose their own team assignments.

**Owner invitation workflow:**

1. The Owner creates a manager invitation.
2. The Owner may specify the intended manager's email or other identity details if required by the product.
3. The Owner selects one or more existing teams for the manager.
4. The system generates a unique, high-entropy Manager Registration Code.
5. The Owner shares the invitation securely with the intended manager.
6. The invitation stores the organization and team assignments chosen by the Owner.

**Manager registration workflow:**

1. The manager opens the registration page and enters the invitation code.
2. The manager provides the required account details, including username and password (and email if required by the Supabase Auth configuration).
3. The backend validates the invitation.
4. Reject invalid, expired, revoked, exhausted, or otherwise ineligible invitations.
5. After successful registration, create the Supabase Auth identity, profile, and `manager` organization membership.
6. Apply the organization and team assignments stored in the invitation.
7. Ignore or reject any role, organization ID, or team IDs submitted as registration-form values; these must come from the validated invitation and trusted server-side records.

Managers can access only the teams currently assigned to them.

### 4.6 Employee Invitation and Registration

Employees cannot register without a valid team invitation.

**Manager invitation workflow:**

1. The manager selects a team to which they are currently assigned.
2. The manager creates an Employee Registration Code scoped to that team and organization.
3. The manager configures an expiration and usage limit where supported.
4. The manager shares the code securely with the intended employee.
5. The backend verifies that the manager is still authorized to invite employees to that team.

**Employee registration workflow:**

1. The employee opens the registration page and enters the Team Registration Code.
2. The employee provides the required account details, including username and password (and email if required by Supabase Auth).
3. The backend validates the invitation.
4. Reject invalid, expired, revoked, exhausted, or otherwise ineligible invitations.
5. After successful registration, create the Supabase Auth identity, profile, and `member` organization membership.
6. Automatically associate the employee with the team and organization stored in the invitation.
7. Never trust organization IDs, team IDs, or roles submitted by the registration form.

Employees cannot choose or change their own role, organization, or team assignment during registration.

### 4.7 Shared Login Flow

Use one login page and one authentication flow for Owners, Managers, and Employees.

**User-facing credentials:**

- Username
- Password

Do not ask users to select a role during login. The role is retrieved from trusted database records after authentication.

**Login behavior:**

1. The user submits their username and password.
2. Resolve the username to the corresponding Supabase Auth identity using a secure server-side mechanism, or use email as the Supabase Auth identifier if that is the established project convention.
3. Authenticate through Supabase Auth.
4. Retrieve the user's profile, organization membership, role, account status, and team assignments from trusted records.
5. Establish the session using the project's secure Supabase SSR/session pattern.
6. Route the user to the appropriate dashboard based on their actual role:
   - `owner` → Owner/Admin Dashboard.
   - `manager` → Manager Dashboard.
   - `member` → Employee Dashboard.
7. Deny protected access to inactive, suspended, or unauthorized accounts.

Never expose privileged service-role credentials to the browser. Do not implement a custom password-verification system alongside Supabase Auth.

### 4.8 Authorization Rules

**Owner (`owner`):**

- Access organization-wide information and all teams within that organization.
- Manage teams, members, manager invitations, team assignments, and organization settings.
- Perform owner-only administrative actions.

**Manager (`manager`):**

- Access only teams assigned to them.
- View permitted employee status, telemetry, activity timelines, and time records for those teams.
- Create employee invitations only for teams currently assigned to them.
- Perform only explicitly permitted employee and time-audit management actions.
- Cannot access owner-only organization functionality.
- Cannot change their own role or team assignments.
- Cannot access another manager's teams unless also assigned to them.

**Employee (`member`):**

- Access their own employee dashboard, session statistics, and permitted personal information.
- Access only team resources explicitly permitted to employees.
- Cannot access owner or manager functionality.
- Cannot view another team's restricted information.
- Cannot change their own role, organization membership, or team assignment.

Authorization must be enforced by backend checks and database policies. Hiding frontend links or protecting frontend routes alone is insufficient.

### 4.9 Invitation Code Security

- Generate codes using a cryptographically secure random generator with sufficient entropy.
- Display the raw code only when it is created so it can be shared with the intended recipient.
- Store only a secure hash of each code.
- Never expose stored hashes or raw codes through ordinary database reads, public APIs, logs, analytics, or error messages.
- Support expiration, revocation, and configurable usage limits.
- Track invitation type (`manager` or `employee`), organization, team scope, creator, manager invitation team assignments, status, usage count, and timestamps.
- Validate and consume invitation usage atomically with account creation to prevent concurrent requests from exceeding usage limits.
- Verify that the invitation creator is authorized for the organization and team scope.
- Prevent reuse of revoked, expired, or exhausted invitations.
- Return clear but non-sensitive validation errors.

### 4.10 Multi-Tenant Isolation and Supabase RLS

Tenant isolation is a critical security requirement.

- Every organization-owned resource must be associated with an `organization_id`.
- Every team must belong to exactly one organization.
- Memberships and team assignments must be validated against the same organization.
- Owners can access resources only within their own organization.
- Managers can access only resources belonging to their assigned teams within their organization.
- Employees can access only their own permitted data and resources belonging to their assigned team.
- Enable and enforce RLS on all tables containing organization-, team-, or user-scoped data.
- Derive the authenticated user identity from the verified Supabase session.
- Never trust browser- or extension-supplied `organization_id`, `team_id`, `user_id`, or role values as proof of authorization.
- Validate resource ownership and team assignment on every protected query and mutation.
- Prevent IDOR vulnerabilities, including access attempts that alter URL parameters or request payload IDs.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client-side code.
- Any server-side service-role operation must be narrowly scoped and perform explicit authorization checks because it bypasses RLS.
- Scope Realtime subscriptions to authorized organization/team data and ensure the underlying rows remain protected by RLS.

### 4.11 Account and Assignment Lifecycle

Support the following operations:

- Activate and deactivate organization members.
- Revoke unused invitations.
- Expire invitations based on their expiration timestamp.
- Change manager-to-team assignments through the Owner.
- Remove employees from teams through authorized management actions.
- Deactivate or remove managers and employees.
- Immediately deny protected access when a user is deactivated or loses the relevant organization/team membership.
- Preserve telemetry and time records according to retention and audit requirements when a membership is removed.
- Record important security and administrative actions in an audit log where appropriate.

When a manager loses an assignment to a team, their access to that team's data must be revoked immediately. When an employee is removed from a team, their access to that team's restricted resources must also be revoked.

### 4.12 Expected Data Model

Extend the existing Supabase schema; do not create a parallel authentication model.

- `auth.users`: Supabase Auth identities and credential management.
- `profiles`: Application profile information linked to `auth.users.id`.
- `organizations`: Company/workspace records.
- `organization_members`: User-to-organization membership and role (`owner`, `manager`, `member`, and `admin` only if genuinely needed).
- `teams`: Teams linked to an organization.
- `team_members` or separate `team_managers` and `team_employees`: Explicit user-to-team relationships.
- `invitations`: Hashed registration codes, invitation type, organization/team scope, creator, assigned team IDs for manager invitations, expiration, usage limit/count, status, and timestamps.
- Existing telemetry tables (`work_sessions`, `activity_events`, `time_entries`, and `projects`): Preserve organization/team ownership relationships and protect them with the same access rules.

Use foreign keys, indexes, unique constraints, and database validation where appropriate. Do not duplicate authentication credentials in `profiles` or other application tables. Passwords remain managed by Supabase Auth.

For the initial product behavior, employees should belong to one team and managers may belong to multiple teams.

---

## 5. Execution Rules for Autonomous Workflows

1. **Verify Before and After**: Run the relevant test and lint suites before making alterations to establish the baseline, then rerun them after edits. Run the full verification set before declaring completion when feasible.
2. **Inspect Before Changing**: Review the existing schema, migrations, RLS policies, authentication utilities, proxy/middleware, API routes, and dashboard routing before modifying authentication or authorization.
3. **Atomic, Intentional Changes**: Modify only the code necessary to solve the task. Do not reformat unrelated files.
4. **No Placeholders**: Never write placeholder functions (`// TODO: implement later`) or mock data in production paths without explicit user instruction.
5. **Migration Discipline**: Implement database changes through version-controlled Supabase migrations. Review existing schema and policies first; do not create duplicate tables or policies that conflict with the current design.
6. **Security Tests**: For authentication and authorization changes, test valid/invalid/expired/revoked invitations, invitation usage limits, role permissions, cross-tenant access, cross-team access, inactive accounts, and concurrent invitation redemption as applicable.
7. **Telemetry Compatibility**: Do not weaken existing event idempotency, RLS, extension authentication, or privacy controls while implementing account and team management.
8. **Transparent Communication**: Summarize architectural changes concisely and reference affected files using clickable Markdown links. Report commands run and their actual outcomes. Clearly identify anything not tested or not completed.

---

## 6. Final Engineering Principles

- Prefer the smallest safe change that fits the existing architecture.
- Keep the extension, Next.js application, and Supabase schema aligned through shared types and clear API contracts.
- Treat the server and database as the authority for identity, roles, permissions, and tenant boundaries.
- Use one Supabase Auth identity per person, one shared profile model, organization memberships for roles, explicit team assignments, and invitation-based registration.
- Enforce authorization on every protected backend operation and through Supabase RLS.
- Never trust the frontend as the source of truth for a user's role, organization, or team access.
- Prioritize security, correctness, maintainability, and user privacy over implementation shortcuts.
