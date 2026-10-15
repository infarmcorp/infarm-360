-- 0051 — Bucket penyimpanan gambar email (Email Rilis Laporan PA).
--
-- HRD mengunggah gambar pendamping email rilis per periode (mis. "Panduan setelah menerima laporan" dan
-- "Cara mengunduh laporan PA") di dialog Email Rilis Laporan (Review & Finalisasi). Gambar disimpan di
-- `email-assets/release/<period_id>/<kunci>.<ext>` dan disisipkan ke email (inline/CID) saat dikirim.
--
--   - PUBLIK baca: penyedia email (Gmail SMTP/Resend) mengunduh gambar lewat URL publik. Isinya infografis
--     umum, BUKAN data pegawai — jangan pernah menaruh berkas berisi data pribadi di bucket ini.
--   - Tulis/hapus: hanya Server Action (service_role, setelah cek HRD Mode Admin) → tanpa policy tulis
--     untuk anon/authenticated.
--   - Batas 2 MB per berkas, hanya JPG/PNG/WebP (juga dicek di server).
-- Aplikasi tetap jalan tanpa migrasi ini: dialog menampilkan "penyimpanan gambar belum aktif" dan email
-- terkirim tanpa gambar.
--
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-assets', 'email-assets', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
