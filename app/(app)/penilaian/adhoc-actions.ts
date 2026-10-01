'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Penilaian Ad-Hoc INSTAN (tanpa persetujuan HRD) — DINONAKTIFKAN (BR-04, Q3 2026,
 * keputusan HRD): satu-satunya jalur menambah ratee di luar mapping rutin kini
 * "Ajukan Penilaian" (request-actions.ts), yang wajib alasan + ACC HRD. `addAdhocTarget` ditolak di SERVER — bukan
 * cuma disembunyikan dari UI — agar tak bisa dipanggil langsung.
 * `removeAdhocTarget` di bawah TETAP aktif agar pemetaan ad-hoc dari periode
 * sebelum kebijakan ini masih bisa dibersihkan pemiliknya sendiri.
 */
type Result = { ok: true } | { ok: false; error: string };
const TargetId = z.string().uuid();

export async function addAdhocTarget(_rawTargetId: string): Promise<Result> {
  return { ok: false, error: 'Penambahan Ad-Hoc instan dinonaktifkan. Gunakan "Ajukan Penilaian" — pengajuan Anda akan diproses HRD.' };
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
  if (asmt?.status === 'invalidated') {
    return { ok: false, error: 'Penilaian ini dibatalkan validitasnya oleh HRD — disimpan sebagai arsip, tidak bisa dihapus' };
  }
  if (asmt) await admin.from('assessments').delete().eq('id', asmt.id); // draf → hapus (skor/esai cascade)

  const { error } = await admin.from('mappings').delete().eq('id', map.id);
  if (error) return { ok: false, error: 'Gagal menghapus: ' + error.message };

  revalidatePath('/penilaian');
  return { ok: true };
}
