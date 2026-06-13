import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { RecomputeButton } from './recompute-button';

/**
 * Kalkulasi & rekap Skor 360° (HRD). Membaca result_360 (hasil komputasi server).
 * Penulisan hanya via Server Action service_role — lihat actions.ts.
 */
export default async function Result360Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') {
    return (
      <Shell>
        <p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin.</p>
        <Link href="/home" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link>
      </Shell>
    );
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();

  const { data: results } = ap
    ? await supabase
        .from('result_360').select('employee_id, score, computed_at')
        .eq('period_id', ap.id)
    : { data: [] };
  const rows = results ?? [];

  const ids = rows.map((r) => r.employee_id);
  const { data: emps } = ids.length
    ? await supabase.from('employees').select('id, name, dept').in('id', ids)
    : { data: [] };
  const empById = new Map((emps ?? []).map((e) => [e.id, e]));

  const items = rows
    .map((r) => ({
      id: r.employee_id,
      name: empById.get(r.employee_id)?.name ?? '—',
      dept: empById.get(r.employee_id)?.dept ?? '—',
      score: r.score,
      computedAt: r.computed_at,
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return (
    <Shell>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Kalkulasi Skor 360°</h1>
          <p className="text-sm text-gray-500">
            Periode aktif: {ap?.label ?? '—'} · skor terbobot dari penilaian terkirim.
          </p>
        </div>
        <Link href="/home" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>

      <div className="my-4">
        <RecomputeButton />
        <p className="text-[11px] text-gray-400 mt-1.5">
          Self dikecualikan dari total. Bobot mengikuti skema aktif periode.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">
          Belum ada hasil. Klik <strong>Hitung Ulang Skor 360°</strong> setelah ada penilaian terkirim.
        </p>
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
                <td className="py-3 pl-3 text-right font-mono font-black text-indigo-700">
                  {it.score != null ? it.score.toFixed(1) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
