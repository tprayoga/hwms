# Task List: Phase 6 Dashboards, Pushes, and Schedulers

- [ ] **Dashboard Modules (Backend)**
  - [ ] Implement `GET /dashboard/team` (filters, grid info, blocker aging, anomalies)
  - [ ] Implement `GET /dashboard/program` (CTO cards, sprint/role completion RAG status bars, status distribution)
- [ ] **Web Push Notifications (Backend)**
  - [ ] Implement `PushService` with VAPID key auto-generator and push trigger helper
  - [ ] Expose `POST /push/subscribe` and `POST /push/unsubscribe` endpoints
- [ ] **BullMQ Scheduler & Async Exporter (Backend)**
  - [ ] Create `SchedulerService` bootstrapping BullMQ workers and queues
  - [ ] Implement timezone-aware check-in/checkout reminder worker (skips holidays/approved leaves)
  - [ ] Implement selfie cleanup worker (removes files > 90 days old)
  - [ ] Implement `POST /reports/attendance/export` (queueing async exceljs builder) and `GET /reports/download/:key` serving endpoint
- [ ] **Frontend Dashboard & PWA Onboarding (Frontend)**
  - [ ] Build interactive Team & Program Dashboard tab in `App.tsx`
  - [ ] Build PWA Onboarding dialog guide (Safari vs Android instructions, permissions triggers, privacy statement)
  - [ ] Implement in-app notifications and banner fallbacks
- [ ] **Testing & Verification**
  - [ ] Write integration test suites and verify all specs pass
