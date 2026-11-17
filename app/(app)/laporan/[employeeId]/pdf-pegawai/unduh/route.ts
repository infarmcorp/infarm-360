import { loadPaPdf } from '@/lib/pdf/pa-load';
import { renderPaReport } from '@/lib/pdf/pa-report';
import { pdfFileName } from '@/lib/pa-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unduh PDF Pegawai (format Laporan Performance Appraisal) — HRD Mode Admin saja (gerbang di loadPaPdf).
 * `?inline=1` = tampil di browser (pratinjau di halaman kontrol); bawaan = unduh berkas.
 */
export async function GET(req: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const url = new URL(req.url);
  const res = await loadPaPdf(employeeId, url.searchParams.get('period') ?? undefined);
  if (!res.ok) return new Response(res.error, { status: res.status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  const pdf = await renderPaReport(res.input, res.settings);
  const name = pdfFileName(res.input.dept, res.input.name, res.input.period.label);
  const disposition = url.searchParams.get('inline') === '1' ? 'inline' : 'attachment';
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${name.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
