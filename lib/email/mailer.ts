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

export type SendResult = { ok: true } | { ok: false; reason: 'not_configured' | 'error'; detail?: string };

type Provider = 'smtp' | 'resend' | null;

function provider(): Provider {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
  if (process.env.RESEND_API_KEY) return 'resend';
  return null;
}

export function emailConfigured(): boolean {
  return provider() !== null;
}

export async function sendEmail(msg: { to: string | string[]; subject: string; html: string }): Promise<SendResult> {
  const p = provider();
  if (!p) return { ok: false, reason: 'not_configured' };
  return p === 'smtp' ? sendViaSmtp(msg) : sendViaResend(msg);
}

/** Jalur 1 — Gmail (atau SMTP lain) via nodemailer. App Password boleh berisi spasi. */
async function sendViaSmtp({ to, subject, html }: { to: string | string[]; subject: string; html: string }): Promise<SendResult> {
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
    await transporter.sendMail({ from, to: Array.isArray(to) ? to.join(',') : to, subject, html });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', detail: String(e).slice(0, 300) };
  }
}

/** Jalur 2 — Resend REST API (tanpa SDK). */
async function sendViaResend({ to, subject, html }: { to: string | string[]; subject: string; html: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY!;
  const from = process.env.RESEND_FROM || 'Infarm 360 <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html }),
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

/** Template HTML pengingat 360° (daftar nama yang belum dinilai). */
export function reminderHtml(assessorName: string, periodLabel: string, pendingNames: string[]): string {
  const items = pendingNames.map((n) => `<li style="margin:2px 0">${escapeHtml(n)}</li>`).join('');
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1f2937">
    <h2 style="color:#047857;margin-bottom:4px">Pengingat Penilaian 360°</h2>
    <p style="color:#6b7280;margin-top:0">Periode: <strong>${escapeHtml(periodLabel)}</strong></p>
    <p>Halo <strong>${escapeHtml(assessorName)}</strong>,</p>
    <p>Anda masih memiliki <strong>${pendingNames.length}</strong> penilaian 360° yang belum diselesaikan:</p>
    <ul style="padding-left:18px">${items}</ul>
    <p>Mohon selesaikan melalui menu <strong>Daftar Penilaian Saya</strong> di portal Infarm 360°.</p>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px">Email otomatis dari Infarm 360° Performance Appraisal. Mohon tidak membalas.</p>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}
