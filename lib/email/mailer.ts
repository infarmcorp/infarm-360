/**
 * Pengirim email terpadu — dua jalur, dipilih otomatis dari env (DORMAN bila kosong):
 *   1) Gmail SMTP  — bila SMTP_USER + SMTP_PASS diset (App Password Gmail). Kirim dari
 *      akun Gmail sendiri ke siapa pun; tak perlu domain. Limit Gmail gratis ~500/hari.
 *   2) Resend REST — bila RESEND_API_KEY diset (butuh domain terverifikasi utk produksi).
 * Prioritas SMTP > Resend. Rahasia hanya di server (jangan NEXT_PUBLIC_*).
 *
 * Aktivasi Gmail SMTP: aktifkan 2FA di akun Google → buat App Password (16 char) →
 * set env di Vercel: SMTP_USER=<email gmail>, SMTP_PASS=<app password>. Opsional
 * SMTP_FROM (mis. "Infarm 360 <infarmcorp@gmail.com>"), SMTP_HOST, SMTP_PORT.
 */
import nodemailer from 'nodemailer';
import { panduanFor } from '@/lib/panduan';

export type SendResult = { ok: true } | { ok: false; reason: 'not_configured' | 'error'; detail?: string };

/** Lampiran email: file diambil provider dari URL publik (mis. /panduan/x.pdf). */
export type EmailAttachment = { filename: string; path: string };

type Provider = 'smtp' | 'resend' | null;

function provider(): Provider {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
  if (process.env.RESEND_API_KEY) return 'resend';
  return null;
}

export function emailConfigured(): boolean {
  return provider() !== null;
}

export async function sendEmail(msg: { to: string | string[]; subject: string; html: string; text?: string; attachments?: EmailAttachment[] }): Promise<SendResult> {
  const p = provider();
  if (!p) return { ok: false, reason: 'not_configured' };
  // Selalu sertakan alternatif PLAIN-TEXT (multipart) → menurunkan skor spam & terbaca di
  // klien tanpa HTML. Bila tak diberikan eksplisit, diturunkan otomatis dari HTML.
  const text = msg.text ?? htmlToText(msg.html);
  return p === 'smtp' ? sendViaSmtp({ ...msg, text }) : sendViaResend({ ...msg, text });
}

/** Jalur 1 — Gmail (atau SMTP lain) via nodemailer. App Password boleh berisi spasi. */
async function sendViaSmtp({ to, subject, html, text, attachments }: { to: string | string[]; subject: string; html: string; text: string; attachments?: EmailAttachment[] }): Promise<SendResult> {
  const user = process.env.SMTP_USER!;
  const pass = (process.env.SMTP_PASS ?? '').replace(/\s+/g, ''); // App Password sering ditulis berspasi
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const from = process.env.SMTP_FROM || `Infarm 360 <${user}>`;
  try {
    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465, // 465 = SSL; 587 = STARTTLS
      auth: { user, pass },
    });
    await transporter.sendMail({
      from, to: Array.isArray(to) ? to.join(',') : to, subject, html, text,
      // nodemailer mengunduh sendiri tiap `path` (URL) → jadikan lampiran.
      ...(attachments?.length ? { attachments: attachments.map((a) => ({ filename: a.filename, path: a.path })) } : {}),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', detail: String(e).slice(0, 300) };
  }
}

/** Jalur 2 — Resend REST API (tanpa SDK). */
async function sendViaResend({ to, subject, html, text, attachments }: { to: string | string[]; subject: string; html: string; text: string; attachments?: EmailAttachment[] }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY!;
  const from = process.env.RESEND_FROM || 'Infarm 360 <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      // Resend mengunduh tiap `path` (URL) menjadi lampiran.
      body: JSON.stringify({
        from, to: Array.isArray(to) ? to : [to], subject, html, text,
        ...(attachments?.length ? { attachments: attachments.map((a) => ({ filename: a.filename, path: a.path })) } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, reason: 'error', detail: detail.slice(0, 300) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', detail: String(e).slice(0, 200) };
  }
}

/**
 * Template HTML pengingat 360° (daftar nama yang belum dinilai).
 * `appUrl` opsional → bila ada, tampilkan tombol "Buka Portal" yang menautkan ke
 * Daftar Penilaian Saya. Dorman-aman: tanpa appUrl, tombol tak dirender.
 */
export function reminderHtml(assessorName: string, periodLabel: string, pendingNames: string[], appUrl?: string): string {
  const items = pendingNames.map((n) => `<li style="margin:2px 0">${escapeHtml(n)}</li>`).join('');
  const safeUrl = appUrl && /^https?:\/\//i.test(appUrl) ? appUrl : '';
  const button = safeUrl
    ? `<p style="margin:20px 0">
         <a href="${escapeHtml(safeUrl)}" style="display:inline-block;background:#00843b;color:#ffffff;text-decoration:none;font-weight:bold;padding:11px 22px;border-radius:8px">Buka Portal Infarm 360°</a>
       </p>
       <p style="color:#9ca3af;font-size:12px;margin:0">Atau salin tautan ini: <a href="${escapeHtml(safeUrl)}" style="color:#00843b">${escapeHtml(safeUrl)}</a></p>`
    : '';
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1f2937">
    <h2 style="color:#00843b;margin-bottom:4px">Pengingat Penilaian 360°</h2>
    <p style="color:#6b7280;margin-top:0">Periode: <strong>${escapeHtml(periodLabel)}</strong></p>
    <p>Halo <strong>${escapeHtml(assessorName)}</strong>,</p>
    <p>Anda masih memiliki <strong>${pendingNames.length}</strong> penilaian 360° yang belum diselesaikan:</p>
    <ul style="padding-left:18px">${items}</ul>
    <p>Mohon selesaikan melalui menu <strong>Daftar Penilaian Saya</strong> di portal Infarm 360°.</p>
    ${button}
    <p style="color:#9ca3af;font-size:12px;margin-top:24px">Email otomatis dari Infarm 360° Performance Appraisal. Mohon tidak membalas.</p>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

/**
 * Konversi HTML email → plain-text yang rapi (alternatif multipart, anti-spam).
 * Pertahankan tautan sebagai "teks (url)", item daftar sebagai "- ", dan jaga baris baru
 * pada blok. Bukan parser HTML penuh — cukup untuk template email sederhana kita.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*\/\s*(p|div|h[1-6]|tr|ul|ol|li|table)\s*>/gi, '\n')
    .replace(/<\s*a[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\s*\/\s*a\s*>/gi,
      (_m, href, label) => {
        const t = label.replace(/<[^>]+>/g, '').trim();
        return t && t !== href ? `${t} (${href})` : href;
      })
    .replace(/<[^>]+>/g, '')                 // buang sisa tag
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')              // rapikan spasi sebelum newline
    .replace(/\n{3,}/g, '\n\n')              // maksimal satu baris kosong
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const ROLE_LABEL_ID: Record<string, string> = {
  employee: 'Pegawai', spv: 'Supervisor', hrd: 'HRD Admin', direksi: 'Direksi',
};

/**
 * Lampiran panduan PDF sesuai peran penerima (mapping terpusat di lib/panduan.ts, dipakai bersama
 * section "Panduan Pengguna" di aplikasi). Mengembalikan null bila base URL kosong (tak bisa
 * membentuk tautan) — pemanggil cukup mengirim tanpa lampiran.
 */
export function panduanAttachment(role: string, isHrdAdmin: boolean, base: string, isCoordinator = false): EmailAttachment | null {
  if (!base) return null;
  const def = panduanFor(role, isHrdAdmin, isCoordinator);
  return { filename: def.filename, path: `${base.replace(/\/+$/, '')}/panduan/${def.file}` };
}

/** Panduan ringkas per peran untuk email onboarding (3–5 langkah inti). */
function roleGuide(role: string, isHrdAdmin: boolean): string[] {
  if (role === 'hrd' || isHrdAdmin) return [
    'Atur siklus di Kelola Siklus Periode, Pemetaan (siapa menilai siapa), dan Kelola Pertanyaan.',
    'Pantau pengisian di Progress 360 dan kirim pengingat bila perlu.',
    'Setelah cukup terisi, buka Review Hasil Akhir → Finalisasi & rilis laporan.',
    'Gunakan tombol Mode Admin ↔ Mode posisi-asli untuk berganti peran.',
  ];
  if (role === 'spv') return [
    'Isi Input KPI Anggota tiap bulan (termasuk KPI Anda sendiri).',
    'Isi Daftar Penilaian Saya (penilaian 360°) seperti pegawai lain.',
    'Pantau tim di Monitor Kinerja & Laporan Kinerja Tim, lalu beri ACC laporan.',
  ];
  if (role === 'direksi') return [
    'Lihat Dashboard eksekutif untuk ringkasan kinerja organisasi.',
    'Tinjau & ACC usulan Promosi/Suksesi.',
  ];
  return [
    'Buka menu Daftar Penilaian Saya.',
    'Klik Mulai Nilai pada tiap rekan: isi rating + komentar (wajib) + esai kualitatif.',
    'Tekan Kirim Penilaian 360° (kerja Anda tersimpan otomatis tiap 5 detik).',
    'Hasil Anda muncul di Laporan Hasil Saya setelah HRD memfinalisasi periode.',
  ];
}

/**
 * Template HTML "Undangan & Info Akun" (onboarding, dikirim sekali di awal periode).
 * Memuat info akun (peran, email login, sandi), tombol login, daftar yang belum dinilai,
 * dan panduan ringkas sesuai peran. `appUrl` opsional → tombol/tautan login.
 */
export function onboardingHtml(args: {
  name: string; role: string; isHrdAdmin?: boolean; email: string; password: string;
  periodLabel: string; pendingNames: string[]; appUrl?: string;
}): string {
  const { name, role, isHrdAdmin = false, email, password, periodLabel, pendingNames, appUrl } = args;
  const roleLabel = ROLE_LABEL_ID[role] ?? role;
  const safeUrl = appUrl && /^https?:\/\//i.test(appUrl) ? appUrl : '';
  const pendingBlock = pendingNames.length
    ? `<p style="margin:16px 0 4px">Tugas penilaian 360° Anda (${pendingNames.length}):</p>
       <ul style="padding-left:18px;margin:0">${pendingNames.map((n) => `<li style="margin:2px 0">${escapeHtml(n)}</li>`).join('')}</ul>`
    : '';
  const guide = roleGuide(role, isHrdAdmin).map((s) => `<li style="margin:3px 0">${escapeHtml(s)}</li>`).join('');
  const button = safeUrl
    ? `<p style="margin:20px 0">
         <a href="${escapeHtml(safeUrl)}" style="display:inline-block;background:#00843b;color:#ffffff;text-decoration:none;font-weight:bold;padding:11px 22px;border-radius:8px">Masuk ke Portal Infarm 360°</a>
       </p>
       <p style="color:#9ca3af;font-size:12px;margin:0">Atau salin tautan ini: <a href="${escapeHtml(safeUrl)}" style="color:#00843b">${escapeHtml(safeUrl)}</a></p>`
    : '';
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">
    <h2 style="color:#00843b;margin-bottom:4px">Selamat Datang di Portal Infarm 360°</h2>
    <p style="color:#6b7280;margin-top:0">Periode penilaian: <strong>${escapeHtml(periodLabel)}</strong></p>
    <p>Halo <strong>${escapeHtml(name)}</strong>, berikut informasi akun Anda untuk mengikuti penilaian kinerja 360°.</p>
    <table style="border-collapse:collapse;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin:12px 0">
      <tr><td style="padding:8px 14px;color:#6b7280">Peran</td><td style="padding:8px 14px;font-weight:bold">${escapeHtml(roleLabel)}</td></tr>
      <tr><td style="padding:8px 14px;color:#6b7280">Email (untuk login)</td><td style="padding:8px 14px;font-weight:bold">${escapeHtml(email)}</td></tr>
      <tr><td style="padding:8px 14px;color:#6b7280">Sandi</td><td style="padding:8px 14px;font-weight:bold;font-family:monospace">${escapeHtml(password)}</td></tr>
    </table>
    <p style="color:#b45309;font-size:13px;margin:0 0 4px">⚠️ Demi keamanan, segera ganti sandi setelah masuk melalui menu <strong>Akun Saya → Ganti Sandi</strong>.</p>
    ${button}
    ${pendingBlock}
    <p style="margin:18px 0 4px;font-weight:bold">Langkah penggunaan untuk Anda (${escapeHtml(roleLabel)}):</p>
    <ol style="padding-left:18px;margin:0">${guide}</ol>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px">Email otomatis dari Infarm 360° Performance Appraisal. Mohon tidak membalas.</p>
  </div>`;
}
