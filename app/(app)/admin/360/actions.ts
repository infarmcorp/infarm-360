'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';
import type { RelationKind, WeightValues } from '@/lib/database.types';
import { classOf, avg, round1, weightedScore360, type Groups360 } from '@/lib/score360';

/**
 * Kalkulasi skor 360 terbobot → tabel result_360 (PANDUAN: kalibrasi skor).
 *
 * Keamanan (inti aplikasi):
 *  - Hanya HRD yang boleh memicu (verifikasi peran via client ber-sesi).
 *  - Penulisan result_360 lewat service_role (RLS sengaja TIDAK memberi tulis ke client).
 *  - Rumus murni (rata-rata ×20, pembobotan per kelas, Self dikecualikan) ada di
 *    `lib/score360.ts` agar bisa diuji unit; di sini hanya I/O DB + otorisasi.
 */
export type ComputeResult = { ok: true; computed: number; periodLabel: string } | { ok: false; error: string };

export async function computeResult360(): Promise<ComputeResult> {
  // 1) Otorisasi: harus HRD.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') return { ok: false, error: 'Hanya HRD yang dapat menghitung skor 360' };

  // 2) Komputasi pakai service_role (baca semua + tulis result_360).
  const admin = createAdminClient();

  const { data: ap } = await admin
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { data: ws } = await admin
    .from('weight_schemes').select('model, weights')
    .eq('period_id', ap.id).eq('is_active', true).maybeSingle();
  if (!ws) return { ok: false, error: 'Belum ada skema bobot aktif untuk periode ini' };
  const weights = ws.weights as WeightValues;

  // Assessment terkirim + skornya + relasi mapping.
  const { data: asmts } = await admin
    .from('assessments').select('id, assessor_id, target_id')
    .eq('period_id', ap.id).eq('status', 'submitted');
  if (!asmts || asmts.length === 0) {
    return { ok: false, error: 'Belum ada penilaian terkirim untuk dihitung' };
  }

  const { data: scores } = await admin
    .from('assessment_indicator_scores').select('assessment_id, rating')
    .in('assessment_id', asmts.map((a) => a.id));
  const ratingsByAsmt = new Map<string, number[]>();
  (scores ?? []).forEach((s) => {
    if (s.rating == null) return;
    const arr = ratingsByAsmt.get(s.assessment_id) ?? [];
    arr.push(s.rating);
    ratingsByAsmt.set(s.assessment_id, arr);
  });

  const { data: maps } = await admin
    .from('mappings').select('assessor_id, target_id, relation').eq('period_id', ap.id);
  const relByPair = new Map<string, RelationKind>();
  (maps ?? []).forEach((m) => relByPair.set(`${m.assessor_id}:${m.target_id}`, m.relation));

  // Kelompokkan skor (×20) per target per kelas.
  const byTarget = new Map<string, Groups360>();
  for (const a of asmts) {
    const rs = ratingsByAsmt.get(a.id);
    const m = rs && avg(rs);
    if (!m) continue;
    const score100 = m * 20;
    if (score100 <= 0) continue;
    const rel: RelationKind =
      a.assessor_id === a.target_id ? 'Self' : relByPair.get(`${a.assessor_id}:${a.target_id}`) ?? 'Peer';
    const cls = classOf(rel);
    const g = byTarget.get(a.target_id) ?? { atasan: [], peer: [], cross: [], bawahan: [], self: [] };
    g[cls].push(score100);
    byTarget.set(a.target_id, g);
  }

  // Hitung skor terbobot per target (rumus murni di lib/score360.ts).
  const rows: { employee_id: string; period_id: string; score: number }[] = [];
  for (const [targetId, g] of byTarget) {
    const score = weightedScore360(g, ws.model, weights);
    if (score != null) rows.push({ employee_id: targetId, period_id: ap.id, score: round1(score) });
  }

  if (rows.length === 0) return { ok: false, error: 'Tidak ada skor yang dapat dihitung' };

  const { error } = await admin.from('result_360').upsert(rows, { onConflict: 'employee_id,period_id' });
  if (error) return { ok: false, error: 'Gagal menulis result_360: ' + error.message };

  await logHrdAction({
    action: 'score360.recompute', category: 'skor',
    summary: `Menghitung ulang Skor 360° periode "${ap.label}" (${rows.length} pegawai, model ${ws.model === '4class' ? '4-Kelas' : '2-Kelas'})`,
    targetType: 'period', targetId: ap.id, targetLabel: ap.label, meta: { computed: rows.length, model: ws.model },
  });
  revalidatePath('/admin/bobot');
  revalidatePath('/admin/dashboard');
  return { ok: true, computed: rows.length, periodLabel: ap.label };
}
