'use server';

import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { tableMissing } from '@/lib/report-folder';
import { OUTSIDE_NOTE_MIN, OUTSIDE_NOTE_MAX } from '@/lib/outside-notes';

/**
 * CATATAN DI LUAR PEMETAAN (migrasi 0054) — pegawai menyampaikan kejadian kepada HRD tentang rekan di LUAR
 * daftar penilaiannya: rekan + satu aspek budaya + isi (≥ 20 karakter). Tanpa rating.
 *
 * BUKAN Ad-Hoc (addAdhocTarget tetap ditolak): tak menyentuh mappings/assessments/assessment_indicator_scores,
 * jadi tak pernah masuk Skor 360°, Progress 360, Kepatuhan, potongan keterlambatan, atau angka "x dari y".
 *
 * ANONIM: identitas pengirim HANYA dipakai untuk validasi di bawah. Tidak ditulis ke tabel (skemanya tak punya
 * kolom penulis), tidak ke Log Aktivitas, tidak ke console, tidak ke pesan error, tidak ke notifikasi. Insert lewat
 * service_role karena tabel tanpa policy (RLS tertutup untuk anon/authenticated).
 */
type Result = { ok: true } | { ok: false; error: string };

const Input = z.object({
  targetId: z.string().uuid('Rekan tidak valid'),
  aspectId: z.string().uuid('Aspek tidak valid'),
  body: z.string().trim()
    .min(OUTSIDE_NOTE_MIN, `Isi catatan minimal ${OUTSIDE_NOTE_MIN} karakter`)
    .max(OUTSIDE_NOTE_MAX, `Isi catatan maksimal ${OUTSIDE_NOTE_MAX} karakter`),
});

export async function submitOutsideNote(rawTargetId: string, rawAspectId: string, rawBody: string): Promise<Result> {
  const parsed = Input.safeParse({ targetId: rawTargetId, aspectId: rawAspectId, body: rawBody });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { targetId, aspectId, body } = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  if (targetId === user.id) return { ok: false, error: 'Tidak dapat menulis catatan tentang diri sendiri' };

  // Gerbang fase: periode aktif + 360° aktif + form DIBUKA. Tahap tinjau pemetaan (form belum dibuka) ditolak.
  // Deadline penilaian sengaja tidak dicek — selama form dibuka, catatan boleh dikirim.
  const { data: ap } = await supabase
    .from('periods').select('id, has_360, form_open').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };
  if (!ap.has_360) return { ok: false, error: 'Penilaian 360° untuk periode ini belum dibuka oleh HRD' };
  if (!ap.form_open) return { ok: false, error: 'Form penilaian sedang ditutup — catatan belum bisa dikirim' };

  // Pengirim: penilai eksternal (vendor/freelance) belum boleh mengirim catatan (keputusan pemilik 2026-11-03).
  const { data: me } = await supabase.from('employees').select('is_external').eq('id', user.id).maybeSingle();
  if (!me || me.is_external) return { ok: false, error: 'Fitur ini belum tersedia untuk akun Anda' };

  // Kandidat: aturan sama dengan dropdown Ajukan Penilaian (bukan Direksi/eksternal/nonaktif).
  const { data: target } = await supabase.from('employees')
    .select('id, role, is_external, is_active').eq('id', targetId).maybeSingle();
  if (!target) return { ok: false, error: 'Pegawai tidak ditemukan' };
  if (!target.is_active) return { ok: false, error: 'Pegawai ini sudah nonaktif' };
  if (target.role === 'direksi') return { ok: false, error: 'Direksi tidak dapat dipilih' };
  if (target.is_external) return { ok: false, error: 'Pegawai eksternal tidak dapat dipilih' };

  // Rekan yang SUDAH ada di pemetaan aktif → pakai form penilaian, bukan catatan ini.
  const { data: mapped } = await supabase.from('mappings').select('id')
    .eq('period_id', ap.id).eq('assessor_id', user.id).eq('target_id', targetId)
    .eq('is_active', true).maybeSingle();
  if (mapped) return { ok: false, error: 'Rekan ini sudah ada di daftar penilaian Anda — sampaikan lewat form penilaian' };

  // Aspek wajib milik periode aktif (database juga menegakkannya lewat trigger).
  const { data: aspect } = await supabase.from('culture_aspects').select('id')
    .eq('id', aspectId).eq('period_id', ap.id).maybeSingle();
  if (!aspect) return { ok: false, error: 'Aspek tidak ditemukan di periode aktif' };

  // Baris hanya berisi periode, rekan, aspek, isi — tanpa identitas & waktu kirim.
  const admin = createAdminClient();
  const { error } = await admin.from('outside_mapping_notes').insert({
    period_id: ap.id, target_id: targetId, aspect_id: aspectId, body,
  });
  if (error) {
    return { ok: false, error: tableMissing(error) ? 'Fitur Catatan di Luar Pemetaan belum aktif' : 'Gagal mengirim catatan, coba lagi' };
  }
  // Sengaja tanpa revalidatePath: tak ada tampilan pegawai yang berubah (catatan tak punya riwayat).
  return { ok: true };
}
