import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

/**
 * Laporan Hasil Saya (pegawai). Hanya tampil bila HRD sudah FINALISASI (RLS fr_read:
 * employee hanya melihat laporannya yang status='finalized'). Menampilkan Skor Akhir +
 * rincian (rerata KPI & skor 360 periode aktif).
 */
export default async function LaporanSayaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  const { data: report } = await supabase
    .from('final_reports').select('final_score, status')
    .eq('employee_id', user.id).eq('period_id', ap.id).maybeSingle();

  if (!report) {
    return (
      <Shell>
        <Header label={ap.label} />
        <p className="text-sm text-gray-500 mt-4">
          Laporan Anda <strong>belum difinalisasi</strong> oleh HRD. Silakan cek kembali nanti.
        </p>
      </Shell>
    );
  }

  // Rincian (RLS mengizinkan pegawai membaca KPI & 360 miliknya sendiri).
  const { data: months } = await supabase.from('period_months').select('ym').eq('period_id', ap.id);
  const yms = (months ?? []).map((m) => m.ym);
  const { data: kpi } = yms.length
    ? await supabase.from('kpi_scores').select('score').eq('employee_id', user.id).in('ym', yms) : { data: [] };
  const kpiAvg = kpi && kpi.length ? kpi.reduce((a, b) => a + b.score, 0) / kpi.length : null;
  const { data: r } = await supabase.from('result_360').select('score')
    .eq('employee_id', user.id).eq('period_id', ap.id).maybeSingle();
  const s360 = r?.score ?? null;

  return (
    <Shell>
      <Header label={ap.label} />
      <div className="mt-4 text-center py-6 bg-slate-50 border border-gray-200 rounded-2xl">
        <p className="text-xs text-gray-400 uppercase tracking-wider font-bold">Skor Akhir Kalibrasi</p>
        <p className="text-5xl font-black text-emerald-700 font-mono mt-1">
          {report.final_score != null ? report.final_score.toFixed(1) : '—'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-[10px] text-gray-400 uppercase font-bold">Rerata KPI</p>
          <p className="text-xl font-black font-mono text-emerald-700">{kpiAvg != null ? kpiAvg.toFixed(1) : '—'}</p>
        </div>
        <div className="border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-[10px] text-gray-400 uppercase font-bold">Evaluasi 360°</p>
          <p className="text-xl font-black font-mono text-indigo-700">{s360 != null ? s360.toFixed(1) : '—'}</p>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 italic mt-3">
        {ap.has_360 ? 'Skor Akhir = blend KPI 50% + 360° 50%' : 'Skor Akhir = 100% KPI (periode tanpa 360°)'} dikurangi punishment kepatuhan (bila ada).
      </p>
    </Shell>
  );
}

function Header({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Laporan Hasil Saya</h1>
        <p className="text-sm text-gray-500">Periode: {label}</p>
      </div>
      <Link href="/home" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
