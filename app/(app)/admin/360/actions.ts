'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import type { RelationKind, WeightValues } from '@/lib/database.types';

/**
 * Kalkulasi skor 360 terbobot → tabel result_360 (PANDUAN: kalibrasi skor).
 *
 * Keamanan (inti aplikasi):
 *  - Hanya HRD yang boleh memicu (verifikasi peran via client ber-sesi).
 *  - Penulisan result_360 lewat service_role (RLS sengaja TIDAK memberi tulis ke client).
 *  - Rumus mengikuti SPA legacy getScore360ForQuarter: rata-rata rating per penilai ×20,
 *    dikelompokkan per kelas (Atasan/Peer/Cross/Self), Self DIKECUALIKAN dari total,
 *    lalu dibobot sesuai weight_scheme aktif (4class / 2class).
 */
const classOf = (rel: RelationKind): 'atasan' | 'peer' | 'cross' | 'self' => {
  if (rel === 'Atasan') return 'atasan';
  if (rel === 'Cross') return 'cross';
  if (rel === 'Self') return 'self';
  return 'peer'; // Peer, Bawahan
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (n: number) => Math.round(n * 10) / 10;

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
  type Groups = { atasan: number[]; peer: number[]; cross: number[]; self: number[] };
  const byTarget = new Map<string, Groups>();
  for (const a of asmts) {
    const rs = ratingsByAsmt.get(a.id);
    const m = rs && avg(rs);
    if (!m) continue;
    const score100 = m * 20;
    if (score100 <= 0) continue;
    const rel: RelationKind =
      a.assessor_id === a.target_id ? 'Self' : relByPair.get(`${a.assessor_id}:${a.target_id}`) ?? 'Peer';
    const cls = classOf(rel);
    const g = byTarget.get(a.target_id) ?? { atasan: [], peer: [], cross: [], self: [] };
    g[cls].push(score100);
    byTarget.set(a.target_id, g);
  }

  // Hitung skor terbobot per target.
  const rows: { employee_id: string; period_id: string; score: number }[] = [];
  for (const [targetId, g] of byTarget) {
    const aAvg = avg(g.atasan), pAvg = avg(g.peer), cAvg = avg(g.cross);
    let score: number | null = null;

    if (ws.model === '4class') {
      const parts: [number | null, number][] = [
        [aAvg, weights.atasan ?? 0],
        [pAvg, weights.peer ?? 0],
        [cAvg, weights.cross ?? 0],
        // self DIKECUALIKAN dari total resmi
      ];
      let wSum = 0, tW = 0;
      for (const [val, w] of parts) if (val != null) { wSum += val * w; tW += w; }
      if (tW > 0) score = wSum / tW;
    } else {
      // 2class: Atasan vs Internal (peer+cross)
      const internal = avg([...g.peer, ...g.cross]);
      const wA = weights.atasan ?? 0, wI = weights.internal ?? 0;
      if (aAvg != null && internal != null && wA + wI > 0) score = (aAvg * wA + internal * wI) / (wA + wI);
      else if (aAvg != null) score = aAvg;
      else if (internal != null) score = internal;
    }
    if (score != null) rows.push({ employee_id: targetId, period_id: ap.id, score: round1(score) });
  }

  if (rows.length === 0) return { ok: false, error: 'Tidak ada skor yang dapat dihitung' };

  const { error } = await admin.from('result_360').upsert(rows, { onConflict: 'employee_id,period_id' });
  if (error) return { ok: false, error: 'Gagal menulis result_360: ' + error.message };

  revalidatePath('/admin/360');
  return { ok: true, computed: rows.length, periodLabel: ap.label };
}
