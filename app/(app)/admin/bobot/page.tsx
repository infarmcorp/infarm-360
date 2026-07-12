import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import type { WeightValues, RelationKind } from '@/lib/database.types';
import { WeightForm } from './weight-form';
import { RecomputeButton } from '../360/recompute-button';
import { EmptyState } from '@/components/empty-state';
import { fetchAllByIds } from '@/lib/supabase/paginate';

/**
 * Kelola Bobot Penilai (HRD) — SATU halaman: skema bobot 360 + Hitung Ulang Skor 360°
 * + rekap result_360 + perbandingan model 4-Kelas vs 2-Kelas (preview dari penilaian
 * terkirim). Bobot menentukan kalkulasi, jadi semuanya menyatu di sini.
 */
const classOf = (rel: RelationKind): 'atasan' | 'peer' | 'cross' | 'bawahan' | 'self' => {
  if (rel === 'Atasan') return 'atasan';
  if (rel === 'Cross') return 'cross';
  if (rel === 'Bawahan') return 'bawahan';
  if (rel === 'Self') return 'self';
  return 'peer';
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (n: number) => Math.round(n * 10) / 10;

export default async function BobotPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin.</p></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return (
    <Shell>
      <EmptyState
        icon="⚖️"
        title="Belum ada periode aktif"
        description="Bobot penilai diatur per periode aktif. Aktifkan periode dulu, lalu tentukan skema bobotnya."
        actions={[{ label: 'Ke Kelola Periode', href: '/admin/periode', primary: true }]}
      />
    </Shell>
  );

  // Skema bobot aktif.
  const { data: ws } = await supabase
    .from('weight_schemes').select('model, weights').eq('period_id', ap.id).eq('is_active', true).maybeSingle();
  const w = (ws?.weights ?? {}) as WeightValues;
  const model = (ws?.model ?? '4class') as '4class' | '2class';
  const initial = {
    model, atasan: w.atasan ?? 40, peer: w.peer ?? 25, cross: w.cross ?? 15, bawahan: w.bawahan ?? 20,
    self: w.self ?? 0, internal: w.internal ?? 60,
  };

  // Data untuk rekap result_360 + perbandingan model (paralel).
  const [resRes, asmtRes, mapRes, empRes] = await Promise.all([
    supabase.from('result_360').select('employee_id, score').eq('period_id', ap.id),
    supabase.from('assessments').select('id, assessor_id, target_id').eq('period_id', ap.id).eq('status', 'submitted'),
    supabase.from('mappings').select('assessor_id, target_id, relation').eq('period_id', ap.id),
    supabase.from('employees').select('id, name, dept').neq('role', 'direksi'),
  ]);
  const empById = new Map((empRes.data ?? []).map((e) => [e.id, e]));

  // Rekap skor resmi (result_360).
  const stored = (resRes.data ?? [])
    .map((r) => ({ id: r.employee_id, name: empById.get(r.employee_id)?.name ?? '—', dept: empById.get(r.employee_id)?.dept ?? '—', score: r.score }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // Perbandingan model: kelompokkan rating (×20) per target per kelas dari penilaian terkirim.
  // DIPAGINASI + di-chunk: assessment_indicator_scores bisa >4000 baris → tanpa ini pratinjau
  // perbandingan model terpotong di 1000 → angka simulasi SALAH & menyesatkan pilihan bobot HRD.
  const asmts = asmtRes.data ?? [];
  const scoreRows = asmts.length
    ? await fetchAllByIds<{ assessment_id: string; rating: number | null }>(asmts.map((a) => a.id), (chunk, from, to) =>
        supabase.from('assessment_indicator_scores').select('assessment_id, rating')
          .in('assessment_id', chunk).order('assessment_id').order('indicator_id').range(from, to))
    : [];
  const ratingsByAsmt = new Map<string, number[]>();
  scoreRows.forEach((s) => {
    if (s.rating == null) return;
    const arr = ratingsByAsmt.get(s.assessment_id) ?? []; arr.push(s.rating); ratingsByAsmt.set(s.assessment_id, arr);
  });
  const relByPair = new Map<string, RelationKind>();
  (mapRes.data ?? []).forEach((m) => relByPair.set(`${m.assessor_id}:${m.target_id}`, m.relation));

  type Groups = { atasan: number[]; peer: number[]; cross: number[]; bawahan: number[] };
  const byTarget = new Map<string, Groups>();
  for (const a of asmts) {
    if (a.assessor_id === a.target_id) continue; // Self dikecualikan
    const rs = ratingsByAsmt.get(a.id); const m = rs && avg(rs);
    if (!m) continue;
    const s100 = m * 20; if (s100 <= 0) continue;
    const cls = classOf(relByPair.get(`${a.assessor_id}:${a.target_id}`) ?? 'Peer');
    if (cls === 'self') continue;
    const g = byTarget.get(a.target_id) ?? { atasan: [], peer: [], cross: [], bawahan: [] };
    g[cls].push(s100); byTarget.set(a.target_id, g);
  }

  const wa = initial.atasan, wp = initial.peer, wc = initial.cross, wb = initial.bawahan, wi = initial.internal;
  const compare = [...byTarget.entries()].map(([id, g]) => {
    const aA = avg(g.atasan), pA = avg(g.peer), cA = avg(g.cross), bA = avg(g.bawahan);
    // 4-Kelas: Atasan/Peer/Cross/Bawahan (Self dikecualikan).
    let s4: number | null = null;
    { let sum = 0, tw = 0; for (const [v, wt] of [[aA, wa], [pA, wp], [cA, wc], [bA, wb]] as [number | null, number][]) if (v != null) { sum += v * wt; tw += wt; } if (tw > 0) s4 = round1(sum / tw); }
    // 2-Kelas: Atasan vs Internal (Peer+Cross+Bawahan).
    let s2: number | null = null;
    { const internal = avg([...g.peer, ...g.cross, ...g.bawahan]); if (aA != null && internal != null && wa + wi > 0) s2 = round1((aA * wa + internal * wi) / (wa + wi)); else if (aA != null) s2 = round1(aA); else if (internal != null) s2 = round1(internal); }
    return { id, name: empById.get(id)?.name ?? '—', dept: empById.get(id)?.dept ?? '—', s4, s2 };
  }).sort((a, b) => (b.s4 ?? 0) - (a.s4 ?? 0));

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Bobot &amp; Kalkulasi Skor 360°</h1>
          <p className="text-sm text-gray-500">Periode aktif: {ap.label}</p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>

      {/* 1. Bobot Penilai */}
      <Section title="Bobot Penilai">
        <WeightForm initial={initial} />
        <p className="text-[10px] text-gray-500 italic mt-4">
          Skor 360 = rata-rata rating tiap kelas penilai ×20, dibobot di sini (Self dikecualikan dari total).
          Perubahan berlaku setelah <strong>Hitung Ulang Skor 360°</strong> di bawah.
        </p>
      </Section>

      {/* 2. Kalkulasi (Hitung Ulang + hasil resmi) */}
      <Section title="Kalkulasi Skor 360°">
        <div className="mb-4">
          <RecomputeButton />
          <p className="text-[11px] text-gray-500 mt-1.5">
            Menulis hasil resmi ke <code>result_360</code> memakai model aktif:
            <strong> {model === '4class' ? '4-Kelas' : '2-Kelas'}</strong>. Self dikecualikan dari total.
          </p>
        </div>
        {stored.length === 0 ? (
          <p className="text-sm text-gray-500">Belum ada hasil resmi. Klik <strong>Hitung Ulang Skor 360°</strong> setelah ada penilaian terkirim.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[420px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-3">Pegawai</th><th className="py-2 px-3">Divisi</th><th className="py-2 pl-3 text-right">Skor 360° Resmi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stored.map((it) => (
                <tr key={it.id}>
                  <td className="py-3 pr-3 font-bold text-gray-800">{it.name}</td>
                  <td className="py-3 px-3 text-gray-500">{it.dept}</td>
                  <td className="py-3 pl-3 text-right font-mono font-black text-indigo-700">{it.score != null ? it.score.toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Section>

      {/* 3. Perbandingan Model 4-Kelas vs 2-Kelas */}
      <Section title="Perbandingan Model: 4-Kelas vs 2-Kelas">
        <p className="text-[11px] text-gray-500 mb-3">
          Pratinjau skor 360° tiap pegawai bila dihitung dengan kedua model, memakai bobot yang tersimpan
          (4-Kelas: Atasan {wa}/Peer {wp}/Cross {wc}/Bawahan {wb} · 2-Kelas: Atasan {wa}/Internal {wi}). Membantu memilih
          model sebelum <strong>Hitung Ulang</strong>. Kolom <strong>{model === '4class' ? '4-Kelas' : '2-Kelas'}</strong> adalah model aktif.
        </p>
        {compare.length === 0 ? (
          <p className="text-sm text-gray-500">Belum ada penilaian terkirim untuk dibandingkan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[480px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3">Pegawai</th>
                  <th className={`py-2 px-3 text-right ${model === '4class' ? 'text-emerald-700' : ''}`}>4-Kelas{model === '4class' ? ' ●' : ''}</th>
                  <th className={`py-2 px-3 text-right ${model === '2class' ? 'text-emerald-700' : ''}`}>2-Kelas{model === '2class' ? ' ●' : ''}</th>
                  <th className="py-2 pl-3 text-right">Selisih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {compare.map((c) => {
                  const delta = c.s4 != null && c.s2 != null ? round1(c.s4 - c.s2) : null;
                  return (
                    <tr key={c.id}>
                      <td className="py-3 pr-3"><span className="font-bold text-gray-800 block">{c.name}</span><span className="text-[11px] text-gray-500">{c.dept}</span></td>
                      <td className={`py-3 px-3 text-right font-mono ${model === '4class' ? 'font-black text-emerald-800' : 'text-gray-600'}`}>{c.s4 != null ? c.s4.toFixed(2) : '—'}</td>
                      <td className={`py-3 px-3 text-right font-mono ${model === '2class' ? 'font-black text-emerald-800' : 'text-gray-600'}`}>{c.s2 != null ? c.s2.toFixed(2) : '—'}</td>
                      <td className={`py-3 pl-3 text-right font-mono font-bold ${delta == null ? 'text-gray-300' : delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-rose-600' : 'text-gray-500'}`}>
                        {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-gray-500 italic mt-3">
          Selisih = 4-Kelas − 2-Kelas. Pratinjau ini tidak mengubah data; skor resmi hanya berubah saat <strong>Hitung Ulang</strong>.
        </p>
      </Section>
    </Shell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight mb-3 pb-2 border-b border-gray-100">{title}</h2>
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
