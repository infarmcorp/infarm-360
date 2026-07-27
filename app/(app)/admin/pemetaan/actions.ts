'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { logHrdAction } from '@/lib/audit/log';
import { computeResult360 } from '@/app/(app)/admin/360/actions';

/**
 * Pemetaan (Mapping) penilai→target untuk periode aktif (HRD).
 * Menentukan "Daftar Penilaian Saya" tiap pegawai + relasi (kelas bobot) + sifat
 * Wajib/Opsional (dasar Flag Kepatuhan). RLS map_write = HRD.
 */
async function requireHrd(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) return { ok: false as const, error: 'Hanya HRD yang dapat mengelola pemetaan' };
  return { ok: true as const };
}

const CreateInput = z.object({
  assessorId: z.string().uuid(),
  targetId: z.string().uuid(),
  relation: z.enum(['Atasan', 'Peer', 'Cross', 'Self', 'Bawahan']),
  mandatory: z.boolean(),
});

type Result = { ok: true } | { ok: false; error: string };

export async function createMapping(raw: unknown): Promise<Result> {
  const parsed = CreateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const { assessorId, targetId, relation } = parsed.data;
  const mandatory = true; // kebijakan: penilaian yang ditugaskan HRD selalu WAJIB
  if (assessorId === targetId && relation !== 'Self') {
    return { ok: false, error: 'Penilai = target hanya boleh untuk relasi Self' };
  }

  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: ap } = await supabase
    .from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  // Eksternal (vendor/freelance) hanya boleh MENILAI, tak boleh jadi target.
  const { data: pair } = await supabase.from('employees').select('id, is_external, is_active').in('id', [assessorId, targetId]);
  const tgt = (pair ?? []).find((e) => e.id === targetId);
  const asr = (pair ?? []).find((e) => e.id === assessorId);
  if (tgt?.is_external) return { ok: false, error: 'Pegawai eksternal hanya dapat menjadi penilai, tidak dapat dinilai' };
  // Pegawai nonaktif tak boleh masuk siklus baru (penilai maupun target).
  if (asr && !asr.is_active) return { ok: false, error: 'Penilai berstatus nonaktif — tidak bisa ditugaskan menilai' };
  if (tgt && !tgt.is_active) return { ok: false, error: 'Pegawai yang dinilai berstatus nonaktif — tidak bisa menjadi target' };

  const { error } = await supabase.from('mappings')
    .insert({ period_id: ap.id, assessor_id: assessorId, target_id: targetId, relation, mandatory, is_active: true });
  if (error) {
    return { ok: false, error: error.code === '23505' ? 'Pasangan penilai→target ini sudah ada' : 'Gagal: ' + error.message };
  }
  await logHrdAction({
    action: 'mapping.create', category: 'pemetaan',
    summary: `Menambah pemetaan penilai→target (relasi ${relation}, ${mandatory ? 'Wajib' : 'Opsional'})`,
    targetType: 'mapping', meta: { assessor_id: assessorId, target_id: targetId, relation, mandatory },
  });
  revalidatePath('/admin/pemetaan');
  revalidatePath('/penilaian');
  revalidatePath('/', 'layout'); // segarkan notifikasi sidebar (getTodos)
  return { ok: true };
}

const BulkRow = z.object({
  assessorId: z.string().uuid(),
  targetId: z.string().uuid(),
  relation: z.enum(['Atasan', 'Peer', 'Cross', 'Self', 'Bawahan']),
  mandatory: z.boolean(),
});

/** Impor mapping massal (HRD) dari Excel/CSV. Lewati baris Self yang penilai≠target & duplikat. */
export async function createMappingsBulk(rawRows: unknown): Promise<{ ok: true; saved: number; skipped: number } | { ok: false; error: string }> {
  const parsed = z.array(BulkRow).min(1).safeParse(rawRows);
  if (!parsed.success) return { ok: false, error: 'Data impor tidak valid' };

  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data: ap } = await supabase.from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  // Eksternal tak boleh jadi target; pegawai NONAKTIF tak boleh masuk siklus (penilai/target).
  const { data: empMeta } = await supabase.from('employees').select('id, is_external, is_active');
  const externalIds = new Set((empMeta ?? []).filter((e) => e.is_external).map((e) => e.id));
  const inactiveIds = new Set((empMeta ?? []).filter((e) => !e.is_active).map((e) => e.id));
  const rows = parsed.data
    .filter((r) => !(r.assessorId === r.targetId && r.relation !== 'Self'))
    .filter((r) => !externalIds.has(r.targetId))
    .filter((r) => !inactiveIds.has(r.assessorId) && !inactiveIds.has(r.targetId));
  if (rows.length === 0) return { ok: false, error: 'Tidak ada baris valid (penilai=target hanya untuk Self; eksternal tak boleh jadi target; pegawai nonaktif dilewati)' };

  const { error, count } = await supabase.from('mappings').upsert(
    rows.map((r) => ({ period_id: ap.id, assessor_id: r.assessorId, target_id: r.targetId, relation: r.relation, mandatory: true, is_active: true })),
    { onConflict: 'period_id,assessor_id,target_id', ignoreDuplicates: true, count: 'exact' },
  );
  if (error) return { ok: false, error: 'Gagal mengimpor: ' + error.message };

  await logHrdAction({
    action: 'mapping.import', category: 'pemetaan',
    summary: `Impor massal pemetaan: ${count ?? rows.length} tersimpan, ${parsed.data.length - rows.length} dilewati`,
    targetType: 'mapping', meta: { saved: count ?? rows.length, skipped: parsed.data.length - rows.length },
  });
  revalidatePath('/admin/pemetaan');
  revalidatePath('/penilaian');
  revalidatePath('/', 'layout'); // segarkan notifikasi sidebar (getTodos)
  return { ok: true, saved: count ?? rows.length, skipped: parsed.data.length - rows.length };
}

/**
 * Salin SEMUA pemetaan dari periode lain ke periode AKTIF (HRD). Berguna saat ganti
 * periode: tak perlu input ulang. Hasil salinan = baris mapping biasa → tetap bisa
 * diedit/dihapus. Duplikat (pasangan penilai→target yang sudah ada) dilewati.
 */
export async function copyMappingsFromPeriod(sourcePeriodId: string): Promise<{ ok: true; saved: number; skipped: number } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(sourcePeriodId).success) return { ok: false, error: 'Periode sumber tidak valid' };
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: ap } = await supabase.from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };
  if (sourcePeriodId === ap.id) return { ok: false, error: 'Periode sumber sama dengan periode aktif' };

  const { data: srcAll } = await supabase.from('mappings')
    .select('assessor_id, target_id, relation, mandatory').eq('period_id', sourcePeriodId).eq('is_active', true);
  if (!srcAll || srcAll.length === 0) return { ok: false, error: 'Periode sumber tidak memiliki pemetaan untuk disalin' };

  // Eksternal tak boleh jadi target & pegawai NONAKTIF tak boleh masuk siklus (mis. status
  // berubah sejak periode sumber) → buang baris dengan penilai/target eksternal/nonaktif.
  const { data: empMeta } = await supabase.from('employees').select('id, is_external, is_active');
  const externalIds = new Set((empMeta ?? []).filter((e) => e.is_external).map((e) => e.id));
  const inactiveIds = new Set((empMeta ?? []).filter((e) => !e.is_active).map((e) => e.id));
  const src = srcAll
    .filter((m) => !externalIds.has(m.target_id))
    .filter((m) => !inactiveIds.has(m.assessor_id) && !inactiveIds.has(m.target_id));
  if (src.length === 0) return { ok: false, error: 'Periode sumber tak punya pasangan valid untuk disalin (target eksternal / pegawai nonaktif dilewati)' };

  const { error, count } = await supabase.from('mappings').upsert(
    src.map((m) => ({ period_id: ap.id, assessor_id: m.assessor_id, target_id: m.target_id, relation: m.relation, mandatory: true, is_active: true })),
    { onConflict: 'period_id,assessor_id,target_id', ignoreDuplicates: true, count: 'exact' },
  );
  if (error) return { ok: false, error: 'Gagal menyalin: ' + error.message };
  const saved = count ?? src.length;

  const { data: srcP } = await supabase.from('periods').select('label').eq('id', sourcePeriodId).maybeSingle();
  await logHrdAction({
    action: 'mapping.copy', category: 'pemetaan',
    summary: `Menyalin ${saved} pemetaan dari periode "${srcP?.label ?? sourcePeriodId}" ke "${ap.label}"`,
    targetType: 'period', targetId: ap.id, meta: { source: sourcePeriodId, saved, total: src.length },
  });
  revalidatePath('/admin/pemetaan');
  revalidatePath('/penilaian');
  revalidatePath('/', 'layout'); // segarkan notifikasi sidebar (getTodos)
  return { ok: true, saved, skipped: src.length - saved };
}

/**
 * Info pra-hapus pemetaan (untuk dialog konfirmasi): nama pasangan, relasi, dan
 * apakah pasangan ini sudah punya penilaian 360° (draf/terkirim) di periode pemetaan.
 */
export async function mappingDeleteInfo(mappingId: string): Promise<
  { ok: true; assessor: string; target: string; relation: string; hasAssessment: boolean; submitted: boolean }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data: m } = await supabase.from('mappings')
    .select('assessor_id, target_id, period_id, relation').eq('id', mappingId).maybeSingle();
  if (!m) return { ok: false, error: 'Pemetaan tidak ditemukan' };
  const { data: emps } = await supabase.from('employees').select('id, name').in('id', [m.assessor_id, m.target_id]);
  const nameById = new Map((emps ?? []).map((e) => [e.id, e.name]));
  const { data: asmts } = await supabase.from('assessments')
    .select('status').eq('period_id', m.period_id).eq('assessor_id', m.assessor_id).eq('target_id', m.target_id);
  return {
    ok: true,
    assessor: nameById.get(m.assessor_id) ?? '—',
    target: nameById.get(m.target_id) ?? '—',
    relation: m.relation,
    hasAssessment: !!asmts && asmts.length > 0,
    submitted: (asmts ?? []).some((a) => a.status === 'submitted'),
  };
}

export async function deleteMapping(mappingId: string): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  // Ambil pasangan + periode pemetaan SEBELUM dihapus (untuk hapus penilaian yang sama).
  const { data: m } = await supabase.from('mappings')
    .select('assessor_id, target_id, period_id').eq('id', mappingId).maybeSingle();

  const { error } = await supabase.from('mappings').delete().eq('id', mappingId);
  if (error) return { ok: false, error: 'Gagal menghapus: ' + error.message };

  // Hapus penilaian 360° pasangan ini HANYA DI PERIODE PEMETAAN (anak-anaknya cascade
  // via FK). Periode lain (mis. kuartal sebelumnya) tak tersentuh — beda period_id.
  // Pakai service_role karena RLS tak memberi HRD hapus penilaian milik penilai lain.
  let removedAssessment = false;
  if (m) {
    const admin = createAdminClient();
    const { data: asmts } = await admin.from('assessments').select('id')
      .eq('period_id', m.period_id).eq('assessor_id', m.assessor_id).eq('target_id', m.target_id);
    if (asmts && asmts.length) {
      const { error: delErr } = await admin.from('assessments').delete()
        .eq('period_id', m.period_id).eq('assessor_id', m.assessor_id).eq('target_id', m.target_id);
      if (delErr) return { ok: false, error: 'Pemetaan terhapus tapi gagal hapus penilaian: ' + delErr.message };
      removedAssessment = true;
    }

    // Rekonsiliasi skor 360° target — SELALU dijalankan tiap pemetaan dihapus, terlepas
    // dari apakah langkah ini yang menghapus penilaiannya (penilaian bisa sudah hilang lebih
    // dulu, mis. via skrip reset → blok di atas terlewat). Sinyal "perlu hitung ulang" TIDAK
    // mendeteksi penghapusan, jadi lakukan manual:
    //   target tak punya penilaian submitted → buang result_360 (tak ada yg dihitung);
    //   masih punya → hitung ulang agar skor mencerminkan penilai yang tersisa.
    const { count: remaining } = await admin.from('assessments').select('*', { count: 'exact', head: true })
      .eq('period_id', m.period_id).eq('target_id', m.target_id).eq('status', 'submitted');
    if ((remaining ?? 0) === 0) {
      await admin.from('result_360').delete().eq('period_id', m.period_id).eq('employee_id', m.target_id);
    } else {
      await computeResult360(); // best-effort; upsert ulang skor target yang masih punya penilaian
    }
  }

  await logHrdAction({
    action: 'mapping.delete', category: 'pemetaan',
    summary: removedAssessment
      ? 'Menghapus pemetaan penilai→target + penilaian 360°-nya (periode pemetaan)'
      : 'Menghapus satu pemetaan penilai→target',
    targetType: 'mapping', targetId: mappingId,
  });
  revalidatePath('/admin/pemetaan');
  revalidatePath('/penilaian');
  revalidatePath('/admin/laporan');
  revalidatePath('/', 'layout'); // segarkan notifikasi sidebar (getTodos) — jumlah penilaian berubah
  return { ok: true };
}

/**
 * Tinjau permohonan koreksi relasi (HRD). Setuju → perbarui relasi mapping terkait
 * ke new_relation + tandai approved; Tolak → tandai rejected. RLS corr_review = HRD.
 */
export async function reviewCorrection(requestId: string, decision: 'approved' | 'rejected'): Promise<Result> {
  if (decision !== 'approved' && decision !== 'rejected') return { ok: false, error: 'Keputusan tidak valid' };
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data: { user } } = await supabase.auth.getUser();

  const { data: req } = await supabase
    .from('relation_correction_requests')
    .select('id, mapping_id, assessor_id, target_id, period_id, new_relation, status')
    .eq('id', requestId).maybeSingle();
  if (!req) return { ok: false, error: 'Permohonan tidak ditemukan' };
  if (req.status !== 'pending') return { ok: false, error: 'Permohonan sudah diproses' };

  if (decision === 'approved' && req.new_relation) {
    // Perbarui relasi mapping (berdasarkan mapping_id, atau pasangan penilai→target).
    const q = supabase.from('mappings').update({ relation: req.new_relation });
    const upd = req.mapping_id
      ? await q.eq('id', req.mapping_id)
      : await q.eq('assessor_id', req.assessor_id).eq('target_id', req.target_id).eq('period_id', req.period_id);
    if (upd.error) return { ok: false, error: 'Gagal memperbarui mapping: ' + upd.error.message };
  }

  const { error } = await supabase.from('relation_correction_requests')
    .update({ status: decision, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() }).eq('id', requestId);
  if (error) return { ok: false, error: 'Gagal: ' + error.message };

  await logHrdAction({
    action: 'correction.review', category: 'pemetaan',
    summary: `${decision === 'approved' ? 'Menyetujui' : 'Menolak'} permohonan koreksi garis hubungan`,
    targetType: 'correction_request', targetId: requestId,
    meta: { decision, new_relation: req.new_relation ?? null },
  });
  revalidatePath('/admin/pemetaan');
  revalidatePath('/penilaian');
  revalidatePath(`/laporan/${req.target_id}`); // perbarui peringatan "skor 360° basi"
  return { ok: true };
}
