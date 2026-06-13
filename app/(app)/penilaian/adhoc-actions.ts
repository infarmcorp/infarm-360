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

  const { data: ap } = await supabase.from('periods').select('id, status').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  // Pastikan target adalah pegawai sah.
  const { data: target } = await supabase.from('employees').select('id, role').eq('id', targetId).maybeSingle();
  if (!target) return { ok: false, error: 'Pegawai tidak ditemukan' };
  if (target.role === 'direksi') return { ok: false, error: 'Direksi tidak dinilai lewat Ad-Hoc' };

  // Cegah duplikat (mapping rutin maupun ad-hoc sebelumnya).
  const { data: existing } = await supabase
    .from('mappings').select('id').eq('period_id', ap.id).eq('assessor_id', user.id).eq('target_id', targetId).maybeSingle();
  if (existing) return { ok: false, error: 'Rekan ini sudah ada di daftar penilaian Anda' };

  // Tulis mapping via service_role (RLS map_write = HRD). Relasi Cross, Opsional.
  const admin = createAdminClient();
  const { error } = await admin.from('mappings').insert({
    period_id: ap.id, assessor_id: user.id, target_id: targetId,
    relation: 'Cross', mandatory: false, is_active: true,
  });
  if (error) {
    return { ok: false, error: error.code === '23505' ? 'Rekan ini sudah ada di daftar Anda' : 'Gagal menambah: ' + error.message };
  }

  revalidatePath('/penilaian');
  return { ok: true };
}
