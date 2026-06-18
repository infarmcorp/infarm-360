/**
 * Pengirim email via Resend REST API (tanpa SDK — cukup fetch).
 * Pola DORMAN: bila RESEND_API_KEY belum diset, `sendEmail` mengembalikan
 * { ok:false, reason:'not_configured' } sehingga pemanggil bisa menampilkan pesan
 * "belum aktif" alih-alih error. Rahasia hanya di server (jangan NEXT_PUBLIC_*).
 *
 * Aktivasi: set env di Vercel → RESEND_API_KEY (wajib) & RESEND_FROM (opsional,
 * mis. "Infarm 360 <noreply@domain-terverifikasi>"). Tanpa domain terverifikasi,
 * Resend hanya mengirim ke email pemilik akun (mode uji) dari onboarding@resend.dev.
 */
const ENDPOINT = 'https://api.resend.com/emails';

export type SendResult = { ok: true } | { ok: false; reason: 'not_configured' | 'error'; detail?: string };

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail({
  to, subject, html,
}: {
  to: string | string[]; subject: string; html: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: 'not_configured' };
  const from = process.env.RESEND_FROM || 'Infarm 360 <onboarding@resend.dev>';
  try {
    const res = await fetch(ENDPOINT, {
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
