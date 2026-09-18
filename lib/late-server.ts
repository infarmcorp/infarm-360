import { createAdminClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { isPenalizableLate, latePenaltyOf, apply360Penalty } from '@/lib/late';

/**
 * I/O keterlambatan penilaian 360° (migrasi 0036). Rumus murni ada di `lib/late.ts`.
 *
 * ⚠️ Memakai service_role: PEMANGGIL WAJIB sudah mengotorisasi (HRD / pemegang grant
 * berlingkup / server action milik penilai sendiri). Fungsi ini tak memeriksa peran.
 */

export type LateItem = { targetId: string; firstSubmittedAt: string };
export type LateSummary = {
  late: LateItem[];          // penilaian terlambat yang DIHITUNG (wajib, non-ad-hoc, non-paksa)
  waived: boolean;
  waiveReason: string | null;
  penalty: number;           // potongan yang berlaku (0 bila dikecualikan / tak terlambat)
};

/**
 * Ringkasan keterlambatan per PENILAI untuk satu periode. Hanya penilai yang punya
 * keterlambatan terhitung ATAU pengecualian yang masuk peta. Tanpa deadline → peta kosong
 * dari sisi keterlambatan (pengecualian tetap dimuat agar bisa ditampilkan/dicabut).
 */
export async function loadLateSummaries(periodId: string): Promise<{ deadline: string | null; byAssessor: Map<string, LateSummary> }> {
  const admin = createAdminClient();
  const { data: p } = await admin.from('periods').select('assessment_deadline').eq('id', periodId).maybeSingle();
  const deadline = p?.assessment_deadline ?? null;

  const { data: wv } = await admin.from('late_penalty_waivers').select('employee_id, reason').eq('period_id', periodId);
  const waiverBy = new Map((wv ?? []).map((w) => [w.employee_id, w.reason]));

  const byAssessor = new Map<string, LateSummary>();
  const get = (id: string): LateSummary => {
    let s = byAssessor.get(id);
    if (!s) {
      s = { late: [], waived: waiverBy.has(id), waiveReason: waiverBy.get(id) ?? null, penalty: 0 };
      byAssessor.set(id, s);
    }
    return s;
  };

  if (deadline) {
    // Hanya kiriman SESUDAH deadline yang mungkin terlambat → saring di DB agar ringan.
    const asmts = await fetchAllPaged<{ assessor_id: string; target_id: string; status: string; first_submitted_at: string | null; forced_by_hrd: boolean }>((from, to) =>
      admin.from('assessments').select('assessor_id, target_id, status, first_submitted_at, forced_by_hrd')
        .eq('period_id', periodId).eq('status', 'submitted').gt('first_submitted_at', deadline)
        .order('assessor_id').order('target_id').range(from, to));
    if (asmts.length) {
      const maps = await fetchAllPaged<{ assessor_id: string; target_id: string; mandatory: boolean; is_adhoc: boolean; created_at: string }>((from, to) =>
        admin.from('mappings').select('assessor_id, target_id, mandatory, is_adhoc, created_at')
          .eq('period_id', periodId).eq('is_active', true).order('assessor_id').order('target_id').range(from, to));
      const mapBy = new Map(maps.map((m) => [`${m.assessor_id}:${m.target_id}`, m]));
      for (const a of asmts) {
        const m = mapBy.get(`${a.assessor_id}:${a.target_id}`);
        if (!m) continue; // pemetaan dicabut/nonaktif → bukan tugas lagi
        const late = isPenalizableLate({
          firstSubmittedAt: a.first_submitted_at, status: a.status, forcedByHrd: a.forced_by_hrd,
          mandatory: m.mandatory, isAdhoc: m.is_adhoc, mappingCreatedAt: m.created_at,
        }, deadline);
        if (late) get(a.assessor_id).late.push({ targetId: a.target_id, firstSubmittedAt: a.first_submitted_at! });
      }
    }
  }
  for (const id of waiverBy.keys()) get(id);
  for (const s of byAssessor.values()) s.penalty = latePenaltyOf(s.late.length, s.waived);
  return { deadline, byAssessor };
}

/**
 * Terapkan ulang potongan keterlambatan ke result_360 yang SUDAH ada (tanpa menghitung ulang
 * rumus 360°): score = max(0, score_raw − penalty). Dipanggil saat deadline diubah, pengecualian
 * diberi/dicabut, atau penilai mengirim terlambat. `onlyIds` membatasi pegawai yang disentuh.
 * Pegawai tanpa baris result_360 → diabaikan (kebijakan: tak punya Skor 360° → potongan gugur).
 * Mengembalikan jumlah baris yang berubah.
 */
export async function refreshLatePenalties(periodId: string, onlyIds?: string[]): Promise<number> {
  const admin = createAdminClient();
  const { byAssessor } = await loadLateSummaries(periodId);
  let q = admin.from('result_360').select('employee_id, score, score_raw, late_penalty').eq('period_id', periodId);
  if (onlyIds) {
    if (onlyIds.length === 0) return 0;
    q = q.in('employee_id', onlyIds);
  }
  const rows = onlyIds
    ? ((await q).data ?? [])
    : await fetchAllPaged<{ employee_id: string; score: number | null; score_raw: number | null; late_penalty: number }>((from, to) =>
        admin.from('result_360').select('employee_id, score, score_raw, late_penalty').eq('period_id', periodId).order('employee_id').range(from, to));

  let changed = 0;
  for (const r of rows) {
    const raw = r.score_raw ?? r.score;
    const pen = byAssessor.get(r.employee_id)?.penalty ?? 0;
    const score = apply360Penalty(raw, pen);
    if (Number(r.late_penalty) === pen && r.score === score && r.score_raw === raw) continue;
    const { error } = await admin.from('result_360')
      .update({ score, score_raw: raw, late_penalty: pen })
      .eq('period_id', periodId).eq('employee_id', r.employee_id);
    if (error) throw new Error('Gagal memperbarui potongan 360°: ' + error.message);
    changed++;
  }
  return changed;
}
