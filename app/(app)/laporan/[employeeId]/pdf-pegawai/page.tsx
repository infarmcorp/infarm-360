import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { loadReport, withoutNamedFeedback, type ReportData } from '@/lib/report';
import { finalScoreOf, fmt2, perfCategoryOf, PERF_LABEL, type PerfCategory } from '@/lib/scoring';
import {
  COMPANY_NAME, CONFIDENTIAL_NOTE, NOTE_CONCLUSION, NOTE_OTHER, classifyQualQuestions, fmtDateId, followUpRows,
  methodText, nextPeriodLabel, pageCss, periodMonthsText, resolvePaPdfSettings,
} from '@/lib/pa-pdf';
import { CARD, CAT_COLOR, Note } from '@/components/infarm-ui';
import { INFARM_PAGE } from '@/app/infarm-fonts';
import { SummaryText } from '../../summary-text';
import { PrintButton, PdfSettingsForm } from './pdf-controls';

/**
 * PDF PEGAWAI — format "Laporan Performance Appraisal" (templat paket PDF HRD Q3 2026), dicetak lewat
 * jendela cetak browser. HANYA HRD (bagian Laporan) di Mode Admin. Isi = skor + ringkasan HRD saja:
 * TANPA komentar mentah & TANPA nama penilai (aman untuk Folder Laporan pegawai). Data dimuat di server;
 * yang dikirim ke klien hanya HTML laporan + pengaturan periode (komponen klien tak menerima ReportData).
 */
export default async function PdfPegawaiPage({
  params, searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { employeeId } = await params;
  const { period: periodParam } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  const mode = (await cookies()).get('hrd_mode')?.value;
  if (!canSection(me, 'laporan') || mode !== 'admin') {
    return <Shell><p className={MSG}>PDF Pegawai hanya tersedia untuk HRD di <strong>Mode Admin</strong>.</p></Shell>;
  }

  // Periode (+ pengaturan PDF 0063). Kolom belum ada → baca ulang tanpa kolom itu (pakai bawaan).
  type PeriodRow = { id: string; label: string; has_360: boolean; status: string; start_date: string; end_date: string; pa_pdf?: unknown };
  let periods: PeriodRow[] = [];
  let settingsReady = true;
  {
    const r = await supabase.from('periods').select('id, label, has_360, status, start_date, end_date, pa_pdf').order('start_date', { ascending: false });
    if (r.error) {
      settingsReady = false;
      const r2 = await supabase.from('periods').select('id, label, has_360, status, start_date, end_date').order('start_date', { ascending: false });
      periods = (r2.data ?? []) as PeriodRow[];
    } else {
      periods = (r.data ?? []) as PeriodRow[];
    }
  }
  const ap = (periodParam ? periods.find((p) => p.id === periodParam) : undefined) ?? periods.find((p) => p.status === 'active') ?? null;
  if (!ap) return <Shell><p className={MSG}>Belum ada periode penilaian.</p></Shell>;

  const loaded = await loadReport(supabase, employeeId, ap);
  if (!loaded) return <Shell><p className={MSG}>Data tidak ditemukan atau di luar lingkup akses Anda.</p></Shell>;
  const data = withoutNamedFeedback(loaded);

  const { settings, isDefault } = resolvePaPdfSettings(ap.pa_pdf ?? null, ap.end_date);
  const detailHref = `/laporan/${employeeId}${periodParam ? `?period=${ap.id}` : ''}`;
  const missing = missingItems(data);

  return (
    <Shell>
      {/* Kepala & kaki halaman cetak (nomor halaman, KONFIDENSIAL, nama pegawai mulai halaman 2). */}
      <style>{pageCss(`Laporan Performance Appraisal ${ap.label}`, data.emp.name)}</style>
      <div className="no-print mb-4 space-y-3">
        <Link href={detailHref} prefetch={false} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-brand">
          <ArrowLeft className="w-4 h-4" aria-hidden /> Detail laporan
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold text-ink">PDF Pegawai</h1>
            <p className="text-[13px] text-ink-soft">{data.emp.name} · {ap.label} · tanpa komentar mentah & tanpa nama penilai</p>
          </div>
          <PrintButton />
        </div>
        <Note>
          Di jendela cetak pilih <strong>Simpan sebagai PDF</strong>, kertas <strong>A4</strong>, dan matikan <strong>Header dan footer</strong>{' '}
          (kepala, kaki, dan nomor halaman sudah dibuat aplikasi).
        </Note>
        {data.status !== 'finalized' && (
          <Note tone="warn">Laporan ini belum Final — angka masih bisa berubah. Cetak setelah laporan difinalisasi.</Note>
        )}
        {missing.length > 0 && (
          <Note tone="warn">Belum diisi di detail laporan: {missing.join(', ')}. Bagian itu tercetak kosong.</Note>
        )}
        {!settingsReady && (
          <Note tone="warn">Pengaturan tanggal & jadwal belum aktif — memakai bawaan. Hubungi admin aplikasi.</Note>
        )}
        {settingsReady && (
          <PdfSettingsForm periodId={ap.id} periodLabel={ap.label} initial={settings} isDefault={isDefault} />
        )}
      </div>

      <PaDocument data={data} period={ap} reportDateIso={settings.reportDate} tenggat={settings.tenggat} />
    </Shell>
  );
}

// ── Dokumen ──────────────────────────────────────────────────────────────────────────────────────

const num = (v: number | null) => (v == null ? '—' : fmt2(v).replace('.', ','));

function PaDocument({ data, period, reportDateIso, tenggat }: {
  data: ReportData;
  period: { label: string; start_date: string; end_date: string; has_360: boolean };
  reportDateIso: string;
  tenggat: readonly string[];
}) {
  const has360 = data.has360;
  const hasKpi = data.kpiAvg != null;
  const both = hasKpi && has360 && data.s360 != null;
  const months = periodMonthsText(period.start_date, period.end_date);
  const next = nextPeriodLabel(period.label);
  const liveFinal = finalScoreOf(data.kpiAvg, data.s360, has360);
  const showFormula = both && liveFinal != null && data.finalScore != null && liveFinal === data.finalScore;

  // Nomor bagian dinamis: periode tanpa 360° tak punya bagian umpan balik.
  let n = 0;
  const sec = {
    score: ++n,
    qual: has360 ? ++n : 0,
    aspects: has360 ? ++n : 0,
    narr: has360 ? ++n : 0,
    plan: ++n,
    follow: ++n,
    comment: ++n,
    sign: ++n,
  };
  const qual = classifyQualQuestions(data.qualQuestions);
  const conclusion = data.pdfNotes[NOTE_CONCLUSION]?.trim() ?? '';
  const otherFeedback = data.pdfNotes[NOTE_OTHER]?.trim() ?? '';

  return (
    <article className="mx-auto max-w-[210mm] bg-surface text-ink text-[11px] leading-relaxed rounded-card shadow-card border border-line px-[12mm] py-[12mm] print:max-w-none print:rounded-none print:shadow-none print:border-0 print:p-0 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      {/* Kop */}
      <header className="flex items-start gap-4">
        <Image src="/infarm-id-logo.png" alt="Infarm" width={56} height={79} className="shrink-0" priority />
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-bold tracking-tight text-brand-ink leading-tight">LAPORAN PERFORMANCE APPRAISAL</h1>
          <p className="text-[12px] text-ink-soft mt-1">{period.label} · Periode {months}</p>
          <p className="text-[12px] text-ink-soft">{COMPANY_NAME}</p>
        </div>
        <div className="text-right shrink-0">
          <span className="inline-block rounded-full bg-danger-tint text-danger-ink font-bold text-[10px] px-2.5 py-0.5">KONFIDENSIAL</span>
          <p className="text-[10px] text-ink-soft mt-1 max-w-[34mm] ml-auto">{CONFIDENTIAL_NOTE}</p>
        </div>
      </header>

      {/* Identitas */}
      <section className="mt-4 rounded-xl bg-brand-tint/50 border border-line px-4 py-3">
        <p className="text-[18px] font-bold text-ink pb-2 border-b border-line">{data.emp.name}</p>
        <dl className="grid grid-cols-4 gap-3 pt-2">
          <Kv k="Divisi" v={data.emp.dept ?? '—'} />
          <Kv k="Periode Penilaian" v={`${period.label} (${months})`} />
          <Kv k="Metode Penilaian" v={methodText(hasKpi, has360)} />
          <Kv k="Tanggal Laporan" v={fmtDateId(reportDateIso)} />
        </dl>
      </section>

      <p className="mt-3 rounded-lg border border-line border-l-4 border-l-brand px-3 py-2 text-[10.5px] text-ink-soft">
        <strong className="text-ink">Cara membaca laporan ini:</strong> identitas penilai dirahasiakan. Fokuslah pada pola perilaku yang
        terlihat, bukan pada siapa yang menulis. Mencari tahu identitas penilai atau memperlakukan rekan kerja secara berbeda karena hasil
        umpan balik 360 termasuk pelanggaran budaya perusahaan. Jika ada hal yang kurang jelas, silakan hubungi Tim HRD.
      </p>

      {/* 1. Skor keseluruhan */}
      <Sec n={sec.score} title="Skor Keseluruhan" />
      <div className={`grid gap-3 ${both ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <ScoreCard label="Skor Akhir" score={data.finalScore} dark />
        {hasKpi && <ScoreCard label={both ? 'Skor KPI · Bobot 50%' : 'Skor KPI'} score={data.kpiAvg} />}
        {has360 && <ScoreCard label={both ? 'Skor Umpan Balik 360° · Bobot 50%' : 'Skor Umpan Balik 360°'} score={data.s360} />}
      </div>
      <div className="mt-2 text-[10.5px] text-ink-soft space-y-0.5">
        {showFormula && (
          <p>
            <strong className="text-ink">Rumus:</strong> Skor Akhir = (Skor KPI × 50%) + (Skor 360 × 50%) = ({num(data.kpiAvg)} × 0,5) + ({num(data.s360)} × 0,5) ={' '}
            <strong className="text-ink">{num(data.finalScore)}</strong>
          </p>
        )}
        {!hasKpi && has360 && <p>Tanpa KPI pada periode ini, Skor Akhir = Skor Umpan Balik 360°.</p>}
        {hasKpi && !has360 && <p>Periode ini tanpa umpan balik 360°, Skor Akhir = Skor KPI.</p>}
        {has360 && (
          <p>{data.latePenalty360 > 0
            ? `Skor 360 sudah termasuk potongan keterlambatan pengisian 360 sebesar ${num(data.latePenalty360)} poin.`
            : 'Tidak ada potongan keterlambatan pengisian 360.'}</p>
        )}
      </div>
      <Legend />

      {/* 2. Ringkasan kualitatif */}
      {has360 && (
        <>
          <Sec n={sec.qual} title="Ringkasan Umpan Balik Kualitatif" />
          {conclusion && (
            <div className="rounded-lg bg-brand-tint/50 border-l-4 border-brand px-3 py-2.5 text-[11.5px] break-inside-avoid">
              <strong>Kesimpulan:</strong> <SummaryInline text={conclusion} />
            </div>
          )}
          {(qual.strength || qual.growth) && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <QualColumn title="Kekuatan Utama" tone="brand" text={qual.strength ? data.qualSummaries[qual.strength] : undefined} />
              <QualColumn title="Perlu Dikembangkan" tone="warn" text={qual.growth ? data.qualSummaries[qual.growth] : undefined} />
            </div>
          )}
          {qual.others.map((q) => (
            <div key={q} className="mt-3 rounded-lg border border-line break-inside-avoid">
              <p className="px-3 py-1.5 font-bold text-white bg-brand-ink rounded-t-lg">{q}</p>
              <div className="px-3 py-2.5">{data.qualSummaries[q] ? <SummaryText text={data.qualSummaries[q]} /> : <Blank />}</div>
            </div>
          ))}

          {/* 3. Skor per aspek */}
          <Sec n={sec.aspects} title="Skor per Aspek Budaya (Umpan Balik 360°)" />
          <table className="w-full border border-line text-[11px]">
            <thead>
              <tr className="bg-brand-ink text-white text-left">
                <th className="px-2.5 py-1.5 font-semibold w-[28%]">Aspek Budaya</th>
                <th className="px-2.5 py-1.5 font-semibold w-[9%] text-right">Skor</th>
                <th className="px-2.5 py-1.5 font-semibold w-[19%]">Posisi skor (0—100)</th>
                <th className="px-2.5 py-1.5 font-semibold w-[20%]">Kategori</th>
                <th className="px-2.5 py-1.5 font-semibold">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {data.aspects.map((a) => (
                <tr key={a.name} className="border-t border-line break-inside-avoid">
                  <td className="px-2.5 py-2 font-semibold">{a.name}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{num(a.score)}</td>
                  <td className="px-2.5 py-2"><Bar score={a.score} /></td>
                  <td className="px-2.5 py-2"><CatChip score={a.score} /></td>
                  <td className="px-2.5 py-1.5"><div className="h-6 rounded-md border border-line bg-bg" /></td>
                </tr>
              ))}
              <tr className="border-t border-line bg-brand-tint/50">
                <td className="px-2.5 py-2 font-bold">Skor Umpan Balik 360°</td>
                <td className="px-2.5 py-2 text-right font-bold tabular-nums">{num(data.s360)}</td>
                <td colSpan={3} className="px-2.5 py-2 text-ink-soft">
                  Gabungan seluruh penilai menurut bobot kelompok penilai{data.latePenalty360 > 0 ? ', setelah potongan keterlambatan' : ''}
                </td>
              </tr>
            </tbody>
          </table>

          {/* 4. Narasi per aspek */}
          <Sec n={sec.narr} title="Penilaian Kualitatif Aspek Budaya" />
          <div className="space-y-4">
            {data.aspects.map((a) => (
              <div key={a.name} className="break-inside-avoid">
                <div className="flex items-center gap-3 pb-1 border-b-2" style={{ borderColor: catColor(a.score) }}>
                  <p className="flex-1 font-bold text-[12px]">{a.name}</p>
                  <span className="font-bold text-[12px] tabular-nums" style={{ color: catInk(a.score) }}>{num(a.score)}</span>
                  <CatChip score={a.score} />
                </div>
                <div className="pt-2">{data.aspectSummaries[a.name] ? <SummaryText text={data.aspectSummaries[a.name]} /> : <Blank />}</div>
              </div>
            ))}
          </div>
          {otherFeedback && (
            <div className="mt-4 rounded-lg bg-brand-tint/50 border border-line border-l-4 border-l-brand px-3 py-2.5 break-inside-avoid">
              <p className="font-bold text-brand-ink text-[11.5px]">MASUKAN LAIN DARI PENILAI</p>
              <p className="text-[10.5px] text-ink-soft mb-1.5">
                Masukan berikut ditulis penilai di luar topik indikator yang sedang dinilai, tetapi tetap disampaikan karena relevan untuk
                pengembangan Anda.
              </p>
              <SummaryText text={otherFeedback} />
            </div>
          )}
        </>
      )}

      {/* Rencana pengembangan (diisi tangan) */}
      <Sec n={sec.plan} title={`Rencana Pengembangan ${next}`} />
      <p className="text-[10.5px] text-ink-soft">
        <strong className="text-ink">Catatan:</strong> bagian ini merupakan Rencana Pengembangan Individu (IDP) Anda. Bagian ini diisi oleh pegawai
        setelah sesi empat mata, berdasarkan hasil diskusi dengan atasan langsung. Prioritas 1 mengacu pada hal paling utama di kolom Perlu
        Dikembangkan. Rencana ini ditandatangani bersama atasan pada bagian {sec.sign}.
      </p>
      {[1, 2].map((p) => <PriorityBox key={p} n={p} />)}

      {/* Tindak lanjut */}
      <Sec n={sec.follow} title="Tindak Lanjut Setelah Menerima Laporan Ini" />
      <table className="w-full border border-line text-[10.5px] break-inside-avoid">
        <thead>
          <tr className="bg-brand-ink text-white text-left">
            <th className="px-2 py-1.5 font-semibold w-[5%]">No.</th>
            <th className="px-2 py-1.5 font-semibold w-[20%]">Aksi</th>
            <th className="px-2 py-1.5 font-semibold w-[22%]">Target</th>
            <th className="px-2 py-1.5 font-semibold w-[16%]">Tenggat</th>
            <th className="px-2 py-1.5 font-semibold w-[16%]">Pendamping</th>
            <th className="px-2 py-1.5 font-semibold">Indikator Selesai</th>
          </tr>
        </thead>
        <tbody>
          {followUpRows(next, tenggat, { plan: sec.plan, comment: sec.comment }).map((r) => (
            <tr key={r.no} className="border-t border-line align-top even:bg-brand-tint/40">
              <td className="px-2 py-2 text-center">{r.no}</td>
              <td className="px-2 py-2 font-semibold">{r.aksi}</td>
              <td className="px-2 py-2">{r.target}</td>
              <td className="px-2 py-2">{r.tenggat}</td>
              <td className="px-2 py-2">{r.pendamping}</td>
              <td className="px-2 py-2">{r.selesai}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Komentar atasan (diisi tangan) */}
      <Sec n={sec.comment} title="Komentar Atasan Langsung" />
      <p className="text-[10.5px] text-ink-soft">
        <strong className="text-ink">Untuk atasan langsung:</strong> bagian ini diisi setelah sesi empat mata dengan pegawai. Komentar Anda
        memberikan konteks penting dan memastikan laporan ini seimbang.
      </p>
      <div className="mt-2 space-y-2.5">
        {[
          ['Konfirmasi Kinerja', 'Apakah hasil penilaian ini mencerminkan kinerja yang Anda amati sehari-hari?'],
          ['Konteks Tambahan', 'Adakah konteks situasional atau hal lain yang perlu diketahui pegawai?'],
          ['Dukungan yang Diberikan', `Apa bentuk dukungan konkret yang akan Anda berikan untuk pengembangan pegawai di ${next}?`],
          ['Harapan ke Depan', `Pesan atau harapan Anda untuk pegawai di ${next}.`],
        ].map(([t, q]) => (
          <div key={t} className="break-inside-avoid">
            <p className="font-bold text-[11px]">{t}</p>
            <p className="text-[10.5px] text-ink-soft">{q}</p>
            <div className="mt-1 h-14 rounded-lg border border-line bg-bg" />
          </div>
        ))}
      </div>

      {/* Tanda tangan */}
      <Sec n={sec.sign} title="Tanda Tangan dan Persetujuan" />
      <div className="grid grid-cols-3 gap-3 break-inside-avoid">
        {['Pegawai yang Bersangkutan', 'Atasan Langsung', 'HRD'].map((r) => (
          <div key={r} className="rounded-lg border border-line px-3 py-3">
            <p className="font-bold text-[11px]">{r}</p>
            <div className="mt-12 border-t border-ink-soft" />
            <p className="mt-2 text-[10px] font-semibold text-ink-soft">Nama</p>
            <div className="mt-0.5 h-6 rounded-md border border-line bg-bg" />
            <p className="mt-2 text-[10px] font-semibold text-ink-soft">Tanggal</p>
            <div className="mt-0.5 h-6 rounded-md border border-line bg-bg" />
          </div>
        ))}
      </div>
    </article>
  );
}

// ── Potongan kecil ───────────────────────────────────────────────────────────────────────────────

const CHIP: Record<PerfCategory, string> = {
  exceed: 'bg-infarm-cream text-infarm-soil',
  meet: 'bg-brand-tint text-brand-ink',
  improve: 'bg-warn-tint text-warn-ink',
  below: 'bg-danger-tint text-danger-ink',
};
const INK: Record<PerfCategory, string> = { exceed: '#6B4E3D', meet: '#006B31', improve: '#8A5A12', below: '#A23C33' };
const catColor = (s: number | null) => { const c = perfCategoryOf(s); return c ? CAT_COLOR[c] : '#E4E6E2'; };
const catInk = (s: number | null) => { const c = perfCategoryOf(s); return c ? INK[c] : '#5B615C'; };

function CatChip({ score, onDark = false }: { score: number | null; onDark?: boolean }) {
  const c = perfCategoryOf(score);
  if (!c) return <span className={onDark ? 'text-white/80' : 'text-ink-soft'}>—</span>;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${CHIP[c]}`}>{PERF_LABEL[c]}</span>;
}

function Bar({ score }: { score: number | null }) {
  const w = score == null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <div className="h-2 w-full rounded-full bg-line-soft overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: catColor(score) }} />
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{k}</dt>
      <dd className="text-[12px] font-semibold text-ink">{v}</dd>
    </div>
  );
}

function Sec({ n, title }: { n: number; title: string }) {
  return (
    <div className="mt-6 mb-2.5 flex items-center gap-2.5 break-after-avoid">
      <span className="w-6 h-6 shrink-0 rounded-full bg-brand-ink text-white text-[11px] font-bold flex items-center justify-center">{n}</span>
      <h2 className="text-[14px] font-bold uppercase text-brand-ink">{title}</h2>
      <span className="flex-1 border-t border-line" aria-hidden />
    </div>
  );
}

function ScoreCard({ label, score, dark = false }: { label: string; score: number | null; dark?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-3 text-center ${dark ? 'bg-brand-ink text-white' : 'border border-line'}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${dark ? 'text-white/85' : 'text-ink-soft'}`}>{label}</p>
      <p className="text-[30px] font-bold leading-tight tabular-nums">{num(score)}</p>
      <CatChip score={score} onDark={dark} />
    </div>
  );
}

function Legend() {
  const items: [PerfCategory, string][] = [['below', '< 70'], ['improve', '70—79,99'], ['meet', '80—89,99'], ['exceed', '≥ 90']];
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-soft">
      <span className="font-semibold">Kategori</span>
      {items.map(([c, r]) => (
        <span key={c} className="inline-flex items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${CHIP[c]}`}>{PERF_LABEL[c]}</span>{r}
        </span>
      ))}
    </div>
  );
}

function QualColumn({ title, tone, text }: { title: string; tone: 'brand' | 'warn'; text: string | undefined }) {
  return (
    <div className="rounded-lg border border-line overflow-hidden">
      <p className={`px-3 py-1.5 font-bold text-white uppercase text-[11px] ${tone === 'brand' ? 'bg-brand-ink' : 'bg-warn-ink'}`}>{title}</p>
      <div className="px-3 py-2.5">{text ? <SummaryText text={text} /> : <Blank />}</div>
    </div>
  );
}

function PriorityBox({ n }: { n: number }) {
  const rows: [string, string][] = [
    ['Area yang dikembangkan', 'h-7'], ['Target terukur', 'h-7'], ['Langkah aksi', 'h-12'],
    ['Tenggat', 'h-6'], ['Pendamping', 'h-6'], ['Indikator berhasil', 'h-7'],
  ];
  return (
    <table className="mt-3 w-full border border-line text-[11px] break-inside-avoid">
      <thead><tr><th colSpan={2} className="bg-brand-ink text-white text-left px-2.5 py-1.5 font-bold">PRIORITAS {n}</th></tr></thead>
      <tbody>
        {rows.map(([label, h]) => (
          <tr key={label} className="border-t border-line">
            <td className="w-[26%] bg-brand-tint/50 px-2.5 py-1.5 font-semibold">{label}</td>
            <td className="px-2 py-1.5"><div className={`${h} rounded-md border border-line bg-bg`} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Kesimpulan satu paragraf: tampil sebaris setelah label tebal (format tebal/poin tetap didukung). */
function SummaryInline({ text }: { text: string }) {
  return <span className="inline [&>div]:inline [&_p]:inline"><SummaryText text={text} /></span>;
}

/** Isian HRD kosong: di layar diberi tanda (tak ikut tercetak); di cetakan bagian itu kosong. */
function Blank() {
  return <p className="no-print text-ink-soft italic">Belum diisi HRD di detail laporan.</p>;
}

function missingItems(d: ReportData): string[] {
  if (!d.has360) return [];
  const out: string[] = [];
  if (!d.pdfNotes[NOTE_CONCLUSION]?.trim()) out.push('Kesimpulan');
  const emptyAspects = d.aspects.filter((a) => !d.aspectSummaries[a.name]?.trim()).length;
  if (emptyAspects) out.push(`ringkasan ${emptyAspects} aspek`);
  const emptyQual = d.qualQuestions.filter((q) => !d.qualSummaries[q]?.trim()).length;
  if (emptyQual) out.push(`ringkasan ${emptyQual} pertanyaan esai`);
  return out;
}

const MSG = `${CARD} text-[13px] text-ink-soft`;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7 print:bg-white print:p-0`}>
      {children}
    </main>
  );
}

