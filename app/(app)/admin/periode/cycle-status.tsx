import Link from 'next/link';
import { CheckCircle2, Circle, CircleDot, MinusCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

/**
 * Status Siklus — TAHAP periode aktif (peta alur end-to-end) + "apa yang memblokir finalisasi".
 * Read-only; angka dari tabel yang sudah ada (RLS is_hrd, user-scoped).
 *
 * Dipindah ke halaman Kelola Siklus Periode saat halaman Beranda dihapus (2026-08). Melengkapi
 * `ReadinessPanel` di atasnya: panel itu = PRASYARAT sebelum 360° diluncurkan, kartu ini =
 * jalannya siklus sampai periode dikunci. Sebelumnya kartu Beranda; lebih awal lagi /admin/siklus.
 */
type StageStatus = 'done' | 'current' | 'todo' | 'skipped';
type Stage = { label: string; detail?: string; href?: string; status: StageStatus };

export async function CycleStatus() {
  const supabase = await createClient();
  const { data: ap } = await supabase
    .from('periods').select('id, label, status, has_360, form_open').eq('status', 'active').limit(1).maybeSingle();

  // Tanpa periode aktif kartu ini tak punya konteks — halaman Kelola Periode sendiri sudah
  // menampilkan daftar & tombol aktivasi, jadi cukup diam (tak perlu kartu kosong).
  if (!ap) return null;

  const has360 = ap.has_360;
  const [
    { count: totalEmp }, { count: mappingActive }, { count: submitted },
    { count: finalized }, { count: inReview }, { count: corrPending },
  ] = await Promise.all([
    supabase.from('employees').select('*', { count: 'exact', head: true }).eq('is_active', true).neq('role', 'direksi').eq('is_external', false),
    supabase.from('mappings').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('is_active', true),
    supabase.from('assessments').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('status', 'submitted'),
    supabase.from('final_reports').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('status', 'finalized'),
    supabase.from('final_reports').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('status', 'in_review'),
    supabase.from('relation_correction_requests').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('status', 'pending'),
  ]);

  // Cakupan 360° berbasis TARGET yang dipetakan (bukan seluruh pegawai) → cegah alarm palsu.
  const [{ data: mapT }, { data: resE }] = await Promise.all([
    has360 ? supabase.from('mappings').select('target_id').eq('period_id', ap.id).eq('is_active', true)
           : Promise.resolve({ data: [] as { target_id: string }[] }),
    has360 ? supabase.from('result_360').select('employee_id').eq('period_id', ap.id).not('score', 'is', null)
           : Promise.resolve({ data: [] as { employee_id: string }[] }),
  ]);
  const targets = new Set((mapT ?? []).map((m) => m.target_id));
  const computed = new Set((resE ?? []).map((r) => r.employee_id));
  const targetsN = targets.size;
  const scoredN = [...targets].filter((id) => computed.has(id)).length;
  const missing360 = targetsN - scoredN;

  const nEmp = totalEmp ?? 0, nMap = mappingActive ?? 0, nSub = submitted ?? 0;
  const nFinal = finalized ?? 0, nReview = inReview ?? 0, nCorr = corrPending ?? 0;

  // Cakupan KPI (dibutuhkan finalisasi di SEMUA mode, termasuk Tanpa 360°): berapa pegawai
  // sudah punya minimal satu nilai KPI di bulan-bulan periode ini.
  const { data: pm } = await supabase.from('period_months').select('ym').eq('period_id', ap.id);
  const yms = (pm ?? []).map((m) => m.ym);
  const { data: krows } = yms.length
    ? await supabase.from('kpi_scores').select('employee_id').in('ym', yms)
    : { data: [] as { employee_id: string }[] };
  const kpiFilled = new Set((krows ?? []).map((r) => r.employee_id)).size;

  // Alur END-TO-END periode (SOP lengkap) — SELALU ditampilkan utuh sebagai peta. Langkah 360°
  // ditandai 'skipped' (dilewati) saat mode Tanpa 360°, bukan dihilangkan, agar alur tetap terbaca
  // dari awal sampai akhir. 'base' = status tanpa penanda "current" (diberikan ke todo pertama).
  const skip = !has360; // langkah 360° dilewati bila periode Tanpa 360°
  const off = 'Dilewati — periode Tanpa 360°';
  const defs: { label: string; detail?: string; href?: string; base: StageStatus }[] = [
    { label: 'Periode dibuat & diaktifkan', detail: ap.label, href: '/admin/periode', base: 'done' },
    { label: 'Pertanyaan, bobot & pemetaan 360°', detail: skip ? off : `${nMap} pemetaan aktif`, href: '/admin/pemetaan', base: skip ? 'skipped' : (nMap > 0 ? 'done' : 'todo') },
    { label: 'Aktifkan / luncurkan 360°', detail: skip ? off : (ap.form_open ? 'form terbuka' : 'form ditutup'), href: '/admin/pemetaan', base: skip ? 'skipped' : 'done' },
    { label: 'Input KPI bulanan (SPV)', detail: `${kpiFilled}/${nEmp} pegawai ada KPI`, href: '/kpi?tab=riwayat', base: nEmp > 0 && kpiFilled >= nEmp ? 'done' : 'todo' },
    { label: 'Pengisian 360° oleh pegawai', detail: skip ? off : `${nSub}/${nMap} penilaian terkirim`, href: '/admin/progress', base: skip ? 'skipped' : (nMap > 0 && nSub >= nMap ? 'done' : 'todo') },
    { label: '① Hitung Ulang Skor 360°', detail: skip ? off : `${scoredN}/${targetsN} target berskor 360°`, href: '/admin/laporan', base: skip ? 'skipped' : (targetsN > 0 && scoredN >= targetsN ? 'done' : 'todo') },
    { label: 'Review & susun ringkasan', detail: skip ? off : (nReview > 0 ? `${nReview} sedang ditinjau` : 'tulis Ringkasan Aspek, opsional rilis ke SPV'), href: '/admin/laporan', base: skip ? 'skipped' : (nFinal > 0 || nReview > 0 ? 'done' : 'todo') },
    { label: 'Finalisasi laporan', detail: `${nFinal}/${nEmp} pegawai difinalkan`, href: '/admin/laporan', base: nEmp > 0 && nFinal >= nEmp ? 'done' : 'todo' },
    { label: 'Kunci & akhiri periode', detail: 'setelah semua difinalkan', href: '/admin/periode', base: 'todo' },
    { label: 'Ekspor & backup arsip', detail: 'simpanan kuartal (opsional)', href: '/admin/ekspor', base: 'todo' },
  ];
  let currentAssigned = false;
  const stages: Stage[] = defs.map((d) => {
    let status: StageStatus = d.base;
    if (d.base === 'todo' && !currentAssigned) { status = 'current'; currentAssigned = true; }
    return { label: d.label, detail: d.detail, href: d.href, status };
  });

  const blockers: { label: string; href: string }[] = [];
  if (nCorr > 0) blockers.push({ label: `${nCorr} permohonan koreksi relasi belum diproses`, href: '/admin/pemetaan' });
  if (nEmp - kpiFilled > 0) blockers.push({ label: `${nEmp - kpiFilled} pegawai belum ada nilai KPI`, href: '/kpi?tab=riwayat' });
  if (has360 && missing360 > 0) blockers.push({ label: `${missing360} target 360° belum berskor — jalankan ① Hitung Ulang (atau belum ada penilaian masuk)`, href: '/admin/laporan' });
  if (nEmp - nFinal > 0) blockers.push({ label: `${nEmp - nFinal} laporan belum difinalisasi`, href: '/admin/laporan' });

  const current = stages.find((s) => s.status === 'current');

  return (
    <div className="mb-5 rounded-panel border border-line bg-surface p-5 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 className="text-[14.5px] font-bold text-ink">Status Siklus — {ap.label}</h3>
        <span className="text-[12px] text-ink-faint">
          Tahap: <strong className="font-semibold text-brand-ink">{current?.label ?? 'Siap dikunci'}</strong>
        </span>
      </div>
      <p className="text-[12px] text-ink-faint mb-4">
        Mode 360°:{' '}
        {has360 ? (
          <span className="font-semibold text-brand-ink">Aktif</span>
        ) : (
          <>
            <span className="font-semibold text-ink-soft">Tanpa 360°</span> — Skor Akhir = 100% KPI (langkah 360° dilewati).{' '}
            <span className="text-ink-soft">Ubah lewat tombol <strong className="font-semibold">Set Tanpa 360°</strong> pada baris periode.</span>
          </>
        )}
      </p>

      <ol className="space-y-1">
        {stages.map((s, i) => (
          <li key={i} className={`flex items-start gap-2.5 rounded-control border px-3 py-2 ${
            s.status === 'current' ? 'border-brand bg-brand-tint/60'
              : s.status === 'skipped' ? 'border-line-soft bg-neutral-tint/50' : 'border-line-soft'
          }`}>
            <span className="mt-0.5 shrink-0">
              {s.status === 'done' ? <CheckCircle2 className="w-4 h-4 text-brand" />
                : s.status === 'current' ? <CircleDot className="w-4 h-4 text-brand" />
                : s.status === 'skipped' ? <MinusCircle className="w-4 h-4 text-line-strong" />
                : <Circle className="w-4 h-4 text-line-strong" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-[13px] font-semibold ${
                s.status === 'skipped' ? 'text-ink-faint' : s.status === 'todo' ? 'text-ink-soft' : 'text-ink'
              }`}>{s.label}</div>
              {s.detail && <div className={`text-[11px] ${s.status === 'skipped' ? 'text-ink-faint italic' : 'text-ink-faint'}`}>{s.detail}</div>}
            </div>
            {s.href && s.status !== 'skipped' && (
              <Link href={s.href} className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-brand-ink hover:underline">
                Buka <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-4 pt-3.5 border-t border-line-soft">
        <div className="flex items-center gap-1.5 mb-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-warn" />
          <h4 className="text-[12px] font-bold text-ink">Apa yang memblokir finalisasi</h4>
        </div>
        {blockers.length === 0 ? (
          <p className="text-[12px] text-brand-ink font-semibold">Tak ada penghalang — siap difinalisasi &amp; dikunci. 🎉</p>
        ) : (
          <ul className="space-y-1.5">
            {blockers.map((b, i) => (
              <li key={i}>
                <Link href={b.href} className="flex items-center justify-between gap-3 rounded-control border border-warn-ink/25 bg-warn-tint px-3 py-2 text-[12px] font-semibold text-warn-ink hover:brightness-97">
                  <span>{b.label}</span>
                  <span className="text-[11px] font-bold opacity-70 shrink-0">Selesaikan →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
