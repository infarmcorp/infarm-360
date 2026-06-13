import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { WeightValues } from '@/lib/database.types';
import { WeightForm } from './weight-form';
import { RecomputeButton } from '../360/recompute-button';

/**
 * Kelola Bobot Penilai (HRD) — dua tab: "Bobot Penilai" (skema bobot 360 periode aktif)
 * & "Kalkulasi Skor 360°" (Hitung Ulang + rekap result_360). Disatukan karena bobot
 * menentukan hasil kalkulasi. Tab via ?tab=bobot|kalkulasi.
 */
export default async function BobotPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === 'kalkulasi' ? 'kalkulasi' : 'bobot';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin.</p></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  return (
    <Shell>
      <h1 className="text-xl font-bold text-gray-800">Bobot &amp; Kalkulasi Skor 360°</h1>
      <p className="text-sm text-gray-500">Periode aktif: {ap.label}</p>

      <div className="flex gap-1 mt-4 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        <Tab href="/admin/bobot?tab=bobot" active={tab === 'bobot'}>Bobot Penilai</Tab>
        <Tab href="/admin/bobot?tab=kalkulasi" active={tab === 'kalkulasi'}>Kalkulasi Skor 360°</Tab>
      </div>

      {tab === 'bobot' ? <BobotTab supabase={supabase} periodId={ap.id} /> : <KalkulasiTab supabase={supabase} periodId={ap.id} />}
    </Shell>
  );
}

/** Tab Bobot Penilai: skema bobot aktif. */
async function BobotTab({
  supabase, periodId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>; periodId: string;
}) {
  const { data: ws } = await supabase
    .from('weight_schemes').select('model, weights').eq('period_id', periodId).eq('is_active', true).maybeSingle();
  const w = (ws?.weights ?? {}) as WeightValues;
  const initial = {
    model: (ws?.model ?? '4class') as '4class' | '2class',
    atasan: w.atasan ?? 50, peer: w.peer ?? 30, cross: w.cross ?? 20, self: w.self ?? 0, internal: w.internal ?? 60,
  };
  return (
    <>
      <WeightForm initial={initial} />
      <p className="text-[10px] text-gray-400 italic mt-4">
        Skor 360 = rata-rata rating tiap kelas penilai ×20, dibobot di sini (Self dikecualikan
        dari total). Perubahan berlaku setelah <Link href="/admin/bobot?tab=kalkulasi" className="underline">Hitung Ulang Skor 360°</Link>.
      </p>
    </>
  );
}

/** Tab Kalkulasi: Hitung Ulang + rekap result_360 periode aktif. */
async function KalkulasiTab({
  supabase, periodId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>; periodId: string;
}) {
  const { data: results } = await supabase
    .from('result_360').select('employee_id, score').eq('period_id', periodId);
  const rows = results ?? [];
  const ids = rows.map((r) => r.employee_id);
  const { data: emps } = ids.length
    ? await supabase.from('employees').select('id, name, dept').in('id', ids)
    : { data: [] };
  const empById = new Map((emps ?? []).map((e) => [e.id, e]));
  const items = rows
    .map((r) => ({ id: r.employee_id, name: empById.get(r.employee_id)?.name ?? '—', dept: empById.get(r.employee_id)?.dept ?? '—', score: r.score }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return (
    <>
      <div className="mb-4">
        <RecomputeButton />
        <p className="text-[11px] text-gray-400 mt-1.5">Self dikecualikan dari total. Bobot mengikuti skema aktif (tab Bobot Penilai).</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Belum ada hasil. Klik <strong>Hitung Ulang Skor 360°</strong> setelah ada penilaian terkirim.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
              <th className="py-2 pr-3">Pegawai</th>
              <th className="py-2 px-3">Divisi</th>
              <th className="py-2 pl-3 text-right">Skor 360°</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((it) => (
              <tr key={it.id}>
                <td className="py-3 pr-3 font-bold text-gray-800">{it.name}</td>
                <td className="py-3 px-3 text-gray-500">{it.dept}</td>
                <td className="py-3 pl-3 text-right font-mono font-black text-indigo-700">{it.score != null ? it.score.toFixed(1) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-4 py-1.5 text-xs font-extrabold rounded-lg transition-all ${
        active ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
