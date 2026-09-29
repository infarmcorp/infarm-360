import { createAdminClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { isPenalizableLate, latePenaltyOf, apply360Penalty, ajuanPenaltyApplies } from '@/lib/late';

/**
 * I/O keterlambatan penilaian 360° (migrasi 0036). Rumus murni ada di `lib/late.ts`.
 * `byAssessor[x].late` sejak 2026-09-28 mencakup DUA jenis kewajiban "belum selesai saat
 * deadline": terkirim-telat (firstSubmittedAt terisi) DAN belum-pernah-dikirim sama sekali
 * (firstSubmittedAt null) — keduanya kena potongan yang SAMA (flat, bukan per item).
 *
 * ⚠️ Memakai service_role: PEMANGGIL WAJIB sudah mengotorisasi (HRD / pemegang grant
 * berlingkup / server action milik penilai sendiri). Fungsi ini tak memeriksa peran.
 */

// firstSubmittedAt null = belum pernah dikirim sama sekali (celah 2026-09-28: dulu hanya yang
// SUDAH kirim tapi telat yang terhitung; sekarang "belum selesai saat deadline" ikut terhitung).
// kind: 'wajib' = pemetaan Wajib; 'ajuan' = Opsional hasil PERMOHONAN pegawai yang disetujui HRD
// (ditampilkan terpisah agar HRD tahu potongan berasal dari ajuan yang tak dituntaskan).
export type LateItem = { targetId: string; firstSubmittedAt: string | null; kind: 'wajib' | 'ajuan' };
export type LateSummary = {
  late: LateItem[];          // penilaian terlambat yang DIHITUNG (wajib + ajuan, non-ad-hoc, non-paksa)
  /** HRD menetapkan nilai potongan sendiri (late_penalty_waivers). `override` 0 = dikecualikan. */
  waived: boolean;
  waiveReason: string | null;
  override: number | null;
  auto: number;              // potongan otomatis (tanpa campur tangan HRD)
  penalty: number;           // potongan yang BERLAKU (override bila ada, else otomatis)
};

/**
 * Ringkasan keterlambatan per PENILAI untuk satu periode. Hanya penilai yang punya
 * keterlambatan terhitung ATAU pengecualian yang masuk peta. Tanpa deadline → peta kosong
 * dari sisi keterlambatan (pengecualian tetap dimuat agar bisa ditampilkan/dicabut).
 */
export async function loadLateSummaries(periodId: string): Promise<{ deadline: string | null; byAssessor: Map<string, LateSummary> }> {
  const admin = createAdminClient();
  const { data: p } = await admin.from('periods').select('assessment_deadline, start_date').eq('id', periodId).maybeSingle();
  const deadline = p?.assessment_deadline ?? null;
  const ajuanCounts = ajuanPenaltyApplies(p?.start_date); // ajuan ikut potongan mulai Q3 2026

  // Nilai potongan yang ditetapkan HRD (kolom points, migrasi 0043). Sebelum 0043 diterapkan kolom
  // belum ada → baca tanpa points; baris yang ada = pengecualian penuh (0), perilaku lama.
  let wv: { employee_id: string; reason: string; points?: number | null }[] = [];
  {
    const withPts = await admin.from('late_penalty_waivers').select('employee_id, reason, points').eq('period_id', periodId);
    if (!withPts.error) wv = withPts.data ?? [];
    else {
      const plain = await admin.from('late_penalty_waivers').select('employee_id, reason').eq('period_id', periodId);
      if (plain.error) throw new Error('Gagal membaca pengaturan potongan: ' + plain.error.message);
      wv = plain.data ?? [];
    }
  }
  const waiverBy = new Map(wv.map((w) => [w.employee_id, { reason: w.reason, points: Number(w.points ?? 0) }]));

  const byAssessor = new Map<string, LateSummary>();
  const get = (id: string): LateSummary => {
    let s = byAssessor.get(id);
    if (!s) {
      const w = waiverBy.get(id);
      s = { late: [], waived: !!w, waiveReason: w?.reason ?? null, override: w ? w.points : null, auto: 0, penalty: 0 };
      byAssessor.set(id, s);
    }
    return s;
  };

  if (deadline) {
    const now = Date.now();
    // Kandidat kewajiban = pemetaan WAJIB + Opsional hasil AJUAN yang disetujui HRD (2026-09-29),
    // non-ad-hoc, aktif (bukan cuma yang sudah terkirim telat) — sejak 2026-09-28, penilai yang TAK
    // PERNAH mengirim sampai deadline juga kena potongan.
    const maps = await fetchAllPaged<{ assessor_id: string; target_id: string; mandatory: boolean; is_adhoc: boolean; created_at: string }>((from, to) =>
      admin.from('mappings').select('assessor_id, target_id, mandatory, is_adhoc, created_at')
        .eq('period_id', periodId).eq('is_active', true).eq('is_adhoc', false)
        .order('assessor_id').order('target_id').range(from, to));
    const requested = new Set<string>();
    if (ajuanCounts) {
      const { data: reqs, error: reqErr } = await admin.from('relation_correction_requests')
        .select('assessor_id, target_id').eq('period_id', periodId).eq('kind', 'add').eq('status', 'approved');
      if (reqErr) throw new Error('Gagal membaca permohonan penilaian: ' + reqErr.message);
      (reqs ?? []).forEach((r) => requested.add(`${r.assessor_id}:${r.target_id}`));
    }
    if (maps.length) {
      const asmts = await fetchAllPaged<{ assessor_id: string; target_id: string; status: string; first_submitted_at: string | null; forced_by_hrd: boolean }>((from, to) =>
        admin.from('assessments').select('assessor_id, target_id, status, first_submitted_at, forced_by_hrd')
          .eq('period_id', periodId).order('assessor_id').order('target_id').range(from, to));
      const asmtBy = new Map(asmts.map((a) => [`${a.assessor_id}:${a.target_id}`, a]));
      for (const m of maps) {
        const a = asmtBy.get(`${m.assessor_id}:${m.target_id}`);
        const late = isPenalizableLate({
          firstSubmittedAt: a?.first_submitted_at ?? null,
          status: a?.status ?? 'not_started', // belum ada baris assessments = belum disentuh sama sekali
          forcedByHrd: a?.forced_by_hrd ?? false,
          mandatory: m.mandatory, isAdhoc: m.is_adhoc, mappingCreatedAt: m.created_at,
          requested: !m.mandatory && requested.has(`${m.assessor_id}:${m.target_id}`),
        }, deadline, now);
        if (late) get(m.assessor_id).late.push({
          targetId: m.target_id, firstSubmittedAt: a?.first_submitted_at ?? null, kind: m.mandatory ? 'wajib' : 'ajuan',
        });
      }
    }
  }
  for (const id of waiverBy.keys()) get(id);
  for (const s of byAssessor.values()) {
    s.auto = latePenaltyOf(s.late.length);
    s.penalty = latePenaltyOf(s.late.length, s.override);
  }
  return { deadline, byAssessor };
}

/**
 * Pegawai yang potongan keterlambatannya BELUM diterapkan ke Skor 360° tersimpan: punya baris
 * result_360 tetapi `late_penalty` tersimpan ≠ potongan yang berlaku sekarang. Terjadi terutama
 * pada penilai yang TAK PERNAH mengirim — kondisinya berubah seiring waktu (deadline lewat) tanpa
 * ada aksi yang memicu penerapan, karena cron dinonaktifkan (audit 2026-09-29).
 * `byAssessor` boleh diberikan (hasil loadLateSummaries yang sudah dimuat) agar tak dimuat ulang.
 */
export async function loadPendingLatePenalties(
  periodId: string,
  byAssessor?: Map<string, LateSummary>,
): Promise<{ employeeId: string; stored: number; due: number }[]> {
  const admin = createAdminClient();
  const by = byAssessor ?? (await loadLateSummaries(periodId)).byAssessor;
  const rows = await fetchAllPaged<{ employee_id: string; late_penalty: number }>((from, to) =>
    admin.from('result_360').select('employee_id, late_penalty').eq('period_id', periodId).order('employee_id').range(from, to));
  return rows
    .map((r) => ({ employeeId: r.employee_id, stored: Number(r.late_penalty ?? 0), due: by.get(r.employee_id)?.penalty ?? 0 }))
    .filter((r) => r.stored !== r.due);
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
