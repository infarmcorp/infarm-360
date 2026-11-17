/**
 * PDF PEGAWAI — dokumen "Laporan Performance Appraisal" dibuat di server (@react-pdf/renderer), mengikuti
 * paket templat PDF HRD Q3 2026 (make_pdf.py + Prompt Laporan PA v2.0):
 *  - geometri make_pdf.py: margin 16 mm; kepala berjalan (logo 6,2×8,8 mm + judul + nama, garis 13,5 mm) mulai
 *    halaman 2; kaki (garis 12 mm, teks 8 mm) + "Halaman x dari y" di semua halaman; strip hijau tepi kiri.
 *  - mode: normal · "ringkasan" (Direksi: tanpa KPI, Skor Akhir = 360°, hanya bagian 1–4) · "KPI menyusul"
 *    (pegawai tanpa KPI: KPI & Skor Akhir "—").
 *  - ukuran huruf ringkasan Kekuatan/Perlu Dikembangkan diperkecil bertahap (8,5 → 7,9) agar muat di halaman 1.
 *  - kotak isian AcroForm (bisa diketik di Acrobat/pembaca PDF): catatan per aspek, prioritas, komentar atasan, nama &
 *    tanggal tanda tangan.
 *
 * ATURAN POTONG HALAMAN: blok bermakna (kartu, baris tabel, satu aspek, kotak prioritas, tanda tangan) `wrap={false}`
 * → dipindah utuh ke halaman berikutnya bila tak muat; judul bagian `minPresenceAhead` agar tak tertinggal sendirian.
 * Blok yang lebih tinggi dari satu halaman tetap dipecah (terpaksa).
 *
 * PRIVASI: hanya menerima skor + ringkasan HRD (PaReportInput) — tak ada raw (byAspect/essays) maupun L3.
 * Hanya untuk server (membaca font & logo dari disk; dipanggil route handler).
 */
import path from 'node:path';
import fs from 'node:fs';
import { Document, Page, View, Text, Image, Font, TextInput, renderToBuffer, StyleSheet } from '@react-pdf/renderer';
import { fmt2, perfCategoryOf, PERF_LABEL, finalScoreOf, roundScore, type PerfCategory } from '@/lib/scoring';
import { parseSummary, type SummaryLine } from '@/lib/summary-format';
import {
  COMPANY_NAME, CONFIDENTIAL_NOTE, NOTE_CONCLUSION, NOTE_OTHER, classifyQualQuestions, fmtDateId, methodText,
  nextPeriodLabel, periodMonthsText, sectionNumbers, type PaPdfSettings,
} from '@/lib/pa-pdf';

const DIR = path.join(process.cwd(), 'lib', 'pdf');
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  Font.register({
    family: 'Inter',
    fonts: [
      { src: path.join(DIR, 'fonts', 'Inter-Regular.ttf'), fontWeight: 400 },
      { src: path.join(DIR, 'fonts', 'Inter-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
      { src: path.join(DIR, 'fonts', 'Inter-SemiBold.ttf'), fontWeight: 600 },
      { src: path.join(DIR, 'fonts', 'Inter-Bold.ttf'), fontWeight: 700 },
    ],
  });
  // Tanpa pemenggalan kata otomatis (bawaan react-pdf menyisipkan tanda hubung di tengah kata).
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}
let logoCache: Buffer | null = null;
const logo = () => (logoCache ??= fs.readFileSync(path.join(DIR, 'assets', 'infarm-logo.png')));

// ── Palet (selaras token aplikasi; warna kategori = CAT_COLOR) ────────────────────────────────────
const C = {
  ink: '#1B1F1C', soft: '#5B615C', faint: '#8B918C', line: '#D5E2DA', lineSoft: '#EDEFEB',
  dark: '#006B31', leaf: '#4DAF4A', tint: '#F2F7F3', field: '#EAF1FB', fieldLine: '#C9D6E8', dangerTint: '#F9DEDA',
};
const CAT: Record<PerfCategory | 'none', { bar: string; ink: string; bg: string }> = {
  exceed: { bar: '#6b4e3d', ink: '#6B4E3D', bg: '#EDE3D0' },
  meet: { bar: '#388e3c', ink: '#006B31', bg: '#E4F3E9' },
  improve: { bar: '#E0A800', ink: '#8A5A12', bg: '#FBF0DE' },
  below: { bar: '#b71c1c', ink: '#A23C33', bg: '#FBEAE7' },
  none: { bar: '#D5E2DA', ink: '#5F6B65', bg: '#E9EEEB' },
};

// ── Geometri (pt) — sama dengan make_pdf.py ───────────────────────────────────────────────────────
const MM = 72 / 25.4;
const PAGE_H = 841.89;
const M = 16 * MM;
const TOP_LATER = 18 * MM;   // bingkai halaman 2+ (di bawah kepala berjalan)
const TOP_FIRST = 12 * MM;   // bingkai halaman 1 (tanpa kepala berjalan)
const s = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 8.5, color: C.ink, paddingTop: TOP_LATER, paddingBottom: 17 * MM, paddingHorizontal: M, lineHeight: 1.42 },
  strip: { position: 'absolute', left: 0, top: 0, width: 3, height: PAGE_H, backgroundColor: C.leaf },
  head: { position: 'absolute', top: 3.2 * MM, left: M, right: M, height: 10.3 * MM, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.6, borderBottomColor: C.line },
  foot: { position: 'absolute', top: PAGE_H - 12 * MM, left: M, right: M, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 2.2 * MM, borderTopWidth: 0.6, borderTopColor: C.line, fontSize: 7.2, color: C.soft },
  secRow: { flexDirection: 'row', alignItems: 'center', marginTop: 13, marginBottom: 7 },
  secNum: { width: 15, height: 15, borderRadius: 7.5, backgroundColor: C.dark, color: '#fff', fontSize: 7.5, lineHeight: 1, fontWeight: 700, textAlign: 'center', paddingTop: 3.8 },
  secTitle: { marginLeft: 7, fontSize: 10.5, lineHeight: 1.2, fontWeight: 700, color: C.dark },
  secLine: { flex: 1, marginLeft: 8, borderTopWidth: 0.6, borderTopColor: C.line },
  small: { fontSize: 7.4, color: C.soft },
  label: { fontSize: 6.6, fontWeight: 600, color: C.soft, textTransform: 'uppercase', letterSpacing: 0.3 },
  th: { color: '#fff', fontWeight: 700, fontSize: 7.4 },
  field: { borderWidth: 0.6, borderColor: C.fieldLine, backgroundColor: C.field, borderRadius: 3 },
});

const num = (v: number | null | undefined) => (v == null ? '—' : fmt2(v).replace('.', ','));

export type PaReportInput = {
  name: string;
  dept: string | null;
  /** Direksi → mode "ringkasan" (tanpa KPI, Skor Akhir = 360°, hanya bagian 1–4). */
  isDireksi: boolean;
  period: { label: string; start_date: string; end_date: string };
  has360: boolean;
  status: string | null;
  finalScore: number | null;
  kpiAvg: number | null;
  s360: number | null;
  latePenalty360: number;
  aspects: { name: string; score: number | null }[];
  aspectSummaries: Record<string, string>;
  qualSummaries: Record<string, string>;
  qualQuestions: string[];
  pdfNotes: Record<string, string>;
};

type Mode = 'normal' | 'ringkasan' | 'kpi_menyusul';
export function paMode(d: Pick<PaReportInput, 'isDireksi' | 'kpiAvg' | 'has360'>): Mode {
  if (d.isDireksi && d.has360) return 'ringkasan';
  if (d.kpiAvg == null && d.has360) return 'kpi_menyusul';
  return 'normal';
}

const FIT_SIZES = [8.5, 8.3, 8.1, 7.9];

/** Render PDF ke Buffer. Ukuran huruf ringkasan dipilih agar Kekuatan/Perlu Dikembangkan muat di halaman 1. */
export async function renderPaReport(d: PaReportInput, settings: PaPdfSettings): Promise<Buffer> {
  ensureFonts();
  let fsz = FIT_SIZES[FIT_SIZES.length - 1];
  for (const cand of FIT_SIZES) {
    const probe = await renderToBuffer(
      <Document><Page size="A4" style={s.page}><FirstPage d={d} settings={settings} fs={cand} /></Page></Document>,
    );
    if (pageCount(probe) <= 1) { fsz = cand; break; }
  }
  return renderToBuffer(<PaReport d={d} settings={settings} fs={fsz} />);
}

function pageCount(buf: Buffer): number {
  return (buf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

function PaReport({ d, settings, fs: fsz }: { d: PaReportInput; settings: PaPdfSettings; fs: number }) {
  const mode = paMode(d);
  const next = nextPeriodLabel(d.period.label);
  const sec = sectionNumbers(d.has360);
  const other = d.pdfNotes[NOTE_OTHER]?.trim() ?? '';
  const title = `Laporan Performance Appraisal ${d.period.label}`;
  const mean = aspectMean(d.aspects, d.s360, d.latePenalty360);

  return (
    <Document title={`${title} — ${d.name}`} author={COMPANY_NAME} subject="Laporan Performance Appraisal" language="id-ID">
      <Page size="A4" style={s.page}>
        <View fixed style={s.strip} />
        {/* Kepala halaman berjalan: digambar di semua halaman; di halaman 1 tertutup kop berlatar putih. */}
        <View fixed style={s.head}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf tak punya alt */}
          <Image src={logo()} style={{ width: 6.2 * MM, height: 8.8 * MM, marginRight: 2.8 * MM }} />
          <Text style={{ flex: 1, fontSize: 8, lineHeight: 1, fontWeight: 600, color: C.dark }}>{title}</Text>
          <Text style={{ fontSize: 8, lineHeight: 1, color: C.soft }}>{d.name}</Text>
        </View>
        <View fixed style={s.foot}>
          <Text>KONFIDENSIAL · {CONFIDENTIAL_NOTE} · {COMPANY_NAME}</Text>
          <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
        </View>

        <FirstPage d={d} settings={settings} fs={fsz} />

        {d.has360 && (
          <>
            {/* 3. Skor per aspek */}
            <Sec n={sec.aspects} title="SKOR PER ASPEK BUDAYA (UMPAN BALIK 360°)" />
            <View style={{ borderWidth: 0.6, borderColor: C.line }}>
              <View wrap={false} style={{ flexDirection: 'row', backgroundColor: C.dark, paddingVertical: 5 }}>
                <Text style={[s.th, { width: '30%', paddingLeft: 7 }]}>Aspek Budaya</Text>
                <Text style={[s.th, { width: '10%', textAlign: 'right', paddingRight: 8 }]}>Skor</Text>
                <Text style={[s.th, { width: '20%' }]}>Posisi skor (0—100)</Text>
                <Text style={[s.th, { width: '20%' }]}>Kategori</Text>
                <Text style={[s.th, { width: '20%' }]}>Catatan</Text>
              </View>
              {d.aspects.map((a, i) => (
                <View key={a.name} wrap={false} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 26, borderTopWidth: i ? 0.6 : 0, borderTopColor: C.line }}>
                  <Text style={{ width: '30%', paddingLeft: 7, fontWeight: 600 }}>{a.name}</Text>
                  <Text style={{ width: '10%', textAlign: 'right', paddingRight: 8 }}>{num(a.score)}</Text>
                  <View style={{ width: '20%', paddingRight: 8 }}><Bar score={a.score} /></View>
                  <View style={{ width: '20%' }}><Chip score={a.score} /></View>
                  <View style={{ width: '20%', paddingRight: 6, paddingVertical: 3 }}>
                    <Field name={`catatan_aspek_${i + 1}`} height={17} />
                  </View>
                </View>
              ))}
              <View wrap={false} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 22, backgroundColor: C.tint, borderTopWidth: 0.6, borderTopColor: C.line }}>
                <Text style={{ width: '30%', paddingLeft: 7, fontWeight: 700 }}>{mean.consistent ? 'Rata-rata 360°' : 'Skor Umpan Balik 360°'}</Text>
                <Text style={{ width: '10%', textAlign: 'right', paddingRight: 8, fontWeight: 700 }}>{num(mean.consistent ? mean.value : d.s360)}</Text>
                <Text style={{ width: '60%', color: C.soft, fontSize: 7.4 }}>
                  {mean.consistent ? `Rata-rata dari ke${mean.count} aspek budaya` : 'Gabungan seluruh penilai menurut bobot kelompok penilai'}
                </Text>
              </View>
            </View>

            {/* 4. Narasi per aspek */}
            <Sec n={sec.narr} title="PENILAIAN KUALITATIF ASPEK BUDAYA" />
            {d.aspects.map((a) => {
              const c = perfCategoryOf(a.score) ?? 'none';
              return (
                <View key={a.name} wrap={false} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: CAT[c].bg }}>
                    <Text style={{ flex: 1, fontSize: 9, fontWeight: 700 }}>{a.name}</Text>
                    <Text style={{ width: 60, fontSize: 9, fontWeight: 700, color: CAT[c].ink }}>{num(a.score)}</Text>
                    <View style={{ width: 92, alignItems: 'flex-end' }}><Chip score={a.score} /></View>
                  </View>
                  <View style={{ marginTop: 5 }}><Rich text={d.aspectSummaries[a.name] ?? ''} size={8.6} headline /></View>
                </View>
              );
            })}
            {other ? (
              <View wrap={false} style={{ marginTop: 4, backgroundColor: C.tint, borderWidth: 0.6, borderColor: C.line, borderLeftWidth: 2.5, borderLeftColor: '#1A9BE0', paddingHorizontal: 9, paddingVertical: 7 }}>
                <Text style={{ fontWeight: 700, color: C.dark, fontSize: 8.6 }}>MASUKAN LAIN DARI PENILAI</Text>
                <Text style={[s.small, { marginTop: 1, marginBottom: 4 }]}>
                  Masukan berikut ditulis penilai di luar topik indikator yang sedang dinilai, tetapi tetap disampaikan karena relevan untuk
                  pengembangan Anda.
                </Text>
                <Rich text={other} />
              </View>
            ) : null}
          </>
        )}

        {mode !== 'ringkasan' && (
          <>
            {/* Rencana pengembangan */}
            <Sec n={sec.plan} title={`RENCANA PENGEMBANGAN ${next.toUpperCase()}`} />
            <Text style={s.small}>
              <Text style={{ fontWeight: 700, color: C.ink }}>Catatan: </Text>
              bagian ini merupakan Rencana Pengembangan Individu (IDP) Anda. Bagian ini diisi oleh pegawai setelah sesi empat mata,
              berdasarkan hasil diskusi dengan atasan langsung. Prioritas 1 mengacu pada hal paling utama di kolom Perlu Dikembangkan.
              Rencana ini ditandatangani bersama atasan pada bagian {sec.sign}.
            </Text>
            {[1, 2].map((p) => <Priority key={p} n={p} />)}

            {/* Tindak lanjut */}
            <Sec n={sec.follow} title="TINDAK LANJUT SETELAH MENERIMA LAPORAN INI" />
            <View style={{ borderWidth: 0.6, borderColor: C.line }}>
              <View wrap={false} style={{ flexDirection: 'row', backgroundColor: C.dark, paddingVertical: 5 }}>
                {FOLLOW_COLS.map(([h, w]) => <Text key={h} style={[s.th, { width: w, paddingHorizontal: 5 }]}>{h}</Text>)}
              </View>
              {settings.rows.map((r, i) => (
                <View key={i} wrap={false} style={{ flexDirection: 'row', paddingVertical: 5, backgroundColor: i % 2 ? C.tint : '#fff', borderTopWidth: i ? 0.6 : 0, borderTopColor: C.line }}>
                  <Text style={{ width: FOLLOW_COLS[0][1], paddingHorizontal: 5, textAlign: 'center' }}>{i + 1}</Text>
                  <Text style={{ width: FOLLOW_COLS[1][1], paddingHorizontal: 5, fontWeight: 700 }}>{r.aksi}</Text>
                  <Text style={{ width: FOLLOW_COLS[2][1], paddingHorizontal: 5 }}>{r.target}</Text>
                  <Text style={{ width: FOLLOW_COLS[3][1], paddingHorizontal: 5 }}>{r.tenggat}</Text>
                  <Text style={{ width: FOLLOW_COLS[4][1], paddingHorizontal: 5 }}>{r.pendamping}</Text>
                  <Text style={{ width: FOLLOW_COLS[5][1], paddingHorizontal: 5 }}>{r.selesai}</Text>
                </View>
              ))}
            </View>

            {/* Komentar atasan */}
            <View wrap={false}>
              <Sec n={sec.comment} title="KOMENTAR ATASAN LANGSUNG" />
              <Text style={s.small}>
                <Text style={{ fontWeight: 700, color: C.ink }}>Untuk atasan langsung: </Text>
                bagian ini diisi setelah sesi empat mata dengan pegawai. Komentar Anda memberikan konteks penting dan memastikan laporan ini seimbang.
              </Text>
            </View>
            {[
              ['Konfirmasi Kinerja', 'Apakah hasil penilaian ini mencerminkan kinerja yang Anda amati sehari-hari?'],
              ['Konteks Tambahan', 'Adakah konteks situasional atau hal lain yang perlu diketahui pegawai?'],
              ['Dukungan yang Diberikan', `Apa bentuk dukungan konkret yang akan Anda berikan untuk pengembangan pegawai di ${next}?`],
              ['Harapan ke Depan', `Pesan atau harapan Anda untuk pegawai di ${next}.`],
            ].map(([t, q], i) => (
              <View key={t} wrap={false} style={{ marginTop: 7 }}>
                <Text style={{ fontWeight: 700 }}>{t}</Text>
                <Text style={s.small}>{q}</Text>
                <View style={{ marginTop: 3 }}><Field name={`komentar_atasan_${i + 1}`} height={38} multiline /></View>
              </View>
            ))}

            {/* Tanda tangan */}
            <View wrap={false}>
              <Sec n={sec.sign} title="TANDA TANGAN DAN PERSETUJUAN" />
              <View style={{ flexDirection: 'row' }}>
                {['Pegawai yang Bersangkutan', 'Atasan Langsung', 'HRD'].map((r, i) => (
                  <View key={r} style={{ flex: 1, marginLeft: i ? 8 : 0, borderWidth: 0.6, borderColor: C.line, padding: 8 }}>
                    <Text style={{ fontWeight: 700 }}>{r}</Text>
                    <View style={{ height: 34, borderBottomWidth: 0.8, borderBottomColor: C.soft }} />
                    <Text style={[s.label, { marginTop: 6 }]}>Nama</Text>
                    <View style={{ marginTop: 2 }}><Field name={`ttd_${i + 1}_nama`} height={16} /></View>
                    <Text style={[s.label, { marginTop: 5 }]}>Tanggal</Text>
                    <View style={{ marginTop: 2 }}><Field name={`ttd_${i + 1}_tanggal`} height={16} /></View>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
      </Page>
    </Document>
  );
}

/** Halaman 1: kop, identitas, cara membaca, skor keseluruhan, ringkasan kualitatif (juga dipakai uji muat halaman 1). */
function FirstPage({ d, settings, fs: fsz }: { d: PaReportInput; settings: PaPdfSettings; fs: number }) {
  const mode = paMode(d);
  const months = periodMonthsText(d.period.start_date, d.period.end_date);
  const sec = sectionNumbers(d.has360);
  const qual = classifyQualQuestions(d.qualQuestions);
  const conclusion = d.pdfNotes[NOTE_CONCLUSION]?.trim() ?? '';
  const live = finalScoreOf(d.kpiAvg, d.s360, d.has360);
  const mean = aspectMean(d.aspects, d.s360, d.latePenalty360);
  const pen = d.latePenalty360;
  const penTxt = Number.isInteger(pen) ? String(pen) : num(pen);

  let formula: React.ReactNode = null;
  if (mode === 'ringkasan') {
    formula = <>Skor Akhir = Skor 360 = <Text style={{ fontWeight: 700, color: C.ink }}>{num(d.s360)}</Text> (penilaian KPI tidak berlaku untuk posisi ini).</>;
  } else if (mode === 'kpi_menyusul') {
    formula = <>Skor Akhir = (Skor KPI × 50%) + (Skor 360 × 50%). Skor KPI masih menunggu data; Skor Akhir akan dilengkapi setelah data KPI masuk.</>;
  } else if (d.has360 && d.kpiAvg != null && d.s360 != null && live != null && live === d.finalScore) {
    formula = <>Skor Akhir = (Skor KPI × 50%) + (Skor 360 × 50%) = ({num(d.kpiAvg)} × 0,5) + ({num(d.s360)} × 0,5) = <Text style={{ fontWeight: 700, color: C.ink }}>{num(d.finalScore)}</Text></>;
  } else if (!d.has360) {
    formula = <>Periode ini tanpa umpan balik 360°, Skor Akhir = Skor KPI.</>;
  }
  const penLine = !d.has360 ? null : pen > 0
    ? `Potongan keterlambatan pengisian 360: ${penTxt} poin.${mean.consistent ? ` Skor 360 = rata-rata ${mean.count} aspek budaya − potongan = ${num(mean.value)} − ${penTxt} = ${num(d.s360)}.` : ''}`
    : `Tidak ada potongan keterlambatan pengisian 360.${mean.consistent ? ` Skor 360 = rata-rata ${mean.count} aspek budaya = ${num(d.s360)}.` : ''}`;

  return (
    <>
      {/* Kop — berlatar putih dan dimulai dari tepi atas agar menutup kepala berjalan di halaman 1. */}
      <View wrap={false} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: -TOP_LATER, paddingTop: TOP_FIRST, backgroundColor: '#fff' }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf tak punya alt */}
        <Image src={logo()} style={{ width: 16 * MM, height: 22.7 * MM, marginRight: 4 * MM }} />
        <View style={{ flex: 1, paddingTop: 2 }}>
          <Text style={{ fontSize: 15, lineHeight: 1.2, fontWeight: 700, color: C.dark }}>LAPORAN PERFORMANCE APPRAISAL</Text>
          <Text style={{ fontSize: 8.4, color: C.soft, marginTop: 3 }}>{d.period.label} · Periode {months}</Text>
          <Text style={{ fontSize: 8.4, color: C.soft, marginTop: 1 }}>{COMPANY_NAME}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', width: 100, paddingTop: 2 }}>
          <Text style={{ fontSize: 6.8, lineHeight: 1, fontWeight: 700, color: '#9B2C22', backgroundColor: C.dangerTint, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 7 }}>KONFIDENSIAL</Text>
          <Text style={{ fontSize: 6.8, color: C.soft, textAlign: 'right', marginTop: 4 }}>{CONFIDENTIAL_NOTE}</Text>
        </View>
      </View>

      {/* Identitas */}
      <View wrap={false} style={{ marginTop: 10, backgroundColor: C.tint, borderRadius: 5, paddingHorizontal: 10, paddingVertical: 7 }}>
        <Text style={{ fontSize: 12.5, lineHeight: 1.25, fontWeight: 700, paddingBottom: 5, borderBottomWidth: 0.6, borderBottomColor: C.line }}>{d.name}</Text>
        <View style={{ flexDirection: 'row', marginTop: 5 }}>
          <Kv k="Divisi" v={d.dept ?? '—'} w="22%" />
          <Kv k="Periode Penilaian" v={`${d.period.label} (${months})`} w="30%" />
          <Kv k="Metode Penilaian" v={methodText(mode === 'kpi_menyusul' || (mode === 'normal' && d.kpiAvg != null), d.has360)} w="26%" />
          <Kv k="Tanggal Laporan" v={fmtDateId(settings.reportDate)} w="22%" />
        </View>
      </View>

      <View wrap={false} style={{ marginTop: 8, borderWidth: 0.6, borderColor: C.line, borderLeftWidth: 2.5, borderLeftColor: '#1A9BE0', paddingHorizontal: 8, paddingVertical: 5 }}>
        <Text style={{ fontSize: 7.4, color: C.soft }}>
          <Text style={{ fontWeight: 700, color: C.ink }}>Cara membaca laporan ini: </Text>
          identitas penilai dirahasiakan. Fokuslah pada pola perilaku yang terlihat, bukan pada siapa yang menulis. Mencari tahu
          identitas penilai atau memperlakukan rekan kerja secara berbeda karena hasil umpan balik 360 termasuk pelanggaran budaya
          perusahaan. Jika ada hal yang kurang jelas, silakan hubungi Tim HRD.
        </Text>
      </View>

      {/* 1. Skor keseluruhan */}
      <Sec n={sec.score} title="SKOR KESELURUHAN" />
      <View wrap={false}>
        <View style={{ flexDirection: 'row' }}>
          {mode === 'ringkasan' ? (
            <>
              <ScoreCard label="SKOR AKHIR" score={d.s360} dark />
              <ScoreCard label="SKOR UMPAN BALIK 360° · BOBOT 100%" score={d.s360} />
            </>
          ) : (
            <>
              <ScoreCard label="SKOR AKHIR" score={mode === 'kpi_menyusul' ? null : d.finalScore} dark pending={mode === 'kpi_menyusul'} />
              <ScoreCard label={d.has360 ? 'SKOR KPI · BOBOT 50%' : 'SKOR KPI'} score={d.kpiAvg} pending={mode === 'kpi_menyusul'} />
              {d.has360 && <ScoreCard label="SKOR UMPAN BALIK 360° · BOBOT 50%" score={d.s360} />}
            </>
          )}
        </View>
        <View style={{ marginTop: 6 }}>
          {formula && <Text style={s.small}><Text style={{ fontWeight: 700, color: C.ink }}>Rumus: </Text>{formula}</Text>}
          {penLine && <Text style={s.small}>{penLine}</Text>}
        </View>
        <Legend />
      </View>

      {d.has360 && (
        <>
          <Sec n={sec.qual} title="RINGKASAN UMPAN BALIK KUALITATIF" />
          {conclusion ? (
            <View wrap={false} style={{ backgroundColor: C.tint, borderLeftWidth: 2.5, borderLeftColor: C.leaf, paddingHorizontal: 9, paddingVertical: 7 }}>
              <Rich text={conclusion} lead="Kesimpulan: " size={fsz + 0.3} />
            </View>
          ) : null}
          {(qual.strength || qual.growth) && (
            <View wrap={false} style={{ flexDirection: 'row', marginTop: 8 }}>
              <QualCol title="KEKUATAN UTAMA" color={C.dark} text={qual.strength ? d.qualSummaries[qual.strength] ?? '' : ''} size={fsz} />
              <View style={{ width: 8 }} />
              <QualCol title="PERLU DIKEMBANGKAN" color="#B5772A" text={qual.growth ? d.qualSummaries[qual.growth] ?? '' : ''} size={fsz} />
            </View>
          )}
          {qual.others.map((q) => (
            <View key={q} wrap={false} style={{ marginTop: 8, borderWidth: 0.6, borderColor: C.line }}>
              <Text style={{ backgroundColor: C.dark, color: '#fff', fontWeight: 700, paddingHorizontal: 8, paddingVertical: 4 }}>{q}</Text>
              <View style={{ padding: 8 }}><Rich text={d.qualSummaries[q] ?? ''} size={fsz} /></View>
            </View>
          ))}
        </>
      )}
    </>
  );
}

/** Rata-rata 5 aspek (sebelum potongan); `consistent` bila rata-rata − potongan = Skor 360° tersimpan (rumus HRD berlaku). */
export function aspectMean(aspects: { score: number | null }[], s360: number | null, penalty: number) {
  const xs = aspects.map((a) => a.score).filter((x): x is number => x != null);
  const value = xs.length ? roundScore(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  const consistent = value != null && s360 != null && xs.length === aspects.length
    && Math.abs(roundScore(Math.max(0, value - penalty)) - s360) < 0.011;
  const words = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh'];
  return { value, consistent, count: words[aspects.length] ?? String(aspects.length) };
}

const FOLLOW_COLS: [string, string][] = [['No.', '6%'], ['Aksi', '19%'], ['Target', '22%'], ['Tenggat', '16%'], ['Pendamping', '16%'], ['Indikator Selesai', '21%']];

// ── Potongan kecil ───────────────────────────────────────────────────────────────────────────────

function Sec({ n, title }: { n: number; title: string }) {
  return (
    <View style={s.secRow} minPresenceAhead={70} wrap={false}>
      <Text style={s.secNum}>{n}</Text>
      <Text style={s.secTitle}>{title}</Text>
      <View style={s.secLine} />
    </View>
  );
}

function Kv({ k, v, w }: { k: string; v: string; w: string }) {
  return (
    <View style={{ width: w, paddingRight: 8 }}>
      <Text style={s.label}>{k}</Text>
      <Text style={{ fontSize: 8.4, fontWeight: 600, marginTop: 1 }}>{v}</Text>
    </View>
  );
}

function ChipText({ c, text }: { c: PerfCategory | 'none'; text: string }) {
  return (
    <Text style={{ alignSelf: 'flex-start', fontSize: 6.8, lineHeight: 1, fontWeight: 600, color: CAT[c].ink, backgroundColor: CAT[c].bg, paddingTop: 2.6, paddingBottom: 2.2, paddingHorizontal: 6, borderRadius: 6 }}>
      {text}
    </Text>
  );
}

function Chip({ score }: { score: number | null }) {
  const c = perfCategoryOf(score);
  if (!c) return <Text style={{ color: C.soft }}>—</Text>;
  return <ChipText c={c} text={PERF_LABEL[c]} />;
}

function Bar({ score }: { score: number | null }) {
  const c = perfCategoryOf(score) ?? 'none';
  const w = score == null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: C.lineSoft }}>
      <View style={{ width: `${w}%`, height: 6, borderRadius: 3, backgroundColor: CAT[c].bar }} />
    </View>
  );
}

function ScoreCard({ label, score, dark = false, pending = false }: { label: string; score: number | null; dark?: boolean; pending?: boolean }) {
  const c = pending ? 'none' : perfCategoryOf(score);
  return (
    <View style={{ flex: 1, marginLeft: dark ? 0 : 6, alignItems: 'center', paddingVertical: 9, borderRadius: 5, ...(dark ? { backgroundColor: C.dark } : { borderWidth: 0.6, borderColor: C.line }) }}>
      <Text style={{ fontSize: 6.8, lineHeight: 1.2, fontWeight: 700, color: dark ? '#E4F3E9' : C.soft }}>{label}</Text>
      <Text style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 700, color: dark ? '#fff' : C.ink, marginTop: 4, marginBottom: 4 }}>{num(score)}</Text>
      {c ? <View style={{ alignItems: 'center' }}><ChipText c={c} text={pending ? 'Menunggu data KPI' : PERF_LABEL[c as PerfCategory]} /></View> : null}
    </View>
  );
}

function Legend() {
  const items: [PerfCategory, string][] = [['below', '< 70'], ['improve', '70—79,99'], ['meet', '80—89,99'], ['exceed', '≥ 90']];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 7 }}>
      <Text style={{ fontSize: 6.8, fontWeight: 600, color: C.soft, marginRight: 8 }}>Kategori</Text>
      {items.map(([c, r]) => (
        <View key={c} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
          <ChipText c={c} text={PERF_LABEL[c]} />
          <Text style={{ fontSize: 6.8, color: C.soft, marginLeft: 3 }}>{r}</Text>
        </View>
      ))}
    </View>
  );
}

function QualCol({ title, color, text, size }: { title: string; color: string; text: string; size: number }) {
  return (
    <View style={{ flex: 1, borderWidth: 0.6, borderColor: C.line }}>
      <Text style={{ backgroundColor: color, color: '#fff', fontWeight: 700, fontSize: 8, paddingHorizontal: 8, paddingVertical: 5 }}>{title}</Text>
      <View style={{ padding: 8 }}><Rich text={text} size={size} /></View>
    </View>
  );
}

function Priority({ n }: { n: number }) {
  const rows: [string, number, boolean][] = [
    ['Area yang dikembangkan', 22, false], ['Target terukur', 22, false], ['Langkah aksi', 40, true],
    ['Tenggat', 17, false], ['Pendamping', 17, false], ['Indikator berhasil', 22, false],
  ];
  return (
    <View wrap={false} style={{ marginTop: 8, borderWidth: 0.6, borderColor: C.line }}>
      <Text style={{ backgroundColor: C.dark, color: '#fff', fontWeight: 700, paddingHorizontal: 7, paddingVertical: 5 }}>PRIORITAS {n}</Text>
      {rows.map(([label, h, multi], i) => (
        <View key={label} style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: i ? 0.6 : 0, borderTopColor: C.line }}>
          <Text style={{ width: '24%', alignSelf: 'stretch', backgroundColor: C.tint, paddingHorizontal: 7, paddingVertical: 4, fontWeight: 600 }}>{label}</Text>
          <View style={{ width: '76%', padding: 3 }}>
            <Field name={`prioritas_${n}_${i + 1}`} height={h} multiline={multi} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Kotak isian AcroForm — bisa diketik di Acrobat/pembaca PDF; tampil kotak biru muda. */
function Field({ name, height, multiline = false }: { name: string; height: number; multiline?: boolean }) {
  return (
    <View style={[s.field, { height }]}>
      <TextInput name={name} multiline={multiline} fontSize={8} style={{ width: '100%', height }} />
    </View>
  );
}

/**
 * Ringkasan HRD berformat (tebal `**…**`, poin `- `). `headline` = paragraf pertama ditebalkan HANYA bila diikuti
 * daftar poin (gaya "judul + poin" seperti PDF HRD); narasi dua paragraf (Prompt v2.0) tetap biasa.
 */
function Rich({ text, lead, size = 8.5, headline = false }: { text: string; lead?: string; size?: number; headline?: boolean }) {
  if (!text.trim()) return <Text style={{ color: C.faint }}> </Text>;
  const blocks = parseSummary(text);
  const boldFirst = headline && blocks[0]?.kind === 'p' && blocks.some((b) => b.kind === 'ul');
  return (
    <View>
      {blocks.map((b, i) => b.kind === 'p' ? (
        <Text key={i} style={{ fontSize: size, marginTop: i ? 4 : 0, fontWeight: boldFirst && i === 0 ? 700 : 400, textAlign: headline ? 'justify' : 'left' }}>
          {i === 0 && lead ? <Text style={{ fontWeight: 700 }}>{lead}</Text> : null}
          <Lines lines={b.lines} />
        </Text>
      ) : (
        <View key={i} style={{ marginTop: i ? 4 : 0 }}>
          {b.items.map((lines, j) => (
            <View key={j} style={{ flexDirection: 'row', marginTop: j ? 2.5 : 0 }}>
              <Text style={{ width: 9, fontSize: size }}>•</Text>
              <Text style={{ flex: 1, fontSize: size }}><Lines lines={lines} autoLabel boldTitle={lines.length > 1} /></Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Baris-baris ringkasan. `autoLabel` menebalkan awalan "Catatan:"/"Positif:"; `boldTitle` menebalkan baris pertama poin
 * yang punya lanjutan (judul poin + penjelasan), seperti PDF HRD.
 */
function Lines({ lines, autoLabel = false, boldTitle = false }: { lines: SummaryLine[]; autoLabel?: boolean; boldTitle?: boolean }) {
  return (
    <>
      {lines.map((line, i) => (
        <Text key={i} style={boldTitle && i === 0 ? { fontWeight: 700 } : undefined}>
          {i > 0 ? '\n' : ''}
          {line.map((seg, j) => {
            if (seg.bold) return <Text key={j} style={{ fontWeight: 700 }}>{seg.text}</Text>;
            const m = autoLabel && i === 0 && j === 0 ? /^(Catatan:|Positif:)(.*)$/s.exec(seg.text) : null;
            return m
              ? <Text key={j}><Text style={{ fontWeight: 700 }}>{m[1]}</Text>{m[2]}</Text>
              : <Text key={j}>{seg.text}</Text>;
          })}
        </Text>
      ))}
    </>
  );
}
