'use server';

import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { tableMissing } from '@/lib/report-folder';
import {
  OUTSIDE_NOTE_MIN, OUTSIDE_NOTE_MAX, OUTSIDE_NOTE_EXTRA_MAX,
  loadViolationPeriod, loadViolationCategories, matchCategory,
} from '@/lib/outside-notes';

/**
 * LAPORKAN PELANGGARAN (tabel `outside_mapping_notes`, migrasi 0054 + 0058 + 0061; dulu "Catatan di Luar Pemetaan") —
 * pegawai melaporkan kejadian kepada HRD tentang rekan: rekan + tanggal kejadian + kategori (nama aspek budaya kerja
 * atau "Lainnya") + isi laporan (≥ 20 karakter) + catatan opsional. Tanpa rating.
 *
 * LEPAS DARI 360° (0061, pemilik 2026-11-16): gerbang = periode aktif + saklar Laporkan Pelanggaran periode itu
 * (`periods.violation_open`, diatur HRD di Kelola Periode). Status 360° & formulir penilaian tidak menentukan.
 * Kategori = NAMA aspek (aspek sama antarperiode), divalidasi terhadap daftar `loadViolationCategories`.
 *
 * BUKAN Ad-Hoc (addAdhocTarget tetap ditolak): tak menyentuh mappings/assessments/assessment_indicator_scores,
 * jadi tak pernah masuk Skor 360°, Progress 360, Kepatuhan, potongan keterlambatan, atau angka "x dari y".
 *
 * ANONIM: identitas pengirim HANYA dipakai untuk validasi di bawah. Tidak ditulis ke tabel (skemanya tak punya
 * kolom penulis maupun waktu kirim), tidak ke Log Aktivitas, tidak ke console, tidak ke pesan error, tidak ke
 * notifikasi. `incident_date` = tanggal KEJADIAN yang diisi pelapor, bukan waktu kirim. Insert lewat service_role
 * karena tabel tanpa policy (RLS tertutup untuk anon/authenticated).
 */
type Result = { ok: true } | { ok: false; error: string };

/** "YYYY-MM-DD" hari ini di WIB (zona pengguna; server Vercel berjalan di UTC). */
function todayWib(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal kejadian wajib diisi')
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'Tanggal kejadian tidak valid');

/** Nilai kategori dari formulir: 'other' = Lainnya; selain itu nama aspek budaya kerja (sama dengan report-form.tsx). */
const OTHER_CATEGORY_VALUE = 'other';

const Input = z.object({
  targetId: z.string().uuid('Rekan tidak valid'),
  category: z.string().trim().min(1, 'Pilih kategori laporan').max(100, 'Kategori tidak valid'),
  incidentDate: IsoDate,
  body: z.string().trim()
    .min(OUTSIDE_NOTE_MIN, `Isi laporan minimal ${OUTSIDE_NOTE_MIN} karakter`)
    .max(OUTSIDE_NOTE_MAX, `Isi laporan maksimal ${OUTSIDE_NOTE_MAX} karakter`),
  note: z.string().trim().max(OUTSIDE_NOTE_EXTRA_MAX, `Catatan maksimal ${OUTSIDE_NOTE_EXTRA_MAX} karakter`),
});

/** Kolom baru belum ada di database (migrasi belum dijalankan). */
const columnMissing = (e: { code?: string; message?: string }) =>
  e.code === '42703' || e.code === 'PGRST204' || /column/i.test(e.message ?? '');

export async function submitOutsideNote(
  rawTargetId: string, rawCategory: string, rawIncidentDate: string, rawBody: string, rawNote: string,
): Promise<Result> {
  const parsed = Input.safeParse({
    targetId: rawTargetId, category: rawCategory ?? '', incidentDate: rawIncidentDate, body: rawBody, note: rawNote ?? '',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { targetId, category, incidentDate, body, note } = parsed.data;
  if (incidentDate > todayWib()) return { ok: false, error: 'Tanggal kejadian tidak boleh setelah hari ini' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir. Silakan masuk kembali.' };
  if (targetId === user.id) return { ok: false, error: 'Tidak dapat melaporkan diri sendiri' };

  // Gerbang: periode aktif + saklar Laporkan Pelanggaran dibuka HRD (lepas dari 360° & formulir penilaian).
  const ap = await loadViolationPeriod(supabase);
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };
  if (!ap.open) return { ok: false, error: 'Laporkan Pelanggaran sedang ditutup HRD — laporan belum bisa dikirim' };

  // Pengirim: penilai eksternal (vendor/freelance) belum boleh mengirim (keputusan pemilik 2026-11-03).
  const { data: me } = await supabase.from('employees').select('is_external').eq('id', user.id).maybeSingle();
  if (!me || me.is_external) return { ok: false, error: 'Fitur ini belum tersedia untuk akun Anda' };

  // Kandidat: aturan sama dengan dropdown Ajukan Penilaian (bukan Direksi/eksternal/nonaktif).
  const { data: target } = await supabase.from('employees')
    .select('id, role, is_external, is_active').eq('id', targetId).maybeSingle();
  if (!target) return { ok: false, error: 'Pegawai tidak ditemukan' };
  if (!target.is_active) return { ok: false, error: 'Pegawai ini sudah nonaktif' };
  if (target.role === 'direksi') return { ok: false, error: 'Direksi tidak dapat dipilih' };
  if (target.is_external) return { ok: false, error: 'Pegawai eksternal tidak dapat dipilih' };

  // Rekan yang ada di pemetaan aktif → sampaikan lewat formulir penilaian, TETAPI hanya selama formulir 360° terbuka
  // (pemilik 2026-11-10 & 2026-11-16). Saat formulir ditutup pegawai tak punya jalur lain, jadi laporan diterima.
  if (ap.formOpen) {
    const { data: mapped } = await supabase.from('mappings').select('id')
      .eq('period_id', ap.id).eq('assessor_id', user.id).eq('target_id', targetId)
      .eq('is_active', true).maybeSingle();
    if (mapped) return { ok: false, error: 'Rekan ini sudah ada di daftar penilaian Anda — sampaikan lewat formulir penilaian' };
  }

  // Kategori budaya kerja = nama aspek dari daftar baku (tak terikat ke aspek periode aktif).
  const isOther = category === OTHER_CATEGORY_VALUE;
  let categoryName: string | null = null;
  if (!isOther) {
    categoryName = matchCategory(await loadViolationCategories(supabase), category);
    if (!categoryName) return { ok: false, error: 'Kategori tidak ditemukan' };
  }

  // Baris hanya berisi isian pelapor + periode + rekan — tanpa identitas & tanpa waktu kirim.
  const admin = createAdminClient();
  const row = { period_id: ap.id, target_id: targetId, incident_date: incidentDate, body, note: note || null };
  let { error } = await admin.from('outside_mapping_notes').insert({
    ...row, aspect_id: null, category: categoryName, is_other: isOther,
  });
  // Kolom kategori (0061) belum ada → cara lama: rujukan aspek periode laporan dengan nama yang sama.
  if (error && columnMissing(error) && /category/i.test(error.message ?? '')) {
    let aspectId: string | null = null;
    if (!isOther) {
      const { data: asp } = await supabase.from('culture_aspects').select('id, name').eq('period_id', ap.id);
      aspectId = (asp ?? []).find((a) => a.name.trim().toLocaleLowerCase('id') === categoryName!.toLocaleLowerCase('id'))?.id ?? null;
      if (!aspectId) return { ok: false, error: 'Fitur Laporkan Pelanggaran sedang diperbarui — coba lagi nanti' };
    }
    ({ error } = await admin.from('outside_mapping_notes').insert({ ...row, aspect_id: aspectId, is_other: isOther }));
  }
  if (error) {
    if (columnMissing(error)) return { ok: false, error: 'Fitur Laporkan Pelanggaran sedang diperbarui — coba lagi nanti' };
    return { ok: false, error: tableMissing(error) ? 'Fitur Laporkan Pelanggaran belum aktif' : 'Gagal mengirim laporan, coba lagi' };
  }
  // Sengaja tanpa revalidatePath: tak ada tampilan pegawai yang berubah (laporan tak punya riwayat).
  return { ok: true };
}
