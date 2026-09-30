'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Input KPI bulanan (peran SPV). PANDUAN: "Pengisian Manual Apps".
 *
 * Keamanan (jangan dilemahkan) — keputusan HRD 2026-09-29, migrasi 0042:
 *  - KPI HANYA bisa diubah LEWAT UI (Server Action ini). RLS tak lagi memberi hak tulis
 *    kpi_scores/kpi_audit ke pengguna mana pun (termasuk HRD) → API langsung ditolak.
 *  - Karena itu LINGKUP ditegakkan DI SINI (`assertKpiScope`), SAMA dengan daftar yang tampil di UI:
 *    HRD (posisi, Mode SPV) → pegawai se-divisinya + diri; SPV → tim + diri; Koordinator → tim
 *    naungannya. Lalu tulis via service_role.
 *  - Skor + jejak audit ditulis dalam SATU transaksi (fungsi DB kpi_save_with_audit /
 *    kpi_delete_with_audit) → tak mungkin ada skor tanpa Komentar Audit.
 */

type Svc = ReturnType<typeof createAdminClient>;
type Me = { role: string | null; is_coordinator: boolean | null; is_hrd_admin: boolean | null; dept: string | null } | null;

/**
 * Lingkup tulis KPI jalur SPV/HRD (koordinator punya jalurnya sendiri) — cermin daftar pegawai di tab
 * Input KPI (kpi/page.tsx InputTab), agar API tak lebih longgar daripada UI. null = boleh.
 */
async function assertKpiScope(svc: Svc, me: Me, userId: string, empIds: string[]): Promise<string | null> {
  if (me?.role === 'hrd') {
    // HRD posisi (Mode SPV) → pegawai se-divisinya (bukan Direksi) + dirinya sendiri.
    const { data, error } = await svc.from('employees').select('id, dept, role').in('id', empIds);
    if (error) return 'Gagal memeriksa divisi pegawai: ' + error.message;
    const byId = new Map((data ?? []).map((e) => [e.id, e]));
    const ok = empIds.every((id) => {
      const e = byId.get(id);
      return !!e && (id === userId || (e.dept === me.dept && e.role !== 'direksi'));
    });
    return ok ? null : 'Sebagian pegawai berada di luar divisi Anda.';
  }
  if (me?.role !== 'spv') return 'Hanya SPV, Koordinator, atau HRD (Mode SPV) yang dapat mengubah KPI.';
  const { data: team, error } = await svc.from('spv_team_members')
    .select('employee_id').eq('spv_id', userId).in('employee_id', empIds);
  if (error) return 'Gagal memeriksa tim: ' + error.message;
  const allowed = new Set([userId, ...(team ?? []).map((t) => t.employee_id)]); // tim + diri sendiri (0008)
  return empIds.every((id) => allowed.has(id)) ? null : 'Sebagian pegawai berada di luar tim Anda.';
}

/** Fungsi DB belum ada (migrasi 0042 belum diterapkan) → pakai jalur lama 2-langkah via service_role. */
const rpcMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message ?? ''));

/** Simpan skor + audit (atomik bila 0042 sudah diterapkan). null = sukses. */
async function writeKpi(svc: Svc, actorId: string, ym: string, rows: { employeeId: string; score: number; note?: string }[]): Promise<string | null> {
  const { error } = await svc.rpc('kpi_save_with_audit', {
    p_actor: actorId, p_ym: ym,
    p_rows: rows.map((r) => ({ employee_id: r.employeeId, score: r.score, note: r.note ?? null })),
  });
  if (!error) return null;
  if (!rpcMissing(error)) return 'Gagal menyimpan: ' + error.message;
  const { error: upErr } = await svc.from('kpi_scores').upsert(
    rows.map((r) => ({ employee_id: r.employeeId, ym, score: r.score, updated_by: actorId })),
    { onConflict: 'employee_id,ym' },
  );
  if (upErr) return 'Gagal menyimpan: ' + upErr.message;
  const { error: auErr } = await svc.from('kpi_audit').insert(
    rows.map((r) => ({ employee_id: r.employeeId, ym, score: r.score, changed_by: actorId, note: r.note ?? 'Input bulanan' })),
  );
  return auErr ? 'Skor tersimpan tapi audit gagal: ' + auErr.message : null;
}
const ScoreRow = z.object({
  employeeId: z.string().uuid(),
  score: z.coerce.number().min(0, 'Skor minimal 0').max(100, 'Skor maksimal 100'),
  note: z.string().trim().max(500).optional(),
});

const SaveKpiInput = z.object({
  ym: z.string().regex(/^\d{4}-\d{2}$/, 'Format bulan harus YYYY-MM'),
  rows: z.array(ScoreRow).min(1, 'Tidak ada skor untuk disimpan'),
});

export type SaveKpiResult =
  | { ok: true; saved: number }
  | { ok: false; error: string };

export async function saveKpiScores(raw: unknown): Promise<SaveKpiResult> {
  const parsed = SaveKpiInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }
  const { ym, rows } = parsed.data;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_coordinator, is_hrd_admin, dept').eq('id', auth.user.id).maybeSingle();
  const empIds = rows.map((r) => r.employeeId);

  // PEGAWAI NONAKTIF: hanya boleh diberi KPI untuk bulan yang masih ia kerjakan (ym ≤ bulan
  // `left_on`). Daftar di UI sudah menyaring per bulan, tapi itu TAMPILAN — gembok sesungguhnya
  // di sini (impor Excel, tab yang terbuka lama, atau pemanggilan langsung tak lewat daftar).
  // Ditaruh SEBELUM percabangan koordinator agar berlaku untuk semua jalur (SPV/HRD/Koordinator).
  // Nonaktif tanpa `left_on` (deaktivasi lama) ditolak untuk semua bulan — tak ada acuan batas.
  const { data: empStatus } = await createAdminClient()
    .from('employees').select('id, name, is_active, left_on, is_external').in('id', empIds);
  // Penilai EKSTERNAL (vendor/freelance) tak punya KPI — hanya menjadi penilai 360°.
  const external = (empStatus ?? []).filter((e) => e.is_external);
  if (external.length > 0) {
    return { ok: false, error: `Pegawai eksternal tidak memiliki KPI: ${external.map((e) => e.name).join(', ')}.` };
  }
  const blocked = (empStatus ?? []).filter((e) => !e.is_active && (!e.left_on || ym > e.left_on.slice(0, 7)));
  if (blocked.length > 0) {
    return {
      ok: false,
      error: `Pegawai nonaktif tidak dapat diberi KPI bulan ${ym} (di luar masa kerjanya): ${blocked.map((e) => e.name).join(', ')}.`,
    };
  }

  // KOORDINATOR "murni" (grant is_coordinator, bukan SPV/HRD/Direksi): input KPI HANYA pegawai
  // naungannya. RLS kpi_write menolak koordinator → tulis lewat service_role dgn scoping server.
  if (me?.is_coordinator && me.role !== 'spv' && me.role !== 'hrd' && me.role !== 'direksi') {
    return saveKpiAsCoordinator(auth.user.id, ym, rows, empIds);
  }

  // SPV: pegawai yang PUNYA koordinator diinput koordinatornya, bukan SPV → tolak di server.
  // (HRD dibiarkan sebagai fallback/override tepercaya; daftar UI-nya sudah mengecualikan.)
  if (me?.role === 'spv') {
    const { data: ct } = await createAdminClient()
      .from('coordinator_team_members').select('employee_id').in('employee_id', empIds);
    const coordinated = new Set((ct ?? []).map((r) => r.employee_id));
    if (empIds.some((id) => coordinated.has(id))) {
      return { ok: false, error: 'Sebagian pegawai dikoordinasikan oleh Koordinator — KPI mereka diinput koordinatornya, bukan SPV.' };
    }
  }

  // Tolak input ke periode yang sudah dikunci (server-side; RLS tidak mengecek ini).
  const { data: openMonth } = await supabase
    .from('period_months')
    .select('ym, periods!inner(status)')
    .eq('ym', ym)
    .eq('periods.status', 'active')
    .maybeSingle();
  if (!openMonth) {
    return { ok: false, error: `Bulan ${ym} tidak berada dalam periode aktif` };
  }

  // Aturan paritas legacy: input KPI PERTAMA (belum ada baris bulan ini) boleh tanpa
  // komentar; input KEDUA pada bulan SAMA = EDIT capaian → WAJIB Komentar Audit.
  // Cek per pegawai: bila skor bulan ini sudah ada tapi komentar kosong → tolak.
  const { data: existingRows } = await supabase
    .from('kpi_scores').select('employee_id').eq('ym', ym).in('employee_id', empIds);
  const existing = new Set((existingRows ?? []).map((r) => r.employee_id));
  const missingNote = rows.filter((r) => existing.has(r.employeeId) && !(r.note && r.note.trim()));
  if (missingNote.length > 0) {
    const { data: emps } = await supabase
      .from('employees').select('id, name').in('id', missingNote.map((r) => r.employeeId));
    const names = (emps ?? []).map((e) => e.name);
    const label = names.length ? names.join(', ') : `${missingNote.length} pegawai`;
    return {
      ok: false,
      error: `Perubahan capaian KPI bulan ${ym} wajib disertai Komentar Audit (input kedua = edit): ${label}.`,
    };
  }

  // Lingkup (dulu ditegakkan RLS kpi_write; kini di server karena tulis lewat service_role).
  const svc = createAdminClient();
  const scopeErr = await assertKpiScope(svc, me, auth.user.id, empIds);
  if (scopeErr) return { ok: false, error: scopeErr };

  // Skor + jejak audit (append-only) dalam satu transaksi.
  const writeErr = await writeKpi(svc, auth.user.id, ym, rows);
  if (writeErr) return { ok: false, error: writeErr };

  revalidatePath('/kpi');
  return { ok: true, saved: rows.length };
}

/**
 * Jalur KOORDINATOR untuk saveKpiScores. Koordinator = pegawai biasa di RLS (grant tak menyalakan
 * kpi_write) → tulis via service_role dengan penegakan di SERVER: setiap pegawai WAJIB ada di
 * coordinator_team_members milik koordinator ini. Guard lain (periode aktif, edit-wajib-komentar,
 * jejak audit) IDENTIK dgn jalur SPV — cuma clientnya service_role & lingkupnya tim koordinasi.
 */
async function saveKpiAsCoordinator(
  coordId: string,
  ym: string,
  rows: z.infer<typeof ScoreRow>[],
  empIds: string[],
): Promise<SaveKpiResult> {
  const svc = createAdminClient();

  // Scoping NYATA: semua pegawai target wajib di bawah koordinasi pelaku.
  const { data: team } = await svc.from('coordinator_team_members')
    .select('employee_id').eq('coordinator_id', coordId).in('employee_id', empIds);
  const allowed = new Set((team ?? []).map((t) => t.employee_id));
  if (empIds.some((id) => !allowed.has(id))) {
    return { ok: false, error: 'Sebagian pegawai berada di luar tim koordinasi Anda.' };
  }

  // Tolak periode terkunci.
  const { data: openMonth } = await svc
    .from('period_months').select('ym, periods!inner(status)')
    .eq('ym', ym).eq('periods.status', 'active').maybeSingle();
  if (!openMonth) return { ok: false, error: `Bulan ${ym} tidak berada dalam periode aktif` };

  // Edit bulan sama = wajib Komentar Audit (paritas legacy).
  const { data: existingRows } = await svc
    .from('kpi_scores').select('employee_id').eq('ym', ym).in('employee_id', empIds);
  const existing = new Set((existingRows ?? []).map((r) => r.employee_id));
  const missingNote = rows.filter((r) => existing.has(r.employeeId) && !(r.note && r.note.trim()));
  if (missingNote.length > 0) {
    const { data: emps } = await svc.from('employees').select('id, name').in('id', missingNote.map((r) => r.employeeId));
    const names = (emps ?? []).map((e) => e.name);
    const label = names.length ? names.join(', ') : `${missingNote.length} pegawai`;
    return { ok: false, error: `Perubahan capaian KPI bulan ${ym} wajib disertai Komentar Audit (input kedua = edit): ${label}.` };
  }

  const writeErr = await writeKpi(svc, coordId, ym, rows);
  if (writeErr) return { ok: false, error: writeErr };

  revalidatePath('/kpi');
  return { ok: true, saved: rows.length };
}

/**
 * Hapus satu skor KPI (pegawai+bulan) — peran SPV (tim/diri) & HRD mode-SPV (divisi).
 *
 * Keamanan & jejak (jangan dilemahkan):
 *  - RLS `kpi_write` (for all) membatasi DELETE ke tim/diri sendiri — penegakan sebenarnya.
 *  - WAJIB alasan (note) — penghapusan lebih konsekuen daripada edit.
 *  - Tolak di periode terkunci (server; RLS tak mengecek ini).
 *  - Penghapusan DICATAT di kpi_audit (append-only) dgn action='delete' & score=nilai lama.
 */
const DeleteKpiInput = z.object({
  employeeId: z.string().uuid(),
  ym: z.string().regex(/^\d{4}-\d{2}$/, 'Format bulan harus YYYY-MM'),
  note: z.string().trim().min(1, 'Alasan penghapusan wajib diisi').max(500),
});

export type DeleteKpiResult = { ok: true } | { ok: false; error: string };

export async function deleteKpiScore(raw: unknown): Promise<DeleteKpiResult> {
  const parsed = DeleteKpiInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const { employeeId, ym, note } = parsed.data;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_coordinator, is_hrd_admin, dept').eq('id', auth.user.id).maybeSingle();

  // KOORDINATOR "murni": hapus KPI HANYA pegawai naungannya, via service_role (RLS menolaknya).
  const isCoord = me?.is_coordinator && me.role !== 'spv' && me.role !== 'hrd' && me.role !== 'direksi';
  const svc = createAdminClient();
  if (isCoord) {
    const { data: link } = await svc.from('coordinator_team_members')
      .select('employee_id').eq('coordinator_id', auth.user.id).eq('employee_id', employeeId).maybeSingle();
    if (!link) return { ok: false, error: 'Pegawai ini di luar tim koordinasi Anda.' };
  } else if (me?.role === 'spv') {
    // SPV tak boleh menghapus KPI pegawai berkoordinator (itu wewenang koordinatornya).
    const { data: coordLink } = await svc.from('coordinator_team_members')
      .select('employee_id').eq('employee_id', employeeId).maybeSingle();
    if (coordLink) return { ok: false, error: 'Pegawai ini dikoordinasikan oleh Koordinator — KPI-nya dikelola koordinatornya.' };
  }

  // Lingkup SPV/HRD ditegakkan di server (RLS tak lagi memberi hak tulis KPI — migrasi 0042).
  if (!isCoord) {
    const scopeErr = await assertKpiScope(svc, me, auth.user.id, [employeeId]);
    if (scopeErr) return { ok: false, error: scopeErr };
  }
  const db = isCoord ? svc : supabase; // baca (periode & skor lama)

  // Tolak penghapusan di bulan luar periode aktif (konsisten dgn saveKpiScores).
  const { data: openMonth } = await db
    .from('period_months').select('ym, periods!inner(status)')
    .eq('ym', ym).eq('periods.status', 'active').maybeSingle();
  if (!openMonth) return { ok: false, error: `Bulan ${ym} tidak berada dalam periode aktif` };

  // Skor lama (dicatat di audit + pastikan memang ada).
  const { data: cur } = await db
    .from('kpi_scores').select('score').eq('employee_id', employeeId).eq('ym', ym).maybeSingle();
  if (!cur) return { ok: false, error: `Tidak ada skor KPI bulan ${ym} untuk dihapus` };

  // Hapus + jejak audit (action='delete', skor lama) dalam satu transaksi via service_role.
  const { data: oldScore, error: rpcErr } = await svc.rpc('kpi_delete_with_audit', {
    p_actor: auth.user.id, p_employee: employeeId, p_ym: ym, p_note: note,
  });
  if (rpcErr && !rpcMissing(rpcErr)) return { ok: false, error: 'Gagal menghapus: ' + rpcErr.message };
  if (rpcErr) {
    // Fallback sebelum migrasi 0042 diterapkan: dua langkah via service_role.
    const { data: del, error: delErr } = await svc
      .from('kpi_scores').delete().eq('employee_id', employeeId).eq('ym', ym).select('employee_id');
    if (delErr) return { ok: false, error: 'Gagal menghapus: ' + delErr.message };
    if (!del || del.length === 0) return { ok: false, error: 'Skor tak ditemukan atau di luar lingkup Anda' };
    const { error: auditErr } = await svc.from('kpi_audit').insert({
      employee_id: employeeId, ym, score: cur.score, changed_by: auth.user.id, note, action: 'delete',
    });
    if (auditErr) return { ok: false, error: 'Skor dihapus tapi audit gagal: ' + auditErr.message };
  } else if (oldScore == null) {
    return { ok: false, error: 'Skor tak ditemukan atau di luar lingkup Anda' };
  }

  revalidatePath('/kpi');
  return { ok: true };
}
