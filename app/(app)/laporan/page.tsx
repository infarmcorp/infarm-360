import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { loadReport } from '@/lib/report';
import { ReportDoc } from './report-doc';
import { AspectSummaryView } from './aspect-summary-view';

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
        <h1 className="text-xl font-bold text-gray-800">Laporan Hasil Saya</h1>
        {ap ? (
          <>
            <p className="text-sm text-gray-500">Periode: {ap.label}</p>
            <p className="text-sm text-gray-500 mt-4">
              Laporan Anda <strong>belum difinalisasi</strong> oleh HRD. Silakan cek kembali nanti.
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-500 mt-4">Belum ada laporan yang difinalisasi.</p>
        )}
      </Shell>
    );
  }

  // Periode ber-laporan final, terbaru dulu.
  const { data: periods } = await supabase
    .from('periods').select('id, label, has_360, start_date').in('id', finalIds)
    .order('start_date', { ascending: false });
  const list = periods ?? [];
  if (list.length === 0) return <Shell><p className="text-sm text-gray-500">Data laporan tidak ditemukan.</p></Shell>;

  // Periode terpilih: dari ?period= bila valid (harus ber-laporan final), else terbaru.
  const selected = list.find((p) => p.id === periodParam) ?? list[0];

  const data = await loadReport(supabase, user.id, { id: selected.id, label: selected.label, has_360: selected.has_360 });
  if (!data) return <Shell><p className="text-sm text-gray-500">Data laporan tidak ditemukan.</p></Shell>;

  // Buang lapis 3 (komentar mentah per penilai) sebelum render — pegawai hanya melihat
  // agregat (L1+L2). Array dikosongkan agar tak ikut terserialisasi ke browser.
  const safe = { ...data, assessors: [], byAspect: [], essays: [] };

  const activePending = ap && !finalIds.includes(ap.id); // periode berjalan belum final

  return (
    <Shell>
      {(list.length > 1 || activePending) && (
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 mb-1.5">Pilih periode</p>
          <div className="flex flex-wrap gap-2">
            {list.map((p) => {
              const isSel = p.id === selected.id;
              return (
                <Link
                  key={p.id}
                  href={`/laporan?period=${p.id}`}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    isSel ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
          {activePending && (
            <p className="text-xs text-gray-500 mt-2">
              Laporan periode berjalan (<strong>{ap!.label}</strong>) belum difinalisasi oleh HRD.
            </p>
          )}
        </div>
      )}
      <ReportDoc data={safe} anonymize hideAssessorComments />
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
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
