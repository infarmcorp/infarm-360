import { PERF_LABEL } from '@/lib/scoring';

/**
 * Template email "Rilis Laporan PA" — mengabarkan pegawai bahwa PDF laporannya sudah bisa diunduh di
 * portal (Laporan Hasil Saya → Unduh PDF → Folder Laporan Drive). Teks acuan: dokumen HRD "Komunikasi
 * Rilis Laporan PA Q3 2026" (2026-10-15), dibuat berlaku untuk periode mana pun:
 *  - otomatis dari data: label periode, rentang bulan, aspek budaya (360°), tabel kategori skor;
 *  - diisi HRD saat kirim: urutan siklus, potongan keterlambatan (ya/tidak), Tahapan Selanjutnya.
 * Modul polos (tanpa node/nodemailer) → dipakai server (kirim) & klien (pratinjau di dialog).
 * Semua isian HRD di-escape; email tak memuat skor/isi laporan (rahasia tetap di portal).
 */

export type ReleaseStep = { when: string; text: string };

export type ReleaseContent = {
  cycle: string;            // urutan siklus, mis. "ketiga" — kosong → kalimat siklus dihilangkan
  includeLate: boolean;     // paragraf potongan keterlambatan 360° (hanya bila periode ber-360°)
  steps: ReleaseStep[];     // Tahapan Selanjutnya (tanggal + kegiatan)
};

export type ReleasePeriod = {
  label: string;            // mis. "Q3 2026"
  monthRange: string;       // mis. "Juli–September 2026" ('' bila bulan periode kosong)
  has360: boolean;
  aspects: string[];        // aspek budaya periode (urut)
};

export const RELEASE_SIGNATURE = 'Tim HRD-GA INFARM';

const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const NUM_WORD_ID = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh'];
const ORDINAL_ID = ['pertama', 'kedua', 'ketiga', 'keempat', 'kelima', 'keenam', 'ketujuh', 'kedelapan', 'kesembilan', 'kesepuluh'];

/** Urutan siklus ke-n dalam kata ("ketiga"); di atas sepuluh → "ke-11". */
export function ordinalId(n: number): string {
  if (!Number.isInteger(n) || n < 1) return '';
  return ORDINAL_ID[n - 1] ?? `ke-${n}`;
}

/** Rentang bulan periode dari daftar 'YYYY-MM' → "Juli–September 2026" / "Desember 2026–Februari 2027". */
export function monthRangeId(yms: string[]): string {
  const valid = yms.filter((ym) => /^\d{4}-(0[1-9]|1[0-2])$/.test(ym)).sort();
  if (!valid.length) return '';
  const fmt = (ym: string) => ({ m: MONTHS_ID[Number(ym.slice(5, 7)) - 1], y: ym.slice(0, 4) });
  const a = fmt(valid[0]); const b = fmt(valid[valid.length - 1]);
  if (valid.length === 1 || valid[0] === valid[valid.length - 1]) return `${a.m} ${a.y}`;
  return a.y === b.y ? `${a.m}–${b.m} ${b.y}` : `${a.m} ${a.y}–${b.m} ${b.y}`;
}

/** Label kuartal berikutnya dari label "Q3 2026" → "Q4 2026"; "Q4 2026" → "Q1 2027". Tak dikenali → null. */
export function nextQuarterLabel(label: string): string | null {
  const m = /Q([1-4])\s*(\d{4})/i.exec(label);
  if (!m) return null;
  const q = Number(m[1]); const y = Number(m[2]);
  return q === 4 ? `Q1 ${y + 1}` : `Q${q + 1} ${y}`;
}

const dayMonth = (d: Date) => `${d.getDate()} ${MONTHS_ID[d.getMonth()]}`;
const dayMonthYear = (d: Date) => `${dayMonth(d)} ${d.getFullYear()}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** "16–20 Oktober 2026" / "28 Oktober–3 November 2026" / lintas tahun lengkap. */
function dayRange(a: Date, b: Date): string {
  if (a.getFullYear() !== b.getFullYear()) return `${dayMonthYear(a)}–${dayMonthYear(b)}`;
  if (a.getMonth() !== b.getMonth()) return `${dayMonth(a)}–${dayMonthYear(b)}`;
  return `${a.getDate()}–${dayMonthYear(b)}`;
}

/**
 * Isian awal Tahapan Selanjutnya — pola dokumen Q3 2026 digeser dari tanggal rilis (HRD tetap
 * menyunting sebelum kirim): pelajari mandiri 5 hari → sesi empat mata 7 hari → tinjauan dua-mingguan
 * mulai ±3,5 minggu setelah rilis → tinjauan bulanan HRD dua bulan berikutnya.
 */
export function defaultSteps(release: Date, periodLabel: string): ReleaseStep[] {
  const nextQ = nextQuarterLabel(periodLabel);
  const s2a = addDays(release, 5); const s2b = addDays(release, 11);
  const m1 = new Date(release.getFullYear(), release.getMonth() + 1, 1);
  const m2 = new Date(release.getFullYear(), release.getMonth() + 2, 1);
  const monthly = m1.getFullYear() === m2.getFullYear()
    ? `${MONTHS_ID[m1.getMonth()]}–${MONTHS_ID[m2.getMonth()]} ${m2.getFullYear()}`
    : `${MONTHS_ID[m1.getMonth()]} ${m1.getFullYear()}–${MONTHS_ID[m2.getMonth()]} ${m2.getFullYear()}`;
  return [
    { when: dayRange(release, addDays(release, 4)),
      text: 'pelajari laporan secara mandiri, lalu catat pertanyaan dan ide perbaikan untuk dibawa ke sesi empat mata.' },
    { when: dayRange(s2a, s2b),
      text: `sesi empat mata bersama atasan langsung. Setelah sesi, Anda mengisi Rencana Pengembangan ${nextQ ?? 'periode berikutnya'} (bagian 5) berdasarkan hasil diskusi, atasan mengisi komentar (bagian 7), dan laporan ditandatangani kedua pihak.` },
    { when: `Mulai ${dayMonthYear(addDays(release, 25))}`,
      text: 'tinjauan kemajuan setiap dua minggu bersama atasan langsung.' },
    { when: monthly, text: 'tinjauan bulanan bersama Tim HRD.' },
  ];
}

/** Subjek email — sama dengan dokumen acuan, periode mengikuti data. */
export function releaseSubject(periodLabel: string, name: string): string {
  return `[Konfidensial] Laporan Performance Appraisal ${periodLabel} – ${name}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

const CATEGORY_ROWS: [string, string][] = [
  ['< 70', PERF_LABEL.below],
  ['70–79', PERF_LABEL.improve],
  ['80–89', PERF_LABEL.meet],
  ['90–100', PERF_LABEL.exceed],
];

const P = 'margin:0 0 14px';
const H = 'font-size:15px;color:#1B1F1C;margin:22px 0 8px';
const TD = 'border:1px solid #C9CEC7;padding:7px 12px;text-align:left';

/**
 * HTML email rilis untuk satu penerima. `appUrl` = tautan tombol "Buka Laporan Saya" (mis.
 * https://…/laporan); kosong/tak sah → tombol tak dirender. `imageUrl` opsional (gambar dari HRD).
 */
export function releaseEmailHtml(args: {
  name: string; period: ReleasePeriod; content: ReleaseContent; appUrl?: string; imageUrl?: string;
}): string {
  const { name, period, content, appUrl, imageUrl } = args;
  const safeUrl = appUrl && /^https?:\/\//i.test(appUrl) ? appUrl : '';
  const safeImg = imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : '';
  const periodText = period.monthRange ? `${esc(period.label)} (${esc(period.monthRange)})` : esc(period.label);
  const cycle = content.cycle.trim();
  const steps = content.steps.filter((s) => s.when.trim() || s.text.trim());

  const image = safeImg
    ? `<p style="${P}"><img src="${esc(safeImg)}" alt="Laporan Performance Appraisal ${esc(period.label)}" style="display:block;max-width:100%;height:auto;border:0"></p>`
    : '';
  const button = safeUrl
    ? `<p style="margin:4px 0 18px">
         <a href="${esc(safeUrl)}" style="display:inline-block;background:#00843b;color:#ffffff;text-decoration:none;font-weight:bold;padding:11px 22px;border-radius:8px">Buka Laporan Saya</a>
       </p>
       <p style="color:#8B918C;font-size:12px;margin:0 0 18px">Atau salin tautan ini: <a href="${esc(safeUrl)}" style="color:#00843b">${esc(safeUrl)}</a></p>`
    : '';

  const method = period.has360
    ? `<p style="${P}">Skor akhir terdiri dari dua komponen dengan bobot masing-masing 50%, yaitu skor KPI dan skor 360.</p>
       ${period.aspects.length ? `<p style="margin:0 0 6px">Skor 360 dihitung dari rata-rata ${NUM_WORD_ID[period.aspects.length] ?? period.aspects.length} aspek budaya perusahaan:</p>
       <ul style="margin:0 0 14px;padding-left:22px">${period.aspects.map((a) => `<li style="margin:2px 0">${esc(a)}</li>`).join('')}</ul>` : ''}
       ${content.includeLate ? `<p style="${P}">Pada periode ini, skor 360 dapat dikurangi apabila pengisian penilaian 360 melewati batas waktu. Jika berlaku untuk Anda, keterangannya tercantum di bagian Skor Keseluruhan pada laporan.</p>` : ''}
       <p style="${P}">Jumlah penilai berbeda-beda untuk setiap posisi. Identitas penilai dirahasiakan, sehingga kami mengajak Anda berfokus pada pola perilaku yang disampaikan, bukan pada siapa yang menulis. Kami juga menyarankan agar skor dibaca bersama narasinya, tidak hanya berfokus pada angka akhir. Laporan ini merupakan potret satu kuartal, bukan penilaian yang bersifat permanen.</p>`
    : `<p style="${P}">Skor akhir pada periode ini berasal dari skor KPI.</p>
       <p style="${P}">Kami menyarankan agar skor dibaca bersama narasinya, tidak hanya berfokus pada angka akhir. Laporan ini merupakan potret satu kuartal, bukan penilaian yang bersifat permanen.</p>`;

  const stepsBlock = steps.length
    ? `<h3 style="${H}">Tahapan Selanjutnya</h3>
       <ol style="margin:0 0 14px;padding-left:22px">${steps.map((s) =>
         `<li style="margin:4px 0">${s.when.trim() ? `<strong>${esc(s.when.trim())}:</strong> ` : ''}${esc(s.text.trim())}</li>`).join('')}</ol>`
    : '';

  return `
  <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#1B1F1C;font-size:14px;line-height:1.55">
    ${image}
    <p style="${P}">Yth. ${esc(name)},</p>
    <p style="${P}">Laporan Performance Appraisal periode ${periodText} telah selesai disusun dan kini dapat Anda unduh dalam bentuk PDF melalui portal Infarm 360°, pada menu <strong>Laporan Hasil Saya</strong> → <strong>Unduh PDF</strong>. Laporan ini bersifat konfidensial dan hanya dapat diakses oleh Anda serta atasan langsung.</p>
    ${button}
    <p style="${P}">${cycle ? `Ini adalah siklus ${esc(cycle)} penerapan penilaian KPI${period.has360 ? ' + 360' : ''} di Infarm. ` : ''}Sebelum dirilis, hasil penilaian telah dikalibrasi bersama para leader untuk memastikan isi laporan sesuai dengan kondisi kerja di lapangan.</p>
    ${period.has360 ? `<p style="${P}">Tujuan penilaian 360 adalah mengumpulkan masukan dari orang-orang yang bekerja langsung dengan Anda, yaitu atasan, rekan setim, rekan lintas divisi, dan bawahan, agar penilaian kinerja tidak hanya berasal dari satu sudut pandang. Hasil ini digunakan untuk menyusun rencana pengembangan, bukan sebagai dasar sanksi maupun pembanding antarpegawai.</p>` : ''}
    <h3 style="${H}">Metode Penilaian</h3>
    ${method}
    <h3 style="${H}">Kategori Skor</h3>
    <table style="border-collapse:collapse;width:100%;max-width:520px;margin:0 0 14px;font-size:13px">
      <tr style="background:#EEEFEC"><th style="${TD}">Rentang Skor</th><th style="${TD}">Kategori</th></tr>
      ${CATEGORY_ROWS.map(([r, l]) => `<tr><td style="${TD}">${r}</td><td style="${TD}">${esc(l)}</td></tr>`).join('')}
    </table>
    ${stepsBlock}
    <p style="${P}">Apabila terdapat bagian laporan yang menurut Anda tidak sesuai dengan kondisi kerja sehari-hari, silakan sampaikan pada sesi empat mata bersama atasan. Apabila keberatan tersebut berkaitan dengan atasan langsung Anda, silakan sampaikan langsung kepada Tim HRD.</p>
    <p style="${P}">Apabila ada pertanyaan mengenai laporan maupun proses Performance Appraisal ini, jangan ragu untuk menghubungi Tim HRD.</p>
    <p style="margin:0">Hormat kami,</p>
    <p style="margin:0;font-weight:bold">${RELEASE_SIGNATURE}</p>
  </div>`;
}
