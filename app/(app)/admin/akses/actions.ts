'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isFullHrd, GRANTABLE_PAGES, PAGE_SCOPES, GRANTABLE_PAGE_LABELS, GRANTABLE_PAGE_KIND, PAGE_SCOPE_LABELS, GRANT_ROLE_TARGETS, GRANT_ROLE_TARGET_LABELS, type GrantablePage, type PageScope } from '@/lib/auth/roles';
import { logHrdAction } from '@/lib/audit/log';

/**
 * Manajemen Akses (HRD): beri/ubah/cabut akses HALAMAN ber-lingkup untuk pegawai non-HRD
 * (RBAC data-driven, migrasi 0024). AUGMENT — tak mengubah akses default per-peran.
 *
 * KEAMANAN:
 *   - Gerbang: HANYA HRD PENUH (isFullHrd) — rekan HRD terbatas tak boleh mengelola grant
 *     (cegah menaikkan aksesnya sendiri).
 *   - Penulisan page_grants LEWAT service_role (tabel tak punya policy tulis untuk pengguna biasa).
 *   - Section wajib dari katalog GRANTABLE_PAGES (halaman yang lingkupnya SUDAH ditegakkan server);
 *     scope dari PAGE_SCOPES. Nilai di luar itu ditolak Zod.
 *   - Semua perubahan tercatat di Log Aktivitas HRD.
 */
type Result = { ok: true; msg?: string } | { ok: false; error: string };

async function requireFullHrd(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!isFullHrd(me)) return { ok: false as const, error: 'Hanya HRD Admin dengan akses penuh yang dapat mengatur akses.' };
  return { ok: true as const, userId: user.id };
}

const GrantInput = z.object({
  employeeId: z.string().uuid(),
  section: z.enum(GRANTABLE_PAGES),
  scopes: z.array(z.enum(PAGE_SCOPES)).min(1),
  canEdit: z.boolean(),
});

/**
 * Beri/ubah akses halaman ber-lingkup untuk seorang pegawai (upsert per (orang, halaman)). Lingkup
 * kini MULTI (`scopes[]`, migrasi 0028). Ditulis via service_role. `canEdit` hanya bermakna untuk
 * halaman jenis 'administrator' (dinormalkan false untuk 'pemantauan'). Kolom tunggal LAMA `scope`
 * tetap diisi (`scopes[0]`) demi kompatibilitas app yang belum di-deploy ulang.
 */
export async function setPageGrant(employeeId: string, section: unknown, scopes: unknown, canEdit: unknown = false): Promise<Result> {
  const parsed = GrantInput.safeParse({ employeeId, section, scopes, canEdit: !!canEdit });
  if (!parsed.success) return { ok: false, error: 'Input tidak valid (pilih minimal satu lingkup).' };
  const { employeeId: id, section: sec } = parsed.data;
  // Normalisasi: buang duplikat; 'all' menyerap semua → simpan ['all'] saja (paling ringkas).
  let scps: PageScope[] = [...new Set(parsed.data.scopes)];
  if (scps.includes('all')) scps = ['all'];
  // Halaman pemantauan selalu lihat-saja → paksa can_edit=false apa pun yang dikirim.
  const edit = GRANTABLE_PAGE_KIND[sec as GrantablePage] === 'administrator' ? parsed.data.canEdit : false;

  const supabase = await createClient();
  const auth = await requireFullHrd(supabase);
  if (!auth.ok) return auth;

  const { data: target } = await supabase.from('employees').select('name').eq('id', id).maybeSingle();
  if (!target) return { ok: false, error: 'Pegawai tidak ditemukan.' };

  // Upsert lewat service_role (page_grants tanpa policy tulis untuk pengguna biasa). Isi `scope`
  // (legacy) + `scopes` (baru) sekaligus agar sinkron.
  const admin = createAdminClient();
  const { error } = await admin.from('page_grants')
    .upsert({ employee_id: id, section: sec, scope: scps[0], scopes: scps, can_edit: edit, created_by: auth.userId }, { onConflict: 'employee_id,section' });
  if (error) return { ok: false, error: 'Gagal menyimpan akses: ' + error.message };

  const scopeLabel = scps.map((s) => PAGE_SCOPE_LABELS[s]).join(' + ');
  const editNote = GRANTABLE_PAGE_KIND[sec as GrantablePage] === 'administrator' ? (edit ? ', boleh edit' : ', hanya lihat') : '';
  await logHrdAction({
    action: 'access.set_page_grant', category: 'pegawai',
    summary: `Memberi akses "${GRANTABLE_PAGE_LABELS[sec as GrantablePage]}" (${scopeLabel}${editNote}) untuk ${target.name ?? id}`,
    targetType: 'employee', targetId: id, targetLabel: target.name ?? null, meta: { section: sec, scopes: scps, can_edit: edit },
  });
  revalidate();
  return { ok: true, msg: `Akses "${GRANTABLE_PAGE_LABELS[sec as GrantablePage]}" diberikan (${scopeLabel}${editNote}).` };
}

const RoleGrantInput = z.object({
  roleTarget: z.enum(GRANT_ROLE_TARGETS),
  section: z.enum(GRANTABLE_PAGES),
  scopes: z.array(z.enum(PAGE_SCOPES)).min(1),
  canEdit: z.boolean(),
});

/**
 * Beri akses halaman ber-lingkup ke SEMUA anggota sebuah PERAN saat ini (upsert per orang, via
 * service_role). Lingkup/izin sama untuk tiap anggota; penegakan tetap per-pemegang saat runtime
 * (mis. 'coordinator_team' → tim masing-masing; 'own_division' → divisi masing-masing). Peringatan
 * untuk Edit-ke-peran-luas ditangani di klien (konfirmasi) — di server tetap dibolehkan.
 */
export async function setPageGrantForRole(roleTarget: unknown, section: unknown, scopes: unknown, canEdit: unknown = false): Promise<Result> {
  const parsed = RoleGrantInput.safeParse({ roleTarget, section, scopes, canEdit: !!canEdit });
  if (!parsed.success) return { ok: false, error: 'Input tidak valid (pilih peran, halaman, & minimal satu lingkup).' };
  const { roleTarget: rt, section: sec } = parsed.data;
  let scps: PageScope[] = [...new Set(parsed.data.scopes)];
  if (scps.includes('all')) scps = ['all'];
  const edit = GRANTABLE_PAGE_KIND[sec as GrantablePage] === 'administrator' ? parsed.data.canEdit : false;

  const supabase = await createClient();
  const auth = await requireFullHrd(supabase);
  if (!auth.ok) return auth;

  // Anggota peran SAAT INI (via service_role; internal saja).
  const admin = createAdminClient();
  let q = admin.from('employees').select('id').eq('is_external', false);
  if (rt === 'koordinator') q = q.eq('is_coordinator', true);
  else if (rt === 'pegawai') q = q.eq('role', 'employee');
  else if (rt === 'spv') q = q.eq('role', 'spv');
  else q = q.eq('role', 'direksi');
  const { data: members, error: mErr } = await q;
  if (mErr) return { ok: false, error: 'Gagal membaca anggota peran: ' + mErr.message };
  if (!members || members.length === 0) return { ok: false, error: `Tak ada anggota ${GRANT_ROLE_TARGET_LABELS[rt]} saat ini.` };

  const rows = members.map((m) => ({
    employee_id: m.id, section: sec, scope: scps[0], scopes: scps, can_edit: edit, created_by: auth.userId,
  }));
  const { error } = await admin.from('page_grants').upsert(rows, { onConflict: 'employee_id,section' });
  if (error) return { ok: false, error: 'Gagal menyimpan akses massal: ' + error.message };

  const scopeLabel = scps.map((s) => PAGE_SCOPE_LABELS[s]).join(' + ');
  const editNote = GRANTABLE_PAGE_KIND[sec as GrantablePage] === 'administrator' ? (edit ? ', boleh edit' : ', hanya lihat') : '';
  await logHrdAction({
    action: 'access.set_page_grant_role', category: 'pegawai',
    summary: `Memberi akses "${GRANTABLE_PAGE_LABELS[sec as GrantablePage]}" (${scopeLabel}${editNote}) ke SEMUA ${GRANT_ROLE_TARGET_LABELS[rt]} (${rows.length} orang)`,
    targetType: 'role', targetId: rt, targetLabel: GRANT_ROLE_TARGET_LABELS[rt], meta: { section: sec, scopes: scps, can_edit: edit, count: rows.length },
  });
  revalidate();
  return { ok: true, msg: `Akses "${GRANTABLE_PAGE_LABELS[sec as GrantablePage]}" diberikan ke ${rows.length} ${GRANT_ROLE_TARGET_LABELS[rt]} (${scopeLabel}${editNote}).` };
}

/** Cabut akses halaman untuk seorang pegawai. Ditulis via service_role. */
export async function removePageGrant(employeeId: string, section: unknown): Promise<Result> {
  const parsed = z.object({ employeeId: z.string().uuid(), section: z.enum(GRANTABLE_PAGES) }).safeParse({ employeeId, section });
  if (!parsed.success) return { ok: false, error: 'Input tidak valid' };
  const { employeeId: id, section: sec } = parsed.data;

  const supabase = await createClient();
  const auth = await requireFullHrd(supabase);
  if (!auth.ok) return auth;

  const { data: target } = await supabase.from('employees').select('name').eq('id', id).maybeSingle();
  const admin = createAdminClient();
  const { error } = await admin.from('page_grants').delete().eq('employee_id', id).eq('section', sec);
  if (error) return { ok: false, error: 'Gagal mencabut akses: ' + error.message };

  await logHrdAction({
    action: 'access.remove_page_grant', category: 'pegawai',
    summary: `Mencabut akses "${GRANTABLE_PAGE_LABELS[sec as GrantablePage]}" untuk ${target?.name ?? id}`,
    targetType: 'employee', targetId: id, targetLabel: target?.name ?? null, meta: { section: sec },
  });
  revalidate();
  return { ok: true, msg: `Akses "${GRANTABLE_PAGE_LABELS[sec as GrantablePage]}" dicabut.` };
}

/**
 * Tandai bahwa akses pegawai (baru) SUDAH ditinjau HRD → kartu hilang dari section "Pegawai Baru"
 * meski masih dalam jendela waktu. Hanya menyetel penanda `access_reviewed_at` (tak mengubah akses).
 * Ditulis via service_role (HRD penuh; konsisten dgn grant). Idempoten.
 */
export async function markAccessReviewed(employeeId: unknown): Promise<Result> {
  const parsed = z.string().uuid().safeParse(employeeId);
  if (!parsed.success) return { ok: false, error: 'Input tidak valid' };
  const id = parsed.data;

  const supabase = await createClient();
  const auth = await requireFullHrd(supabase);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: target } = await admin.from('employees').select('name').eq('id', id).maybeSingle();
  const { error } = await admin.from('employees').update({ access_reviewed_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, error: 'Gagal menandai: ' + error.message };

  await logHrdAction({
    action: 'access.mark_reviewed', category: 'pegawai',
    summary: `Menandai akses pegawai baru "${target?.name ?? id}" sudah ditinjau`,
    targetType: 'employee', targetId: id, targetLabel: target?.name ?? null,
  });
  revalidate();
  return { ok: true, msg: 'Ditandai sudah ditinjau.' };
}

function revalidate() {
  revalidatePath('/admin/akses');
  // Perubahan grant langsung tercermin di menu (layout) & halaman target.
  revalidatePath('/admin/monitor');
  revalidatePath('/kpi');
  revalidatePath('/', 'layout');
}
