import type { createAdminClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { fmt2 } from '@/lib/scoring';
import { tableMissing } from '@/lib/report-folder';

/**
 * Riwayat laporan (migrasi 0052 `final_report_history`, dicatat TRIGGER database): setiap perubahan
 * ACC, status, dan Skor Akhir. Dipakai panel "Riwayat Laporan" (detail laporan, HRD) dan tooltip ACC
 * di tabel Review & Finalisasi — agar klaim "sudah ACC" bisa dicek tanpa SQL.
 *
 * Penulisan lewat service_role tak membawa pelaku (actor_id NULL) → dilengkapi dari hrd_audit_log
 * (pegawai sama, selisih waktu ≤ ACTOR_MATCH_MS, aksi yang sejenis), ditandai `actorFromLog`.
 */
type Db = ReturnType<typeof createAdminClient>;

export type HistoryRow = {
  changed_at: string; actor_id: string | null; actor_name: string | null;
  kind: 'change' | 'created' | 'snapshot';
  old_status: string | null; new_status: string | null;
  old_acc: boolean | null; new_acc: boolean | null;
  old_score: number | null; new_score: number | null;
};

export type HistoryItem = { text: string; tone: 'brand' | 'danger' | 'neutral' };
export type HistoryEvent = { at: string; actor: string | null; actorFromLog: boolean; items: HistoryItem[] };

const ACTOR_MATCH_MS = 15_000;
const STATUS_LABEL: Record<string, string> = { draft: 'Draf', in_review: 'Ditinjau', finalized: 'Final' };
const statusLabel = (s: string | null) => (s ? STATUS_LABEL[s] ?? s : '—');
const score = (n: number | null) => (n == null ? '—' : fmt2(Number(n)));
const sameScore = (a: number | null, b: number | null) => (a == null && b == null) || (a != null && b != null && Number(a) === Number(b));

/** Satu baris riwayat → kalimat-kalimat untuk HRD (murni; diuji). */
export function describeHistory(r: HistoryRow): HistoryItem[] {
  if (r.kind === 'snapshot' || r.kind === 'created') {
    const head = r.kind === 'snapshot' ? 'Awal pencatatan riwayat' : 'Laporan dibuat';
    return [{
      text: `${head}: ${statusLabel(r.new_status)} · ${r.new_acc ? '✔ sudah ACC' : 'belum ACC'} · Skor Akhir ${score(r.new_score)}`,
      tone: r.new_acc ? 'brand' : 'neutral',
    }];
  }
  const items: HistoryItem[] = [];
  const accOn = r.old_acc === false && r.new_acc === true;
  const accOff = r.old_acc === true && r.new_acc === false;
  const statusChanged = r.old_status !== r.new_status;
  const scoreChanged = !sameScore(r.old_score, r.new_score);
  if (accOn) items.push({ text: '✔ ACC diberikan', tone: 'brand' });
  if (accOff) {
    const why = statusChanged && r.new_status === 'draft' ? ' — karena laporan disimpan sebagai Draf'
      : r.new_status === 'in_review' && scoreChanged ? ' — karena dirilis ulang dengan Skor Akhir berbeda'
      : '';
    items.push({ text: `✖ ACC dibatalkan${why}`, tone: 'danger' });
  }
  if (statusChanged) items.push({ text: `Status: ${statusLabel(r.old_status)} → ${statusLabel(r.new_status)}`, tone: 'neutral' });
  if (scoreChanged) items.push({ text: `Skor Akhir ${score(r.old_score)} → ${score(r.new_score)}`, tone: 'neutral' });
  return items;
}

type AuditHit = { created_at: string; actor_name: string | null; target_id: string | null };

/** Nama pelaku dari log aplikasi untuk baris tanpa pelaku (penulisan via service_role). */
function actorFromAudit(at: string, targetId: string, audit: AuditHit[]): string | null {
  const t = Date.parse(at);
  let best: AuditHit | null = null;
  for (const a of audit) {
    if (a.target_id !== targetId) continue;
    const d = Math.abs(Date.parse(a.created_at) - t);
    if (d <= ACTOR_MATCH_MS && (!best || d < Math.abs(Date.parse(best.created_at) - t))) best = a;
  }
  return best?.actor_name ?? null;
}

const REPORT_ACTIONS = ['report.acc', 'report.acc_revoke', 'report.save_draft', 'report.release_spv',
  'report.finalize', 'report.bulk_finalize', 'report.resync_drift'];
const COLS = 'changed_at, actor_id, actor_name, kind, old_status, new_status, old_acc, new_acc, old_score, new_score';

/** Riwayat satu laporan (terbaru dulu). `ok:false` = tabel belum ada (migrasi 0052 belum dijalankan). */
export async function loadReportHistory(db: Db, employeeId: string, periodId: string): Promise<{ ok: true; events: HistoryEvent[] } | { ok: false }> {
  const { data, error } = await db.from('final_report_history').select(COLS)
    .eq('employee_id', employeeId).eq('period_id', periodId).order('changed_at', { ascending: false }).limit(200);
  if (error) return tableMissing(error) ? { ok: false } : { ok: true, events: [] };
  const rows = (data ?? []) as HistoryRow[];
  const needActor = rows.some((r) => !r.actor_id && r.kind !== 'snapshot');
  let audit: AuditHit[] = [];
  if (needActor && rows.length) {
    const times = rows.map((r) => Date.parse(r.changed_at));
    const { data: logs } = await db.from('hrd_audit_log').select('created_at, actor_name, target_id')
      .eq('target_id', employeeId).in('action', REPORT_ACTIONS)
      .gte('created_at', new Date(Math.min(...times) - ACTOR_MATCH_MS).toISOString())
      .lte('created_at', new Date(Math.max(...times) + ACTOR_MATCH_MS).toISOString());
    audit = (logs ?? []) as AuditHit[];
  }
  return {
    ok: true,
    events: rows.map((r) => {
      const fromLog = !r.actor_id && r.kind !== 'snapshot' ? actorFromAudit(r.changed_at, employeeId, audit) : null;
      return { at: r.changed_at, actor: r.actor_name ?? fromLog, actorFromLog: !r.actor_name && !!fromLog, items: describeHistory(r) };
    }).filter((e) => e.items.length > 0),
  };
}

/**
 * ACC terakhir yang diberikan per pegawai pada periode (untuk tooltip kolom ACC). Hanya pegawai yang
 * ACC-nya MASIH aktif yang relevan bagi pemanggil; Map kosong bila tabel belum ada.
 */
export async function loadLastAccGiven(db: Db, periodId: string): Promise<Map<string, { at: string; actor: string | null }>> {
  type Row = { employee_id: string; changed_at: string; actor_id: string | null; actor_name: string | null; kind: string; old_acc: boolean | null; new_acc: boolean | null };
  let rows: Row[];
  try {
    rows = await fetchAllPaged<Row>((from, to) => db.from('final_report_history')
      .select('employee_id, changed_at, actor_id, actor_name, kind, old_acc, new_acc')
      .eq('period_id', periodId).eq('new_acc', true).order('changed_at').range(from, to));
  } catch {
    return new Map(); // tabel belum ada / gagal baca → tanpa tooltip
  }
  const out = new Map<string, { at: string; actor: string | null; needLog: boolean }>();
  for (const r of rows) {
    const given = (r.kind === 'change' && r.old_acc === false) || r.kind === 'created' || (r.kind === 'snapshot' && !out.has(r.employee_id));
    if (!given) continue;
    out.set(r.employee_id, { at: r.changed_at, actor: r.actor_name, needLog: !r.actor_name && r.kind !== 'snapshot' });
  }
  const pending = [...out.entries()].filter(([, v]) => v.needLog);
  if (pending.length) {
    const times = pending.map(([, v]) => Date.parse(v.at));
    const audit = await fetchAllPaged<AuditHit>((from, to) => db.from('hrd_audit_log').select('created_at, actor_name, target_id')
      .eq('action', 'report.acc')
      .gte('created_at', new Date(Math.min(...times) - ACTOR_MATCH_MS).toISOString())
      .lte('created_at', new Date(Math.max(...times) + ACTOR_MATCH_MS).toISOString())
      .order('created_at').range(from, to)).catch(() => [] as AuditHit[]);
    for (const [id, v] of pending) v.actor = actorFromAudit(v.at, id, audit);
  }
  return new Map([...out.entries()].map(([id, v]) => [id, { at: v.at, actor: v.actor }]));
}
