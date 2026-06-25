'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Penilaian Ad-Hoc: penilai berhak menilai rekan kerja yang TIDAK tercantum di
 * mapping rutinnya. Implementasi: buat mapping relasi "Cross" (lintas unit, bobot
 * terkecil) & sifat Opsional, via service_role (mappings di-RLS HRD-only). Setelah
 * itu target muncul di "Daftar Penilaian Saya" dan dinilai seperti biasa.
 *
 * Pengamanan: assessor = user yang login (bukan bebas pilih), target ≠ self, periode
 * aktif, belum ada mapping. Relasi dikunci 'Cross' agar tak bisa menggelembungkan bobot.
 */
type Result = { ok: true } | { ok: false; error: string };
const TargetId = z.string().uuid();

export async function addAdhocTarget(rawTargetId: string): Promise<Result> {
  const parsed = TargetId.safeParse(rawTargetId);
  if (!parsed.success) return { ok: false, error: 'Target tidak valid' };
  const targetId = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  if (targetId === user.id) return { ok: false, error: 'Tidak dapat menilai diri sendiri lewat Ad-Hoc' };

  const { data: ap } = await supabase.from('periods').select('id, status, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };
  if (!ap.has_360) return { ok: false, error: 'Penilaian 360° untuk periode ini belum dibuka oleh HRD' };

  // Pastikan target adalah pegawai sah.
  const { data: target } = await supabase.from('employees').select('id, role, is_external').eq('id', targetId).maybeSingle();
  if (!target) return { ok: false, error: 'Pegawai tidak ditemukan' };
  if (target.role === 'direksi') return { ok: false, error: 'Direksi tidak dinilai lewat Ad-Hoc' };
  if (target.is_external) return { ok: false, error: 'Pegawai eksternal hanya dapat menjadi penilai, tidak dapat dinilai' };

  // Cegah duplikat (mapping rutin maupun ad-hoc sebelumnya).
  const { data: existing } = await supabase
    .from('mappings').select('id').eq('period_id', ap.id).eq('assessor_id', user.id).eq('target_id', targetId).maybeSingle();
  if (existing) return { ok: false, error: 'Rekan ini sudah ada di daftar penilaian Anda' };

  // Tulis mapping via service_role (RLS map_write = HRD). Relasi Cross, Opsional, ditandai Ad-Hoc.
  const admin = createAdminClient();
  const { error } = await admin.from('mappings').insert({
    period_id: ap.id, assessor_id: user.id, target_id: targetId,
    relation: 'Cross', mandatory: false, is_adhoc: true, is_active: true,
  });
  if (error) {
    return { ok: false, error: error.code === '23505' ? 'Rekan ini sudah ada di daftar Anda' : 'Gagal menambah: ' + error.message };
  }

  revalidatePath('/penilaian');
  return { ok: true };
}

/**
 * Hapus target Ad-Hoc milik sendiri. Hanya untuk pemetaan ber-`is_adhoc`
 * (penilai = user). Bila penilaiannya sudah TERKIRIM → ditolak (jaga integritas
 * data). Draf yang belum terkirim ikut terhapus (cascade FK) bersama mapping.
 */
export async function removeAdhocTarget(rawTargetId: string): Promise<Result> {
  const parsed = TargetId.safeParse(rawTargetId);
  if (!parsed.success) return { ok: false, error: 'Target tidak valid' };
  const targetId = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };

  const { data: ap } = await supabase.from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const admin = createAdminClient();
  // Pastikan mapping ini memang Ad-Hoc milik user (bukan penugasan HRD).
  const { data: map } = await admin.from('mappings')
    .select('id, is_adhoc')
    .eq('period_id', ap.id).eq('assessor_id', user.id).eq('target_id', targetId).maybeSingle();
  if (!map) return { ok: false, error: 'Pemetaan tidak ditemukan' };
  if (!map.is_adhoc) return { ok: false, error: 'Hanya penilaian Ad-Hoc (tambahan mandiri) yang bisa dihapus' };

  // Tolak bila penilaiannya sudah dikirim (jaga data 360°).
  const { data: asmt } = await admin.from('assessments')
    .select('id, status').eq('period_id', ap.id).eq('assessor_id', user.id).eq('target_id', targetId).maybeSingle();
  if (asmt?.status === 'submitted') {
    return { ok: false, error: 'Penilaian ad-hoc ini sudah dikirim — tidak bisa dihapus' };
  }
  if (asmt) await admin.from('assessments').delete().eq('id', asmt.id); // draf → hapus (skor/esai cascade)

  const { error } = await admin.from('mappings').delete().eq('id', map.id);
  if (error) return { ok: false, error: 'Gagal menghapus: ' + error.message };

  revalidatePath('/penilaian');
  return { ok: true };
}
