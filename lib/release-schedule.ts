import { z } from 'zod';
import type { createAdminClient } from '@/lib/supabase/server';
import type { ReleaseContent } from '@/lib/email/release-template';
import { emailConfigured } from '@/lib/email/mailer';
import { loadReleasePeriod, loadReleaseSentIds, RELEASE_EMAIL_ACTION } from '@/lib/report-release';
import { deliverReleaseEmails, type ReleasePerson } from '@/lib/release-delivery';
import { tableMissing } from '@/lib/report-folder';

/**
 * Jadwal Email Rilis Laporan (migrasi 0053, keputusan pemilik 2026-10-16):
 *  - HRD menjadwalkan tanggal + jam (WIB); PENERIMA & ISI dikunci saat menjadwalkan, bisa diubah/dibatalkan
 *    selama belum mulai terkirim.
 *  - Route cron (/api/cron/release-email, dipanggil GitHub Actions ±10 menit) memanggil
 *    processDueReleaseSchedules: jadwal yang jamnya sudah tiba dikirim BERTAHAP (≤ maxPerRun per panggilan)
 *    lewat inti yang sama dengan tombol manual (lib/release-delivery). Syarat dicek ulang saat kirim; yang
 *    sudah pernah dikirimi (manual/jadwal) dilewati. Tiap tahap dicatat ke Log Aktivitas (RELEASE_EMAIL_ACTION).
 *  - Klaim jadwal atomik (status scheduled → sending) agar dua pemanggilan bersamaan tak mengirim dobel;
 *    'sending' yang macet > STALE_MS diambil ulang.
 */
type Db = ReturnType<typeof createAdminClient>;

export const ReleaseContentSchema = z.object({
  cycle: z.string().trim().max(40),
  includeLate: z.boolean(),
  steps: z.array(z.object({ when: z.string().trim().max(80), text: z.string().trim().max(600) })).max(8),
});

export type ScheduleStatus = 'scheduled' | 'sending' | 'done' | 'cancelled';
export type ReleaseSchedule = {
  id: string; periodId: string; sendAt: string; status: ScheduleStatus; content: ReleaseContent; recipientIds: string[];
  createdByName: string | null; createdAt: string; startedAt: string | null; finishedAt: string | null;
  sentIds: string[]; skipped: ReleasePerson[]; failed: ReleasePerson[];
};

export { SCHEDULE_MIN_LEAD_MS, SCHEDULE_MAX_AHEAD_MS, wibToIso, isoToWibParts, fmtScheduleWib, sendAtError } from '@/lib/release-schedule-time';
export const STALE_MS = 15 * 60 * 1000;                     // 'sending' macet → diambil ulang

/** Sisa penerima yang belum diproses (belum terkirim/dilewati/gagal) — urutan sesuai daftar terkunci. */
export function remainingRecipients(s: { recipientIds: string[]; sentIds: string[]; skipped: ReleasePerson[]; failed: ReleasePerson[] }): string[] {
  const done = new Set([...s.sentIds, ...s.skipped.map((x) => x.id), ...s.failed.map((x) => x.id)]);
  return s.recipientIds.filter((id) => !done.has(id));
}

type Row = {
  id: string; period_id: string; send_at: string; status: ScheduleStatus; content: unknown; recipient_ids: string[];
  created_by: string | null; created_by_name: string | null; created_at: string; started_at: string | null; finished_at: string | null;
  sent_ids: string[] | null; skipped: unknown; failed: unknown;
};
const people = (v: unknown): ReleasePerson[] => (Array.isArray(v) ? v.filter((x): x is ReleasePerson => !!x && typeof x.id === 'string') : []);
export function toSchedule(r: Row): ReleaseSchedule {
  const c = ReleaseContentSchema.safeParse(r.content);
  return {
    id: r.id, periodId: r.period_id, sendAt: r.send_at, status: r.status, recipientIds: r.recipient_ids ?? [],
    content: c.success ? c.data : { cycle: '', includeLate: false, steps: [] },
    createdByName: r.created_by_name, createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at,
    sentIds: r.sent_ids ?? [], skipped: people(r.skipped), failed: people(r.failed),
  };
}
const COLS = 'id, period_id, send_at, status, content, recipient_ids, created_by, created_by_name, created_at, started_at, finished_at, sent_ids, skipped, failed';

/** Jadwal aktif (menunggu/sedang dikirim) + jadwal selesai terakhir periode ini. `ok=false` = tabel belum ada. */
export async function loadReleaseSchedules(db: Db, periodId: string): Promise<{ ok: boolean; active: ReleaseSchedule | null; last: ReleaseSchedule | null }> {
  const { data, error } = await db.from('release_email_schedules').select(COLS)
    .eq('period_id', periodId).order('created_at', { ascending: false }).limit(10);
  if (error) return { ok: false, active: null, last: null }; // tabel belum ada (0053) / gangguan baca → fitur jadwal disembunyikan
  const rows = (data ?? []).map((r) => toSchedule(r as Row));
  return {
    ok: true,
    active: rows.find((s) => s.status === 'scheduled' || s.status === 'sending') ?? null,
    last: rows.find((s) => s.status === 'done') ?? null,
  };
}

export type ProcessResult = { id: string; period?: string; sent: number; skipped: number; failed: number; done: boolean; note?: string };

/**
 * Proses jadwal yang jamnya sudah tiba (dipanggil route cron). Mengirim ≤ maxPerRun pegawai per panggilan;
 * sisanya dilanjutkan panggilan berikutnya (status kembali 'scheduled', send_at sudah lewat).
 */
export async function processDueReleaseSchedules(db: Db, opts: { now?: number; maxPerRun?: number; appUrl?: string } = {}): Promise<{ ok: boolean; error?: string; results: ProcessResult[] }> {
  const now = opts.now ?? Date.now();
  let budget = opts.maxPerRun ?? 25;
  const nowIso = new Date(now).toISOString();
  const staleIso = new Date(now - STALE_MS).toISOString();
  const { data, error } = await db.from('release_email_schedules').select(COLS)
    .or(`and(status.eq.scheduled,send_at.lte.${nowIso}),and(status.eq.sending,started_at.lt.${staleIso})`)
    .order('send_at', { ascending: true }).limit(5);
  if (error) return { ok: false, error: tableMissing(error) ? 'fitur jadwal belum aktif' : error.message, results: [] };

  const results: ProcessResult[] = [];
  for (const raw of (data ?? []) as Row[]) {
    if (budget <= 0) break;
    const s = toSchedule(raw);
    if (!emailConfigured()) { results.push({ id: s.id, sent: 0, skipped: 0, failed: 0, done: false, note: 'email belum aktif — dicoba lagi nanti' }); continue; }

    // Klaim atomik: hanya satu pemanggil yang lolos (status & started_at harus masih sama seperti saat dibaca).
    let claim = db.from('release_email_schedules')
      .update({ status: 'sending', started_at: nowIso, updated_at: nowIso }).eq('id', s.id).eq('status', s.status);
    claim = s.startedAt ? claim.eq('started_at', s.startedAt) : claim.is('started_at', null);
    const { data: claimed, error: cErr } = await claim.select('id');
    if (cErr || !claimed?.length) { results.push({ id: s.id, sent: 0, skipped: 0, failed: 0, done: false, note: 'sedang diproses oleh pengiriman lain' }); continue; }

    const finish = async (patch: { sent: string[]; skipped: ReleasePerson[]; failed: ReleasePerson[]; done: boolean }) => {
      await db.from('release_email_schedules').update({
        sent_ids: [...s.sentIds, ...patch.sent], skipped: [...s.skipped, ...patch.skipped], failed: [...s.failed, ...patch.failed],
        status: patch.done ? 'done' : 'scheduled', finished_at: patch.done ? new Date().toISOString() : null,
        started_at: patch.done ? nowIso : null, updated_at: new Date().toISOString(),
      }).eq('id', s.id);
    };

    const period = await loadReleasePeriod(db, s.periodId);
    const remaining = remainingRecipients(s);
    if (!period) {
      const gone = remaining.map((id) => ({ id, name: '—', reason: 'periode tidak ditemukan' }));
      await finish({ sent: [], skipped: gone, failed: [], done: true });
      results.push({ id: s.id, sent: 0, skipped: gone.length, failed: 0, done: true, note: 'periode tidak ditemukan' });
      continue;
    }
    const batch = remaining.slice(0, budget);
    const alreadySent = await loadReleaseSentIds(db, period.id);
    const res = batch.length
      ? await deliverReleaseEmails(db, { period, ids: batch, content: s.content, appUrl: opts.appUrl, alreadySent })
      : { ok: true as const, sent: [], skipped: [], failed: [] };
    if (!res.ok) {
      // Gangguan baca (mis. database) → kembalikan ke antrean, coba lagi panggilan berikutnya.
      await db.from('release_email_schedules').update({ status: 'scheduled', started_at: null, updated_at: new Date().toISOString() }).eq('id', s.id);
      results.push({ id: s.id, period: period.label, sent: 0, skipped: 0, failed: 0, done: false, note: res.error });
      continue;
    }
    budget -= batch.length;
    const done = batch.length === remaining.length;
    await finish({ sent: res.sent, skipped: res.skipped, failed: res.failed, done });
    if (res.sent.length || res.failed.length) {
      await db.from('hrd_audit_log').insert({
        actor_id: raw.created_by, actor_name: `${s.createdByName ?? 'HRD'} (terjadwal)`,
        action: RELEASE_EMAIL_ACTION, category: 'laporan',
        summary: `Email rilis laporan "${period.label}" (terjadwal): ${res.sent.length} terkirim, ${res.failed.length} gagal, ${res.skipped.length} dilewati`,
        target_type: 'period', target_id: period.id, target_label: period.label,
        meta: { sent_ids: res.sent, failed: res.failed.map((f) => f.id), skipped: res.skipped.map((x) => x.id), schedule_id: s.id },
      });
    }
    results.push({ id: s.id, period: period.label, sent: res.sent.length, skipped: res.skipped.length, failed: res.failed.length, done });
  }
  return { ok: true, results };
}
