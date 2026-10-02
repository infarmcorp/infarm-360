'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { logHrdAction } from '@/lib/audit/log';
import { computeResult360 } from '@/app/(app)/admin/360/actions';
import { isBackfilledPeriod } from '@/lib/backfill-guard';

/**
 * Pemetaan (Mapping) penilai→target untuk periode aktif (HRD).
 * Menentukan "Daftar Penilaian Saya" tiap pegawai + relasi (kelas bobot) + sifat
 * Wajib/Opsional (dasar Flag Kepatuhan). RLS map_write = HRD.
 */
async function requireHrd(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!canSection(me, 'pemetaan')) return { ok: false as const, error: 'Hanya HRD yang dapat mengelola pemetaan' };
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
  // BR-02 (Q3 2026): Self Assessment DINONAKTIFKAN — tidak boleh membuat pemetaan
  // penilai=target maupun relasi 'Self'. 'Self' tetap ada di enum untuk kompatibilitas
  // baca data historis (periode lama), bukan untuk dibuat baru.
  if (relation === 'Self') {
    return { ok: false, error: 'Self Assessment dinonaktifkan untuk periode ini' };
  }
  if (assessorId === targetId) {
    return { ok: false, error: 'Penilai = target tidak diperbolehkan (Self Assessment dinonaktifkan)' };
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
    // BR-02 (Q3 2026): Self Assessment dinonaktifkan — buang penilai=target & relasi 'Self'.
    .filter((r) => r.relation !== 'Self' && r.assessorId !== r.targetId)
    .filter((r) => !externalIds.has(r.targetId))
    .filter((r) => !inactiveIds.has(r.assessorId) && !inactiveIds.has(r.targetId));
  if (rows.length === 0) return { ok: false, error: 'Tidak ada baris valid (Self Assessment dinonaktifkan; eksternal tak boleh jadi target; pegawai nonaktif dilewati)' };

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

/** Status penilaian satu pasangan pemetaan (Screen 07). 'none' = Belum Mulai. */
export type PairStatus = 'none' | 'draft' | 'submitted' | 'invalidated';

/**
 * Info pra-tindakan pemetaan (untuk dialog Screen 07): nama pasangan, relasi, status penilaian
 * (Belum Mulai / Draft / Terkirim / Dibatalkan) + data pembatalan bila ada.
 */
export async function mappingDeleteInfo(mappingId: string): Promise<
  { ok: true; assessor: string; target: string; relation: string; status: PairStatus; invalidReason: string | null; invalidatedAt: string | null }
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
  const { data: a } = await createAdminClient().from('assessments')
    .select('status, invalid_reason, invalidated_at').eq('period_id', m.period_id).eq('assessor_id', m.assessor_id).eq('target_id', m.target_id).maybeSingle();
  return {
    ok: true,
    assessor: nameById.get(m.assessor_id) ?? '—',
    target: nameById.get(m.target_id) ?? '—',
    relation: m.relation,
    status: (a?.status ?? 'none') as PairStatus,
    invalidReason: a?.invalid_reason ?? null,
    invalidatedAt: a?.invalidated_at ?? null,
  };
}

const Reason = z.string().trim().min(5, 'Alasan minimal 5 karakter').max(300, 'Alasan maksimal 300 karakter');

/**
 * Rekonsiliasi Skor 360° target setelah pemetaan/penilaiannya berubah: tanpa penilaian terkirim
 * tersisa → buang result_360 (tak ada yang dihitung); masih ada → hitung ulang (best-effort).
 * Sinyal "perlu hitung ulang" TIDAK mendeteksi penghapusan/pembatalan, jadi dilakukan di sini.
 */
async function reconcileTarget360(periodId: string, targetId: string) {
  const admin = createAdminClient();
  if (await isBackfilledPeriod(admin, periodId)) return; // skor impor Looker: jangan disentuh
  const { count: remaining } = await admin.from('assessments').select('*', { count: 'exact', head: true })
    .eq('period_id', periodId).eq('target_id', targetId).eq('status', 'submitted');
  if ((remaining ?? 0) === 0) {
    await admin.from('result_360').delete().eq('period_id', periodId).eq('employee_id', targetId);
  } else {
    await computeResult360();
  }
}

/**
 * Hapus pemetaan (Screen 07, Decision 09): HANYA untuk status Belum Mulai / Draft, ALASAN WAJIB.
 * Penilaian TERKIRIM tak bisa dihapus — HRD memakai "Batalkan Validitas" (arsip tetap tersimpan).
 */
export async function deleteMapping(mappingId: string, rawReason: string): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const reason = Reason.safeParse(rawReason ?? '');
  if (!reason.success) return { ok: false, error: reason.error.issues[0]?.message ?? 'Alasan penghapusan wajib diisi' };

  // Ambil pasangan + periode pemetaan SEBELUM dihapus (untuk hapus penilaian yang sama).
  const { data: m } = await supabase.from('mappings')
    .select('assessor_id, target_id, period_id').eq('id', mappingId).maybeSingle();
  if (m) {
    const { data: cur } = await createAdminClient().from('assessments').select('status')
      .eq('period_id', m.period_id).eq('assessor_id', m.assessor_id).eq('target_id', m.target_id).maybeSingle();
    if (cur?.status === 'submitted') return { ok: false, error: 'Penilaian sudah terkirim — tidak dapat dihapus. Gunakan "Batalkan Validitas".' };
    if (cur?.status === 'invalidated') return { ok: false, error: 'Penilaian ini sudah dibatalkan validitasnya — disimpan sebagai arsip, tidak dapat dihapus.' };
  }

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

    // Rekonsiliasi skor 360° target — SELALU dijalankan tiap pemetaan dihapus, terlepas dari apakah
    // langkah ini yang menghapus penilaiannya (penilaian bisa sudah hilang lebih dulu, mis. via skrip reset).
    await reconcileTarget360(m.period_id, m.target_id);
  }

  await logHrdAction({
    action: 'mapping.delete', category: 'pemetaan',
    summary: removedAssessment
      ? 'Menghapus pemetaan penilai→target + draf penilaian 360°-nya (periode pemetaan)'
      : 'Menghapus satu pemetaan penilai→target',
    targetType: 'mapping', targetId: mappingId,
    meta: { reason: reason.data, status_before: removedAssessment ? 'draft' : 'none' },
  });
  revalidatePath('/admin/pemetaan');
  revalidatePath('/penilaian');
  revalidatePath('/admin/laporan');
  revalidatePath('/', 'layout'); // segarkan notifikasi sidebar (getTodos) — jumlah penilaian berubah
  return { ok: true };
}

/**
 * BATALKAN VALIDITAS penilaian TERKIRIM (Screen 06/07, migrasi 0046) — pengganti hapus untuk status
 * Terkirim. Status → 'invalidated' (keluar dari SEMUA hitungan skor yang memakai status 'submitted'),
 * jawaban & evidence tetap tersimpan sebagai arsip, kewajiban rater gugur (tak ditagih / tak kena
 * potongan telat). Alasan wajib; dicatat di Log Aktivitas. Ditulis via service_role.
 */
export async function setAssessmentValidity(mappingId: string, action: 'invalidate' | 'restore', rawReason: string): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const reason = Reason.safeParse(rawReason ?? '');
  if (!reason.success) return { ok: false, error: reason.error.issues[0]?.message ?? 'Alasan wajib diisi' };

  const admin = createAdminClient();
  const { data: m } = await admin.from('mappings').select('assessor_id, target_id, period_id').eq('id', mappingId).maybeSingle();
  if (!m) return { ok: false, error: 'Pemetaan tidak ditemukan' };
  const { data: per } = await admin.from('periods').select('status').eq('id', m.period_id).maybeSingle();
  if (per?.status !== 'active') return { ok: false, error: 'Hanya penilaian pada periode aktif yang dapat diubah validitasnya' };
  const { data: a } = await admin.from('assessments').select('id, status')
    .eq('period_id', m.period_id).eq('assessor_id', m.assessor_id).eq('target_id', m.target_id).maybeSingle();

  if (action === 'invalidate') {
    if (a?.status !== 'submitted') return { ok: false, error: 'Hanya penilaian berstatus Terkirim yang dapat dibatalkan validitasnya' };
    const { error } = await admin.from('assessments').update({
      status: 'invalidated', invalidated_at: new Date().toISOString(), invalidated_by: user.id, invalid_reason: reason.data,
    }).eq('id', a.id);
    if (error) return { ok: false, error: 'Gagal membatalkan validitas: ' + error.message };
  } else {
    if (a?.status !== 'invalidated') return { ok: false, error: 'Penilaian ini tidak dalam status dibatalkan' };
    const { error } = await admin.from('assessments').update({
      status: 'submitted', invalidated_at: null, invalidated_by: null, invalid_reason: null,
    }).eq('id', a.id);
    if (error) return { ok: false, error: 'Gagal memulihkan validitas: ' + error.message };
  }

  await reconcileTarget360(m.period_id, m.target_id);
  const { data: emps } = await admin.from('employees').select('id, name').in('id', [m.assessor_id, m.target_id]);
  const nm = new Map((emps ?? []).map((e) => [e.id, e.name]));
  await logHrdAction({
    action: action === 'invalidate' ? 'assessment.invalidate' : 'assessment.restore', category: 'pemetaan',
    summary: `${action === 'invalidate' ? 'Membatalkan' : 'Memulihkan'} validitas penilaian ${nm.get(m.assessor_id) ?? '—'} → ${nm.get(m.target_id) ?? '—'}`,
    targetType: 'mapping', targetId: mappingId,
    meta: { reason: reason.data },
  });
  revalidatePath('/admin/pemetaan');
  revalidatePath('/admin/progress');
  revalidatePath('/penilaian');
  revalidatePath('/admin/laporan');
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Tinjau permohonan pemetaan (HRD) — SATU pintu untuk tiga jenis (migrasi 0035):
 *   relation → ubah relasi mapping yang ada (perilaku lama)
 *   remove   → nonaktifkan mapping (is_active=false), bukan DELETE: jejak & skor
 *              yang sudah terlanjur masuk tak ikut hilang, dan `deleteMapping`
 *              punya rekonsiliasi result_360 tersendiri yang tak ingin ditiru di sini
 *   add      → buat mapping baru dengan relasi yang DIUSULKAN pegawai
 *
 * Menolak WAJIB disertai alasan — pemohon melihatnya di "Permohonan Saya", supaya
 * penolakan tak terasa sepihak (permintaan pengguna 2026-08).
 */
export async function reviewCorrection(
  requestId: string, decision: 'approved' | 'rejected', rawRejectReason?: string,
): Promise<Result> {
  if (decision !== 'approved' && decision !== 'rejected') return { ok: false, error: 'Keputusan tidak valid' };

  let rejectReason: string | null = null;
  if (decision === 'rejected') {
    const parsed = z.string().trim().min(5, 'Alasan penolakan minimal 5 karakter').max(500).safeParse(rawRejectReason ?? '');
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    rejectReason = parsed.data;
  }

  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data: { user } } = await supabase.auth.getUser();

  const { data: req } = await supabase
    .from('relation_correction_requests')
    .select('id, kind, mapping_id, assessor_id, target_id, period_id, new_relation, status')
    .eq('id', requestId).maybeSingle();
  if (!req) return { ok: false, error: 'Permohonan tidak ditemukan' };
  if (req.status !== 'pending') return { ok: false, error: 'Permohonan sudah diproses' };

  const kind = req.kind ?? 'relation';

  if (decision === 'approved') {
    // Audit 2026-09-30: pemetaan yang diubah SELALU dicari dari pasangan penilai→target yang
    // TERTULIS di permohonan (yang dilihat HRD), bukan dari mapping_id kiriman pemohon — mapping_id
    // bisa diisi lewat API dengan pemetaan pasangan LAIN. Aturan pengajuan juga divalidasi ulang.
    const { data: period } = await supabase.from('periods').select('status').eq('id', req.period_id).maybeSingle();
    if (period?.status !== 'active') return { ok: false, error: 'Periode permohonan ini sudah tidak aktif — tolak permohonan ini' };
    if (req.new_relation === 'Self' || (kind !== 'remove' && req.assessor_id === req.target_id)) {
      return { ok: false, error: 'Permohonan tidak sah (menilai diri sendiri diatur HRD lewat pemetaan) — tolak permohonan ini' };
    }
    const { data: pairMap } = await supabase.from('mappings').select('id, relation, is_active, mandatory, is_adhoc')
      .eq('period_id', req.period_id).eq('assessor_id', req.assessor_id).eq('target_id', req.target_id).maybeSingle();

    if (kind === 'relation') {
      if (!pairMap?.is_active) return { ok: false, error: 'Pemetaan pasangan ini sudah tidak aktif — tolak permohonan ini' };
      if (pairMap.relation === 'Self') return { ok: false, error: 'Relasi Self tidak dapat dikoreksi lewat permohonan' };
      if (req.new_relation) {
        const upd = await supabase.from('mappings').update({ relation: req.new_relation }).eq('id', pairMap.id);
        if (upd.error) return { ok: false, error: 'Gagal memperbarui mapping: ' + upd.error.message };
      }
    } else if (kind === 'remove') {
      if (!pairMap?.is_active) return { ok: false, error: 'Pemetaan pasangan ini sudah tidak aktif — tolak permohonan ini' };
      // Tolak bila penilaiannya SUDAH dikirim — menonaktifkan pemetaan setelah itu
      // mengubah komposisi penilai & skor 360° yang sudah terbentuk.
      const admin = createAdminClient();
      const { data: asmt } = await admin.from('assessments').select('id, status')
        .eq('period_id', req.period_id).eq('assessor_id', req.assessor_id).eq('target_id', req.target_id).maybeSingle();
      if (asmt?.status === 'submitted') {
        return { ok: false, error: 'Penilaian untuk pasangan ini sudah dikirim — pemetaan tak dapat dihapus. Tolak permohonan ini; bila rater memang tidak layak menilai, gunakan "Periksa Validitas" di daftar Pemetaan.' };
      }
      if (asmt?.status === 'invalidated') {
        return { ok: false, error: 'Penilaian pasangan ini sudah dibatalkan validitasnya — tolak permohonan ini.' };
      }
      const upd = await supabase.from('mappings').update({ is_active: false }).eq('id', pairMap.id);
      if (upd.error) return { ok: false, error: 'Gagal menonaktifkan pemetaan: ' + upd.error.message };
      if (asmt) await admin.from('assessments').delete().eq('id', asmt.id); // draf ikut dibuang
    } else if (kind === 'add') {
      if (!req.new_relation) return { ok: false, error: 'Permohonan tanpa hubungan kerja — tak dapat disetujui' };
      // Aturan sama dengan saat pegawai mengajukan (request-actions.ts) — dicek ulang di sini karena
      // baris permohonan bisa disisipkan lewat API tanpa melewati validasi itu.
      const { data: tgt } = await supabase.from('employees').select('role, is_external, is_active').eq('id', req.target_id).maybeSingle();
      if (!tgt?.is_active) return { ok: false, error: 'Pegawai yang akan dinilai tidak aktif — tolak permohonan ini' };
      if (tgt.role === 'direksi') return { ok: false, error: 'Direksi tidak dinilai lewat jalur permohonan — tolak permohonan ini' };
      if (tgt.is_external) return { ok: false, error: 'Pegawai eksternal tidak dapat dinilai — tolak permohonan ini' };
      // Sudah ada mapping (mis. HRD menambah manual sebelum menyetujui, atau baris Ad-Hoc lama
      // yang dinonaktifkan) → aktifkan & selaraskan.
      const existing = pairMap;
      // OPSIONAL + BUKAN ad-hoc (kebijakan 2026-09-29): penilaian atas inisiatif pegawai yang
      // disetujui HRD tampil di Kelola Pemetaan & Progress 360. Ia TETAP ikut
      // potongan keterlambatan bila tak dituntaskan sebelum deadline ("ajuan", lib/late-server —
      // dikenali dari permohonan kind='add' yang disetujui, 2026-09-29). Pengecualian: bila HRD sudah lebih dulu
      // menugaskan pasangan ini sebagai Wajib (baris aktif non-ad-hoc), sifat Wajib-nya dipertahankan
      // — persetujuan tak boleh menurunkan penugasan HRD.
      const keepMandatory = !!(existing?.is_active && !existing.is_adhoc && existing.mandatory);
      const fields = { relation: req.new_relation, mandatory: keepMandatory, is_adhoc: false, is_active: true };
      const res = existing
        ? await supabase.from('mappings').update(fields).eq('id', existing.id)
        : await supabase.from('mappings').insert({
            period_id: req.period_id, assessor_id: req.assessor_id, target_id: req.target_id, ...fields,
          });
      if (res.error) return { ok: false, error: 'Gagal membuat pemetaan: ' + res.error.message };
    }
  }

  const { error } = await supabase.from('relation_correction_requests')
    .update({
      status: decision, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString(),
      reject_reason: rejectReason,
    }).eq('id', requestId);
  if (error) return { ok: false, error: 'Gagal: ' + error.message };

  const KIND_LABEL: Record<string, string> = {
    relation: 'koreksi garis hubungan', remove: 'penghapusan pemetaan', add: 'penambahan penilaian',
  };
  await logHrdAction({
    action: 'correction.review', category: 'pemetaan',
    summary: `${decision === 'approved' ? 'Menyetujui' : 'Menolak'} permohonan ${KIND_LABEL[kind] ?? kind}`,
    targetType: 'correction_request', targetId: requestId,
    meta: { decision, kind, new_relation: req.new_relation ?? null, reject_reason: rejectReason },
  });
  revalidatePath('/admin/pemetaan');
  revalidatePath('/penilaian');
  revalidatePath(`/laporan/${req.target_id}`); // perbarui peringatan "skor 360° basi"
  return { ok: true };
}
