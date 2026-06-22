# Smoke Test — Cek Cepat Pasca-Deploy (~5–10 menit)

Uji kilat untuk memastikan aplikasi **tidak rusak total** setelah setiap deploy ke produksi.
Bukan pengganti [TESTING-CHECKLIST.md](TESTING-CHECKLIST.md) (uji lengkap per fitur) — ini hanya
"apakah jalan & aman?". Jalankan di **URL produksi** dengan akun nyata tiap peran.

Centang `[x]` saat lolos. Jika **ada satu pun ❌ di bagian KRITIS**, jangan umumkan deploy —
rollback / perbaiki dulu.

---

## A. Build & otomatis (sebelum/segera setelah deploy)
- [ ] CI GitHub Actions hijau (test + typecheck + build) untuk commit yang dideploy.
- [ ] Halaman utama produksi terbuka tanpa error (cek tab Network: tak ada 500).

## B. KRITIS — Auth & otorisasi (jangan dilewati)
- [ ] Login sebagai **HRD** → landing benar; toggle mode cocok dengan isi halaman (tak ada "toggle SPV tapi halaman Admin").
- [ ] Login sebagai **SPV** → buka Laporan Kinerja Tim → buka detail 1 anggota → **tak ada komentar 360° bernama (L3)**.
- [ ] Login sebagai **Employee** → Laporan Hasil Saya tampil sesuai status (finalized → tampil; selain itu pesan "belum difinalisasi").
- [ ] Login sebagai **Direksi** → menu "Daftar Penilaian Saya" & "Laporan Hasil Saya" ada; "Monitor"/"Rekap Kuartal" tidak ada.
- [ ] Coba akses `/admin/dashboard` sebagai Employee → ditolak/redirect (bukan tampil).

## C. KRITIS — Alur inti yang dipakai orang banyak
- [ ] **Isi 360°**: Mulai Nilai → isi sampai indikator terakhir → "Selanjutnya" **lompat ke Umpan Balik Kualitatif** → Simpan Draf sukses.
- [ ] **Kirim 360°** lengkap → status "Terkirim" (validasi rating+komentar jalan).
- [ ] **Input KPI** (SPV) untuk 1 anggota → tersimpan; edit skor minta komentar.

## D. PENTING — Tampilan & angka
- [ ] **Dashboard** terbuka; ganti filter Periode/Divisi/Tahun → chart berubah tanpa error.
- [ ] Heatmap, donut kategori KPI, & trendline ter-render (bukan kosong/rusak).
- [ ] **Skor Akhir** 1 pegawai masuk akal (cek silang: 360 aktif → blend 50/50 − punishment).
- [ ] Logo Infarm tampil benar (sidebar + mobile).

## E. PENTING — Admin esensial (Mode Admin)
- [ ] Buka detail laporan → tombol Simpan Draf / Rilis ke SPV / Finalisasi tampil & merespons.
- [ ] Ekspor 1 dataset → file Excel terunduh & terbuka.

---

### Bila ada kegagalan
- ❌ di **B/C (KRITIS)** → masalah serius (keamanan/alur inti). Rollback ke deploy sebelumnya, perbaiki, deploy ulang.
- ❌ di **D/E (PENTING)** → catat, perbaiki secepatnya; boleh tetap live bila bukan keamanan.
- Untuk akar masalah & cakupan menyeluruh, lanjut ke [TESTING-CHECKLIST.md](TESTING-CHECKLIST.md).
