# HWMS (Hybrid Work Management System)

Platform "standup-driven work management" yang menggabungkan absensi, standup harian, dan task tracking dalam satu ritual harian untuk PT Indotek Buana Karya.

## Struktur Project Monorepo

*   `apps/api`: NestJS Backend API Server (menangani REST API, database ORM, Auth, dan standalone Worker).
*   `apps/web`: React + Vite + Tailwind CSS + PWA Frontend (Responsive Mobile + Desktop View).
*   `packages/shared`: Modul bersama yang berisi enums dan tipe TypeScript yang digunakan oleh API dan Web.

---

## Langkah Menjalankan Development dari Nol

### Prerequisites
Pastikan Anda sudah menginstal:
*   Node.js v20 LTS atau v24+
*   Docker & Docker Compose
*   pnpm (dijalankan via `npx pnpm` jika belum terinstal secara global)

---

### Langkah 1: Jalankan Infrastruktur Docker
Nyalakan PostgreSQL 16, Redis 7, dan MinIO di latar belakang:
```bash
docker compose -f docker-compose.dev.yml up -d
```

### Langkah 2: Salin Environment Variables
Salin template konfigurasi lokal:
```bash
cp .env.example .env
cp .env.example apps/api/.env
```

### Langkah 3: Instalasi Dependensi Workspace
Instal seluruh paket dependensi monorepo (dengan melewati skrip build pnpm sementara):
```bash
npx pnpm install --ignore-scripts
```

### Langkah 4: Generate Client & Migrasi Database
1.  Kompilasi paket shared:
    ```bash
    npx pnpm --filter @hwms/shared build
    ```
2.  Generate Prisma Client:
    ```bash
    npx pnpm --filter @hwms/api exec prisma generate
    ```
3.  Jalankan migrasi database awal:
    ```bash
    npx pnpm --filter @hwms/api exec prisma migrate dev --name init
    ```

### Langkah 5: Jalankan Seeding Data
Masukkan data default (1 super admin, tenant 'indotek', 3 departemen, 8 functional roles, geofence kantor Bandung, dan kalender libur nasional Indonesia 2026):
```bash
npx pnpm --filter @hwms/api exec prisma db seed
```

### Langkah 6: Jalankan Server Development
Nyalakan backend api (`localhost:3000`) dan frontend web (`localhost:5173`) secara bersamaan:
```bash
npx pnpm dev
```

---

## Akun Uji Coba (Seeded)

Gunakan kredensial berikut untuk masuk ke dashboard super admin:
*   **Email:** `superadmin@indotek.com`
*   **Sandi:** `SuperSecurePassword123`
*   **Situs Web:** `http://localhost:5173/`

---

## Pengujian (Testing)

Jalankan test suite integrasi (memeriksa isolasi database multi-tenant otomatis):
```bash
npx pnpm test
```
