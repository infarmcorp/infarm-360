import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { loadReport } from '@/lib/report';
import { ReportDoc } from './report-doc';
import { AspectSummaryView } from './aspect-summary-view';
import { planTitle } from '@/lib/dev-plan';
import { ArrowRight, FileText, NotebookPen } from 'lucide-react';
import { CARD, PageTitle, pillCls } from '@/components/infarm-ui';
import { INFARM_PAGE } from '@/app/infarm-fonts';

/**
 * Laporan Hasil Saya (pegawai). Tampil bila HRD sudah FINALISASI (RLS fr_read:
 * employee hanya melihat laporannya yang status='finalized'). Tampilan AGREGAT (L1+L2):
 * ringkasan skor, radar aspek, dan Ringkasan Aspek HRD (anonim). Komentar mentah per
 * penilai (lapis 3) TIDAK ditampilkan — dan dibuang dari payload agar tak terkirim ke
 * klien (konsisten dgn jalur SPV `loadTeamReportForSpv`).
 *
 * LINTAS PERIODE (2026-07-20): menampilkan SELURUH laporan final pegawai — termasuk periode
 * yang sudah DITUTUP — lewat pemilih periode (?period=). Default = periode final terbaru.
 * (Sebelumnya terkunci ke periode `active` saja → laporan jadi tak terakses setelah periode
 * ditutup. Datanya selalu ada & RLS mengizinkan; ini murni perbaikan logika halaman.)
 */
export default async function LaporanSayaPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { period: periodParam } = await searchParams;

  // Semua laporan FINAL milik pegawai (lintas periode, termasuk yang sudah ditutup).
  const { data: finals } = await supabase
    .from('final_reports').select('period_id').eq('employee_id', user.id).eq('status', 'finalized');
  const finalIds = [...new Set((finals ?? []).map((f) => f.period_id))];

  // Periode aktif — hanya untuk konteks pesan (belum ada laporan final / periode berjalan).
  const { data: ap } = await supabase
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();

  if (finalIds.length === 0) {
    return (
      <Shell>
        <PageTitle title="Laporan Hasil Saya">{ap ? <>Periode: {ap.label}</> : null}</PageTitle>
        <div className={`${CARD} flex items-start gap-2.5`}>
          <FileText className="w-4 h-4 text-brand shrink-0 mt-0.5" aria-hidden />
          {ap ? (
            <p className="text-[13px] text-ink-soft">
              Laporan Anda <strong className="text-ink">belum difinalisasi</strong> oleh HRD. Silakan cek kembali nanti.
            </p>
          ) : (
            <p className="text-[13px] text-ink-soft">Belum ada laporan yang difinalisasi.</p>
          )}
        </div>
      </Shell>
    );
  }

  // Periode ber-laporan final, terbaru dulu.
  const { data: periods } = await supabase
    .from('periods').select('id, label, has_360, start_date').in('id', finalIds)
    .order('start_date', { ascending: false });
  const list = periods ?? [];
  if (list.length === 0) return <Shell><p className={`${CARD} text-[13px] text-ink-soft`}>Data laporan tidak ditemukan.</p></Shell>;

  // Periode terpilih: dari ?period= bila valid (harus ber-laporan final), else terbaru.
  const selected = list.find((p) => p.id === periodParam) ?? list[0];

  // Dibaca via service_role: sejak migrasi 0041 pegawai yang DINILAI tak lagi boleh membaca baris 360°
  // mentah (identitas penilai) lewat RLS. Aman — `selected` sudah dibatasi ke laporan FINAL miliknya
  // sendiri (query user-scoped di atas, RLS fr_read), dan data mentah dibuang sebelum render (`safe`).
  const data = await loadReport(createAdminClient(), user.id, { id: selected.id, label: selected.label, has_360: selected.has_360 });
  if (!data) return <Shell><p className={`${CARD} text-[13px] text-ink-soft`}>Data laporan tidak ditemukan.</p></Shell>;

  // Buang lapis 3 (komentar mentah per penilai) sebelum render — pegawai hanya melihat
  // agregat (L1+L2). Array dikosongkan agar tak ikut terserialisasi ke browser.
  const safe = { ...data, assessors: [], byAspect: [], essays: [] };

  // Folder Laporan (Drive) — "Unduh PDF" membuka folder ini (PDF semua kuartal dari HRD). Dibaca via
  // service_role (RLS erf_read = HRD saja) dan HANYA di cabang ini, yaitu bila pegawai sudah punya laporan
  // Final. Tabel belum ada (migrasi 0050) / tak diisi → null → pesan "PDF belum tersedia".
  const { data: folder } = await createAdminClient()
    .from('employee_report_folders').select('url').eq('employee_id', user.id).maybeSingle();

  const activePending = ap && !finalIds.includes(ap.id); // periode berjalan belum final

  return (
    <Shell>
      {(list.length > 1 || activePending) && (
        <div className="mb-4 no-print">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink-soft mr-1">Pilih periode</span>
            {list.map((p) => {
              const isSel = p.id === selected.id;
              return (
                <Link
                  key={p.id}
                  href={`/laporan?period=${p.id}`}
                  className={pillCls(isSel)}
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
          {activePending && (
            <p className="text-xs text-ink-soft mt-2">
              Laporan periode berjalan (<strong className="text-ink">{ap!.label}</strong>) belum difinalisasi oleh HRD.
            </p>
          )}
        </div>
      )}
      {/* Rencana Pengembangan (0055): diisi setelah sesi empat mata, melekat ke periode laporan ini. */}
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-infarm-cream/60 px-3.5 py-2.5">
        <p className="flex items-start gap-2 text-[13px] text-ink-soft">
          <NotebookPen className="w-4 h-4 text-infarm-soil shrink-0 mt-0.5" aria-hidden />
          <span><strong className="text-ink">{planTitle(selected.label)}</strong> — isi setelah sesi empat mata dengan atasan Anda.</span>
        </p>
        <Link href={`/pengembangan?tab=saya&period=${selected.id}`} className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-ink hover:underline">
          Buka Rencana <ArrowRight className="w-3.5 h-3.5" aria-hidden />
        </Link>
      </div>
      <ReportDoc data={safe} anonymize hideAssessorComments pdfFolder={{ url: folder?.url ?? null }} />
      {safe.has360 && <AspectSummaryView summaries={safe.aspectSummaries} />}
      {safe.has360 && (
        <AspectSummaryView
          summaries={safe.qualSummaries}
          title="Ringkasan Umpan Balik Kualitatif 360°"
          intro="Rangkuman kalibrasi HRD atas jawaban pertanyaan kualitatif (esai) 360° — anonim, tanpa identitas penilai."
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    // Kanvas Design System Infarm; saat cetak latar putih tanpa padding (globals.css @media print).
    <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7 print:bg-white print:p-0`}>
      <div>{children}</div>
    </main>
  );
}
