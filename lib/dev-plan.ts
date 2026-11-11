import { canAdmin, canSection, type ActorRow } from '@/lib/auth/roles';
import type { DevPlanStatus } from '@/lib/database.types';

/**
 * RENCANA PENGEMBANGAN (migrasi 0055, Tahap 1) — aturan murni (tanpa I/O), dipakai server & tes.
 *
 * Rencana melekat ke periode LAPORAN (laporan Q3 → "Rencana Pengembangan Q4"). Alur:
 *   draft → waiting_supervisor → waiting_hrd → agreed (terkunci)
 *           ↘ revision (Minta Perbaikan) → kirim ulang → waiting_supervisor
 * Pemilik "Tarik Kembali" → draft HANYA selama waiting_supervisor. Setelah atasan menyetujui rencana tak bisa
 * dikembalikan siapa pun (HRD tak punya "Buka Kembali" — keputusan pemilik 2026-11-03). Rencana Direksi tanpa alur.
 *
 * PEMISAHAN MODE (keputusan pemilik 2026-11-03): pemegang izin HRD di Mode Admin HANYA memakai wewenang HRD
 * (pantauan, Setujui (HRD), tinjauan bulanan, atasan cadangan, atur periode); tindakan pemilik rencana & atasan
 * SPV/Koordinator hanya di mode posisi asli (Mode SPV). Lihat `inAdminView`.
 * Isi hanya bisa diubah di draft/revision — persetujuan selalu atas isi yang sama dengan yang dibaca.
 */

export type SupervisorKind = 'none' | 'direksi' | 'coordinator' | 'spv' | 'hrd';
/**
 * Atasan yang berkomentar & menyetujui. `ids` = pegawai yang boleh bertindak (kosong untuk direksi/hrd: siapa pun
 * berperan itu); `viewerIds` = SPV dari pegawai berkoordinator (hanya melihat, paritas aturan ACC/KPI).
 */
export type SupervisorInfo = { kind: SupervisorKind; ids: string[]; viewerIds: string[] };

/**
 * Siapa atasan rencana pegawai (keputusan pemilik 2026-11-03), urutan pertama yang cocok menang:
 *  1. Direksi → tidak ada atasan (rencana tanpa persetujuan).
 *  2. SPV, atau pegawai/HRD yang memimpin tim SPV → Direksi.
 *  3. Anggota tim koordinator → koordinatornya (SPV-nya hanya melihat).
 *  4. Anggota tim SPV (termasuk koordinator, dan tim HRD Mode SPV) → SPV-nya.
 *  5. Selain itu → HRD (posisi HRD, Mode Admin).
 * Pegawai tak pernah menjadi atasan dirinya sendiri.
 */
export function resolveSupervisor(input: {
  employeeId: string;
  role: string | null | undefined;
  leadsTeam: boolean;
  coordinatorIds: string[];
  spvIds: string[];
}): SupervisorInfo {
  const notSelf = (ids: string[]) => [...new Set(ids)].filter((id) => id !== input.employeeId);
  if (input.role === 'direksi') return { kind: 'none', ids: [], viewerIds: [] };
  if (input.role === 'spv' || input.leadsTeam) return { kind: 'direksi', ids: [], viewerIds: [] };
  const coords = notSelf(input.coordinatorIds);
  const spvs = notSelf(input.spvIds);
  if (coords.length) return { kind: 'coordinator', ids: coords, viewerIds: spvs };
  if (spvs.length) return { kind: 'spv', ids: spvs, viewerIds: [] };
  return { kind: 'hrd', ids: [], viewerIds: [] };
}

export type PlanActor = ActorRow & { id: string };
export type HrdMode = 'admin' | 'spv';

/** Pemegang izin HRD yang sedang di Mode Admin — hanya wewenang HRD, bukan pemilik rencana / atasan SPV. */
export function inAdminView(actor: PlanActor | null | undefined, mode: HrdMode): boolean {
  return !!actor && canAdmin(actor) && mode === 'admin';
}

/** Persetujuan HRD: hanya pegawai berPOSISI HRD di Mode Admin (bukan pemegang izin HRD Admin). Boleh atas rencana sendiri. */
export function canHrdSign(actor: PlanActor | null | undefined, mode: HrdMode): boolean {
  return !!actor && actor.role === 'hrd' && mode === 'admin' && canSection(actor, 'pengembangan');
}

/** Pengaturan jendela rencana per periode (batas, tutup/buka) & halaman pantauan: HRD Mode Admin berbagian Rencana. */
export function canHrdManage(actor: PlanActor | null | undefined, mode: HrdMode): boolean {
  return !!actor && mode === 'admin' && canSection(actor, 'pengembangan');
}

/** Boleh berkomentar & Setujui / Minta Perbaikan sebagai atasan rencana `employeeId`? */
export function canActAsSupervisor(info: SupervisorInfo, actor: PlanActor | null | undefined, employeeId: string, mode: HrdMode): boolean {
  if (!actor || actor.id === employeeId) return false;
  switch (info.kind) {
    case 'direksi': return actor.role === 'direksi';
    case 'coordinator':
    case 'spv': return info.ids.includes(actor.id) && !inAdminView(actor, mode); // atasan SPV/Koordinator hanya di Mode SPV
    case 'hrd': return canHrdSign(actor, mode);
    default: return false;
  }
}

/**
 * Boleh MELIHAT rencana: pemilik, atasan, SPV-pengamat, HRD (Mode Admin). Direksi hanya rencananya sendiri & rencana
 * yang ia atasi (SPV/pemimpin tim) — tanpa pantauan semua pegawai (keputusan pemilik 2026-11-11).
 */
export function canViewPlan(info: SupervisorInfo, actor: PlanActor | null | undefined, employeeId: string, mode: HrdMode): boolean {
  if (!actor) return false;
  if (actor.id === employeeId) return true;
  if (canAdmin(actor) && mode === 'admin') return true;
  return canActAsSupervisor(info, actor, employeeId, mode) || info.viewerIds.includes(actor.id);
}

export type PlanItem = {
  area: string; target: string; actions: string; due_text: string; companion: string; success_indicator: string;
};
export const PLAN_ITEM_FIELDS: { key: keyof PlanItem; label: string; long?: boolean }[] = [
  { key: 'area', label: 'Area yang dikembangkan' },
  { key: 'target', label: 'Target terukur' },
  { key: 'actions', label: 'Langkah aksi', long: true },
  { key: 'due_text', label: 'Tenggat' },
  { key: 'companion', label: 'Pendamping' },
  { key: 'success_indicator', label: 'Indikator berhasil' },
];
export const PLAN_MAX_ITEMS = 10;

/** Semua kolom prioritas terisi. */
function isItemComplete(it: PlanItem): boolean {
  return PLAN_ITEM_FIELDS.every((f) => (it[f.key] ?? '').trim().length > 0);
}

/** Siap dikirim: minimal 1 prioritas & SEMUA prioritas lengkap (tak ada prioritas setengah isi). */
export function submitBlocker(items: PlanItem[]): string | null {
  if (items.length === 0) return 'Tambahkan minimal satu prioritas.';
  const bad = items.findIndex((it) => !isItemComplete(it));
  return bad >= 0 ? `Prioritas ${bad + 1} belum lengkap — semua kolom wajib diisi.` : null;
}

/** Pemilik boleh Tarik Kembali: hanya selama menunggu atasan (sebelum atasan Setujui / Minta Perbaikan). */
export function ownerCanWithdraw(status: DevPlanStatus | null, ownerRole: string | null | undefined): boolean {
  return ownerRole !== 'direksi' && status === 'waiting_supervisor';
}

/** Isi rencana bisa diubah pemilik? Direksi selalu (tanpa alur); lainnya hanya draft / perlu perbaikan. */
export function ownerCanEdit(status: DevPlanStatus | null, ownerRole: string | null | undefined): boolean {
  if (ownerRole === 'direksi') return true;
  return status === null || status === 'draft' || status === 'revision';
}

/** Komentar atasan wajib sebelum Setujui: Konfirmasi Kinerja & Dukungan (keputusan pemilik 2026-11-03). */
export const SUP_MIN = 5;
export function supervisorApproveBlocker(c: { confirmation: string; support: string }): string | null {
  if (c.confirmation.trim().length < SUP_MIN) return `Konfirmasi Kinerja wajib diisi (minimal ${SUP_MIN} karakter).`;
  if (c.support.trim().length < SUP_MIN) return `Dukungan yang Diberikan wajib diisi (minimal ${SUP_MIN} karakter).`;
  return null;
}

export const PLAN_STATUS_LABEL: Record<DevPlanStatus | 'none', string> = {
  none: 'Belum diisi',
  draft: 'Draf',
  waiting_supervisor: 'Menunggu Atasan',
  revision: 'Perlu Perbaikan',
  waiting_hrd: 'Menunggu HRD',
  agreed: 'Disepakati',
};
export const PLAN_STATUS_TONE: Record<DevPlanStatus | 'none', 'neutral' | 'brand' | 'warn' | 'danger'> = {
  none: 'neutral', draft: 'neutral', waiting_supervisor: 'warn', revision: 'danger', waiting_hrd: 'warn', agreed: 'brand',
};
/** Rencana Direksi tak punya alur: "Draf" dibaca "Tersimpan". */
export function planStatusLabel(status: DevPlanStatus | null, ownerRole: string | null | undefined): string {
  if (ownerRole === 'direksi' && status) return 'Tersimpan';
  return PLAN_STATUS_LABEL[status ?? 'none'];
}

export const SUPERVISOR_KIND_LABEL: Record<SupervisorKind, string> = {
  none: '—', direksi: 'Direksi', coordinator: 'Koordinator', spv: 'SPV', hrd: 'HRD',
};

/** "Q3 2026" → "Q4 2026"; "Q4 2026" → "Q1 2027". Label lain → "setelah <label>". */
export function nextQuarterLabel(label: string): string {
  const m = /^Q([1-4])\s+(\d{4})$/.exec(label.trim());
  if (!m) return `setelah ${label}`;
  const q = Number(m[1]), y = Number(m[2]);
  return q === 4 ? `Q1 ${y + 1}` : `Q${q + 1} ${y}`;
}
export function planTitle(sourceLabel: string): string {
  return `Rencana Pengembangan ${nextQuarterLabel(sourceLabel)}`;
}

// ── Tahap 2 (migrasi 0056): catatan sesi 1-on-1 & tinjauan bulanan HRD ─────────────────────────────────────────
// Aplikasi HANYA mencatat (keputusan pemilik 2026-11-03): tak ada hitungan/penanda terlambat terhadap jadwal.

export type SessionKind = 'one_on_one' | 'hrd_monthly';
export const SESSION_KIND_LABEL: Record<SessionKind, string> = { one_on_one: 'Sesi 1-on-1', hrd_monthly: 'Tinjauan Bulanan HRD' };
export const OVERALL_LABEL: Record<'on_track' | 'behind', string> = { on_track: 'Sesuai rencana', behind: 'Tertinggal' };
export const ITEM_PROGRESS_LABEL: Record<'on_track' | 'behind' | 'done', string> = { on_track: 'Berjalan', behind: 'Tertinggal', done: 'Selesai' };

/** Sesi hanya dicatat untuk rencana yang sudah DISEPAKATI (bukan rencana Direksi — tanpa atasan & alur). */
export function sessionsOpen(status: DevPlanStatus | null, ownerRole: string | null | undefined): boolean {
  return status === 'agreed' && ownerRole !== 'direksi';
}

/** Pencatat sesi: 1-on-1 = atasan rencana (termasuk HRD cadangan); tinjauan bulanan = HRD Mode Admin berbagian Rencana. */
export function canRecordSession(
  kind: SessionKind, info: SupervisorInfo, actor: PlanActor | null | undefined, employeeId: string, mode: HrdMode,
): boolean {
  return kind === 'one_on_one' ? canActAsSupervisor(info, actor, employeeId, mode) : canHrdManage(actor, mode);
}

/** Ubah / hapus catatan: hanya pencatatnya, dan selama ia masih berwenang mencatat jenis itu. */
export function canEditSession(
  session: { kind: SessionKind; author_id: string | null }, info: SupervisorInfo, actor: PlanActor | null | undefined,
  employeeId: string, mode: HrdMode,
): boolean {
  return !!actor && session.author_id === actor.id && canRecordSession(session.kind, info, actor, employeeId, mode);
}
