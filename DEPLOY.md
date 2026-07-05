# HWMS — Panduan Deploy Pilot (On-Prem / SaftOS)

Panduan singkat menjalankan HWMS untuk **pilot internal** di server on-prem
(target default: SaftOS). Seluruh stack berjalan lewat Docker Compose:
PostgreSQL 16, Redis 7, MinIO, API, Worker, dan Web (nginx PWA).

Arsitektur runtime:

```
                    ┌───────────────────────── host / SaftOS ─────────────────────────┐
  Browser ──80/443──► web (nginx)  ──/api──►  api (NestJS :3000) ──┐
                    │      (SPA + reverse proxy)                    ├─► postgres:5432
                    │                          worker (BullMQ) ─────┤   redis:6379
                    │                          (cron & async jobs)  └─► minio:9000 (selfies/evidences/attachments)
                    └──────────────────────────────────────────────────────────────────┘
```

Hanya port **web** yang dipublikasikan ke luar. DB/Redis/MinIO hanya di jaringan internal compose.

---

## 1. Prasyarat

- Docker Engine 24+ dan Docker Compose v2 (`docker compose version`).
- 2 vCPU / 4 GB RAM minimum untuk pilot (24 user).
- Akses keluar saat **build** (menarik base image + tarball SheetJS `cdn.sheetjs.com`).
  Untuk lingkungan air-gapped, lihat §7.

## 2. Konfigurasi Secret

```bash
cp .env.prod.example .env.prod
# Isi semua CHANGE_ME. Generate secret kuat:
openssl rand -base64 48   # untuk JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, password DB, kunci MinIO
npx web-push generate-vapid-keys   # untuk VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (Web Push)
```

`.env.prod` **tidak boleh** masuk ke version control (sudah di `.dockerignore`).

Poin penting:
- `DATABASE_URL` memakai host `postgres` (nama service), bukan `localhost`.
- `CORS_ORIGINS` hanya relevan bila SPA di-host pada origin berbeda dari API.
  Pada setup default (nginx proxy `/api`), web & API satu origin → CORS tidak aktif.

## 3. Build & Jalankan

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Urutan yang dijamin compose:
1. `postgres`, `redis`, `minio` menjadi **healthy**.
2. `minio-setup` membuat bucket `selfies`, `evidences`, `attachments` dan
   memasang **lifecycle 90 hari** pada `selfies` (defense-in-depth; job worker
   `selfie-cleanup` tetap berjalan sebagai lapisan aplikasi).
3. `migrate` menjalankan `prisma migrate deploy` (idempoten) lalu keluar.
4. `api` dan `worker` start (image sama, entrypoint berbeda).
5. `web` (nginx) start dan mem-proxy `/api` ke `api:3000`.

Cek status:

```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS http://localhost/api/v1/health   # {"status":"healthy",...}
```

Buka `http://<host>/` di browser.

## 4. Seed Data Demo (opsional)

Mengisi project **Saft VE POC**, 12 sprint, **456 task**, 24 user lintas
timezone, dan kalender libur nasional. **Menghapus lalu mengisi ulang** data —
jangan dijalankan pada instance yang sudah berisi data pilot nyata.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile demo run --rm seed
```

Akun uji setelah seed (semua password `SuperSecurePassword123`):
`superadmin@indotek.com`, `pm.admin@indotek.com`, `manager.hr@indotek.com`,
`eng1.be@indotek.com`, dst.

> Untuk pilot produksi nyata, **jangan** seed demo. Buat SUPER_ADMIN pertama
> lewat migrasi/registrasi terkontrol, lalu impor task via
> `POST /tasks/import/preview` → `commit`.

## 5. TLS

Untuk pilot di belakang ingress SaftOS / reverse proxy perusahaan, terminasikan
TLS di ingress dan teruskan ke service `web:80`. Bila nginx image ini yang jadi
edge, tambahkan sertifikat dan blok `listen 443 ssl` pada `apps/web/nginx.conf`.
Refresh cookie sudah `Secure` + `SameSite=Strict` saat `NODE_ENV=production`,
jadi HTTPS wajib agar login berfungsi lintas reload.

## 6. Operasional

| Aksi | Perintah |
|---|---|
| Log API | `docker compose -f docker-compose.prod.yml logs -f api` |
| Log Worker (cron/jobs) | `... logs -f worker` |
| Migrasi ulang setelah update | `... run --rm migrate` |
| Backup DB | `docker exec hwms-postgres-prod pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql` |
| Backup objek | `mc mirror` bucket MinIO ke storage arsip |
| Update versi | `git pull && ... up -d --build` (migrate one-shot jalan otomatis) |

Volume persisten: `postgres_data`, `redis_data`, `minio_data`, `uploads_data`
(laporan absensi async ada di `uploads_data`).

## 7. Catatan Air-Gapped

Build menarik `xlsx` dari `cdn.sheetjs.com` (versi patched, lihat GAP.md §audit).
Untuk lingkungan tanpa internet: build image di jaringan ber-internet lalu
`docker save`/`docker load` ke server, atau mirror tarball SheetJS ke registry
npm internal dan sesuaikan `overrides` di `pnpm-workspace.yaml`.

## 8. Checklist Pra-Pilot

- [ ] Semua `CHANGE_ME` di `.env.prod` sudah diisi secret kuat & unik.
- [ ] TLS aktif (HTTPS) di edge.
- [ ] Kunci VAPID di-generate (Web Push berfungsi).
- [ ] `curl /api/v1/health` = healthy; login berhasil dari browser.
- [ ] Backup terjadwal untuk `postgres_data` + bucket MinIO.
- [ ] `CORS_ORIGINS` diset bila web di origin terpisah.
