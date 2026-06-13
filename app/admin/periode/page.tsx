import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PeriodForm } from './period-form';
import { PeriodActions } from './period-actions';

/**
 * Kelola Siklus Periode (HRD). Buat/aktivasi/kunci periode + toggle 360.
 * Periode aktif menggerakkan semua fitur lain; "Kunci & Akhiri" menghentikan input.
 */
export default async function PeriodePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin.</p>
      <Link href="/home" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: periods } = await supabase
    .from('periods').select('id, code, label, start_date, end_date, status, has_360').order('start_date', { ascending: false });
  const list = periods ?? [];

  const { data: monthRows } = await supabase.from('period_months').select('period_id');
  const monthCount = new Map<string, number>();
  (monthRows ?? []).forEach((m) => monthCount.set(m.period_id, (monthCount.get(m.period_id) ?? 0) + 1));

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Kelola Siklus Periode</h1>
          <p className="text-sm text-gray-500">Aktivasi membuka pengisian; Kunci &amp; Akhiri menghentikannya.</p>
        </div>
        <Link href="/home" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>

      <div className="mb-5"><PeriodForm /></div>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
            <th className="py-2 pr-3">Periode</th>
            <th className="py-2 px-3">Rentang</th>
            <th className="py-2 px-3 text-center">360°</th>
            <th className="py-2 px-3 text-center">Status</th>
            <th className="py-2 pl-3 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {list.map((p) => (
            <tr key={p.id}>
              <td className="py-3 pr-3">
                <span className="font-bold text-gray-800 block">{p.label}</span>
                <span className="text-[11px] text-gray-400 font-mono">{p.code} · {monthCount.get(p.id) ?? 0} bln</span>
              </td>
              <td className="py-3 px-3 text-[11px] text-gray-500">{p.start_date} → {p.end_date}</td>
              <td className="py-3 px-3 text-center">
                {p.has_360
                  ? <span className="text-[10px] font-bold text-indigo-700">Aktif</span>
                  : <span className="text-[10px] text-gray-400">Tanpa</span>}
              </td>
              <td className="py-3 px-3 text-center">
                {p.status === 'active'
                  ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">Aktif</span>
                  : <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-gray-50 text-gray-500 border-gray-200">Terkunci</span>}
              </td>
              <td className="py-3 pl-3 text-right">
                <PeriodActions periodId={p.id} status={p.status} has360={p.has_360} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-400 italic mt-3">
        Hanya satu periode aktif pada satu waktu — mengaktivasi periode akan mengunci yang lain.
        Periode baru harus diisi pertanyaan &amp; mapping (kelola terpisah) sebelum penilaian.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
