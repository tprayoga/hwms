# Seed HWMS — Panduan

Seed modular & deterministik untuk mengisi database demo HWMS. Satu orkestrator
([`index.ts`](index.ts)) menjalankan modul-modul berurutan sesuai **profil** atau
**daftar modul** yang dipilih.

> ## ⚠️ PERINGATAN — SEED FULL HANYA UNTUK DEV/DEMO
>
> **Profil `full` (dan seluruh modul fitur) TIDAK BOLEH dijalankan pada instance
> pilot / produksi nyata.** Modul inti melakukan `deleteMany` (menghapus seluruh
> data bisnis) sebelum mengisi ulang data dummy — ini akan **menghancurkan data
> pilot**. Selfie/notifikasi/audit yang di-seed adalah data uji, bukan data asli.
>
> Untuk instance pilot nyata, ikuti prosedur **[GAP.md §5](../../../../GAP.md)**
> (checklist go/no-go): **buat `SUPER_ADMIN` terkontrol, lalu impor task lewat
> jalur resmi `POST /tasks/import`** — jangan pernah menjalankan seed demo di sana.

---

## Prinsip

1. **Deterministik.** Semua variasi berasal dari PRNG ber-seed ([`lib/rng.ts`](lib/rng.ts),
   mulberry32, default `0x48574d53`). **Tidak ada** `Math.random()`/`Date.now()`.
2. **Anchor tunggal.** Tanggal relatif dihitung dari `ANCHOR_DATE`
   ([`lib/dates.ts`](lib/dates.ts)) — default **Senin terakhir sebelum hari ini**,
   dihitung sekali di awal. Data terasa segar tapi tetap konsisten dalam satu run.
3. **Idempoten.** Modul memakai upsert / find-or-create pada natural key. Menjalankan
   seed 2× menghasilkan state identik (diuji [`seed.spec.ts`](seed.spec.ts)).
4. **Gate Saft VE POC beku.** Modul demo/fitur **tidak pernah** mengubah proyek Saft
   (456 task, bobot, sprint, `percent_complete`). Modul demo memiliki *guard* runtime.

## Profil

| Profil | Isi | Dipakai untuk |
|---|---|---|
| `core` | Hanya `00-core` — dataset ter-gate rekonsiliasi | **CI gate rekonsiliasi**, dev cepat |
| `full` | `core` + semua modul fitur | Demo lengkap dev/lokal (**bukan pilot**) |

## Cara run

```bash
# dari apps/api
pnpm seed                       # profil core (default; kompatibel lama)
pnpm seed:full                  # profil full (core + semua modul fitur)
pnpm seed:module -- attendance  # jalankan modul tertentu saja
pnpm seed:module -- policies scorecards   # beberapa modul (urut registry)
```

Variabel lingkungan (opsional):

| Env | Fungsi | Default |
|---|---|---|
| `SEED_PROFILE` | `core` \| `full` | `core` |
| `SEED_MODULES` | daftar modul dipisah koma/spasi (override profil) | — |
| `SEED_ANCHOR_DATE` | pin anchor (ISO, mis. `2026-06-29`) untuk run deterministik penuh | Senin terakhir |
| `SEED_RNG_SEED` | ganti seed PRNG | `0x48574d53` |

## Matriks modul × fitur × tabel

| Modul (`name`) | Profil | Fitur | Tabel yang diisi |
|---|---|---|---|
| `00-core` (`core`) | core, full | Dataset inti (gate rekonsiliasi) | `tenants`, `departments`, `functional_roles`, `users`, `holidays`, `projects` (Saft), `sprints`, `locations`, `tasks` (456), `task_assignments` |
| `10-holidays` (`holidays`) | full | Kalender libur nasional + cuti bersama | `holidays` |
| `11-attendance` (`attendance`) | full | Riwayat absensi/standup 20 hari kerja, flag LATE/OOR/AUTO | `checkins` (+ objek selfie placeholder/user) |
| `12-leave` (`leave`) | full | Cuti/izin/sakit/WFH + kuota | `leave_requests`, `wfh_quotas` |
| `20-demo-project` (`demo`) | full | Proyek progres non-nol + blocker + evidence | `projects` (demo), `sprints`, `tasks` (60), `task_assignments`, `blockers`, `task_evidences` |
| `30-policies` (`policies`) | full | Kebijakan absensi (F2) | `policies`, `departments` (NOC) |
| `31-scorecards` (`scorecards`) | full | Scorecard mingguan (F2) | `scorecards` |
| `32-review-notes` (`review-notes`) | full | Catatan review mingguan manajer (F2) | `review_notes` |
| `33-escalation` (`escalation`) | full | Kandidat eskalasi approval (F2) | `leave_requests` (update `created_at`) |
| `40-governance` (`governance`) | full | OKR/KR, KPI/aktual, Risk, Gate (F3) | `okrs`, `key_results`, `kpis`, `kpi_actuals`, `risks`, `gates`, `gate_decisions` |
| `41-audit-notifications` (`audit`) | full | Jejak sistem: audit + notifikasi in-app | `audit_logs`, `notifications` |

Catatan:
- **`push_subscriptions` sengaja dibiarkan kosong** — endpoint palsu akan membuat
  worker Web Push error saat kirim nyata.
- Modul `41` menulis audit `VIEW_SELFIE` lewat **jalur produksi**
  (`AttendanceService.authorizeSelfieView`), selaras dengan endpoint Fase 8.1.

## Pre-clean tabel fitur

`00-core` hanya menyapu himpunan tabel lama. Tabel milik fitur yang **tidak**
disapu core namun memegang FK ke baris core (user/departemen/tenant/proyek/role)
dibersihkan lebih dulu oleh `preCleanFeatureTables()` di [`index.ts`](index.ts)
saat core ikut dijalankan — agar `deleteMany` core tidak kena error FK. Tambahkan
tabel persisten baru di sana bila membuat modul fitur baru.

## Test

- [`seed.spec.ts`](seed.spec.ts) — **gate payung**: full di DB kosong → sukses,
  rekonsiliasi hijau, idempoten (snapshot semua tabel), guard Saft, tanpa absensi
  di hari libur, integritas FK (tanpa orphan). Dijalankan job CI **`seed-full`**
  (terpisah dari gate `core`).
- Gate per fase: `attendance.spec.ts`, `demo-project.spec.ts`, `f2-data.spec.ts`,
  `governance-audit.spec.ts`, `idempotency.spec.ts`.
