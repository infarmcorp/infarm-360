import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import type { WeightValues, RelationKind } from '@/lib/database.types';
import { weightedScore360, round2, type Groups360 } from '@/lib/score360';
import { WeightForm } from './weight-form';
import { EmployeeWeights, type Override } from './employee-weights';
import { Kalkulasi360Table, type MergedRow } from './bobot-tables';
import { EmptyState } from '@/components/empty-state';
import { Panel, PanelLabel } from '@/components/panel';
import { fetchAllByIds, fetchAllPaged } from '@/lib/supabase/paginate';

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
const summarizeW = (m: '4class' | '2class', w: WeightValues) =>
  m === '4class' ? `A${w.atasan ?? 0}/P${w.peer ?? 0}/C${w.cross ?? 0}/B${w.bawahan ?? 0}` : `A${w.atasan ?? 0}/Int${w.internal ?? 0}`;

export default async function BobotPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!canSection(me, 'bobot')) {
    return <Shell><p className="text-sm text-ink-soft">Halaman ini hanya untuk HRD Admin.</p></Shell>;
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
  // SEMUA di bawah dipaginasi via fetchAllPaged — assessments/mappings bisa >1000, dan result_360 +
  // employees = 1 baris/pegawai (aman <1000 pegawai, TAPI dipaginasi agar tetap benar bila kelak
  // perusahaan >1000 orang → tabel & peta nama tak terpotong diam-diam).
  const [resAll, asmtsAll, mapsAll, empAll, ovrRes] = await Promise.all([
    fetchAllPaged<{ employee_id: string; score: number | null }>((from, to) =>
      supabase.from('result_360').select('employee_id, score').eq('period_id', ap.id).order('employee_id').range(from, to)),
    fetchAllPaged<{ id: string; assessor_id: string; target_id: string }>((from, to) =>
      supabase.from('assessments').select('id, assessor_id, target_id').eq('period_id', ap.id).eq('status', 'submitted').order('id').range(from, to)),
    fetchAllPaged<{ assessor_id: string; target_id: string; relation: RelationKind }>((from, to) =>
      supabase.from('mappings').select('assessor_id, target_id, relation').eq('period_id', ap.id).order('assessor_id').order('target_id').range(from, to)),
    fetchAllPaged<{ id: string; name: string; dept: string | null; role: string }>((from, to) =>
      supabase.from('employees').select('id, name, dept, role').order('id').range(from, to)),
    supabase.from('employee_weight_overrides').select('employee_id, model, weights').eq('period_id', ap.id),
  ]);
  // Pencarian nama mencakup SEMUA pegawai (termasuk Direksi) agar tak ada baris "—" di tabel.
  const empById = new Map(empAll.map((e) => [e.id, e]));

  // Dropdown "Bobot Khusus per Pegawai" — pegawai non-Direksi (cakupan penilaian normal).
  const empList = empAll.filter((e) => e.role !== 'direksi').map((e) => ({ id: e.id, name: e.name, dept: e.dept ?? '—' }));
  const overrides: Override[] = (ovrRes.data ?? [])
    .map((o) => ({
      employeeId: o.employee_id,
      name: empById.get(o.employee_id)?.name ?? '—',
      dept: empById.get(o.employee_id)?.dept ?? '—',
      model: o.model as '4class' | '2class',
      weights: (o.weights ?? {}) as WeightValues,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Rekap skor resmi (result_360).
  // Perbandingan model: kelompokkan rating (×20) per target per kelas dari penilaian terkirim.
  // DIPAGINASI + di-chunk: assessment_indicator_scores bisa >4000 baris → tanpa ini pratinjau
  // perbandingan model terpotong di 1000 → angka simulasi SALAH & menyesatkan pilihan bobot HRD.
  const asmts = asmtsAll;
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
  mapsAll.forEach((m) => relByPair.set(`${m.assessor_id}:${m.target_id}`, m.relation));

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

  // Bobot GLOBAL periode per model (dipakai simulasi 4/2-Kelas & sebagai "bobot default").
  const gw4: WeightValues = { atasan: initial.atasan, peer: initial.peer, cross: initial.cross, bawahan: initial.bawahan };
  const gw2: WeightValues = { atasan: initial.atasan, internal: initial.internal };
  const globalLabel = summarizeW(model, model === '4class' ? gw4 : gw2);

  const overrideByEmp = new Map(overrides.map((o) => [o.employeeId, o]));
  const scoreById = new Map(resAll.map((r) => [r.employee_id, r.score]));

  // Satu baris per pegawai (union: punya data penilaian ATAU skor resmi ATAU bobot khusus).
  // Kolom "bobot fokus": Skor Resmi (result_360) + Δ dampak bobot khusus (simulasi khusus−default).
  // Kolom "perbandingan model": simulasi 4-Kelas & 2-Kelas memakai bobot GLOBAL periode.
  // empById kini memuat SEMUA pegawai (termasuk Direksi) → nama selalu ter-resolve. Filter hanya
  // membuang id yatim (mis. pegawai terhapus) agar tak ada baris "—".
  const unionIds = new Set<string>([...byTarget.keys(), ...scoreById.keys(), ...overrideByEmp.keys()]);
  const merged: MergedRow[] = [...unionIds].filter((id) => empById.has(id)).map((id) => {
    const g = byTarget.get(id);
    const gFull: Groups360 | null = g ? { ...g, self: [] } : null;
    const s4 = gFull ? weightedScore360(gFull, '4class', gw4) : null;
    const s2 = gFull ? weightedScore360(gFull, '2class', gw2) : null;
    const ov = overrideByEmp.get(id);
    const base = model === '4class' ? s4 : s2;                                   // skor bila pakai bobot default
    const applied = gFull && ov ? weightedScore360(gFull, ov.model, ov.weights) : base; // skor bila pakai bobot khusus
    const deltaWeight = ov && applied != null && base != null ? round2(applied - base) : null;
    return {
      id,
      name: empById.get(id)?.name ?? '—',
      dept: empById.get(id)?.dept ?? '—',
      scoreResmi: scoreById.get(id) ?? null,
      hasOverride: !!ov,
      overrideLabel: ov ? `${ov.model === '4class' ? '4-Kelas' : '2-Kelas'} · ${summarizeW(ov.model, ov.weights)}` : null,
      deltaWeight,
      s4: s4 != null ? round2(s4) : null,
      s2: s2 != null ? round2(s2) : null,
    };
  }).sort((a, b) =>
    (Number(b.hasOverride) - Number(a.hasOverride)) || ((b.scoreResmi ?? b.s4 ?? 0) - (a.scoreResmi ?? a.s4 ?? 0)));
  const overrideCount = merged.filter((m) => m.hasOverride).length;

  return (
    <Shell>
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Bobot &amp; Kalkulasi Skor 360°</h1>
          <p className="text-[13.5px] text-ink-soft mt-1">Periode aktif <span className="data-value font-semibold text-ink">{ap.label}</span></p>
        </div>
        <Link href="/" className="text-[12.5px] text-ink-faint hover:text-ink-soft whitespace-nowrap mt-1">← Beranda</Link>
      </div>

      {/* 1. Bobot Penilai */}
      <Section title="Bobot Penilai">
        <WeightForm initial={initial} />
        <p className="text-[12px] text-ink-faint mt-4 leading-relaxed">
          Skor 360 = rata-rata rating tiap kelas penilai ×20, dibobot di sini. Evaluasi diri (Self)
          tak punya bobot &amp; tak pernah ikut dihitung, jadi tidak ada kolomnya.
          Perubahan berlaku setelah <strong className="font-semibold text-ink-soft">Hitung Ulang Skor 360°</strong> di bawah.
        </p>
      </Section>

      {/* 1b. Bobot Khusus per Pegawai (override skema di atas) */}
      <Section title="Bobot Khusus per Pegawai">
        <p className="text-[12px] text-ink-soft mb-4 max-w-3xl leading-relaxed">
          Sebagian pegawai bisa memakai bobot berbeda dari skema periode di atas. Pegawai dengan bobot khusus
          memakai model &amp; nilai di sini; sisanya tetap skema periode. Berlaku setelah <strong className="font-semibold text-ink">Hitung Ulang Skor 360°</strong> di Review &amp; Finalisasi.
          <span className="block mt-1 text-ink-faint">Catatan: kelas tanpa data (mis. pegawai tanpa bawahan) sudah otomatis diabaikan &amp; bobotnya dinormalisasi — bobot khusus hanya perlu bila kebijakan bobotnya memang berbeda.</span>
        </p>
        <EmployeeWeights employees={empList} overrides={overrides} />
      </Section>

      {/* 2. Kalkulasi & Perbandingan (hasil resmi + dampak bobot khusus + banding model). Tombol Hitung Ulang
          SENGAJA hanya satu, di Review & Finalisasi (kokpit Sinkronkan Skor) — di sini cukup tautan. */}
      <Section title="Kalkulasi Skor 360°">
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-2 border border-line bg-neutral-tint rounded-panel px-3 py-2.5">
            <span className="text-[12px] text-ink-soft">Bobot berubah? Skor 360° perlu dihitung ulang agar bobot baru berlaku.</span>
            <Link href="/admin/laporan" className="text-[12px] font-semibold px-3 py-1.5 rounded-control bg-brand hover:bg-brand-ink text-white">
              Buka Review &amp; Finalisasi →
            </Link>
          </div>
          <p className="text-[12px] text-ink-faint mt-2 leading-relaxed">
            Hitung ulang menulis hasil resmi ke <code className="data-value text-ink-soft bg-neutral-tint px-1 py-0.5 rounded">result_360</code> memakai model aktif:
            <strong className="font-semibold text-ink-soft"> {model === '4class' ? '4-Kelas' : '2-Kelas'}</strong> (bobot global <span className="data-value">{globalLabel}</span>). Pegawai dengan
            <strong className="font-semibold text-ink-soft"> bobot khusus</strong> memakai bobotnya sendiri. Evaluasi diri (Self) tak ikut dihitung.
          </p>
        </div>
        <Kalkulasi360Table rows={merged} model={model} overrideCount={overrideCount} globalLabel={globalLabel} />
      </Section>
    </Shell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel className="mb-5">
      <PanelLabel className="mb-4">{title}</PanelLabel>
      {children}
    </Panel>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">{children}</main>;
}
