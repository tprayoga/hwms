# GAP.md — HWMS: Kesiapan Pilot & Selisih dari PRD

> Status per Fase 7 (Hardening untuk Pilot). Dokumen ini mencatat **apa yang
> sudah tervalidasi**, **fitur MVP yang belum atau berbeda dari PRD**, dan
> **rekomendasi sebelum pilot**. Ditulis jujur — item yang belum ada ditandai
> jelas, bukan disamarkan.

---

## 1. Ringkasan Kesiapan Pilot

**Verdict: SIAP untuk pilot internal terbatas (tenant `indotek`, ±24 user),
dengan catatan pra-pilot di §5.**

Fase 7 menutup pengerasan operasional inti:

| Area | Status | Bukti |
|---|---|---|
| Rate limiting (login 5/mnt/IP, check-in 10/mnt/user) | ✅ | `auth/rate-limit.guard.ts` (Redis, header X-Forwarded-For + `trust proxy`) |
| helmet + CSP produksi + CORS **whitelist** | ✅ | `main.ts` (CSP aktif saat prod, `CORS_ORIGINS` multi-origin, credentials) |
| Refresh cookie httpOnly + `SameSite=Strict` + `Secure` (prod) | ✅ | `auth/auth.controller.ts` |
| Validasi upload: MIME whitelist + ukuran (selfie 2MB) | ✅ | `attendance/attendance.controller.ts` |
| Kompresi selfie client-side ~200KB (downscale 640px, JPEG q0.6) | ✅ | `web/src/App.tsx` |
| Idempotency-Key check-in/checkout (anti-duplikat offline) | ✅ | `attendance.controller.ts` (Redis 24 jam) |
| Lifecycle selfie >90 hari (job harian, null-kan `selfie_key`) | ✅ | `scheduler.service.ts` — hanya bucket `selfies`, evidence/attachment aman; **plus** lifecycle bucket MinIO 90 hari |
| Seed demo penuh: **Saft VE POC**, 12 sprint, **456 task**, 24 user lintas TZ + hierarki atasan | ✅ | `prisma/seed/` modular (profil `core` = dataset ter-gate; re-seed diverifikasi: 456 task terimpor) |
| Seed demo lengkap semua fitur (profil `full`): absensi 20 hari, cuti/WFH, proyek demo progres non-nol, policy/scorecard/review, OKR/KPI/Risk/Gate, audit+notifikasi | ✅ | `prisma/seed/` modul 10–41 (dev/demo saja); gate payung `prisma/seed/seed.spec.ts` + job CI `seed-full`; guard Saft 456/agregat, idempoten, integritas FK. Pilot: GAP.md §5 (SUPER_ADMIN + `POST /tasks/import`) |
| Rekonsiliasi otomatis vs Excel (≤0,5%) — **gate CI** | ✅ | `dashboard/reconciliation.spec.ts` (5 lapis, termasuk uji sintetik non-nol) |
| Isolasi tenant tingkat **endpoint/middleware** + anti-spoofing header | ✅ | `prisma/tenant-isolation-endpoint.spec.ts` |
| E2E Playwright siklus 1 hari (3 user → blocker → resolve → checkout → dashboard) | ✅ | `web/e2e/e2e-cycle.spec.ts` (job CI `e2e`) |
| Dockerfile produksi multi-stage (api+worker satu image, web nginx) | ✅ | `apps/api/Dockerfile`, `apps/web/Dockerfile` — **build & smoke-test lolos** |
| `docker-compose.prod.yml` + panduan deploy | ✅ | compose `config` valid; `DEPLOY.md` |
| `pnpm audit`: **0 critical, 0 high** (dari 1 critical + 10 high) | ✅ | overrides + bump vitest 3 + pin xlsx 0.20.3; CI gagal jika critical |

**Uji:** 43 unit+integrasi hijau (2× berturut, stabil). API & Web build lolos.

---

## 2. Verifikasi Rekonsiliasi (Gate Kepercayaan)

Workbook sumber memiliki **seluruh 456 task pada 0% / Not Started**. Cek
completion-vs-completion murni akan *vacuous* (0 = 0). Karena itu gate diperkuat
menjadi 5 lapis:

1. **Count parity** — jumlah task DB == Excel (456).
2. **Import fidelity per sprint** — jumlah task **dan sum(weight)** cocok per sprint.
3. **Import fidelity per role** — idem, per functional role (menangkap salah-map bobot walau %=0).
4. **Completion parity (data saat ini)** — weighted completion per sprint, ≤0,5%.
5. **Formula parity (sintetik non-nol)** — % pseudo-acak deterministik dijalankan lewat
   **kode produksi** `TaskAggregationService.calculateProgress` vs rumus Excel
   SUMPRODUCT/SUM, per sprint & per role, ≤0,5% — membuktikan rumus benar dengan angka nyata.

> Konsekuensi: begitu data pilot nyata mulai mengisi `percent_complete`, gate ini
> otomatis membandingkan angka riil. Tidak perlu perubahan test.

---

## 3. Fitur yang Ditangguhkan **By Design** (Schema-complete, UI-incremental — §3.3)

Bukan cacat; sesuai prinsip arsitektur. Skema DB **sudah lengkap** untuk semua
ini sejak migrasi awal; API/UI belum dibangun.

| Domain | Skema | API | UI | Catatan |
|---|---|---|---|---|
| **F2** Policies (jendela check-in per scope, mandatory WFO) | ✅ | ❌ | ❌ | Endpoint `GET/PUT /policies` belum ada; sistem pakai default 07:00–10:00 & auto-checkout 18:00 hard-coded via env/logic |
| **F2** WFH auto-approve + kuota (`wfh_quotas`) | ✅ | ❌ | ❌ | Leave saat ini selalu → PENDING/approve manual |
| **F2** Eskalasi approval (24/48 jam kerja) | ✅ | ❌ | — | Job `approval-escalation` belum diimplementasi |
| **F2** Scorecards + `scorecard-builder` job | ✅ | ❌ | ❌ | |
| **F2** Review notes mingguan | ✅ | ❌ | ❌ | |
| **F2** SSO Google (`GET /auth/sso/google`) | — | ❌ | ❌ | Login hanya email+password |
| **F2** Hak subjek data: export pribadi + anonimisasi offboarding | ✅ | ❌ | ❌ | Kontrol UU PDP lanjutan |
| **F2** Mode ONCE (tanpa reminder sore/auto-checkout) | ✅ (kolom `checkin_mode`) | ⚠️ parsial | — | Reminder & auto-checkout sudah skip ONCE; label dashboard 'mode 1x' belum |
| **F3** KPI/OKR/Risk/Gate/Gate-decision | ✅ | ❌ | ❌ | Governance CTO; dashboard program dasar sudah ada tanpa KPI/OKR |

---

## 4. GAP MVP (F1) — Belum / Berbeda dari PRD

Item berikut **dalam scope MVP** namun belum tuntas atau menyimpang. Diurut
berdasarkan dampak.

### 4.1 Blocker / prioritas tinggi sebelum produksi (bukan blokir pilot internal)

1. **Akses objek via Signed URL — RESOLVED (Fase 8.1).** Jalur akses objek
   tunggal via **presigned URL MinIO** berumur pendek (`ObjectAccessService`).
   `GET /objects/selfie/:attendanceId` & `GET /objects/evidence/:taskId/:key`
   menerbitkan presigned GET (TTL 300 dtk). `GET /reports/download/:key` kini
   **302-redirect** ke presigned URL **24 jam** (§7) — endpoint lama dipertahankan
   agar klien tidak rusak; fallback stream FS bila object storage nonaktif.
   Selfie orang lain: wajib `reason` (min 10 char) + audit `VIEW_SELFIE`; lintas
   tenant → 403. Web memakai endpoint baru. Teruji: `objects/objects.spec.ts`.
   (Endpoint lama `GET /attendance/selfies/:key` — Fase 8, ter-auth — masih ada
   untuk kompatibilitas.)
2. **Audit view selfie orang lain — RESOLVED (Fase 8, §6/§9).** `GET
   /attendance/selfies/:key` kini: (a) butuh auth; (b) pemilik boleh lihat selfie
   sendiri tanpa audit; (c) HR & manajer dalam rantai atasan boleh melihat selfie
   bawahan **hanya dengan alasan wajib**, dan setiap akses tercatat di
   `audit_logs` (`action=VIEW_SELFIE`, alasan + target_user_id + via_role).
   Pihak tak berhubungan → `FORBIDDEN_SCOPE`. Teruji: `attendance/selfie-access.spec.ts`.
3. **Secret default di kode — RESOLVED (Fase 8).** Fallback string `JWT_*` dihapus
   dari `auth.service.ts`, `auth.guard.ts`, `auth.module.ts` (via helper
   `auth/jwt-secret.ts`). Boot **gagal cepat** di `main.ts` jika `JWT_ACCESS_SECRET`
   / `JWT_REFRESH_SECRET` tak diset atau <16 char. `dotenv/config` dimuat eksplisit
   di `main.ts`/`worker.ts` untuk urutan deterministik. Teruji: `auth/jwt-secret.spec.ts`.

### 4.2 Menengah

4. **Reminder job granularitas & skala.** `processReminders` jalan tiap 15 menit
   dan hanya memicu pada `localHour === 8`/`17` (window sempit) serta melakukan
   query holiday/leave **per-user** (N+1). Cukup untuk 24 user; perlu batch query
   + window lebih toleran sebelum skala ratusan user.
5. **`recompute-aggregates` bukan BullMQ.** §8 menyebut job BullMQ; implementasi
   nyata via `setInterval` (cron 5 mnt) + debounce 60s in-memory di
   `TaskAggregationService`. Fungsional benar, namun debounce in-memory hilang
   saat restart & tidak lintas-instance. Pindahkan ke BullMQ untuk multi-replika.
6. **Job §8 lain belum ada:** `payroll-export` = `export-attendance` (ada),
   namun `push-cleanup` (hapus endpoint 410), `quota-materializer`,
   `stale-task-report` belum diimplementasi.
7. **Uang/waktu WITA/WIT di export.** Perhitungan `Total Jam Kerja` memakai
   selisih submit IN/OUT UTC — benar lintas TZ, tapi mode ONCE ditandai durasi
   `n/a` belum tercermin di kolom export (masih 0 bila tak ada OUT).

### 4.3 Minor / kosmetik

8. **CSP produksi ketat (`default-src 'none'`)** aman untuk API JSON, tapi bila
   ada halaman non-JSON dari API (mis. dokumen OpenAPI Swagger UI) perlu
   pelonggaran terarah.
9. **Path `uploads/` relatif __dirname** berbeda antara ts-node (dev) dan hasil
   kompilasi. Sudah dikonsolidasikan lewat volume `uploads_data` di compose;
   sebaiknya di-refactor ke path absolut dari env (`UPLOAD_DIR`).
10. **Image runner API menyertakan devDependencies** (agar `migrate`/`seed`
    reuse image). Ukuran image lebih besar; optimasi `pnpm deploy --prod`
    ditangguhkan karena mengubah path relatif seed workbook.

---

## 5. Rekomendasi Sebelum Pilot (Checklist)

- [x] Hapus fallback `JWT_*` di kode (Fase 8). Tetap: set secret produksi di `.env.prod`.
- [ ] Aktifkan **HTTPS** di edge (refresh cookie `Secure` mensyaratkannya).
- [ ] Generate & set kunci **VAPID** (Web Push).
- [x] **Audit view-selfie** + akses selfie ter-auth/ter-scope diterapkan (Fase 8, UU PDP).
- [x] **Signed URL** presigned MinIO untuk selfie/evidence (TTL 300s) + report (24h) — Fase 8.1.
- [ ] Jangan jalankan **seed demo** pada instance pilot nyata; buat SUPER_ADMIN
      terkontrol lalu impor task via `POST /tasks/import`.
- [ ] Backup terjadwal `postgres_data` + bucket MinIO.
- [ ] Verifikasi CI hijau (audit gagal-jika-critical + gate rekonsiliasi + isolasi tenant).

---

## 6. Ringkas Prinsip §3 (Tetap Dipatuhi)

- **Flag-not-block:** telat/geofence/auto-checkout = flag, tidak memblokir. ✅
- **No surveillance:** GPS point-in-time saja; tak ada background tracking/screenshot/keylog. ✅
- **Multi-tenant:** filter tenant disuntik Prisma extension untuk semua model bisnis;
  tenant di-resolve dari **token**, header `x-tenant-*` diabaikan (teruji). ✅
- **Server timestamp acuan** (`submitted_at`); `device_timestamp` hanya forensik. ✅

---

## 7. Fase 8 — Pilot Gate (selesai)

Menutup gap yang wajib sebelum pilot dengan **data karyawan nyata** (personal data):

| Item | Status | Bukti |
|---|---|---|
| Akses selfie ter-auth + RBAC scope (diri / manajer-rantai / HR) + **audit view-selfie wajib-alasan** | ✅ | `attendance.controller.ts` (`getSelfie` bukan lagi `@Public`), `attendance.service.ts` (`authorizeSelfieView`, `isManagerOf`), `StorageService.getFile` (MinIO+lokal); test `selfie-access.spec.ts` (7) |
| Report download ter-auth (HR/SUPER_ADMIN) + tenant-scoped + anti-traversal | ✅ | `report.controller.ts`; web unduh via fetch ber-token; test `report-access.spec.ts` (3) |
| Hapus fallback JWT + boot fail-fast tanpa env | ✅ | `auth/jwt-secret.ts`, `main.ts`/`worker.ts` (`dotenv/config` + validasi); test `jwt-secret.spec.ts` (5) |
| Web: `SelfieThumb` (fetch ber-token, prompt alasan utk selfie orang lain) + unduh laporan ber-token | ✅ | `apps/web/src/App.tsx` |

**Uji:** 58 unit+integrasi hijau (2× berturut, stabil) — 43 existing + 15 baru. API & Web build lolos.

_Fase 8 selesai._

## 7.1 Fase 8.1 — Secure Object Access (selesai)

Satu jalur akses objek berbasis **presigned URL MinIO**:

| Item | Status | Bukti |
|---|---|---|
| `ObjectAccessService.getSignedUrl(bucket, key, ttl)` — presigned GET; TTL 300s (selfie/evidence), 24h (report) | ✅ | `storage/object-access.service.ts`, `storage.service.ts` (`getClient`/`isRemote`/`ensureBucket`) |
| `GET /objects/selfie/:attendanceId` — owner→URL; MANAGER/HR/SUPER_ADMIN→wajib `reason≥10` + audit `VIEW_SELFIE`; scope manajer-rantai/HR; lintas tenant→403 | ✅ | `objects/objects.controller.ts`, `objects.service.ts`, `attendance.service.ts` (`authorizeSelfieViewById` via `prisma.raw` utk 403-vs-404) |
| `GET /objects/evidence/:taskId/:key` — presigned, role-scoped, tercatat `VIEW_EVIDENCE` (tanpa reason) | ✅ | `objects/objects.controller.ts` |
| Report `GET /reports/download/:key` → **302** presigned 24h (fallback stream FS); scheduler upload report ke MinIO | ✅ | `report/report.controller.ts`, `scheduler.service.ts` |
| Web: selfie via `/objects/selfie` (dialog alasan), unduh report ikut redirect | ✅ | `apps/web/src/App.tsx` (`SelfieThumb`), `feed.service.ts` (`checkoutCheckinId`) |

**Uji:** 65 unit+integrasi hijau (2× berturut, stabil) — termasuk: pemilik tanpa
reason→200; MANAGER tanpa reason→400; MANAGER+reason→200 **dan** baris audit
berisi reason (assert isi); MANAGER luar-hierarki→403; **lintas tenant→403**
(di `tenant-isolation-endpoint.spec.ts`); TTL presigned diverifikasi via
`X-Amz-Expires` (300s). `pnpm audit`: 0 critical, 0 high. API & Web build lolos.

**Contoh baris `audit_logs` (VIEW_SELFIE) dari test integrasi:**
```json
{
  "tenant_id": "66ea6038-e3ec-499c-9794-f2e02e27f43d",
  "actor_id": "c78cd95e-2430-4d9d-bfbc-c2316e61f003",
  "entity": "Checkin",
  "entity_id": "6baf319f-a408-439b-894d-d9b2292a3b52",
  "action": "VIEW_SELFIE",
  "after_json": {
    "reason": "Verifikasi kehadiran tim harian",
    "via_role": "MANAGER",
    "selfie_key": "obj_selfie_test.jpg",
    "attendance_id": "6baf319f-a408-439b-894d-d9b2292a3b52",
    "target_user_id": "5f529de0-acc8-484b-9650-56b18dda8f84"
  },
  "at": "2026-07-05T08:22:42.216Z"
}
```

**Batasan dipatuhi:** skema selfie-lifecycle >90 hari tidak diubah (selfie null →
endpoint `/objects/selfie` balas 404 "retensi 90 hari"); logika check-in/checkout
tidak disentuh.

_Fase 8.1 selesai. STOP untuk review manusia sesuai §10.1._
