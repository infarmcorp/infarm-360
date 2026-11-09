import type { createClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { tableMissing } from '@/lib/report-folder';
import type { Database } from '@/lib/database.types';
import { resolveSupervisor, type SupervisorInfo } from '@/lib/dev-plan';

type SB = Awaited<ReturnType<typeof createClient>>;
export type PlanRow = Database['public']['Tables']['development_plans']['Row'];
export type PlanItemRow = Database['public']['Tables']['development_plan_items']['Row'];

/**
 * Rencana Pengembangan (0055) — baca server. Semua fungsi menerima klien service_role (`admin`) dan dipanggil
 * SETELAH pemanggil lolos cek peran/atasan (lib/dev-plan.ts). Tim & koordinator ~100 baris → dibaca utuh, berpaginasi.
 */

/**
 * Pemeta atasan untuk banyak pegawai sekaligus (satu kali baca tabel tim). Atasan (SPV/koordinator) yang sudah
 * NONAKTIF dilewati → rencana jatuh ke tingkat berikutnya (koordinator → SPV → HRD), agar tak tertahan di
 * "Menunggu Atasan" pada orang yang tak bisa login lagi. Keanggotaan tim sengaja tak dihapus saat SPV dinonaktifkan.
 */
export async function loadSupervisorResolver(admin: SB): Promise<(emp: { id: string; role: string | null }) => SupervisorInfo> {
  const [spvRows, coordRows, activeRows] = await Promise.all([
    fetchAllPaged<{ spv_id: string; employee_id: string }>((from, to) =>
      admin.from('spv_team_members').select('spv_id, employee_id').order('spv_id').order('employee_id').range(from, to)),
    fetchAllPaged<{ coordinator_id: string; employee_id: string }>((from, to) =>
      admin.from('coordinator_team_members').select('coordinator_id, employee_id').order('coordinator_id').order('employee_id').range(from, to)),
    fetchAllPaged<{ id: string }>((from, to) =>
      admin.from('employees').select('id').eq('is_active', true).order('id').range(from, to)),
  ]);
  const active = new Set(activeRows.map((r) => r.id));
  const leads = new Set(spvRows.map((r) => r.spv_id));
  const spvBy = new Map<string, string[]>();
  for (const r of spvRows) {
    if (!active.has(r.spv_id)) continue;
    spvBy.set(r.employee_id, [...(spvBy.get(r.employee_id) ?? []), r.spv_id]);
  }
  const coordBy = new Map<string, string[]>();
  for (const r of coordRows) {
    if (!active.has(r.coordinator_id)) continue;
    coordBy.set(r.employee_id, [...(coordBy.get(r.employee_id) ?? []), r.coordinator_id]);
  }
  return (emp) => resolveSupervisor({
    employeeId: emp.id, role: emp.role, leadsTeam: leads.has(emp.id),
    coordinatorIds: coordBy.get(emp.id) ?? [], spvIds: spvBy.get(emp.id) ?? [],
  });
}

export type PlanPeriod = { id: string; label: string; dev_plan_closed_at: string | null; dev_plan_due: string | null };

/**
 * Gerbang "rencana terbuka" untuk (pegawai, periode laporan): laporan pegawai di periode itu FINAL dan HRD belum
 * menutup rencana periode itu. Periode aktif/terkunci TIDAK berpengaruh (1-on-1 berjalan di kuartal berikutnya).
 */
export async function planWindow(
  admin: SB, employeeId: string, periodId: string,
): Promise<{ ok: true; period: PlanPeriod } | { ok: false; error: string }> {
  const [{ data: period }, { data: fr }] = await Promise.all([
    admin.from('periods').select('id, label, dev_plan_closed_at, dev_plan_due').eq('id', periodId).maybeSingle(),
    admin.from('final_reports').select('status').eq('employee_id', employeeId).eq('period_id', periodId).maybeSingle(),
  ]);
  if (!period) return { ok: false, error: 'Periode tidak ditemukan' };
  if (fr?.status !== 'finalized') return { ok: false, error: 'Laporan periode ini belum Final — rencana belum bisa diisi' };
  if (period.dev_plan_closed_at) return { ok: false, error: 'Rencana Pengembangan periode ini sudah ditutup HRD' };
  return { ok: true, period };
}

/** Rencana + prioritas (urut). `missing` = tabel belum ada (migrasi 0055 belum dijalankan). */
export async function loadPlan(
  admin: SB, employeeId: string, periodId: string,
): Promise<{ missing: boolean; plan: PlanRow | null; items: PlanItemRow[] }> {
  const { data: plan, error } = await admin.from('development_plans').select('*')
    .eq('employee_id', employeeId).eq('source_period_id', periodId).maybeSingle();
  if (error) return { missing: tableMissing(error), plan: null, items: [] };
  if (!plan) return { missing: false, plan: null, items: [] };
  const { data: items } = await admin.from('development_plan_items').select('*').eq('plan_id', plan.id).order('order_idx');
  return { missing: false, plan: plan as PlanRow, items: (items ?? []) as PlanItemRow[] };
}

/** Periode yang punya laporan FINAL (opsional milik satu pegawai), terbaru dulu. */
export async function finalizedPeriods(admin: SB, employeeId?: string): Promise<PlanPeriod[]> {
  const rows = await fetchAllPaged<{ period_id: string }>((from, to) => {
    let q = admin.from('final_reports').select('period_id').eq('status', 'finalized');
    if (employeeId) q = q.eq('employee_id', employeeId);
    return q.order('period_id').range(from, to);
  });
  const ids = [...new Set(rows.map((r) => r.period_id))];
  if (!ids.length) return [];
  const { data } = await admin.from('periods').select('id, label, start_date, dev_plan_closed_at, dev_plan_due')
    .in('id', ids).order('start_date', { ascending: false });
  return (data ?? []).map((p) => ({ id: p.id, label: p.label, dev_plan_closed_at: p.dev_plan_closed_at ?? null, dev_plan_due: p.dev_plan_due ?? null }));
}

export type PlanPerson = { id: string; name: string; dept: string | null; role: string | null; is_active: boolean };
/**
 * Pegawai yang bisa punya rencana: bukan eksternal (eksternal hanya menilai, tak punya laporan). Termasuk yang sudah
 * NONAKTIF agar rencananya tetap bisa DIBUKA (lihat saja) dari Pantauan HRD; pemanggil yang menyusun daftar tugas
 * (Tim Saya) menyaring `is_active` sendiri, dan aksi tulis menolak rencana milik pegawai nonaktif (actions.ts).
 */
export async function loadPlanPeople(admin: SB): Promise<PlanPerson[]> {
  return fetchAllPaged<PlanPerson>((from, to) => admin.from('employees').select('id, name, dept, role, is_active')
    .eq('is_external', false).order('id').range(from, to));
}

export type SessionRow = Database['public']['Tables']['development_plan_sessions']['Row'];
/** Catatan sesi satu rencana, terbaru dulu. `missing` = tabel belum ada (migrasi 0056 belum dijalankan). */
export async function loadSessions(admin: SB, planId: string): Promise<{ missing: boolean; sessions: SessionRow[] }> {
  const { data, error } = await admin.from('development_plan_sessions').select('*').eq('plan_id', planId)
    .order('session_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) return { missing: tableMissing(error), sessions: [] };
  return { missing: false, sessions: (data ?? []) as SessionRow[] };
}
