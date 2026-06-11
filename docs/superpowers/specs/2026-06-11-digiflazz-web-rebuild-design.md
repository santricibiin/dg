# Digiflazz Web — Rebuild Design

**Tanggal:** 2026-06-11
**Status:** Disetujui (menunggu review akhir spec)

## Ringkasan

Membangun ulang Digiflazz Fetch Tool sebagai aplikasi web baru di folder
terpisah. Fitur dan logika kerja **identik** dengan tool lama (hapus / tambah /
ubah seller produk massal via replikasi request SPA buyer-area Digiflazz),
tetapi dengan kode terstruktur, UI modern (biru tua, mode terang/gelap, kaya
ikon, responsif HP/tablet/laptop), dan dashboard riwayat pengerjaan berbasis
database.

Logika inti Digiflazz (client, throttle, rate-limit, pool, catalog, modules)
**diport 1:1** dari kode lama. Yang berubah hanya: sumber cookie/config dari DB
(bukan file), eksekusi job lewat antrian, dan persistensi log/riwayat ke MySQL.

## Stack

- **Next.js** (App Router) + **TypeScript**
- **Tailwind CSS** — tema biru tua, mode terang/gelap (`class` strategy)
- **Prisma ORM** → **MySQL** (via Laragon)
- **BullMQ** + **Redis** — antrian job + pub/sub log realtime
- **lucide-react** — ikon
- **Grafik tren:** SVG/bar buatan sendiri (nol dependency)
- **Test:** Vitest

## Keputusan kunci

| Topik | Keputusan |
|---|---|
| Frontend | Next.js + Tailwind (bukan vanilla / Vite) |
| Database | Prisma + MySQL (Laragon) |
| Eksekusi job | BullMQ + Redis + worker terpisah (bukan in-memory) |
| Cookie & config | Dikelola via halaman Setelan, tersimpan di DB |
| Akun | Satu akun Digiflazz (skema Setting satu baris) |
| Login | Tanpa login (lokal saja) |
| Grafik | SVG/bar buatan sendiri |

## Arsitektur

Tiga proses berjalan:

```
┌─────────────┐     enqueue job      ┌─────────┐
│  Next.js    │ ───────────────────→ │  Redis  │
│  (web+API)  │                       │ (BullMQ)│
│             │ ←── SSE log/status ── │         │
└─────────────┘                       └─────────┘
       │ Prisma                            │ ambil job
       ↓                                   ↓
┌─────────────┐                     ┌──────────────┐
│   MySQL     │ ←── tulis log ───── │  Worker      │
│ (riwayat,   │     & progress      │  (proses     │
│  log, config)│                    │   Node tpsh) │
└─────────────┘                     └──────────────┘
```

1. **Next.js** — UI + API routes. Enqueue job ke BullMQ, baca data dashboard
   dari MySQL, relay progress ke browser via SSE (subscribe Redis pub/sub).
2. **Worker** (`worker.ts`, proses Node terpisah) — ambil job dari Redis,
   jalankan logika Digiflazz, tulis log + progress ke MySQL & publish ke Redis.
3. **Redis** — antrian BullMQ + channel pub/sub untuk log realtime.

> **Setup requirement:** Redis harus berjalan (Laragon/standalone) dan worker
> dijalankan sebagai proses terpisah dari `next start`.

## Struktur folder

```
digiflazz-web/
├─ prisma/schema.prisma
├─ src/
│  ├─ app/
│  │  ├─ (dashboard)/page.tsx       # Dashboard
│  │  ├─ hapus/page.tsx
│  │  ├─ tambah/page.tsx
│  │  ├─ seller/page.tsx
│  │  ├─ riwayat/page.tsx
│  │  ├─ pengaturan/page.tsx
│  │  └─ api/
│  │     ├─ run/route.ts            # POST: buat Job + enqueue
│  │     ├─ stop/route.ts           # POST: minta stop
│  │     ├─ logs/route.ts           # GET SSE: relay Redis → browser
│  │     ├─ categories/route.ts     # GET: daftar kategori
│  │     ├─ status/route.ts         # GET: sesi + geo + jumlah kategori
│  │     ├─ stats/route.ts          # GET: agregat dashboard
│  │     ├─ jobs/route.ts           # GET: riwayat job (paginasi)
│  │     └─ jobs/[id]/logs/route.ts # GET: arsip log satu job
│  ├─ components/
│  │  ├─ Sidebar.tsx  Header.tsx  ThemeToggle.tsx
│  │  ├─ StatCard.tsx  TrendChart.tsx  JobTable.tsx
│  │  ├─ CategoryPicker.tsx  ConcurrencySlider.tsx  GroupDelaySlider.tsx
│  │  ├─ LogBox.tsx  ConfirmDialog.tsx
│  ├─ lib/
│  │  ├─ digiflazz/                 # PORT logika inti 1:1 dari tool lama
│  │  │  ├─ client.ts  cookies.ts  fingerprint.ts  geoproxy.ts
│  │  │  ├─ pool.ts  catalog.ts  logger.ts  timer.ts
│  │  │  └─ modules/ delete.ts  add.ts  seller.ts
│  │  ├─ queue.ts                   # setup BullMQ
│  │  ├─ db.ts                      # Prisma client singleton
│  │  └─ config.ts                  # baca/tulis Setting dari DB
│  └─ worker.ts                     # entry worker BullMQ
└─ .env                             # DATABASE_URL, REDIS_URL
```

## Skema Database (Prisma/MySQL)

```prisma
// Konfigurasi tunggal (1 baris saja, id selalu = 1)
model Setting {
  id              Int      @id @default(1)
  cookieRaw       String   @db.Text   // isi kuki.txt (format Netscape)
  baseUrl         String   @default("https://member.digiflazz.com")
  apiPrefix       String   @default("/api/v1")
  mode            String   @default("buyer")
  speed           String   @default("normal")    // normal | turbo
  concurrency     Int      @default(1)
  groupDelayMs    Int      @default(3000)
  rateLimitPerMin Int      @default(120)
  geoipEnabled    Boolean  @default(true)
  expectedCountry String   @default("ID")
  proxyEnabled    Boolean  @default(false)
  proxyList       Json     @default("[]")
  userAgent       String   @default("")
  retryMax        Int      @default(6)
  retryBackoffMs  Int      @default(1500)
  updatedAt       DateTime @updatedAt
}

// Satu baris per eksekusi job
model Job {
  id           String    @id @default(cuid())
  action       String                        // delete | add | seller
  status       String    @default("queued")  // queued|running|done|stopped|error
  dryRun       Boolean   @default(false)
  params       Json                          // only, skip, threshold, op, dst
  processed    Int       @default(0)         // berhasil
  skipped      Int       @default(0)
  failed       Int       @default(0)
  durationMs   Int       @default(0)
  errorMsg     String?   @db.Text
  startedAt    DateTime?
  finishedAt   DateTime?
  createdAt    DateTime  @default(now())
  logs         JobLog[]

  @@index([action, createdAt])
  @@index([createdAt])
}

// Arsip log per baris
model JobLog {
  id        BigInt   @id @default(autoincrement())
  jobId     String
  job       Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  level     String                  // info|ok|warn|error
  msg       String   @db.Text
  createdAt DateTime @default(now())

  @@index([jobId, id])
}
```

**Pemakaian di dashboard:**
- **Kotak harian per-fitur** ("Hapus Produk: 100 hari ini") → `SUM(processed)`
  dari `Job` dengan `action=...`, `dryRun=false`, `createdAt` = hari ini.
  Dihitung via query agregat (selalu akurat, bukan kolom tersimpan).
- **Riwayat job** → tabel `Job` urut `createdAt` desc + paginasi.
- **Arsip log** → `JobLog` filter per `jobId`.
- **Grafik tren** → `GROUP BY DATE(createdAt), action` untuk 7/30 hari terakhir.

**Catatan:**
- `dryRun=true` tetap dicatat sebagai Job tapi **dikecualikan** dari statistik
  dashboard (angka "berhasil dikerjakan" murni aksi sungguhan).
- Tombol opsional "Bersihkan riwayat & log" di Setelan untuk retensi.

## Desain UI/UX

**Layout**
```
┌────────────────────────────────────────────┐
│  HEADER  [logo] Digiflazz Tools  [🌙/☀️] [●online] │
├──────────┬─────────────────────────────────┤
│ SIDEBAR  │  KONTEN                          │
│ 📊 Dashboard                                │
│ 🗑️ Hapus  │                                 │
│ ➕ Tambah │                                  │
│ 🔄 Seller │                                  │
│ 📜 Riwayat│                                  │
│ ⚙️ Setelan│                                  │
└──────────┴─────────────────────────────────┘
```

**Palet — basic biru tua, dua mode**

Mode gelap (default):
- bg `#0f1c2e`, panel `#16263b`, border `#243750`
- aksen `#3b82f6`, teks `#e6edf5`, dim `#8aa0b8`
- ok `#22c55e`, warn `#f59e0b`, error `#ef4444`

Mode terang:
- bg `#f4f7fb`, panel `#ffffff`, border `#dce6f0`
- aksen `#2563eb`, teks `#10243a`
- Toggle disimpan di `localStorage`, default ikut sistem.

Gaya: kalem & simpel — sudut membulat sedang, bayangan tipis, spasi lega, tanpa
gradien ramai. Ikon `lucide-react` di sidebar, kotak statistik, tombol, log.

**Responsif**
- **Laptop (≥1024px):** sidebar fixed di kiri.
- **Tablet (768–1023px):** sidebar rail (ikon-saja), label muncul saat hover.
- **HP (<768px):** sidebar drawer overlay via hamburger di header; kotak
  statistik 1 kolom; tombol full-width; log box scroll.

## Alur eksekusi job

```
1. User klik "Hapus Sekarang"
2. POST /api/run {action,dryRun,only,skip,concurrency,groupDelayMs,...params}
   → buat Job (status=queued) → enqueue BullMQ (jobId=Job.id) → balas {jobId}
3. Worker ambil job → status=running, startedAt=now
   → buildClient dari Setting (cookie+config DB)
   → runDeleteAll/runAddAll/runSellerAll (port 1:1)
   → tiap log: tulis JobLog + PUBLISH Redis "job:{id}"
   → update counter processed/skipped/failed berkala
4. Browser SSE GET /api/logs?jobId=... → Next SUBSCRIBE Redis → relay → LogBox
5. Worker selesai → status=done, finishedAt, durationMs, counter final
   → PUBLISH "__JOB_DONE__" → browser tutup SSE, refresh dashboard
```

**Stop:** `POST /api/stop?jobId=...` → set flag (Redis key) → worker cek flag di
batas grup/item (sama seperti `client._stop()` lama) → berhenti rapi,
status=`stopped`.

**Dipertahankan dari tool lama:**
- Satu job aktif (BullMQ concurrency = 1) → menggantikan guard `running`.
- Throttle / rate-limit / Retry-After / jeda antar-grup → identik (port).
- Urutan Kategori→Brand→Tipe, item paralel dalam grup → identik.
- Sinyal `__JOB_DONE__` → tetap, lewat Redis pub/sub.

**Endpoint API**

| Route | Fungsi |
|---|---|
| `POST /api/run` | buat Job + enqueue |
| `POST /api/stop` | minta stop job berjalan |
| `GET /api/logs` (SSE) | stream log realtime via Redis sub |
| `GET /api/categories` | daftar kategori |
| `GET /api/status` | cek sesi + geo + jumlah kategori |
| `GET /api/stats` | agregat dashboard (kotak harian + tren) |
| `GET /api/jobs` | riwayat job (paginasi) |
| `GET /api/jobs/[id]/logs` | arsip log satu job |

## Detail halaman

**Dashboard** (`/`)
- Baris `StatCard` harian: Hapus / Tambah / Seller — angka besar "berhasil hari
  ini" + sublabel ("gagal 3 · dilewati 12"). Hanya `dryRun=false`.
- Ringkasan: total job hari ini, job berjalan, durasi rata-rata.
- `TrendChart` bar harian 7/30 hari (toggle), per fitur.
- `JobTable` ringkas 5–10 job terakhir → klik buka arsip log.

**Hapus / Tambah / Seller** — tata letak seperti tool lama, dipecah per komponen:
- Slider paralel + jeda antar-grup (shared).
- `CategoryPicker` (muat/pilih semua/kosongkan).
- Field khusus: Hapus (tanpa field) · Tambah (op + threshold) · Seller (multi,
  rating, termurah, timpa, prefix, panjang kode).
- Tombol Tes (Dry-run) + Jalankan (`ConfirmDialog`).
- `LogBox` realtime + timer live.

**Riwayat** (`/riwayat`) — `JobTable` penuh + paginasi + filter (action,
tanggal); klik baris → arsip log.

**Setelan** (`/pengaturan`)
- Textarea cookie + tombol "Tes Sesi" (`/api/status`).
- Form config: speed, concurrency, groupDelayMs, rateLimitPerMin, userAgent.
- GeoIP: enabled, expectedCountry, lookupEndpoint.
- Proxy: enabled + daftar (textarea, satu per baris).
- Retry: max + backoff.
- Simpan → upsert `Setting` id=1.
- Opsional "Bersihkan riwayat & log".

## Keamanan

- Tanpa login, lokal saja. Semua route terbuka.
- Cookie Digiflazz tersimpan di DB sebagai teks (harus utuh untuk request,
  tidak di-hash).
- README mencantumkan: DB berisi kredensial sesi — **jangan ekspos ke jaringan
  publik**.

## Testing & verifikasi

- **Unit (Vitest):** `groupByBrandType` (urutan), `passSellerFilter` /
  `chooseSeller`, `matchFilter` (gte/lte/eq), `parseNetscapeCookies`, throttle
  spacing math, `fmtDuration`.
- **Integrasi worker:** mock client, verifikasi counter & stop berhenti rapi.
- **API:** `/api/stats` mengembalikan agregat benar (seed Job dummy).
- **Manual/UI:** dry-run end-to-end (Redis+MySQL hidup), cek responsif
  HP/tablet/laptop + toggle tema.
- Test default **dry-run** + data mock — tidak ada test yang menghapus/menambah
  produk nyata.
