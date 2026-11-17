import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { loadPaPdf, missingPaItems } from '@/lib/pdf/pa-load';
import { pdfFileName } from '@/lib/pa-pdf';
import { CARD, Note } from '@/components/infarm-ui';
import { INFARM_PAGE } from '@/app/infarm-fonts';
import { PdfSettingsForm } from './pdf-controls';

/**
 * PDF PEGAWAI — halaman kontrol: unduh PDF (dibuat server, lihat lib/pdf/pa-report.tsx), pratinjau, tanda isian
 * yang belum lengkap, dan pengaturan tanggal & tindak lanjut per periode. HRD Mode Admin saja.
 * Halaman ini tak menerima data laporan di klien — pratinjau = PDF dari route `unduh?inline=1`.
 */
export default async function PdfPegawaiPage({
  params, searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { employeeId } = await params;
  const { period: periodParam } = await searchParams;
  const res = await loadPaPdf(employeeId, periodParam);
  if (!res.ok) {
    if (res.status === 401) redirect('/login');
    return <Shell><p className={`${CARD} text-[13px] text-ink-soft`}>{res.error}</p></Shell>;
  }
  const { input, period, settings, isDefault, settingsReady } = res;
  const q = periodParam ? `?period=${period.id}` : '';
  const fileHref = `/laporan/${employeeId}/pdf-pegawai/unduh${q}`;
  const previewHref = `${fileHref}${q ? '&' : '?'}inline=1`;
  const missing = missingPaItems(input);

  return (
    <Shell>
      <Link href={`/laporan/${employeeId}${q}`} prefetch={false} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-brand">
        <ArrowLeft className="w-4 h-4" aria-hidden /> Detail laporan
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">PDF Pegawai</h1>
          <p className="text-[13px] text-ink-soft">{input.name} · {period.label} · tanpa komentar mentah & tanpa nama penilai</p>
        </div>
        <a href={fileHref} download={pdfFileName(input.dept, input.name, input.period.label)}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl min-h-9 px-4 text-[13px] bg-brand text-white font-bold border border-brand hover:bg-brand-ink hover:border-brand-ink">
          <Download className="w-4 h-4" aria-hidden /> Unduh PDF
        </a>
      </div>

      <div className="mt-4 space-y-3">
        {input.status !== 'finalized' && (
          <Note tone="warn">Laporan ini belum Final — angka masih bisa berubah. Unduh setelah laporan difinalisasi.</Note>
        )}
        {missing.length > 0 && (
          <Note tone="warn">Belum diisi di detail laporan: {missing.join(', ')}. Bagian itu tercetak kosong.</Note>
        )}
        {settingsReady ? (
          <PdfSettingsForm periodId={period.id} periodLabel={period.label} initial={settings} isDefault={isDefault} />
        ) : (
          <Note tone="warn">Pengaturan tanggal & tindak lanjut belum aktif — PDF memakai jadwal bawaan. Hubungi admin aplikasi.</Note>
        )}
      </div>

      {/* Pratinjau = PDF yang sama dengan berkas unduhan. Kotak biru bisa diketik di Acrobat/pembaca PDF. */}
      <iframe src={previewHref} title="Pratinjau PDF Pegawai" className="mt-4 w-full h-[80vh] rounded-card border border-line bg-surface" />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7`}>{children}</main>;
}
