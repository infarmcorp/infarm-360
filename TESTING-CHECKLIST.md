# Checklist Pengujian — Infarm 360° Performance Appraisal

Daftar uji manual menyeluruh untuk memastikan **semua fitur berjalan baik** sebelum dipakai
banyak orang. Centang `[x]` saat lolos. Catat temuan di kolom catatan.

> **Cara pakai:** uji per peran (login bergantian). Untuk HRD Admin, uji **dua mode** (Admin & Mode-SPV).
> Setiap kali mengubah perilaku **SPV**, ulangi uji yang sama untuk **HRD Mode-SPV** (ATURAN PARITAS).
> Fokus tiga hal: (1) fitur jalan, (2) **otorisasi benar** (orang tak berhak tak bisa lihat/ubah),
> (3) **angka skor benar** (jalankan `npm test` + cek manual beberapa kasus).

Legenda hasil: ✅ lolos · ⚠️ lolos dengan catatan · ❌ gagal.

---

## 0. Pra-uji (sekali sebelum mulai)

- [ ] `npm install` sukses.
- [ ] `npm run build` hijau (validasi tipe + prerender).
- [ ] `npm run typecheck` bersih.
- [ ] `npm test` → **55 tes hijau** (kunci rumus skor/impor).
- [ ] `npm run verify:rls` → **21 assertion lolos** (kebijakan RLS per peran utuh).
- [ ] Ada minimal 1 **periode aktif** + data uji (pegawai, mapping, KPI) yang cukup.

---

## 1. Autentikasi & Sesi

- [ ] Login dengan kredensial benar → masuk landing sesuai posisi.
- [ ] Login dengan sandi salah → pesan error, tak masuk.
- [ ] Akses route terproteksi tanpa login → diarahkan ke `/login`.
- [ ] Sesi kedaluwarsa saat di `/admin/*` lalu login → mendarat di `/` (landing posisi-asli), **bukan** halaman Admin dengan toggle SPV.
- [ ] Petunjuk "Lupa sandi? Hubungi HRD" tampil di login (atau tautan reset bila flag aktif).
- [ ] Logout → sesi berakhir, kembali ke login.
- [ ] **Akun Saya — ganti sandi:** sandi lama salah ditolak; sandi lama benar + sandi baru → sukses; login ulang pakai sandi baru berhasil.

---

## 2. Otorisasi per peran (inti keamanan)

### Employee
- [ ] Melihat menu: Daftar Penilaian Saya, Laporan Hasil Saya (+ Akun Saya).
- [ ] **Tidak** bisa akses `/admin/*`, `/kpi`, `/monitor`, `/laporan-tim` (redirect/empty/ditolak).
- [ ] Laporan Hasil Saya: tampil **hanya** bila status `finalized`; sebelum itu pesan "belum difinalisasi".
- [ ] Komentar penilai di laporan sendiri **anonim** (tanpa nama penilai).

### SPV
- [ ] Menu Supervisor tampil: Input KPI Anggota, Laporan Kinerja Tim, Monitor Kinerja, Daftar Penilaian Saya, Laporan Hasil Saya.
- [ ] Hanya melihat **KPI/laporan timnya + dirinya** (bukan seluruh pegawai).
- [ ] **TIDAK PERNAH** bisa melihat komentar 360° mentah/bernama anggota tim (lapis 3) — bahkan di laporan detail tim.
- [ ] Detail laporan tim **terkunci** sampai HRD "Rilis ke SPV" (status `in_review`/`finalized`).
- [ ] Skor Akhir (L1) anggota tim terlihat sejak `draft`; detail agregat (L2) hanya setelah dirilis.
- [ ] Laporan **dirinya sendiri** mengikuti aturan pegawai (hanya saat `finalized`).
- [ ] ACC laporan tim berfungsi; **ACC diri sendiri dinonaktifkan**.

### HRD Admin — Mode Admin
- [ ] Default login = **mode base** (posisi asli), masuk Admin disengaja via toggle.
- [ ] Toggle **Mode Admin ↔ Mode posisi-asli** tampil.
- [ ] Akses penuh: Kelola Siklus Periode, Pertanyaan/Aspek, Bobot, Mapping, Punishment, Finalisasi, Dashboard, Kelola Pegawai, Ekspor.
- [ ] Melihat 360° mentah **anonim** + panel finalisasi (raw & finalisasi hanya di Mode Admin).
- [ ] **Monitor Kinerja TIDAK ada** di Mode Admin (menu hilang + akses `/monitor` ditolak).

### HRD Admin — Mode SPV (PARITAS dengan SPV biasa — wajib identik)
- [ ] Menu = SPV biasa (Input KPI Anggota · Laporan Kinerja Tim · Monitor; **tanpa** item "Rekapitulasi Kuartal" terpisah).
- [ ] Lingkup data = **pegawai sedivisi HRD** (termasuk dirinya), bukan `spv_team_members` kosong.
- [ ] `/kpi` menampilkan lingkup SPV (bukan "Monitoring & Audit KPI seluruh pegawai").
- [ ] `/monitor` bisa diakses (lingkup divisi, termasuk diri).
- [ ] Detail laporan tim: lapis 3 **dibuang**, gating status sama seperti SPV.
- [ ] Toggle SPV menyala (hijau) **dan** halaman benar-benar menampilkan konten SPV (bukan Admin).

### Direksi
- [ ] Menu: Dashboard eksekutif, ACC promosi/suksesi, **Daftar Penilaian Saya**, **Laporan Hasil Saya**.
- [ ] **Rekapitulasi Kuartal & Monitor Kinerja TIDAK ada** (menu hilang + akses `/kpi`,`/monitor` ditolak).
- [ ] Read-only + ACC; tak bisa mengubah KPI.

---

## 3. Siklus 360° (pengisian penilaian)

- [ ] Daftar Penilaian Saya menampilkan target yang ditugaskan (mapping aktif) + sifat Wajib/Opsional + status.
- [ ] Mulai Nilai → form indikator per aspek tampil (deskripsi + panduan rating muncul).
- [ ] **"Selanjutnya" dari indikator kuantitatif terakhir → lompat ke Umpan Balik Kualitatif** (label "Ke Umpan Balik Kualitatif"); **bukan** mentok.
- [ ] Di panel Kualitatif ada tombol **"Sebelumnya"** → kembali ke indikator terakhir.
- [ ] Simpan **Draf** → status "Draf"; bisa Lanjutkan nanti dengan data ter-prefill.
- [ ] **Kirim** tanpa semua rating → ditolak ("lengkapi seluruh rating").
- [ ] Kirim tanpa komentar/bukti ≥4 karakter → ditolak.
- [ ] Kirim lengkap → status "Terkirim"; bisa Edit.
- [ ] Self-assessment (relasi Self) tak memunculkan tombol Koreksi Relasi.
- [ ] **Koreksi Relasi**: ajukan → status pending tertandai; HRD bisa proses.
- [ ] **Ad-Hoc**: nilai rekan di luar daftar (non-direksi, bukan diri, belum terdaftar) → muncul & bisa dinilai.
- [ ] Periode **terkunci** → server menolak simpan/kirim penilaian.

---

## 4. KPI Bulanan (SPV & HRD Mode-SPV)

- [ ] Input KPI anggota tim + **dirinya sendiri** (migrasi 0008) tersimpan.
- [ ] Input KPI pertama boleh **tanpa** komentar; **edit** skor KPI **wajib** komentar (paritas legacy).
- [ ] Skor di luar 0–100 ditolak (validasi server/Zod).
- [ ] **Riwayat & Audit KPI** menampilkan diri sendiri + tim (bukan hanya tim).
- [ ] **Rekapitulasi Kuartal** menampilkan diri sendiri + tim.
- [ ] Audit trail KPI tak bisa diubah/dihapus dari client.
- [ ] SPV **tidak** bisa menulis KPI pegawai SPV lain (uji RLS sudah cek; cek manual juga).

### Impor Excel KPI
- [ ] Unggah file valid → baris ter-parse (alias kolom dikenali, kode di-uppercase).
- [ ] Skor **kosong dilewati** (bukan diimpor sebagai 0).
- [ ] Baris invalid (skor di luar 0–100/format salah) ditolak dengan pesan.
- [ ] Pratinjau sebelum simpan akurat.

---

## 5. Laporan & Visibilitas Bertahap (draft → in_review → finalized)

- [ ] **HRD detail laporan:** Unduh PDF · Simpan Draf · **Rilis ke SPV** · **Finalisasi** + badge status & Skor Akhir.
- [ ] Radar **self vs rekan** (garis penuh Rekan, putus Diri) + bar per aspek tampil benar.
- [ ] **Evaluasi Aspek** (ringkasan naratif HRD) tersimpan ke `final_reports.content.aspectSummaries`.
- [ ] **Rincian Komentar Murni** (HRD-only): anonim, per aspek→indikator, akumulasi rating + esai; **Self dikecualikan**.
- [ ] **Rilis ke SPV** → status `Ditinjau SPV`; SPV kini lihat L2 (detail agregat), tetap **tanpa** L3.
- [ ] **Finalisasi** → pegawai bisa lihat laporannya (anonim); ACC SPV **non-blok** (HRD bisa finalisasi tanpa menunggu ACC).
- [ ] Cetak/Unduh PDF (`window.print`) rapi (CSS print).

---

## 6. Dashboard Organisasi

### Filter
- [ ] Filter **Periode** mempersempit chart (server `?period=`).
- [ ] Filter **Divisi** mempersempit lingkup data.
- [ ] Filter **Tahun** mempersempit daftar periode; ganti tahun → lompat ke periode aktif tahun itu (atau teratas).

### Tab Analisis Hasil KPI
- [ ] Kartu **KPI Tertinggi** (nama+skor) & **KPI Terendah** (nama+skor).
- [ ] Kartu **KPI Di Atas Standar (≥N)** memakai `periods.kpi_standard`; ubah standar di Kelola Periode → label & angka berubah tanpa deploy.
- [ ] **Heatmap "Capaian KPI / Divisi"** (divisi × bulan), sel berwarna `heatColor`, sel kosong "—", caption "Rerata skor KPI per divisi".
- [ ] **Donut "Distribusi Kategori KPI"** di samping heatmap (layout sebelahan, full rata kiri-kanan): ≥90 biru · 80–89 hijau · 70–79 kuning · <70 merah; jumlah & persen benar.
- [ ] **Trendline "Tren KPI Bulanan {tahun}"** (Jan–Des) + kartu rerata tahun; ikut filter divisi.
- [ ] Bar "Rerata KPI Bulanan per Divisi", "Perkembangan KPI Bulanan", "Skor KPI per Divisi" — warna `heatColor` konsisten.

### Tab Analisis 360 Feedback
- [ ] **Trendline "Tren 360° per Kuartal {tahun}"** (hanya kuartal ber-360°) + kartu rerata tahun.
- [ ] "Evaluasi Budaya 360°" warna `heatColor`.

### Tab Talenta (9-Box & A/B/C/D)
- [ ] 9-Box & 4-Box **dikunci ke satu kuartal** (`getTalentQuarterKey`).
- [ ] Kuartal **tanpa 360°** (`has360=false`): 9-Box **tidak diplot**, kolom tabel `N/A`, **A Player nonaktif** (Skor Akhir = 100% KPI).
- [ ] Penempatan box sesuai ambang (lihat tabel CLAUDE.md): uji minimal 1 pegawai per band.

### Distribusi/RTL
- [ ] "Distribusi Kategori Kinerja" & "Rencana Tindak Lanjut" pakai **palet diskrit** (≥90 biru · 80–89 hijau · 70–79 kuning · <70 merah).

---

## 7. Monitor Kinerja (SPV & HRD Mode-SPV saja)

- [ ] Bar **"Perbandingan Skor Akhir Antar-Pegawai"** tampil, warna `heatColor`.
- [ ] **Menyertakan diri SPV** (selaras Input KPI/Riwayat/Rekap/Laporan-Tim).
- [ ] Lingkup: SPV = tim; HRD Mode-SPV = divisi (by-design).
- [ ] Tidak bisa diakses Direksi & HRD Mode-Admin.

---

## 8. Laporan Kinerja Tim (SPV & HRD Mode-SPV)

- [ ] Baris **SPV sendiri** muncul (badge "Anda") dengan Skor Akhir & Status **meski draf** (migrasi 0009).
- [ ] HRD Mode-SPV: lingkup baris = **pegawai sedivisi** (incl. diri).
- [ ] Kotak **pencarian nama/divisi** memfilter instan.
- [ ] Tautan detail terkunci sampai laporan dirilis (kecuali sesuai aturan).
- [ ] Tabel lebar bisa di-scroll horizontal di mobile.

---

## 9. Administrasi HRD (Mode Admin)

- [ ] **Kelola Siklus Periode**: buat periode (+ `kpi_standard`), aktifkan, **Kunci & Akhiri** (editor inline standar berfungsi).
- [ ] **Kelola Pertanyaan**: tambah/kelola **aspek** + indikator (deskripsi + panduan rating).
- [ ] **Bobot Penilai**: ubah bobot per relasi → memengaruhi `weightedScore360` (cek angka berubah).
- [ ] **Mapping**: buat/edit pasangan penilai-target + sifat **Wajib/Opsional**; impor mapping (pratinjau menyebut pasangan dilewati + alasan: self/dup/invalid).
- [ ] **Punishment/Kepatuhan**: set pengurangan poin per kuartal → Skor Akhir berkurang (lantai 0).
- [ ] **Hitung Ulang Skor 360°**: jalankan → `result_360` terisi; angka sesuai `lib/score360.ts`.
- [ ] **Finalisasi Final Report** menulis status & skor (hanya `service_role` dari server).
- [ ] **Progress 360**: dua progres per baris ("Menilai orang lain" + "Dinilai oleh X/Y").
- [ ] **Kirim Pengingat / Pengingat Massal** (dormant bila env email kosong — tombol ada, tak error).

### Kelola Pegawai
- [ ] CRUD pegawai (via service_role) berfungsi.
- [ ] **Grant/Revoke HRD Admin** (tombol perisai + badge "HRD"): hanya HRD Admin yang boleh; audit `employee.grant_hrd`/`revoke_hrd`; cegah eskalasi.
- [ ] Pegawai `employee`/`spv` yang diberi grant → dapat masuk Mode Admin **tanpa** kehilangan posisi/tim.

---

## 10. Ekspor Dataset

- [ ] Ekspor: Pegawai, KPI, Audit KPI, Punishment, Rekap, 360° **anonim**, Pemetaan, Rekap Konfigurasi Periode → file Excel valid, kolom benar.
- [ ] Data 360° hasil ekspor **anonim** (tak ada identitas penilai).

---

## 11. Rumus Skor (verifikasi angka — "salah diam-diam")

- [ ] `npm test` hijau (mengunci `finalScoreOf`, `playerClassOf`, `weightedScore360`, band, 9-Box).
- [ ] Cek manual 1 kasus **360° aktif**: Skor Akhir = KPI×0.5 + 360×0.5 − punishment (lantai 0).
- [ ] Cek manual 1 kasus **360° nonaktif**: Skor Akhir = KPI murni; kelas maks **B**.
- [ ] Cek **A Player**: hanya bila 360 aktif & Final≥90 & KPI≥90 & 360≥80.
- [ ] **Self dikecualikan** dari skor 360° (cek pengisian Self tak menaikkan/menurunkan hasil).

---

## 12. Keamanan & RLS (wajib)

- [ ] `npm run verify:rls` → 21/21 lolos.
- [ ] Manual: login SPV, coba buka URL laporan detail anggota tim sebelum dirilis → tak ada L3.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` **tidak** muncul di bundle client (hanya `NEXT_PUBLIC_*`).
- [ ] Periode terkunci menolak edit dari server (bukan hanya UI).
- [ ] Coba akses langsung route admin sebagai employee/SPV → ditolak server (bukan hanya menu disembunyikan).

---

## 13. Lintas-cutting (UX, mobile, regresi)

- [ ] Logo Infarm tampil di sidebar & header mobile (bukan lambang "i" lama), proporsional (header tak melar).
- [ ] Indikator **tenggat periode** di sidebar: sisa hari; amber ≤7 hari; rose saat hari-H/lewat.
- [ ] **Empty-state** berpandu muncul di halaman tanpa data (bukan tabel kosong polos).
- [ ] Mobile: tabel lebar `overflow-x-auto`; menu mobile buka/tutup; dropdown keyboard-nav (↑/↓/Enter/Esc).
- [ ] Kontras teks terbaca (gray-500, ukuran ≥10px) di HP/proyektor/ruang terang.
- [ ] **Konsistensi mode** (regresi yang pernah ada): setelah login HRD, toggle & isi halaman cocok (tak ada "toggle SPV tapi halaman Admin").

---

## 14. Beban (opsional, sebelum 100 pengguna)

- [ ] Jalankan uji k6 di **staging** (lihat `scripts/loadtest/README.md`): burst 100 VU → threshold hijau (p95<3s, error<1%).
- [ ] Bila `429/503` banyak → pertimbangkan Supabase Pro.

---

## 15. Aktivasi produksi (saat siap — butuh aksi pengguna)

- [ ] Email seed `@infarm.test` → email asli (prasyarat pengingat & reset).
- [ ] Set `SMTP_USER`/`SMTP_PASS` (atau Resend) di Vercel → tombol pengingat 360° benar-benar mengirim.
- [ ] `NEXT_PUBLIC_ENABLE_PW_RESET=true` + Redirect URL Supabase → alur Lupa Sandi aktif.
- [ ] Sandi awal berbeda per orang (bukan seragam) → imbau ganti via Akun Saya.
- [ ] Rotasi kredensial (`SUPABASE_SERVICE_ROLE_KEY` dll) sebelum go-live.
- [ ] Branch protection GitHub: PR ke `main` wajib CI hijau.
