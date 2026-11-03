import type { createClient } from '@/lib/supabase/server';
import { canEditSession, canRecordSession, sessionsOpen, type HrdMode, type PlanActor, type SupervisorInfo } from '@/lib/dev-plan';
import { loadSessions, type PlanItemRow, type PlanRow } from '@/lib/dev-plan-server';
import type { SessionVM } from './sessions-section';

type SB = Awaited<ReturnType<typeof createClient>>;

/**
 * Data panel Catatan Sesi untuk satu rencana (server): daftar sesi + hak tombol per pelaku. Null = panel tak
 * ditampilkan (rencana belum Disepakati, rencana Direksi, atau tabel 0056 belum ada).
 */
export async function sessionsPanelData(admin: SB, opts: {
  plan: PlanRow | null; items: PlanItemRow[]; ownerId: string; ownerRole: string | null; info: SupervisorInfo;
  actor: PlanActor; mode: HrdMode; closed: boolean;
}) {
  const { plan, items, ownerId, ownerRole, info, actor, mode, closed } = opts;
  if (!plan || !sessionsOpen(plan.status, ownerRole)) return null;
  const { missing, sessions } = await loadSessions(admin, plan.id);
  if (missing) return null;
  const vms: SessionVM[] = sessions.map((s) => ({
    id: s.id, kind: s.kind, session_date: s.session_date, author_name: s.author_name, summary: s.summary,
    overall_status: s.overall_status, item_progress: s.item_progress ?? [], employee_note: s.employee_note,
    canEdit: canEditSession(s, info, actor, ownerId, mode),
  }));
  return {
    planId: plan.id,
    sessions: vms,
    items: items.map((i) => ({ id: i.id, area: i.area })),
    canAddOneOnOne: canRecordSession('one_on_one', info, actor, ownerId, mode),
    canAddHrd: canRecordSession('hrd_monthly', info, actor, ownerId, mode),
    isOwner: actor.id === ownerId,
    locked: closed,
  };
}
