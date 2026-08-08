import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fetchAllByIds } from '@/lib/supabase/paginate';
import { finalScoreOf, playerClassOf, perfCategoryOf, perfLabelOf } from '@/lib/scoring';
import { PeriodSelect } from './period-select';
import { RekapTable, type RekapRow } from './rekap-table';

/**
 * Rekapitulasi Kuartal — tab di dalam Input KPI. Tabel per periode: KPI tiap bulan,
 * Rataan KPI, Hasil 360°, Skor Akhir, Kategori. SPV → tim (RLS is_my_member),
 * HRD/Direksi → semua pegawai non-direksi. Periode dipilih via ?tab=rekap&period=<id>.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const labelOf = (ym: string) => { const [, m] = ym.split('-'); return MONTHS[Number(m) - 1] ?? m; };
// Warna per kategori terpadu (label dari perfLabelOf agar seragam dgn dashboard/ekspor).
const KAT_COLOR: Record<string, string> = {
  exceed: 'text-brand-ink', meet: 'text-ink', improve: 'text-warn-ink', below: 'text-danger-ink',
};
const KAT = (f: number | null) => {
  const c = perfCategoryOf(f);
  return { t: perfLabelOf(f), c: c ? KAT_COLOR[c] : 'text-ink-faint' };
};

export async function RekapView({ role, userId, periodParam, hrdMode = 'admin', scopedIds }: { role: string; userId: string; periodParam?: string; hrdMode?: 'admin' | 'spv'; scopedIds?: string[] | null }) {
  // Jalur GRANT non-HRD (Manajemen Akses): pemegang grant diblokir RLS → baca via service_role,
  // dibatasi ke daftar id yang SUDAH disaring per-lingkup di page.tsx (employeeInScopes).
  const supabase = scopedIds ? createAdminClient() : await createClient();

  const { data: periods } = await supabase.from('periods').select('id, label, has_360, status').order('label');
  const periodList = periods ?? [];
  if (periodList.length === 0) return <p className="text-sm text-ink-soft">Belum ada periode.</p>;
  const sel = periodList.find((p) => p.id === periodParam)
    ?? periodList.find((p) => p.status === 'active')
    ?? periodList[0];

  // Lingkup pegawai. SPV → tim; HRD mode-SPV → hanya DIVISINYA (selaras Input KPI);
  // HRD admin / Direksi → semua pegawai non-direksi.
  // Pelaporan: enumerasi TANPA filter is_active; pegawai nonaktif disaring belakangan HANYA
  // bila tak punya data di periode (lihat filter `shown`). Jadi nonaktif yang sudah punya
  // KPI/360° di kuartal ini tetap muncul (mis. resign di akhir periode) & bisa difinalisasi.
  let empRows: { id: string; name: string; dept: string; is_active: boolean }[] = [];
  if (scopedIds) {
    // Grant berlingkup: hanya pegawai dalam daftar tersaring (id sudah dibatasi lingkup di server).
    const { data } = scopedIds.length
      ? await supabase.from('employees').select('id, name, dept, is_active').in('id', scopedIds)
      : { data: [] };
    empRows = data ?? [];
  } else if (role === 'spv') {
    const { data: team } = await supabase.from('spv_team_members').select('employee_id').eq('spv_id', userId);
    // SPV juga mencatat KPI dirinya sendiri (migrasi 0008) → sertakan dalam rekap.
    const ids = [...new Set([userId, ...(team ?? []).map((t) => t.employee_id)])];
    const { data } = await supabase.from('employees').select('id, name, dept, is_active').in('id', ids);
    empRows = data ?? [];
  } else if (role === 'hrd' && hrdMode === 'spv') {
    const { data: me } = await supabase.from('employees').select('dept').eq('id', userId).maybeSingle();
    const { data } = await supabase.from('employees').select('id, name, dept, is_active')
      .eq('dept', me?.dept ?? '__none__').neq('role', 'direksi').eq('is_external', false);
    empRows = data ?? [];
  } else {
    const { data } = await supabase.from('employees').select('id, name, dept, is_active').neq('role', 'direksi').eq('is_external', false);
    empRows = data ?? [];
  }
  empRows.sort((a, b) => a.name.localeCompare(b.name));

  const { data: months } = await supabase.from('period_months').select('ym').eq('period_id', sel.id).order('ym');
  const ymList = (months ?? []).map((m) => m.ym);
  const empIds = empRows.map((e) => e.id);

  // kpi_scores lintas semua pegawai × bulan → bisa >1000; ambil penuh (chunk id + paginasi).
  const kpiRows = empIds.length && ymList.length
    ? await fetchAllByIds<{ employee_id: string; ym: string; score: number }>(empIds, (chunk, from, to) =>
        supabase.from('kpi_scores').select('employee_id, ym, score').in('employee_id', chunk).in('ym', ymList)
          .order('employee_id').order('ym').range(from, to))
    : [];
  const kpiByCell = new Map<string, { sum: number; n: number }>();
  kpiRows.forEach((r) => {
    const k = `${r.employee_id}|${r.ym}`;
    const a = kpiByCell.get(k) ?? { sum: 0, n: 0 };
    a.sum += r.score; a.n += 1; kpiByCell.set(k, a);
  });

  const { data: r360 } = empIds.length
    ? await supabase.from('result_360').select('employee_id, score').eq('period_id', sel.id).in('employee_id', empIds)
    : { data: [] };
  const s360By = new Map((r360 ?? []).map((r) => [r.employee_id, r.score]));
  const { data: pen } = empIds.length
    ? await supabase.from('compliance_penalties').select('employee_id, points').eq('period_id', sel.id).in('employee_id', empIds)
    : { data: [] };
  const penBy = new Map((pen ?? []).map((p) => [p.employee_id, p.points]));

  const rows: RekapRow[] = empRows.map((e) => {
    const monthly = ymList.map((ym) => {
      const a = kpiByCell.get(`${e.id}|${ym}`);
      return a ? a.sum / a.n : null;
    });
    const present = monthly.filter((v): v is number => v != null);
    const kpiAvg = present.length ? present.reduce((s, v) => s + v, 0) / present.length : null;
    const s360 = s360By.get(e.id) ?? null;
    const penalty = penBy.get(e.id) ?? 0;
    const final = finalScoreOf(kpiAvg, s360, sel.has_360, penalty);
    const player = playerClassOf(kpiAvg, sel.has_360 ? s360 : null);
    const kat = KAT(final);
    return { id: e.id, name: e.name, dept: e.dept, is_active: e.is_active, monthly, kpiAvg, s360, final, player, katText: kat.t, katClass: kat.c };
  })
    // Pelaporan: tampilkan yang AKTIF atau yang PUNYA DATA di periode (KPI/360°) — nonaktif
    // tanpa data disembunyikan; nonaktif yang sudah dinilai/ber-KPI di kuartal ini tetap tampil.
    .filter((r) => r.is_active || r.kpiAvg != null || r.s360 != null);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <p className="text-sm text-ink-soft">Ringkasan KPI bulanan, 360°, &amp; Skor Akhir per kuartal.</p>
        <PeriodSelect periods={periodList} current={sel.id} />
      </div>
      {!sel.has_360 && (
        <div className="mb-3 bg-warn-tint border border-warn-ink/25 p-3 rounded-control text-xs text-warn-ink">
          Kuartal ini bertipe <strong>KPI Saja</strong> — 360° diabaikan; Skor Akhir = 100% KPI.
        </div>
      )}
      <RekapTable rows={rows} monthLabels={ymList.map(labelOf)} has360={sel.has_360} />
      <p className="text-[11px] text-ink-faint mt-3 leading-relaxed">
        Rataan KPI = rerata bulan ber-skor di kuartal ini. Skor Akhir = blend KPI+360 (50/50) − punishment
        {sel.has_360 ? '' : ' (kuartal KPI saja → 100% KPI)'}. Kategori: ≥90 Melampaui · ≥80 Memenuhi · ≥70 Perlu Peningkatan · &lt;70 Di Bawah Ekspektasi.
      </p>
    </div>
  );
}
