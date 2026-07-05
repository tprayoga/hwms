# Walkthrough — PT Indotek Buana Karya HWMS

This document summarizes the development, architectural decisions, and verification results for all completed phases of the Hybrid Work Management System (HWMS):
- **Phase 0:** Core Monorepo scaffolding & Tenant Isolation
- **Phase 1:** Master Data Administrations & Excel Import
- **Phase 2:** Sprint Tasks & Aggregation Caching
- **Phase 3:** Kehadiran (Attendance) & Standup (Check-in/Check-out with Offline Sync)
- **Phase 4:** Feed & Blocker Lifecycle
- **Phase 5:** Leave Requests & Approvals

---

## Technical Decisions Summary

### 1. Request-Scoped Tenant Isolation (Phase 0)
`PrismaService` implements query interception using a JS `Proxy` and Node's `AsyncLocalStorage` (`tenantLocalStorage`).
- Any query automatically appends `tenant_id` to its parameters.
- For `findUnique` operations (which don't allow non-unique filters like `tenant_id` in Prisma's strict type validations), a post-query validation interceptor checks that the record's `tenant_id` matches the active context, otherwise returning `null` (simulated not found).

### 2. Prisma-Level Auditing (Phase 1)
Auditing is implemented as a **Prisma Client Extension** rather than a NestJS controller interceptor. This ensures that any model write—whether initiated by HTTP request, background cron job, CLI script, or test case—is logged to the `AuditLog` table with actor context.

### 3. Redis Caching & Weighted Aggregations (Phase 2)
Sprint completion metrics are calculated using the formula:
$$\text{Sprint Progress} = \frac{\sum (\text{percent\_complete} \times \text{weight})}{\sum \text{weight}}$$
- Defers to `0%` if total weight is 0.
- Classifies RAG status: **Green** ($\ge 85\%$), **Yellow** ($60\%$ to $84\%$), **Red** ($< 60\%$), and **Black** ($< 65\%$ with open blockers or delayed past planned end date).
- Aggregations are cached in Redis to minimize database stress. Writes trigger a memory-debounced background refresh (60s limit), supplemented by an hourly/5m cron job.

### 4. Timezone-Aware Check-in Lateness (Phase 3)
Instead of relying on server timezone offsets, check-in lateness is computed by converting the server's receipt timestamp (`submitted_at`) into the user's registered timezone (WIB/WITA/WIT) using native JS `toLocaleTimeString` and comparing it against the policy's configured `checkin_window_end` (e.g. `"10:00"`).

### 5. Haversine GPS Geofencing (Phase 3)
Calculates GPS distance using the Haversine formula:
- Validated on WFO (must be within radius of tenant offices) and ONSITE (must be within radius of client coordinates).
- If coordinates lie outside the geofence range, the check-in is **still accepted** but flagged as `geofence_ok = false` for compliance review.
- WFH bypasses geofencing checks.

### 6. Atomic Attendance Transactions (Phase 3)
All check-in and check-out writes run inside database transactions:
- **Check-in IN:** 原子 (atomically) writes the `Checkin` record, links tasks into `StandupItem` (planned), creates `Blocker` entries, flags the target `Task` as `BLOCKED`, and generates mention notifications.
- **Check-out OUT:** 原子 writes the checkout record, logs actual status/percents to `StandupItem`, updates `Task` completion metrics, and logs optional evidences.
- To prevent transaction-extension deadlocks or timeout errors, these transactions are run on the raw PrismaClient instance (`this.prisma.raw.$transaction`).

### 7. Offline Sync with IndexedDB & Idempotency Keys (Phase 3)
- If a mobile client fails to submit check-in/check-out due to network error, the payload (including base64 photo data) is stored in the browser's **IndexedDB** (`queue` store).
- A yellow offline sync warning banner appears in [App.tsx](file:///Users/user/Documents/hwms/apps/web/src/App.tsx).
- When a connection is restored, background listeners sync the queued payloads automatically.
- Requests send a unique `Idempotency-Key` header. The server caches results in Redis for 24 hours, preventing double-processing on sync retries.

### 8. Feed Team Resolution Abstraction (Phase 4)
We implemented a dynamic `TeamResolverService` class:
- **Primary Grouping:** Users are grouped into a team if they share active task assignments in the same project(s).
- **Department Fallback:** If the user has no project task assignments, the system automatically falls back to department membership (`user.department_id`), resolving PRD Open Question #3.
- Blocker-attached standups are automatically pinned to the top of the feed, and entries display four specific compliance flags: `late`, `auto`, `offline`, and `no-evidence`.

### 9. Blocker Resolution Lifecycle (Phase 4)
- **POST `/feed/blockers/:id/resolve`** restricts resolver actions to authorized entities (the reporter, mentioned teammates, manager, or super admin).
- Atomic resolution updates `blocker.status` to `RESOLVED`, resets the target task status back to `IN_PROGRESS`, and logs an in-app `ESCALATION` notification for the reporter.

### 10. High-Availability Storage Provider (Phase 5)
`StorageService` implements file uploads (e.g. sick leave certificates) to S3/MinIO `attachments` bucket via the S3 SDK.
- To ensure local development and automated testing environments remain robust without relying on live container infrastructure, the service automatically falls back to local disk storage (`uploads/attachments/`) if S3 credentials are missing or connection errors arise.

### 11. Transactional Leave Deductions & Exemption (Phase 5)
- Permohonan cuti/izin/sakit does not deduct balances prematurely.
- Balance deduction (only for `CUTI` type) runs atomically inside a database transaction **at the moment the supervisor approves the request**.
- If a supervisor rejects a request, a `decisionNote` (reason for rejection) is strictly enforced.
- If an employee cancels an approved request, the deducted days are atomically refunded back to their `leave_balance`.
- Approved leave days exempt the employee from check-in standup requirements. The server and frontend resolve `isOnLeave = true` on target days to render a relaxation status.

---

## What Was Built

### 1. Backend Modules (`apps/api`)
- [PrismaService](file:///Users/user/Documents/hwms/apps/api/src/prisma/prisma.service.ts): Dynamic query isolation.
- [StorageService](file:///Users/user/Documents/hwms/apps/api/src/storage/storage.service.ts): High-availability MinIO and local filesystem storage.
- [LeaveService](file:///Users/user/Documents/hwms/apps/api/src/leave/leave.service.ts): Processes business checks, transactional balance calculations, and notifications.
- [LeaveController](file:///Users/user/Documents/hwms/apps/api/src/leave/leave.controller.ts): Exposes API routes and files attachments server.
- [AttendanceService](file:///Users/user/Documents/hwms/apps/api/src/attendance/attendance.service.ts): Integrates leave exemptions into day statuses and check-in blocks.

### 2. Frontend Interfaces (`apps/web`)
- [App.tsx](file:///Users/user/Documents/hwms/apps/web/src/App.tsx): Adds the **Cuti & Persetujuan** main tab:
  - **Pengajuan Saya:** displays remaining leave balance, logs request form (with date range, type select, reason, and file attachments), lists own request history, and shows cancellation triggers.
  - **Kotak Masuk Persetujuan:** lists pending inbox requests assigned to the supervisor (oldest first), clickable certificate links, and quick Setujui/Tolak decision prompts.
  - Exemption layout overlays the check-in form with a rest card if `isOnLeave` is active.

---

## Verification Results

### 1. Automated Unit & Integration Tests
All 11 test files (totaling 31 tests) execute and pass successfully:
- `rbac.spec.ts`: Prevents employees from accessing admin paths.
- `import.spec.ts`: Validates spreadsheet records.
- `aggregation.spec.ts`: Confirms progress mathematics and RAG statuses.
- `sprint-overlap.spec.ts`: Blocks overlapping sprints.
- `code-generator.spec.ts`: Validates task code formats.
- `lateness.spec.ts`: Validates lateness across timezones (WIB, WITA, WIT).
- `transaction.spec.ts`: Checks transactional check-in/check-out and database atomicity.
- `prisma.service.spec.ts`: Confirms tenant isolation.
- `feed.spec.ts`: Asserts team resolver project fallback and feed payload rendering.
- `blocker.spec.ts`: Verifies authorization permissions and blocker resolution task-status resets.
- `leave.spec.ts`: Verifies date range validations, sickness attachment requirements, oldest-first supervisor inbox routing, transaction balance deduction on approval, decision note requirements on rejection, balance refund on cancellations, and double-sided in-app notifications.

```bash
$ pnpm --filter @hwms/api test
$ vitest run

 RUN  v1.6.1 /Users/user/Documents/hwms/apps/api

 ✓ src/auth/rbac.spec.ts  (4 tests) 8ms
 ✓ src/task/aggregation.spec.ts  (8 tests) 5ms
 ✓ src/feed/blocker.spec.ts  (2 tests) 165ms
[Nest] 27630  - 07/04/2026, 7:08:20 PM     LOG [StorageService] S3/MinIO client initialized pointing to: http://localhost:9000
 ✓ src/leave/leave.spec.ts  (5 tests) 156ms
 ✓ src/attendance/transaction.spec.ts  (1 test) 165ms
 ✓ src/task/code-generator.spec.ts  (2 tests) 8ms
 ✓ src/admin/import.spec.ts  (1 test) 74ms
 ✓ src/attendance/lateness.spec.ts  (3 tests) 1ms
 ✓ src/task/sprint-overlap.spec.ts  (2 tests) 2ms
 ✓ src/prisma/prisma.service.spec.ts  (1 test) 79ms
 ✓ src/feed/feed.spec.ts  (2 tests) 32ms

 Test Files  11 passed (11)
      Tests  31 passed (31)
   Start at  19:08:20
   Duration  941ms
```

### 2. Monorepo Builds
Running `pnpm build` builds the entire workspaces successfully:
```bash
$ pnpm build
✓ @hwms/shared build success
✓ @hwms/api build success (NestJS dist bundle compiled)
✓ @hwms/web build success (React dist bundle compiled with PWA service worker)
```
