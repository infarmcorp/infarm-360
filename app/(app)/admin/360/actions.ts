'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
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

/**
 * Ambil SEMUA baris query ber-filter, menembus batas default PostgREST **1000 baris/request**
 * (`db.max_rows`). WAJIB untuk perhitungan skor: data terpotong = skor 360° salah diam-diam.
 * `run` harus menyertakan `.order(...)` deterministik agar paginasi antar-halaman tak bocor/dobel.
 */
async function fetchAllPaged<T>(run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error(typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : 'query gagal');
    if (data?.length) out.push(...data);
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/**
 * Ambil SEMUA baris tabel anak yang difilter `.in(col, ids)`: **chunk ids** (cegah URL `.in()`
 * kepanjangan ~16KB) + **paginasi baris** (batas 1000/request). Lihat fetchAllPaged.
 */
async function fetchAllByIds<T>(ids: string[], run: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const CHUNK = 150;
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    out.push(...await fetchAllPaged((from, to) => run(chunk, from, to)));
  }
  return out;
}

export async function computeResult360(): Promise<ComputeResult> {
  // 1) Otorisasi: harus HRD.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) return { ok: false, error: 'Hanya HRD yang dapat menghitung skor 360' };

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

  // Assessment terkirim + skornya + relasi mapping. SEMUA query DIPAGINASI: batas default
  // PostgREST 1000 baris/request; tanpa ini data rating terpotong → skor 360° SALAH diam-diam.
  let asmts: { id: string; assessor_id: string; target_id: string }[];
  let scores: { assessment_id: string; rating: number | null }[];
  let maps: { assessor_id: string; target_id: string; relation: RelationKind }[];
  try {
    asmts = await fetchAllPaged<{ id: string; assessor_id: string; target_id: string }>((from, to) =>
      admin.from('assessments').select('id, assessor_id, target_id')
        .eq('period_id', ap.id).eq('status', 'submitted')
        .order('id').range(from, to));
    if (asmts.length === 0) {
      return { ok: false, error: 'Belum ada penilaian terkirim untuk dihitung' };
    }
    scores = await fetchAllByIds<{ assessment_id: string; rating: number | null }>(asmts.map((a) => a.id), (chunk, from, to) =>
      admin.from('assessment_indicator_scores').select('assessment_id, rating')
        .in('assessment_id', chunk).order('assessment_id').order('indicator_id').range(from, to));
    maps = await fetchAllPaged<{ assessor_id: string; target_id: string; relation: RelationKind }>((from, to) =>
      admin.from('mappings').select('assessor_id, target_id, relation')
        .eq('period_id', ap.id).order('assessor_id').order('target_id').range(from, to));
  } catch (e) {
    return { ok: false, error: 'Gagal membaca data penilaian: ' + (e instanceof Error ? e.message : String(e)) };
  }

  const ratingsByAsmt = new Map<string, number[]>();
  scores.forEach((s) => {
    if (s.rating == null) return;
    const arr = ratingsByAsmt.get(s.assessment_id) ?? [];
    arr.push(s.rating);
    ratingsByAsmt.set(s.assessment_id, arr);
  });

  const relByPair = new Map<string, RelationKind>();
  maps.forEach((m) => relByPair.set(`${m.assessor_id}:${m.target_id}`, m.relation));

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
  // computed_at di-set eksplisit agar UPDATE (upsert) ikut memperbarui stempel waktu —
  // dipakai mendeteksi "skor basi" bila penilaian diubah setelah hitung ulang terakhir.
  const computedAt = new Date().toISOString();
  const rows: { employee_id: string; period_id: string; score: number; computed_at: string }[] = [];
  for (const [targetId, g] of byTarget) {
    const score = weightedScore360(g, ws.model, weights);
    if (score != null) rows.push({ employee_id: targetId, period_id: ap.id, score: round1(score), computed_at: computedAt });
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
  revalidatePath('/admin/laporan');
  return { ok: true, computed: rows.length, periodLabel: ap.label };
}
