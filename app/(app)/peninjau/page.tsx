import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canCrossReview } from '@/lib/auth/roles';
import { finalScoreOf } from '@/lib/scoring';
import { CrossTable, type CrossRow } from './cross-table';

/**
 * Review Hasil Lintas Divisi (grant is_cross_reviewer, migrasi 0018).
 * Daftar pegawai di SEMUA divisi KECUALI divisi peninjau sendiri (konflik kepentingan),
 * untuk membantu HRD meringkas Hasil Akhir 360° (menulis Ringkasan Aspek).
 *
 * Enumerasi + skor lewat service_role (peninjau berposisi non-HRD → RLS menolak baca
 * data orang lain); lingkup "divisi ≠ divisi sendiri" ditegakkan di server. TIDAK ada
 * kewenangan finalisasi/rilis/hitung-ulang — itu tetap milik HRD.
 */
export default async function PeninjauPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees')
    .select('dept, is_cross_reviewer').eq('id', user.id).maybeSingle();
  if (!canCrossReview(me)) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk Peninjau Hasil Lintas Divisi.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }
  const myDept = me?.dept ?? '__none__';

  const admin = createAdminClient();
  const { data: ap } = await admin
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><Header dept={myDept} /><p className="text-sm text-gray-500 mt-4">Tidak ada periode aktif.</p></Shell>;

  // Pegawai DIVISI LAIN (bukan divisi peninjau), non-direksi, non-eksternal. Pelaporan:
  // tampilkan aktif ATAU punya data periode (lihat filter di bawah).
  const { data: emps } = await admin.from('employees')
    .select('id, name, dept, is_active')
    .neq('role', 'direksi').eq('is_external', false).neq('dept', myDept);
  const employees = emps ?? [];
  if (employees.length === 0) {
    return <Shell><Header dept={myDept} /><p className="text-sm text-gray-500 mt-4">Belum ada pegawai di divisi lain.</p></Shell>;
  }
  const empIds = employees.map((e) => e.id);

  const { data: months } = await admin.from('period_months').select('ym').eq('period_id', ap.id);
  const yms = (months ?? []).map((m) => m.ym);
  const { data: kpiRows } = yms.length
    ? await admin.from('kpi_scores').select('employee_id, score').in('ym', yms).in('employee_id', empIds) : { data: [] };
  const kpiAgg = new Map<string, { sum: number; n: number }>();
  (kpiRows ?? []).forEach((r) => { const a = kpiAgg.get(r.employee_id) ?? { sum: 0, n: 0 }; a.sum += r.score; a.n++; kpiAgg.set(r.employee_id, a); });

  const { data: r360 } = await admin.from('result_360').select('employee_id, score').eq('period_id', ap.id).in('employee_id', empIds);
  const s360By = new Map((r360 ?? []).map((r) => [r.employee_id, r.score]));
  const { data: pen } = await admin.from('compliance_penalties').select('employee_id, points').eq('period_id', ap.id).in('employee_id', empIds);
  const penBy = new Map((pen ?? []).map((p) => [p.employee_id, p.points]));
  const { data: reports } = await admin.from('final_reports').select('employee_id, status').eq('period_id', ap.id).in('employee_id', empIds);
  const statusBy = new Map((reports ?? []).map((r) => [r.employee_id, r.status]));

  // Kelengkapan "dinilai oleh" berbasis penilai WAJIB (selaras Review Hasil Akhir).
  // TANPA filter is_active (lihat catatan di Review Hasil Akhir): pegawai nonaktif tetap akurat.
  const { data: maps } = await admin.from('mappings')
    .select('assessor_id, target_id, mandatory').eq('period_id', ap.id).in('target_id', empIds);
  const { data: subs } = await admin.from('assessments')
    .select('assessor_id, target_id').eq('period_id', ap.id).eq('status', 'submitted').in('target_id', empIds);
  const doneSet = new Set((subs ?? []).map((s) => `${s.assessor_id}|${s.target_id}`));
  const ratedTotal = new Map<string, number>();
  const ratedDone = new Map<string, number>();
  (maps ?? []).forEach((m) => {
    if (!m.mandatory) return;
    ratedTotal.set(m.target_id, (ratedTotal.get(m.target_id) ?? 0) + 1);
    if (doneSet.has(`${m.assessor_id}|${m.target_id}`)) ratedDone.set(m.target_id, (ratedDone.get(m.target_id) ?? 0) + 1);
  });

  const activeIds = new Set(employees.filter((e) => e.is_active).map((e) => e.id));
  const rows: CrossRow[] = employees.map((e) => {
    const agg = kpiAgg.get(e.id);
    const kpiAvg = agg ? agg.sum / agg.n : null;
    const s360 = s360By.get(e.id) ?? null;
    const final = finalScoreOf(kpiAvg, s360, ap.has_360, penBy.get(e.id) ?? 0);
    return {
      id: e.id, name: e.name, dept: e.dept, kpiAvg, s360, final,
      status: statusBy.get(e.id) ?? null,
      ratedDone: ratedDone.get(e.id) ?? 0, ratedTotal: ratedTotal.get(e.id) ?? 0,
    };
  })
    // Tampilkan yang AKTIF atau PUNYA DATA periode (KPI/360°/laporan).
    .filter((r) => activeIds.has(r.id) || r.kpiAvg != null || r.s360 != null || r.status != null)
    .sort((a, b) => a.dept.localeCompare(b.dept) || a.name.localeCompare(b.name));

  const depts = [...new Set(rows.map((r) => r.dept))].sort();

  return (
    <Shell>
      <Header dept={myDept} />
      <div className="mt-4">
        {rows.length === 0
          ? <p className="text-sm text-gray-500">Belum ada data pegawai divisi lain untuk ditinjau.</p>
          : <CrossTable rows={rows} depts={depts} has360={ap.has_360} />}
      </div>
    </Shell>
  );
}

function Header({ dept }: { dept: string }) {
  return (
    <div className="bg-gradient-to-r from-indigo-800 to-emerald-800 rounded-2xl p-5 sm:p-6 text-white shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <span className="inline-flex py-1 px-2.5 bg-white/10 rounded-full text-[10px] font-bold tracking-wider uppercase border border-white/15">
            Peninjau Hasil Lintas Divisi
          </span>
          <h1 className="text-xl font-bold tracking-tight">Review Hasil Lintas Divisi</h1>
          <p className="text-xs text-indigo-100/90 leading-relaxed max-w-2xl">
            Bantu HRD meringkas Hasil Akhir 360° pegawai di divisi lain. Anda dapat melihat skor,
            radar/aspek, &amp; komentar <strong>anonim</strong>, lalu menulis <strong>Ringkasan Aspek</strong>.
            Divisi Anda sendiri (<strong>{dept}</strong>) sengaja <strong>tidak ditampilkan</strong>.
          </p>
        </div>
        <Link href="/" className="text-[11px] text-indigo-200 hover:text-white shrink-0">← Beranda</Link>
      </div>
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
