'use server';

import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { tableMissing } from '@/lib/report-folder';
import { OUTSIDE_NOTE_MIN, OUTSIDE_NOTE_MAX, OUTSIDE_NOTE_EXTRA_MAX } from '@/lib/outside-notes';

/**
 * LAPORKAN PELANGGARAN (tabel `outside_mapping_notes`, migrasi 0054 + 0058; dulu "Catatan di Luar Pemetaan") —
 * pegawai melaporkan kejadian kepada HRD tentang rekan di LUAR daftar penilaiannya: rekan + tanggal kejadian +
 * kategori (aspek budaya periode aktif atau "Lainnya") + isi laporan (≥ 20 karakter) + catatan opsional. Tanpa rating.
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

const Input = z.object({
  targetId: z.string().uuid('Rekan tidak valid'),
  category: z.union([z.literal('other'), z.string().uuid('Kategori tidak valid')]),
  incidentDate: IsoDate,
  body: z.string().trim()
    .min(OUTSIDE_NOTE_MIN, `Isi laporan minimal ${OUTSIDE_NOTE_MIN} karakter`)
    .max(OUTSIDE_NOTE_MAX, `Isi laporan maksimal ${OUTSIDE_NOTE_MAX} karakter`),
  note: z.string().trim().max(OUTSIDE_NOTE_EXTRA_MAX, `Catatan maksimal ${OUTSIDE_NOTE_EXTRA_MAX} karakter`),
});

export async function submitOutsideNote(
  rawTargetId: string, rawCategory: string, rawIncidentDate: string, rawBody: string, rawNote: string,
): Promise<Result> {
  const parsed = Input.safeParse({
    targetId: rawTargetId, category: rawCategory, incidentDate: rawIncidentDate, body: rawBody, note: rawNote ?? '',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { targetId, category, incidentDate, body, note } = parsed.data;
  if (incidentDate > todayWib()) return { ok: false, error: 'Tanggal kejadian tidak boleh setelah hari ini' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  if (targetId === user.id) return { ok: false, error: 'Tidak dapat melaporkan diri sendiri' };

  // Gerbang fase: periode aktif + 360° aktif + form DIBUKA. Tahap tinjau pemetaan (form belum dibuka) ditolak.
  // Deadline penilaian sengaja tidak dicek — selama form dibuka, laporan boleh dikirim.
  const { data: ap } = await supabase
    .from('periods').select('id, has_360, form_open').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };
  if (!ap.has_360) return { ok: false, error: 'Penilaian 360° untuk periode ini belum dibuka oleh HRD' };
  if (!ap.form_open) return { ok: false, error: 'Form penilaian sedang ditutup — laporan belum bisa dikirim' };

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

  // Rekan yang SUDAH ada di pemetaan aktif → sampaikan lewat form penilaian (keputusan pemilik 2026-11-10: tetap).
  const { data: mapped } = await supabase.from('mappings').select('id')
    .eq('period_id', ap.id).eq('assessor_id', user.id).eq('target_id', targetId)
    .eq('is_active', true).maybeSingle();
  if (mapped) return { ok: false, error: 'Rekan ini sudah ada di daftar penilaian Anda — sampaikan lewat form penilaian' };

  // Kategori budaya kerja = aspek milik periode aktif (database juga menegakkannya lewat trigger).
  const isOther = category === 'other';
  if (!isOther) {
    const { data: aspect } = await supabase.from('culture_aspects').select('id')
      .eq('id', category).eq('period_id', ap.id).maybeSingle();
    if (!aspect) return { ok: false, error: 'Kategori tidak ditemukan di periode aktif' };
  }

  // Baris hanya berisi isian pelapor + periode + rekan — tanpa identitas & tanpa waktu kirim.
  const admin = createAdminClient();
  const { error } = await admin.from('outside_mapping_notes').insert({
    period_id: ap.id, target_id: targetId,
    aspect_id: isOther ? null : category, is_other: isOther,
    incident_date: incidentDate, body, note: note || null,
  });
  if (error) {
    if (error.code === '42703' || error.code === 'PGRST204' || /column/i.test(error.message ?? '')) {
      return { ok: false, error: 'Fitur Laporkan Pelanggaran sedang diperbarui — coba lagi nanti' };
    }
    return { ok: false, error: tableMissing(error) ? 'Fitur Laporkan Pelanggaran belum aktif' : 'Gagal mengirim laporan, coba lagi' };
  }
  // Sengaja tanpa revalidatePath: tak ada tampilan pegawai yang berubah (laporan tak punya riwayat).
  return { ok: true };
}
