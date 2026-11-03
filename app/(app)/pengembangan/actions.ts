'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logAuditAsService } from '@/lib/audit/log';
import { tableMissing } from '@/lib/report-folder';
import { rpcMissing } from '@/lib/supabase/rpc';
import {
  canActAsSupervisor, canHrdManage, canHrdSign, ownerCanEdit, submitBlocker, supervisorApproveBlocker,
  planTitle, PLAN_MAX_ITEMS, SUP_MIN, inAdminView, ownerCanWithdraw, sessionsOpen, canRecordSession, canEditSession, SESSION_KIND_LABEL,
  type PlanActor, type HrdMode,
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
// Pemisahan mode: rencana SENDIRI hanya diubah dari mode posisi asli (Mode SPV), bukan Mode Admin.
const OWNER_IN_ADMIN = 'Pindah ke Mode SPV untuk mengubah rencana Anda sendiri';
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
  const { actor, admin, mode } = c;
  if (inAdminView(actor, mode)) return { ok: false, error: OWNER_IN_ADMIN };

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
  }
  // Ganti seluruh prioritas dalam SATU transaksi yang mengunci baris rencana (0057): Kirim dari tab lain menunggu,
  // dan database menolak bila status sudah bukan Draf / Perlu Perbaikan — tak ada isi setengah-tersimpan.
  const { error: rpcErr } = await admin.rpc('dev_plan_replace_items', { p_plan: planId, p_items: items.data });
  if (!rpcErr) { revalidate(); return { ok: true }; }
  if (!rpcMissing(rpcErr)) {
    return { ok: false, error: /Draf atau Perlu Perbaikan/.test(rpcErr.message)
      ? 'Rencana sudah dikirim — isinya tidak bisa diubah' : 'Gagal menyimpan prioritas: ' + rpcErr.message };
  }
  // Cadangan bila 0057 belum terpasang: sisipkan yang baru DULU, baru hapus yang lama → gagal sisip tak menghilangkan isi lama.
  await admin.from('development_plans').update({ updated_at: new Date().toISOString() }).eq('id', planId);
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
  const { actor, admin, mode } = c;
  if (inAdminView(actor, mode)) return { ok: false, error: OWNER_IN_ADMIN };
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

/** HRD (posisi HRD, Mode Admin) menyetujui terakhir → Disepakati. Boleh atas rencananya sendiri, setelah atasannya
 *  menyetujui & dari Mode Admin (keputusan pemilik 2026-11-03). */
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

/**
 * Pemilik menarik kembali rencana yang masih MENUNGGU ATASAN → Draf (mis. ingin menambah prioritas). Setelah atasan
 * menyetujui, tak ada jalur kembali (keputusan pemilik 2026-11-03 — HRD tak punya "Buka Kembali").
 */
export async function withdrawMyPlan(rawPeriodId: string): Promise<Result> {
  const pid = Uuid.safeParse(rawPeriodId);
  if (!pid.success) return { ok: false, error: 'Periode tidak valid' };
  const c = await ctx(); if (!c.ok) return c;
  const { actor, admin, mode } = c;
  if (inAdminView(actor, mode)) return { ok: false, error: OWNER_IN_ADMIN };
  const win = await planWindow(admin, actor.id, pid.data);
  if (!win.ok) return win;
  const cur = await loadPlan(admin, actor.id, pid.data);
  if (cur.missing) return { ok: false, error: OFF };
  if (!cur.plan || !ownerCanWithdraw(cur.plan.status, actor.role)) {
    return { ok: false, error: 'Rencana hanya bisa ditarik kembali selama masih menunggu atasan' };
  }
  const r = await transition(admin, cur.plan, { ...CLEAR_SIGNS, status: 'draft', revision_reason: null });
  if (!r.ok) return r;
  await logAuditAsService({
    action: 'devplan.withdraw', category: 'pengembangan', summary: `Menarik kembali ${planTitle(win.period.label)} ke Draf`,
    targetType: 'employee', targetId: actor.id, targetLabel: actor.name,
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

// ── Tahap 2 (migrasi 0056): catatan sesi 1-on-1 & tinjauan bulanan HRD ─────────────────────────────────────────
const SESSION_OFF = 'Catatan sesi belum aktif';
const Progress = z.array(z.object({
  item_id: z.string().uuid(),
  status: z.enum(['on_track', 'behind', 'done']),
  note: z.string().trim().max(1000),
})).max(PLAN_MAX_ITEMS);
const SessionInput = z.object({
  kind: z.enum(['one_on_one', 'hrd_monthly']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal sesi wajib diisi'),
  summary: z.string().trim().min(SUP_MIN, `Catatan sesi minimal ${SUP_MIN} karakter`).max(4000),
  overall: z.enum(['on_track', 'behind']).nullable(),
  progress: Progress,
});

/** Konteks bersama aksi sesi: rencana disepakati + periode terbuka + atasan/HRD dihitung ulang. */
type Ctx = Extract<Awaited<ReturnType<typeof ctx>>, { ok: true }>;
async function sessionCtx(c: Ctx, planId: string) {
  const p = await planById(c.admin, planId); if (!p.ok) return p;
  const win = await planWindow(c.admin, p.emp.id, p.plan.source_period_id);
  if (!win.ok) return win;
  if (!sessionsOpen(p.plan.status, p.emp.role)) return { ok: false as const, error: 'Catatan sesi hanya untuk rencana yang sudah Disepakati' };
  const resolve = await loadSupervisorResolver(c.admin);
  return { ...c, ...p, ok: true as const, period: win.period, info: resolve(p.emp) };
}

/** Atasan (1-on-1) / HRD (tinjauan bulanan) menambah atau mengubah catatan sesinya sendiri. */
export async function saveSession(rawPlanId: string, rawSessionId: string | null, raw: unknown): Promise<Result> {
  const planId = Uuid.safeParse(rawPlanId);
  if (!planId.success) return { ok: false, error: 'Rencana tidak valid' };
  const input = SessionInput.safeParse(raw);
  if (!input.success) return { ok: false, error: input.error.issues[0].message };
  const c = await ctx(); if (!c.ok) return c;
  const s = await sessionCtx(c, planId.data); if (!s.ok) return s;
  const { actor, admin, mode, plan, emp, info } = s;
  const v = input.data;
  if (!canRecordSession(v.kind, info, actor, emp.id, mode)) {
    return { ok: false, error: v.kind === 'one_on_one' ? 'Sesi 1-on-1 dicatat oleh atasan rencana ini' : 'Tinjauan bulanan dicatat oleh HRD di Mode Admin' };
  }
  // Kemajuan hanya untuk prioritas milik rencana ini; tinjauan HRD tanpa status/kemajuan.
  const { data: items } = await admin.from('development_plan_items').select('id').eq('plan_id', plan.id);
  const own = new Set((items ?? []).map((i) => i.id));
  if (v.progress.some((x) => !own.has(x.item_id))) return { ok: false, error: 'Prioritas tidak dikenal' };
  const row = {
    kind: v.kind, session_date: v.date, summary: v.summary,
    overall_status: v.kind === 'one_on_one' ? v.overall : null,
    item_progress: v.kind === 'one_on_one' ? v.progress : [],
    updated_at: new Date().toISOString(),
  };

  if (rawSessionId) {
    const sid = Uuid.safeParse(rawSessionId);
    if (!sid.success) return { ok: false, error: 'Catatan tidak valid' };
    const { data: cur, error } = await admin.from('development_plan_sessions').select('id, plan_id, kind, author_id').eq('id', sid.data).maybeSingle();
    if (error) return { ok: false, error: tableMissing(error) ? SESSION_OFF : 'Gagal membaca catatan' };
    if (!cur || cur.plan_id !== plan.id || cur.kind !== v.kind) return { ok: false, error: 'Catatan tidak ditemukan' };
    if (!canEditSession(cur, info, actor, emp.id, mode)) return { ok: false, error: 'Hanya pencatatnya yang bisa mengubah catatan ini' };
    const { error: upErr } = await admin.from('development_plan_sessions').update(row).eq('id', cur.id);
    if (upErr) return { ok: false, error: 'Gagal menyimpan: ' + upErr.message };
  } else {
    const { error } = await admin.from('development_plan_sessions')
      .insert({ ...row, plan_id: plan.id, author_id: actor.id, author_name: actor.name });
    if (error) return { ok: false, error: tableMissing(error) ? SESSION_OFF : 'Gagal menyimpan: ' + error.message };
  }
  await logAuditAsService({
    action: rawSessionId ? 'devplan.session_update' : 'devplan.session_add', category: 'pengembangan',
    summary: `${rawSessionId ? 'Mengubah' : 'Mencatat'} ${SESSION_KIND_LABEL[v.kind]} ${v.date} — ${planTitle(s.period.label)}`,
    targetType: 'employee', targetId: emp.id, targetLabel: emp.name,
  }, { id: actor.id, name: actor.name });
  revalidate();
  return { ok: true };
}

/** Hapus catatan sesi — hanya pencatatnya (mis. salah tanggal / salah pegawai). */
export async function deleteSession(rawSessionId: string): Promise<Result> {
  const sid = Uuid.safeParse(rawSessionId);
  if (!sid.success) return { ok: false, error: 'Catatan tidak valid' };
  const c = await ctx(); if (!c.ok) return c;
  const { data: cur, error } = await c.admin.from('development_plan_sessions').select('id, plan_id, kind, author_id, session_date').eq('id', sid.data).maybeSingle();
  if (error) return { ok: false, error: tableMissing(error) ? SESSION_OFF : 'Gagal membaca catatan' };
  if (!cur) return { ok: false, error: 'Catatan tidak ditemukan' };
  const s = await sessionCtx(c, cur.plan_id); if (!s.ok) return s;
  if (!canEditSession(cur, s.info, s.actor, s.emp.id, s.mode)) return { ok: false, error: 'Hanya pencatatnya yang bisa menghapus catatan ini' };
  const { error: delErr } = await s.admin.from('development_plan_sessions').delete().eq('id', cur.id);
  if (delErr) return { ok: false, error: 'Gagal menghapus: ' + delErr.message };
  await logAuditAsService({
    action: 'devplan.session_delete', category: 'pengembangan',
    summary: `Menghapus ${SESSION_KIND_LABEL[cur.kind]} ${cur.session_date} — ${planTitle(s.period.label)}`,
    targetType: 'employee', targetId: s.emp.id, targetLabel: s.emp.name,
  }, { id: s.actor.id, name: s.actor.name });
  revalidate();
  return { ok: true };
}

/** Pegawai menulis / mengubah tanggapannya atas satu sesi 1-on-1. */
export async function saveSessionResponse(rawSessionId: string, rawNote: string): Promise<Result> {
  const sid = Uuid.safeParse(rawSessionId);
  if (!sid.success) return { ok: false, error: 'Catatan tidak valid' };
  const note = z.string().trim().max(2000).safeParse(rawNote ?? '');
  if (!note.success) return { ok: false, error: 'Tanggapan terlalu panjang' };
  const c = await ctx(); if (!c.ok) return c;
  const { data: cur, error } = await c.admin.from('development_plan_sessions').select('id, plan_id, kind').eq('id', sid.data).maybeSingle();
  if (error) return { ok: false, error: tableMissing(error) ? SESSION_OFF : 'Gagal membaca catatan' };
  if (!cur || cur.kind !== 'one_on_one') return { ok: false, error: 'Catatan tidak ditemukan' };
  const s = await sessionCtx(c, cur.plan_id); if (!s.ok) return s;
  if (s.emp.id !== s.actor.id) return { ok: false, error: 'Tanggapan hanya ditulis pemilik rencana' };
  if (inAdminView(s.actor, s.mode)) return { ok: false, error: OWNER_IN_ADMIN };
  const { error: upErr } = await s.admin.from('development_plan_sessions')
    .update({ employee_note: note.data || null, employee_note_at: note.data ? new Date().toISOString() : null }).eq('id', cur.id);
  if (upErr) return { ok: false, error: 'Gagal menyimpan: ' + upErr.message };
  revalidate();
  return { ok: true };
}
