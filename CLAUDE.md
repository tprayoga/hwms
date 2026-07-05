# CLAUDE.md — HWMS (Hybrid Work Management System)

> Memori proyek untuk Claude Code. File ini self-contained: seluruh keputusan penting dari PRD, TDD, API Spec, Functional Spec, Test Plan, dan ERD sudah diringkas di sini. Jangan menyimpang dari file ini tanpa alasan tertulis. Jika ada konflik antara instruksi ad-hoc dan file ini, file ini menang kecuali user secara eksplisit meng-override.

---

## 1. Konteks Produk

**Perusahaan:** PT Indotek Buana Karya (system integrator, Indonesia).
**Produk:** HWMS — platform "standup-driven work management". Menggabungkan absensi + standup harian + task tracking dalam satu ritual harian. Dipakai internal dulu, dirancang productizable untuk dijual ke klien B2G/enterprise.

**Ide inti:** karyawan check-in 2x sehari dalam bentuk standup (bukan absen polos). Satu ritual menghasilkan tiga jenis data: kehadiran (payroll), progres task (PM/CTO), performa personel (scorecard).

**Bahasa:** UI dalam Bahasa Indonesia. Kode, komentar, nama variabel, commit message dalam English.

---

## 2. Stack Teknologi (WAJIB — jangan diganti tanpa persetujuan)

| Layer | Teknologi |
|---|---|
| Frontend | PWA: React 18 + Vite + Tailwind CSS + vite-plugin-pwa. Satu codebase responsive: mobile view (karyawan) + desktop view (manajer/HR/PM/CTO/admin) |
| Offline | Service Worker + IndexedDB (lib `idb`) untuk antrian check-in offline termasuk foto selfie; Web App Manifest; Web Push (VAPID) |
| Backend | NestJS (Node 20 LTS), REST modular per domain, class-validator, OpenAPI auto-generate dari decorator |
| Worker | NestJS standalone + BullMQ (Redis) untuk job terjadwal & async |
| Database | PostgreSQL 16 + Prisma ORM |
| Cache/Queue | Redis 7 |
| Storage | S3-compatible (MinIO dev). Bucket: `selfies` (lifecycle 90 hari), `evidences` (permanen), `attachments` (lampiran cuti) |
| Push | Web Push VAPID (delivery via FCM) |
| Auth | JWT (access 15m) + refresh token (14 hari, httpOnly cookie di web, rotasi saat dipakai) + RBAC |

**Monorepo:** pnpm workspace — `apps/api`, `apps/web`, `apps/worker` (atau worker sebagai mode di api), `packages/shared` (enums, DTO, tipe bersama).

---

## 3. Prinsip Arsitektur (tidak boleh dilanggar)

1. **Standup adalah satu-satunya pintu update task harian.** Semua progres mengalir dari check-in/check-out, bukan form terpisah. Jalur: `checkins → standup_items → tasks` (percent_after disalin ke tasks.percent_complete dalam satu transaksi).
2. **Flag, bukan blokir.** Sistem TIDAK PERNAH menghukum otomatis. Anomali (telat, auto-checkout, GPS aneh) = flag informatif untuk keputusan manusia.
3. **Schema-complete, UI-incremental.** SEMUA tabel (termasuk KPI/OKR/Risk/Gate/Scorecard F2/F3) dibuat di migration awal. Yang bertahap adalah API dan UI, bukan skema.
4. **Multi-tenant sejak awal.** Kolom `tenant_id` (UUID) ada di SEMUA tabel bisnis sejak migration pertama. Semua query lewat Prisma middleware yang menyuntikkan filter tenant. Default tenant `indotek`. Tenant di-resolve dari token/subdomain — TIDAK dari header yang bisa dipalsukan klien.
5. **Timestamp acuan = server** (`submitted_at`). `device_timestamp` disimpan hanya untuk forensik offline.
6. **Timezone-aware.** WIB/WITA/WIT per lokasi penugasan user. Jendela check-in & reminder mengikuti timezone lokal user.
7. **TIDAK ADA fitur surveillance.** Dilarang: screenshot monitoring, keystroke logging, background location tracking. Lokasi hanya point-in-time saat check-in/out. Ditolak by design.

---

## 4. Skema Database (Prisma)

Kolom umum semua tabel bisnis (tidak diulang di daftar bawah): `id UUID PK`, `tenant_id UUID FK`, `created_at`, `updated_at`, `deleted_at` (soft delete untuk master).

### Domain Inti (task/kehadiran/standup)
- **projects**: name, code_prefix (untuk generator task code), status enum(ACTIVE|ARCHIVED)
- **sprints**: project_id FK, number int, start_date, end_date, goal. Validasi: tidak overlap dalam satu project
- **tasks**: sprint_id FK, project_id FK, functional_role_id FK, code UK (format `PREFIX-SS-NNNN`, immutable), workstream, title, deliverable, priority enum(CRITICAL|HIGH|MEDIUM|LOW), planned_start, planned_end, status enum(NOT_STARTED|IN_PROGRESS|DONE|BLOCKED|DEFERRED|CANCELLED), percent_complete int(0-100), weight numeric, risk_level enum(HIGH|MEDIUM|LOW), rag_override enum nullable, rag_override_reason text, kpi_id FK nullable, okr_kr_id FK nullable, notes
- **task_assignments**: task_id FK, user_id FK, assigned_at, unassigned_at (owner aktif = NULL). Riwayat penuh, jangan pakai satu kolom owner di tasks
- **task_dependencies**: task_id FK, depends_on_task_id FK (self-relation tasks)
- **task_evidences**: task_id FK, kind enum(LINK|FILE), url_or_key, uploaded_by FK
- **checkins**: user_id FK, date, type enum(IN|OUT), work_status enum(WFH|WFO|ONSITE), client_project_id FK nullable (wajib jika ONSITE), lat, lng, gps_accuracy_m, selfie_key, is_auto bool, is_late bool, is_offline_sync bool, geofence_ok bool, device_timestamp, submitted_at, daily_note. UNIQUE(user_id, date, type)
- **standup_items**: checkin_id FK, task_id FK, note, planned bool, percent_after int, status_after enum, is_carried_over bool
- **blockers**: task_id FK, reported_by FK, description, mentioned_user_ids UUID[], status enum(OPEN|RESOLVED), opened_at, resolved_at, resolved_by FK

### Domain Organisasi/Approval/Kebijakan
- **tenants**: name, slug, theme_json, is_active. MVP berisi 1 baris: indotek
- **users**: department_id FK, functional_role_id FK, manager_id FK (self-ref, atasan langsung = approver default), email UK, full_name, nik, system_roles enum[] (EMPLOYEE|MANAGER|PM_ADMIN|HR|CTO|SUPER_ADMIN, multi-role), timezone, checkin_mode enum(TWICE default|ONCE), leave_balance int, employment_status enum(AKTIF|NONAKTIF), joined_at
- **departments**: name
- **functional_roles**: name, code (PO/SA/Infra/BE/FE/QA/TW/Sales — sinkron kolom Role workbook)
- **teams**: project_id FK nullable, name
- **team_members**: team_id FK, user_id FK (M2M; user bisa multi-tim; feed = gabungan)
- **leave_requests**: user_id FK (pengaju), approver_id FK (penyetuju), type enum(CUTI|IZIN|SAKIT|LEMBUR|WFH_EXTRA|TUKAR_WFO), date_from, date_to, hours numeric nullable, attachment_key, reason, status enum(PENDING|APPROVED|REJECTED|CANCELLED|AUTO_APPROVED), decided_at, decision_note, escalated_at
- **policies** (F2): scope_type enum(TENANT|DEPARTMENT|ROLE), scope_id UUID, wfh_days_per_week int, mandatory_wfo_weekdays int[], checkin_window_start time, checkin_window_end time, auto_checkout_at time, default_checkin_mode. Resolusi per-atribut: ROLE > DEPARTMENT > TENANT
- **wfh_quotas** (F2): user_id FK, week_start date, used_days int
- **locations**: name, type enum(OFFICE|CLIENT), lat, lng, radius_m int(default 200). CLIENT boleh tanpa koordinat
- **holidays**: date, name, is_cuti_bersama bool. Preload kalender nasional Indonesia
- **settings**: key, value_json jsonb (retensi selfie, ambang RAG, jam default — ber-scope tenant)

### Domain Governance/Infrastruktur
- **kpis** (F3): functional_role_id FK, name, target numeric, unit, period enum
- **kpi_actuals** (F3): kpi_id FK, period_start, actual numeric
- **okrs** (F3): project_id FK, objective, quarter, owner_id FK
- **key_results** (F3): okr_id FK, description, target numeric, actual numeric, unit
- **risks** (F3): project_id FK, description, category, probability enum, impact enum, mitigation, owner_id FK, status enum(OPEN|MITIGATED|CLOSED|ACCEPTED)
- **gates** (F3): project_id FK, month date, criteria_json jsonb
- **gate_decisions** (F3): gate_id FK, decision enum(GO|NO_GO|CONDITIONAL), decided_by FK, notes
- **scorecards** (F2): user_id FK, period_type enum(SPRINT|MONTH), period_start, weighted_completion numeric, tasks_done int, tasks_total int, blockers_reported int, blockers_resolved int, checkin_discipline numeric, rag enum
- **review_notes** (F2): week_start, author_id FK, highlights, decisions, actions_json
- **notifications**: user_id FK, kind enum(MENTION|APPROVAL_IN|APPROVAL_DECIDED|REMINDER_CHECKIN|REMINDER_CHECKOUT|TASK_ASSIGNED|ESCALATION), payload_json, read_at
- **push_subscriptions**: user_id FK, endpoint, keys_json, user_agent (multi-perangkat)
- **audit_logs**: actor_id FK, entity, entity_id, action enum, before_json, after_json, at

---

## 5. Aturan Bisnis Kunci

- **Jendela check-in:** default 07:00–10:00 (dari policy). Di luar jendela → `is_late=true`, TETAP diterima, tidak diblokir.
- **Auto-checkout:** job 18:00 per timezone. Buat record OUT `is_auto=true` untuk user `checkin_mode=TWICE` yang punya IN tanpa OUT. TIDAK update task.
- **Geofence:** validasi hanya WFO (radius kantor) & ONSITE (radius klien jika ada koordinat). Di luar radius → `geofence_ok=false` (flag), tetap diterima. WFH: lokasi dicatat, tanpa validasi.
- **Blocker:** membuat blocker → `tasks.status=BLOCKED` + notifikasi ke mentioned_user_ids. Resolve → task kembali `IN_PROGRESS`.
- **Carry-over:** task belum DONE saat check-out → `is_carried_over=true` → jadi draft rencana pagi berikutnya (bisa diedit).
- **Pilih task:** check-in pagi pilih 1–5 task dari task milik user di sprint aktif yang belum DONE.
- **DONE tanpa evidence:** diperbolehkan, tapi diberi flag 'tanpa evidence' di feed PM.
- **Hari libur/cuti approved:** tidak ada tuntutan check-in, tidak ada reminder, tidak dihitung anomali. Karyawan yang tetap bekerja bisa check-in dengan `force=true`.
- **Agregasi completion:** `sum(weight × percent_complete) / sum(weight)` per sprint/role/user. Jika semua weight=0 → fallback rata-rata sederhana + peringatan (jangan divide-by-zero).
- **RAG:** Green ≥85%, Yellow 60–84%, Red <60%, Black = override manajemen. Batas inklusif (85→Green, 84→Yellow, 60→Yellow, 59→Red). PM boleh `rag_override` dengan alasan wajib; nilai terhitung tetap disimpan untuk audit.
- **Saldo cuti:** dipotong saat APPROVED (bukan saat pengajuan). Pembatalan mengembalikan saldo/kuota.
- **WFH auto-approve (F2):** dalam kuota → AUTO_APPROVED; di luar kuota → PENDING ke approver. Cek kuota dengan row lock (cegah over-approve saat race).
- **Eskalasi (F2):** pending >24 jam kerja → reminder approver; >48 jam → ke atasan approver. Weekend/libur tidak dihitung. Approver sedang cuti → eskalasi langsung.
- **Mode ONCE (F2):** tidak ada reminder sore, tidak kena auto-checkout; dashboard tandai 'mode 1x' (bukan 'lupa check-out'); durasi = n/a (bukan 0).

---

## 6. RBAC (union jika multi-role)

Roles: EMPLOYEE, MANAGER, PM_ADMIN, HR, CTO, SUPER_ADMIN.

- **Check-in/out:** semua (diri sendiri).
- **Feed standup:** EMPLOYEE (tim sendiri), MANAGER (tim bawahan), PM_ADMIN/HR/CTO (lebih luas).
- **Task lihat:** semua di project-nya. **Task buat/assign/import:** PM_ADMIN, SUPER_ADMIN.
- **Update progres task:** EMPLOYEE (task sendiri via standup), MANAGER (tim), PM_ADMIN.
- **Leave approve:** MANAGER (bawahan), HR (semua).
- **Dashboard program/CTO:** PM_ADMIN, CTO. **Export payroll:** HR.
- **View selfie orang lain:** MANAGER (bawahan) & HR — WAJIB tercatat di audit_logs beserta alasan (kontrol UU PDP).
- **Master data & kebijakan:** SUPER_ADMIN (semua), HR (kebijakan).
- Guard: decorator `@Roles(...)` + scope check (own/team). Enforce di API layer, jangan hanya di UI.

---

## 7. Endpoint Inti (kontrak — detail di API Spec)

Base `/api/v1`. Auth `Bearer {access_token}`. Idempotency-Key (UUID) WAJIB untuk check-in/checkout (kunci offline-sync anti-duplikat).

- `POST /auth/login|refresh|logout`, `POST /auth/password/change`, `GET /auth/sso/google` (F2)
- `GET /me`, `GET /me/today` (status hari ini + carry-over + task sprint aktif + policy efektif)
- `POST /checkins` (multipart: selfie, work_status, client_project_id?, lat/lng, items[1-5], blocker?, daily_note, device_timestamp)
- `POST /checkins/{id}/checkout` (multipart: selfie, lat/lng, updates[]{task_id, percent, status, evidence?}, daily_note)
- `GET /tasks` (filter sprint/owner/status/priority/role/q), `POST|PATCH /tasks`, `POST /tasks/{id}/assign`
- `POST /tasks/import/preview` → `POST /tasks/import/commit` (skip_invalid). Format kolom Excel = sheet "Sprint Tasks" workbook
- `GET /feed?team=&date=`, `POST /blockers/{id}/resolve`
- `GET /leaves`, `POST /leaves`, `GET /approvals/inbox`, `POST /leaves/{id}/decision`
- `GET /dashboard/team`, `GET /dashboard/program`, `POST /reports/attendance/export` (job async → signed URL 24 jam)
- `GET|PUT /policies` (F2), `GET /scorecards` (F2), `/kpis /okrs /risks /gates` (F3)
- `POST /push/subscribe`, `GET /push/vapid-public-key`, `GET /notifications`

**Error codes (stabil, boleh di-hardcode FE):** AUTH_INVALID_CREDENTIALS, AUTH_TOKEN_EXPIRED, FORBIDDEN_ROLE, FORBIDDEN_SCOPE, CHECKIN_ALREADY_EXISTS(409), CHECKIN_NO_OPEN_SESSION(409), CHECKIN_ON_LEAVE_DAY(422, force=true untuk override), TASK_LIMIT_EXCEEDED(422), TASK_NOT_OWNED(422), ONSITE_CLIENT_REQUIRED(422), FILE_TOO_LARGE(413), FILE_TYPE_INVALID(415), IMPORT_PREVIEW_EXPIRED(410), DEPENDENCY_CYCLE(422), SPRINT_OVERLAP(422), QUOTA_EXCEEDED_NEEDS_APPROVAL(202), RATE_LIMITED(429), VALIDATION_ERROR(400). Amplop: `{error:{code, message(Bahasa Indonesia), details, request_id}}`.

---

## 8. Jobs (BullMQ)

auto-checkout (18:00 per tz), reminder-checkin/checkout (skip libur/cuti/ONCE), recompute-aggregates (debounce 60s per sprint + cron 5m), selfie-lifecycle (harian, hapus selfie >90 hari, null-kan selfie_key, evidence aman), payroll-export (on-demand), approval-escalation (F2, cron/jam), scorecard-builder (F2, akhir sprint/bulan), quota-materializer (F2, harian), stale-task-report (F2, mingguan), push-cleanup (mingguan, hapus endpoint 410).

---

## 9. Keamanan & Privasi (UU PDP)

- Selfie: enkripsi at-rest, retensi 90 hari lalu hapus, akses HR + atasan langsung (tercatat), tanpa face-recognition di MVP-F2.
- GPS: point-in-time saja, tampilan manajer dibulatkan ke area. NEVER background tracking.
- Upload: MIME whitelist (jpeg/png/webp/pdf), foto max 2MB (kompresi client-side dulu), lampiran 5MB. Objek via signed URL saja.
- Rate limit login 5/menit/IP, check-in 10/menit/user. helmet, CORS whitelist, refresh cookie SameSite=Strict.
- Hak subjek data: endpoint HR export data pribadi (JSON) + anonimisasi saat offboarding (F2).
- Secrets via env/secret manager, tidak ada di repo. Tambahkan `pnpm audit` di CI (gagal jika critical).

---

## 10. Konvensi Kerja Claude Code

1. **Fase demi fase.** Ikuti urutan prompt fase. Setiap fase: kode → test → ringkas perubahan → **STOP untuk review manusia**. JANGAN lanjut fase berikutnya tanpa diminta.
2. **Test sebelum selesai.** Unit untuk logika (agregasi, RAG, resolusi kebijakan, is_late lintas tz, generator code). Integrasi untuk transaksi & RBAC & idempotensi. E2E Playwright untuk alur persona + offline.
3. **Migration discipline.** Review SQL Prisma. Perubahan destruktif pakai expand-contract, tidak langsung drop.
4. **Commit:** conventional commits dengan scope modul (`feat(checkin): ...`, `fix(tasks): ...`).
5. **Jangan menyimpang dari stack/skema di file ini.** Jika ada usul menyimpang (ganti ORM, tambah lib besar, ubah skema), TULIS alasan dan TANYA dulu — jangan lakukan diam-diam.
6. **Prioritas mutu yang tidak boleh dikompromikan:** integritas data payroll/kehadiran, isolasi multi-tenant, alur offline. Ini kelas Blocker.
7. **Data uji:** jangan pakai data pribadi nyata di non-produksi. Selfie test = gambar dummy.
8. **Rekonsiliasi:** fitur import diuji dengan workbook 456-task; angka agregat sistem HARUS cocok dengan Excel (selisih ≤0,5%) — ini automated test, bukan cek manual.

---

## 11. Definition of Done (per fitur)

- Acceptance criteria terpenuhi (lihat PRD/Functional Spec).
- Test hijau (unit + integrasi relevan); RBAC endpoint teruji.
- Tidak menambah temuan `pnpm audit` critical.
- UI Bahasa Indonesia, responsive (mobile + desktop sesuai peran).
- Error pakai kode & amplop standar (§7).
- Tidak melanggar prinsip §3 (khususnya: no surveillance, flag-not-block, tenant filter).
- Ringkasan perubahan ditulis; STOP untuk review.
