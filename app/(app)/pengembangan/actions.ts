'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logAuditAsService } from '@/lib/audit/log';
import { tableMissing } from '@/lib/report-folder';
import {
  canActAsSupervisor, canHrdManage, canHrdSign, ownerCanEdit, submitBlocker, supervisorApproveBlocker,
  planTitle, PLAN_MAX_ITEMS, SUP_MIN, type PlanActor, type HrdMode,
} from '@/lib/dev-plan';
import { loadPlan, loadSupervisorResolver, planWindow, type PlanRow } from '@/lib/dev-plan-server';

/**
 * RENCANA PENGEMBANGAN (migrasi 0055) — semua tulis lewat sini (pola Input KPI): login → Zod → cek peran/atasan
 * (lib/dev-plan.ts) → gerbang "rencana terbuka" (laporan Final + periode belum ditutup) → tulis service_role
 * (tabel tanpa policy tulis) → Log Aktivitas. Pergantian status memakai syarat status lama (`eq('status', …)`)
 * agar dua klik bersamaan tak menimpa satu sama lain.
 */
type Result = { ok: true } | { ok: false; error: string };
type SB = Awaited<ReturnType<typeof createClient>>;

const OFF = 'Fitur Rencana Pengembangan belum aktif';
const Uuid = z.string().uuid('Data tidak valid');
const Item = z.object({
  area: z.string().trim().max(500),
  target: z.string().trim().max(1000),
  actions: z.string().trim().max(2000),
  due_text: z.string().trim().max(200),
  companion: z.string().trim().max(200),
  success_indicator: z.string().trim().max(1000),
});
const Items = z.array(Item).max(PLAN_MAX_ITEMS, `Maksimal ${PLAN_MAX_ITEMS} prioritas`);
const Comments = z.object({
  confirmation: z.string().trim().max(2000),
  context: z.string().trim().max(2000),
  support: z.string().trim().max(2000),
  hope: z.string().trim().max(2000),
});

async function ctx(): Promise<{ ok: true; actor: PlanActor & { name: string | null }; mode: HrdMode; admin: SB } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees')
    .select('role, is_hrd_admin, is_coordinator, hrd_sections, name').eq('id', user.id).maybeSingle();
  if (!me) return { ok: false, error: 'Akun tidak ditemukan' };
  const jar = await cookies();
  const mode: HrdMode = jar.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  return { ok: true, actor: { id: user.id, ...me }, mode, admin: createAdminClient() as unknown as SB };
}

async function planById(admin: SB, planId: string): Promise<{ ok: true; plan: PlanRow; emp: { id: string; role: string | null; name: string } } | { ok: false; error: string }> {
  const { data: plan, error } = await admin.from('development_plans').select('*').eq('id', planId).maybeSingle();
  if (error) return { ok: false, error: tableMissing(error) ? OFF : 'Gagal membaca rencana' };
  if (!plan) return { ok: false, error: 'Rencana tidak ditemukan' };
  const { data: emp } = await admin.from('employees').select('id, role, name').eq('id', plan.employee_id).maybeSingle();
  if (!emp) return { ok: false, error: 'Pegawai tidak ditemukan' };
  return { ok: true, plan: plan as PlanRow, emp };
}

/** Ubah status dengan syarat status lama; 0 baris = sudah diubah orang lain. */
async function transition(admin: SB, plan: PlanRow, patch: Record<string, unknown>): Promise<Result> {
  const { data, error } = await admin.from('development_plans')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', plan.id).eq('status', plan.status).select('id');
  if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  if (!data?.length) return { ok: false, error: 'Status rencana baru saja berubah — muat ulang halaman' };
  return { ok: true };
}

function revalidate() {
  revalidatePath('/pengembangan', 'layout');
  revalidatePath('/admin/pengembangan');
}

const CLEAR_SIGNS = {
  employee_signed_at: null, supervisor_id: null, supervisor_name: null, supervisor_signed_at: null,
  hrd_id: null, hrd_name: null, hrd_signed_at: null,
};

/** Pegawai menyimpan isi rencananya (draf). Hanya pemilik, hanya saat Draf / Perlu Perbaikan (Direksi: kapan saja). */
export async function saveMyPlan(rawPeriodId: string, rawItems: unknown): Promise<Result> {
  const pid = Uuid.safeParse(rawPeriodId);
  if (!pid.success) return { ok: false, error: 'Periode tidak valid' };
  const items = Items.safeParse(rawItems);
  if (!items.success) return { ok: false, error: items.error.issues[0].message };
  const c = await ctx(); if (!c.ok) return c;
  const { actor, admin } = c;

  const win = await planWindow(admin, actor.id, pid.data);
  if (!win.ok) return win;
  const cur = await loadPlan(admin, actor.id, pid.data);
  if (cur.missing) return { ok: false, error: OFF };
  if (!ownerCanEdit(cur.plan?.status ?? null, actor.role)) {
    return { ok: false, error: 'Rencana sedang ditinjau atau sudah disepakati — isinya tidak bisa diubah' };
  }

  let planId = cur.plan?.id;
  if (!planId) {
    const { data, error } = await admin.from('development_plans')
      .insert({ employee_id: actor.id, source_period_id: pid.data }).select('id').single();
    if (error || !data) return { ok: false, error: error && tableMissing(error) ? OFF : 'Gagal membuat rencana' };
    planId = data.id;
  } else {
    await admin.from('development_plans').update({ updated_at: new Date().toISOString() }).eq('id', planId);
  }
  // Ganti prioritas: sisipkan yang baru DULU, baru hapus yang lama → gagal sisip tak menghilangkan isi lama.
  const oldIds = cur.items.map((i) => i.id);
  if (items.data.length) {
    const { error } = await admin.from('development_plan_items')
      .insert(items.data.map((it, i) => ({ plan_id: planId!, order_idx: i, ...it })));
    if (error) return { ok: false, error: 'Gagal menyimpan prioritas: ' + error.message };
  }
  if (oldIds.length) await admin.from('development_plan_items').delete().in('id', oldIds);
  revalidate();
  return { ok: true };
}

/** Pegawai mengirim rencana ke atasan = persetujuan pegawai (nama + waktu tercatat). Bukan untuk Direksi. */
export async function submitMyPlan(rawPeriodId: string): Promise<Result> {
  const pid = Uuid.safeParse(rawPeriodId);
  if (!pid.success) return { ok: false, error: 'Periode tidak valid' };
  const c = await ctx(); if (!c.ok) return c;
  const { actor, admin } = c;
  if (actor.role === 'direksi') return { ok: false, error: 'Rencana Direksi tidak memerlukan persetujuan' };

  const win = await planWindow(admin, actor.id, pid.data);
  if (!win.ok) return win;
  const cur = await loadPlan(admin, actor.id, pid.data);
  if (cur.missing) return { ok: false, error: OFF };
  if (!cur.plan) return { ok: false, error: 'Simpan rencana terlebih dahulu' };
  if (cur.plan.status !== 'draft' && cur.plan.status !== 'revision') return { ok: false, error: 'Rencana sudah dikirim' };
  const blocker = submitBlocker(cur.items);
  if (blocker) return { ok: false, error: blocker };

  const r = await transition(admin, cur.plan, {
    ...CLEAR_SIGNS, status: 'waiting_supervisor', employee_signed_at: new Date().toISOString(), revision_reason: null,
  });
  if (!r.ok) return r;
  await logAuditAsService({
    action: 'devplan.submit', category: 'pengembangan', summary: `Mengirim ${planTitle(win.period.label)} ke atasan`,
    targetType: 'employee', targetId: actor.id, targetLabel: actor.name,
  }, { id: actor.id, name: actor.name });
  revalidate();
  return { ok: true };
}

/** Atasan: simpan komentar + Setujui (→ Menunggu HRD) atau Minta Perbaikan (→ Perlu Perbaikan, alasan wajib). */
export async function decideAsSupervisor(
  rawPlanId: string, rawDecision: string, rawComments: unknown, rawReason: string,
): Promise<Result> {
  const planId = Uuid.safeParse(rawPlanId);
  if (!planId.success) return { ok: false, error: 'Rencana tidak valid' };
  const decision = z.enum(['approve', 'revise']).safeParse(rawDecision);
  if (!decision.success) return { ok: false, error: 'Keputusan tidak valid' };
  const comments = Comments.safeParse(rawComments);
  if (!comments.success) return { ok: false, error: comments.error.issues[0].message };
  const reason = z.string().trim().max(1000).safeParse(rawReason ?? '');
  if (!reason.success) return { ok: false, error: 'Alasan terlalu panjang' };
  const c = await ctx(); if (!c.ok) return c;
  const { actor, admin, mode } = c;

  const p = await planById(admin, planId.data); if (!p.ok) return p;
  const { plan, emp } = p;
  const resolve = await loadSupervisorResolver(admin);
  if (!canActAsSupervisor(resolve(emp), actor, emp.id, mode)) {
    return { ok: false, error: 'Anda bukan atasan yang berwenang untuk rencana ini' };
  }
  const win = await planWindow(admin, emp.id, plan.source_period_id);
  if (!win.ok) return win;
  if (plan.status !== 'waiting_supervisor') return { ok: false, error: 'Rencana tidak sedang menunggu keputusan atasan' };

  const cm = comments.data;
  const commentCols = { sup_confirmation: cm.confirmation || null, sup_context: cm.context || null, sup_support: cm.support || null, sup_hope: cm.hope || null };
  let r: Result;
  if (decision.data === 'approve') {
    const blocker = supervisorApproveBlocker(cm);
    if (blocker) return { ok: false, error: blocker };
    r = await transition(admin, plan, {
      ...commentCols, status: 'waiting_hrd', revision_reason: null,
      supervisor_id: actor.id, supervisor_name: actor.name, supervisor_signed_at: new Date().toISOString(),
    });
  } else {
    if (reason.data.length < SUP_MIN) return { ok: false, error: `Alasan perbaikan wajib diisi (minimal ${SUP_MIN} karakter)` };
    r = await transition(admin, plan, { ...commentCols, ...CLEAR_SIGNS, status: 'revision', revision_reason: reason.data });
  }
  if (!r.ok) return r;
  await logAuditAsService({
    action: decision.data === 'approve' ? 'devplan.supervisor_approve' : 'devplan.supervisor_revise',
    category: 'pengembangan',
    summary: `${decision.data === 'approve' ? 'Menyetujui' : 'Meminta perbaikan'} ${planTitle(win.period.label)} sebagai atasan`,
    targetType: 'employee', targetId: emp.id, targetLabel: emp.name,
  }, { id: actor.id, name: actor.name });
  revalidate();
  return { ok: true };
}

/** HRD (posisi HRD, Mode Admin) menyetujui terakhir → Disepakati. Boleh atas rencananya sendiri (keputusan pemilik). */
export async function approveAsHrd(rawPlanId: string): Promise<Result> {
  const planId = Uuid.safeParse(rawPlanId);
  if (!planId.success) return { ok: false, error: 'Rencana tidak valid' };
  const c = await ctx(); if (!c.ok) return c;
  const { actor, admin, mode } = c;
  if (!canHrdSign(actor, mode)) return { ok: false, error: 'Persetujuan HRD hanya oleh pegawai berposisi HRD di Mode Admin' };

  const p = await planById(admin, planId.data); if (!p.ok) return p;
  const { plan, emp } = p;
  const win = await planWindow(admin, emp.id, plan.source_period_id);
  if (!win.ok) return win;
  if (plan.status !== 'waiting_hrd') return { ok: false, error: 'Rencana belum disetujui atasan' };
  const r = await transition(admin, plan, {
    status: 'agreed', hrd_id: actor.id, hrd_name: actor.name, hrd_signed_at: new Date().toISOString(),
  });
  if (!r.ok) return r;
  await logAuditAsService({
    action: 'devplan.hrd_approve', category: 'pengembangan', summary: `Menyetujui ${planTitle(win.period.label)} (HRD) — Disepakati`,
    targetType: 'employee', targetId: emp.id, targetLabel: emp.name,
  }, { id: actor.id, name: actor.name });
  revalidate();
  return { ok: true };
}

/** HRD Buka Kembali → Draf; semua persetujuan batal (komentar atasan tetap tersimpan sebagai riwayat). */
export async function reopenPlan(rawPlanId: string): Promise<Result> {
  const planId = Uuid.safeParse(rawPlanId);
  if (!planId.success) return { ok: false, error: 'Rencana tidak valid' };
  const c = await ctx(); if (!c.ok) return c;
  const { actor, admin, mode } = c;
  if (!canHrdSign(actor, mode)) return { ok: false, error: 'Buka Kembali hanya oleh pegawai berposisi HRD di Mode Admin' };

  const p = await planById(admin, planId.data); if (!p.ok) return p;
  const { plan, emp } = p;
  if (emp.role === 'direksi') return { ok: false, error: 'Rencana Direksi tidak memakai alur persetujuan' };
  const win = await planWindow(admin, emp.id, plan.source_period_id);
  if (!win.ok) return win;
  if (plan.status === 'draft') return { ok: false, error: 'Rencana sudah berstatus Draf' };
  const r = await transition(admin, plan, { ...CLEAR_SIGNS, status: 'draft', revision_reason: null });
  if (!r.ok) return r;
  await logAuditAsService({
    action: 'devplan.reopen', category: 'pengembangan', summary: `Membuka kembali ${planTitle(win.period.label)} ke Draf`,
    targetType: 'employee', targetId: emp.id, targetLabel: emp.name,
  }, { id: actor.id, name: actor.name });
  revalidate();
  return { ok: true };
}

/** HRD: batas "rencana disepakati" (informasi) + tutup/buka rencana satu periode laporan. */
export async function setPlanWindow(rawPeriodId: string, closed: boolean, rawDue: string | null): Promise<Result> {
  const pid = Uuid.safeParse(rawPeriodId);
  if (!pid.success) return { ok: false, error: 'Periode tidak valid' };
  const due = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid').nullable().safeParse(rawDue || null);
  if (!due.success) return { ok: false, error: due.error.issues[0].message };
  const c = await ctx(); if (!c.ok) return c;
  const { actor, admin, mode } = c;
  if (!canHrdManage(actor, mode)) return { ok: false, error: 'Hanya HRD (bagian Rencana Pengembangan) di Mode Admin' };

  const { data: cur, error: readErr } = await admin.from('periods').select('label, dev_plan_closed_at').eq('id', pid.data).maybeSingle();
  if (readErr) return { ok: false, error: /dev_plan/.test(readErr.message) ? OFF : 'Gagal membaca periode' };
  if (!cur) return { ok: false, error: 'Periode tidak ditemukan' };
  const closedAt = closed ? (cur.dev_plan_closed_at ?? new Date().toISOString()) : null;
  const { error } = await admin.from('periods').update({ dev_plan_closed_at: closedAt, dev_plan_due: due.data }).eq('id', pid.data);
  if (error) return { ok: false, error: /dev_plan/.test(error.message) ? OFF : 'Gagal menyimpan: ' + error.message };
  await logAuditAsService({
    action: 'devplan.window', category: 'pengembangan',
    summary: `${planTitle(cur.label)}: ${closed ? 'ditutup' : 'dibuka'}${due.data ? ` · batas disepakati ${due.data}` : ''}`,
    targetType: 'period', targetId: pid.data, targetLabel: cur.label,
  }, { id: actor.id, name: actor.name });
  revalidate();
  return { ok: true };
}
