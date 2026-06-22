# Uji Beban (Load Test) — Submit Penilaian 360°

Mengukur apakah Supabase **free tier** sanggup menampung skenario "100 orang submit
serempak". Skrip k6 meniru **persis** `submitAssessment`
(`app/(app)/penilaian/actions.ts`) lewat REST Supabase: login → upsert header →
batch upsert skor indikator → batch upsert jawaban esai. Tiap virtual user (VU) =
satu penilai dengan `assessor_id` unik (tanpa kontensi baris), jadi yang diukur
adalah **kapasitas tulis Supabase** pada beban serempak.

## ⚠️ Penting — JANGAN uji ke produksi

Uji ini **menulis data nyata** dan **butuh periode berstatus `active`** — bisa
mengganggu aplikasi live. `provision.mjs` akan **menolak** project produksi
(ref `beajoczjpywozavatzmf`) kecuali `ALLOW_PROD=1`.

**Cara benar:** buat **project Supabase free baru (staging)**, lalu:
1. Terapkan semua migrasi: `supabase/migrations/0001`–`0013` (pakai
   `node scripts/apply-migration.mjs <file>` dengan `SUPABASE_DB_URL` project staging,
   atau jalankan SQL-nya di SQL Editor Supabase).
2. Buat file `.env.loadtest` di root project:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref-staging>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-staging>
   SUPABASE_SERVICE_ROLE_KEY=<service-role-staging>
   ```
   (Bila `.env.loadtest` tak ada, skrip jatuh ke `.env.local` — tapi itu produksi,
   jadi akan ditolak. Maka **selalu** buat `.env.loadtest`.)

> Free-tier staging punya kapasitas setara free-tier produksi Anda → hasilnya
> representatif untuk keputusan upgrade.

## Prasyarat: pasang k6

k6 adalah binary terpisah (Grafana k6), bukan paket npm.
- Windows: `winget install k6` atau `choco install k6`
- Cek: `k6 version`

## Langkah

```bash
# 1) Provision fixture (default 100 penilai; atur dgn VU=…)
node scripts/loadtest/provision.mjs
VU=200 node scripts/loadtest/provision.mjs

# 2) Jalankan uji
k6 run scripts/loadtest/submit.js                       # sustained 100 VU, 1 menit
k6 run -e VUS=100 -e DURATION=2m scripts/loadtest/submit.js
k6 run -e RAMP=1 -e VUS=100 scripts/loadtest/submit.js  # mode BURST (serempak)

# 3) Bersihkan (WAJIB — hapus semua fixture LOADTEST-*)
node scripts/loadtest/teardown.mjs
```

## Membaca hasil

k6 mencetak ringkasan; perhatikan:

| Metrik | Arti | Lulus |
|---|---|---|
| `submit_full_ms` p(95) | Waktu 1 submit penuh (3 round-trip) | **< 3000 ms** |
| `submit_errors` rate | Proporsi submit gagal | **< 1%** |
| `http_req_failed` rate | Proporsi request HTTP gagal (4xx/5xx) | **< 1%** |
| `http_req_duration` p(95) | Latensi per request | konteks |

Threshold sudah ditanam di `submit.js` → k6 keluar non-zero bila gagal.

**Interpretasi:**
- ✅ Semua threshold hijau di mode BURST 100 VU → free tier sanggup; tak perlu upgrade sekarang.
- ⚠️ Banyak `http_req_failed` dengan status **429/503** → kena rate-limit/throttle free tier
  → pertimbangkan Supabase Pro.
- ⚠️ `submit_full_ms` p95 membengkak (mis. >5 dtk) tapi error rendah → throughput cukup
  tapi lambat saat puncak → Pro akan membantu; atau imbau pengisian bertahap.

## Catatan

- Tiap VU login sekali lalu cache token (sama seperti sesi pengguna). 401 → login ulang.
- `RAMP=1` memakai executor `ramping-vus` (naik 10 dtk → tahan 30 dtk → turun) untuk
  meniru lonjakan serempak; tanpa itu beban konstan (`vus`/`duration`).
- Skrip **tidak** menyentuh data nyata bila dijalankan terhadap `.env.loadtest` staging.
