'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { logHrdAction } from '@/lib/audit/log';

/**
 * Kelola Siklus Periode (HRD) — gerbang seluruh proses.
 *  - createPeriod: buat kuartal + bulan-bulannya (status awal 'ended' = belum aktif).
 *  - activatePeriod: jadikan SATU periode aktif (lainnya di-end → invarian 1 aktif).
 *  - endPeriod: "Kunci & Akhiri" → status 'ended' (RLS menolak tulis penilaian non-aktif).
 *  - toggleHas360: aktif/nonaktif komponen 360 (mengubah rumus Skor Akhir).
 * RLS periods_write/period_months_write = HRD; tak perlu service_role.
 */
async function requireHrd(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) return { ok: false, error: 'Hanya HRD yang dapat mengelola periode' };
  return { ok: true, userId: user.id };
}

function monthsBetween(start: string, end: string): string[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const out: string[] = [];
  let y = sy, m = sm;
  while ((y < ey || (y === ey && m <= em)) && out.length < 24) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

type Result = { ok: true } | { ok: false; error: string };

const CreateInput = z.object({
  label: z.string().trim().min(2, 'Label terlalu pendek').max(40),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal mulai tidak valid'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal selesai tidak valid'),
  has360: z.boolean(),
  kpiStandard: z.number().int().min(0).max(100).default(80),
});

export async function createPeriod(raw: unknown): Promise<Result> {
  const parsed = CreateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const { label, startDate, endDate, has360, kpiStandard } = parsed.data;
  if (endDate < startDate) return { ok: false, error: 'Tanggal selesai sebelum tanggal mulai' };

  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const code = label.replace(/\s+/g, '-');
  const months = monthsBetween(startDate.slice(0, 7), endDate.slice(0, 7));
  if (months.length === 0) return { ok: false, error: 'Rentang bulan kosong' };

  const { data: period, error } = await supabase.from('periods')
    .insert({ code, label, start_date: startDate, end_date: endDate, status: 'ended', has_360: has360, kpi_standard: kpiStandard })
    .select('id').single();
  if (error) {
    return { ok: false, error: error.code === '23505' ? `Kode "${code}" sudah ada` : 'Gagal membuat periode: ' + error.message };
  }
  const { error: mErr } = await supabase.from('period_months')
    .insert(months.map((ym) => ({ period_id: period.id, ym })));
  if (mErr) return { ok: false, error: 'Periode dibuat tapi gagal isi bulan: ' + mErr.message };

  await logHrdAction({
    action: 'period.create', category: 'periode',
    summary: `Membuat periode "${label}" (${startDate} s.d. ${endDate}, 360° ${has360 ? 'aktif' : 'nonaktif'})`,
    targetType: 'period', targetId: period.id, targetLabel: label,
  });
  revalidatePath('/admin/periode');
  return { ok: true };
}

export async function activatePeriod(periodId: string): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  // Akhiri semua periode lain → jaga hanya satu aktif.
  const { error: e1 } = await supabase.from('periods').update({ status: 'ended' }).neq('id', periodId);
  if (e1) return { ok: false, error: 'Gagal: ' + e1.message };
  const { error: e2 } = await supabase.from('periods').update({ status: 'active' }).eq('id', periodId);
  if (e2) return { ok: false, error: 'Gagal: ' + e2.message };

  const { data: pr } = await supabase.from('periods').select('label').eq('id', periodId).maybeSingle();
  await logHrdAction({
    action: 'period.activate', category: 'periode',
    summary: `Mengaktifkan periode "${pr?.label ?? periodId}" (periode lain diakhiri)`,
    targetType: 'period', targetId: periodId, targetLabel: pr?.label ?? null,
  });
  revalidatePath('/admin/periode');
  return { ok: true };
}

export async function endPeriod(periodId: string): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { error } = await supabase.from('periods').update({ status: 'ended' }).eq('id', periodId);
  if (error) return { ok: false, error: 'Gagal mengunci: ' + error.message };

  const { data: pr } = await supabase.from('periods').select('label').eq('id', periodId).maybeSingle();
  await logHrdAction({
    action: 'period.lock', category: 'periode',
    summary: `Mengunci & mengakhiri periode "${pr?.label ?? periodId}"`,
    targetType: 'period', targetId: periodId, targetLabel: pr?.label ?? null,
  });
  revalidatePath('/admin/periode');
  return { ok: true };
}

/**
 * Kesiapan periode AKTIF — palang pengaman sebelum HRD mengaktifkan periode lain
 * (yang akan MENGUNCI periode aktif sekarang). Mengembalikan jumlah pekerjaan tertunda:
 * 360° belum lengkap, draf belum dikirim, laporan belum difinalisasi.
 */
export async function activePeriodReadiness(): Promise<
  { ok: true; active: { id: string; label: string; pending360: number; drafts: number; unfinalized: number } | null }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: true, active: null };

  const [maps, subs, drafts, emps, finals] = await Promise.all([
    supabase.from('mappings').select('*', { count: 'exact', head: true }).eq('period_id', ap.id),
    supabase.from('assessments').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('status', 'submitted'),
    supabase.from('assessments').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('status', 'draft'),
    supabase.from('employees').select('*', { count: 'exact', head: true }).eq('is_active', true).neq('role', 'direksi'),
    supabase.from('final_reports').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('status', 'finalized'),
  ]);
  const pending360 = ap.has_360 ? Math.max(0, (maps.count ?? 0) - (subs.count ?? 0)) : 0;
  const unfinalized = Math.max(0, (emps.count ?? 0) - (finals.count ?? 0));
  return { ok: true, active: { id: ap.id, label: ap.label, pending360, drafts: drafts.count ?? 0, unfinalized } };
}

/**
 * Set Target/Standar KPI periode (metrik dashboard "% di atas standar"). HRD-only.
 * Murni pelaporan — tidak memengaruhi rumus skor (lihat migrasi 0010).
 */
export async function setKpiStandard(periodId: string, value: number): Promise<Result> {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    return { ok: false, error: 'Standar KPI harus bilangan bulat 0–100' };
  }
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { error } = await supabase.from('periods').update({ kpi_standard: value }).eq('id', periodId);
  if (error) return { ok: false, error: 'Gagal: ' + error.message };

  const { data: pr } = await supabase.from('periods').select('label').eq('id', periodId).maybeSingle();
  await logHrdAction({
    action: 'period.setKpiStandard', category: 'periode',
    summary: `Mengatur Standar KPI periode "${pr?.label ?? periodId}" → ≥${value}`,
    targetType: 'period', targetId: periodId, targetLabel: pr?.label ?? null, meta: { kpi_standard: value },
  });
  revalidatePath('/admin/periode');
  revalidatePath('/admin/dashboard');
  return { ok: true };
}

/** Jumlah penilaian 360° TERKIRIM di periode — dipakai memutuskan konfirmasi "matikan 360°". */
export async function count360Submitted(periodId: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { count } = await supabase.from('assessments')
    .select('*', { count: 'exact', head: true }).eq('period_id', periodId).eq('status', 'submitted');
  return { ok: true, count: count ?? 0 };
}

export async function toggleHas360(periodId: string, value: boolean): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  // Validasi PRA-PELUNCURAN saat MENGAKTIFKAN 360°: harus sudah ada pertanyaan (indikator
  // aktif) & pemetaan — cegah form 360° kosong/rusak saat tampil ke pegawai.
  if (value) {
    const { data: aspects } = await supabase.from('culture_aspects').select('id').eq('period_id', periodId);
    const aspectIds = (aspects ?? []).map((a) => a.id);
    const { count: indCount } = aspectIds.length
      ? await supabase.from('indicators').select('*', { count: 'exact', head: true }).in('aspect_id', aspectIds).eq('is_active', true)
      : { count: 0 };
    const { count: mapCount } = await supabase.from('mappings')
      .select('*', { count: 'exact', head: true }).eq('period_id', periodId).eq('is_active', true);
    const missing: string[] = [];
    if (!indCount) missing.push('pertanyaan (indikator aktif)');
    if (!mapCount) missing.push('pemetaan penilai→target');
    if (missing.length) {
      return { ok: false, error: `Tidak bisa mengaktifkan 360°: belum ada ${missing.join(' & ')}. Lengkapi dulu di Kelola Pertanyaan / Pemetaan.` };
    }
  }

  const { error } = await supabase.from('periods').update({ has_360: value }).eq('id', periodId);
  if (error) return { ok: false, error: 'Gagal: ' + error.message };

  const { data: pr } = await supabase.from('periods').select('label').eq('id', periodId).maybeSingle();
  await logHrdAction({
    action: 'period.toggle360', category: 'periode',
    summary: `${value ? 'Mengaktifkan' : 'Menonaktifkan'} komponen 360° pada periode "${pr?.label ?? periodId}"`,
    targetType: 'period', targetId: periodId, targetLabel: pr?.label ?? null, meta: { has_360: value },
  });
  revalidatePath('/admin/periode');
  revalidatePath('/admin/dashboard');
  return { ok: true };
}

/**
 * Bulan yang UNIK milik sebuah periode (tak dipakai periode lain). KPI dikunci per
 * (employee, ym) — TIDAK cascade dari periods & bisa dipakai bersama bila dua periode
 * berbagi bulan. Maka KPI hanya boleh dihapus untuk bulan yang khusus periode ini.
 */
async function uniqueMonthsOf(
  admin: ReturnType<typeof createAdminClient>, periodId: string,
): Promise<string[]> {
  const { data: pm } = await admin.from('period_months').select('ym').eq('period_id', periodId);
  const myYms = (pm ?? []).map((r) => r.ym);
  if (!myYms.length) return [];
  const { data: other } = await admin.from('period_months').select('ym').neq('period_id', periodId).in('ym', myYms);
  const shared = new Set((other ?? []).map((r) => r.ym));
  return myYms.filter((y) => !shared.has(y));
}

/**
 * Rekap isi sebuah periode untuk dialog konfirmasi Hapus (meyakinkan HRD soal dampak).
 * `kpi` = jumlah baris KPI di bulan yang UNIK milik periode ini (yang akan ikut terhapus);
 * bulan yang dipakai bersama periode lain TIDAK dihitung & tidak akan dihapus.
 */
export async function periodDataCounts(periodId: string): Promise<
  | { ok: true; label: string; status: string; counts: { assessments: number; mappings: number; finalReports: number; kpi: number } }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { data: p } = await admin.from('periods').select('label, status').eq('id', periodId).maybeSingle();
  if (!p) return { ok: false, error: 'Periode tidak ditemukan' };

  const cnt = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const assessments = await cnt(admin.from('assessments').select('*', { count: 'exact', head: true }).eq('period_id', periodId));
  const mappings = await cnt(admin.from('mappings').select('*', { count: 'exact', head: true }).eq('period_id', periodId));
  const finalReports = await cnt(admin.from('final_reports').select('*', { count: 'exact', head: true }).eq('period_id', periodId));
  const uniqueYms = await uniqueMonthsOf(admin, periodId);
  const kpi = uniqueYms.length
    ? await cnt(admin.from('kpi_scores').select('*', { count: 'exact', head: true }).in('ym', uniqueYms))
    : 0;

  return { ok: true, label: p.label, status: p.status, counts: { assessments, mappings, finalReports, kpi } };
}

/**
 * HAPUS PERIODE beserta seluruh datanya. Pengaman: hanya HRD, periode AKTIF ditolak
 * (harus "Kunci & Akhiri" dulu), wajib konfirmasi ketik `HAPUS`. Penghapusan baris
 * periods cascade ke months/aspek/indikator/pertanyaan/bobot/pemetaan/koreksi/penilaian
 * (+anak)/result_360/punishment/laporan final/suksesi. KPI (per ym, tak cascade) dihapus
 * manual HANYA untuk bulan unik periode ini agar tak mengganggu periode lain.
 */
export async function deletePeriod(periodId: string, confirmText: string): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (confirmText.trim().toUpperCase() !== 'HAPUS') return { ok: false, error: 'Ketik HAPUS untuk konfirmasi.' };

  const admin = createAdminClient();
  const { data: p } = await admin.from('periods').select('label, status').eq('id', periodId).maybeSingle();
  if (!p) return { ok: false, error: 'Periode tidak ditemukan' };
  if (p.status === 'active') return { ok: false, error: 'Periode aktif tidak bisa dihapus. "Kunci & Akhiri" dulu.' };

  // KPI tak cascade dari periods → hapus manual, hanya bulan UNIK periode ini.
  const uniqueYms = await uniqueMonthsOf(admin, periodId);
  if (uniqueYms.length) {
    await admin.from('kpi_audit').delete().in('ym', uniqueYms);
    await admin.from('kpi_scores').delete().in('ym', uniqueYms);
  }

  const { error } = await admin.from('periods').delete().eq('id', periodId);
  if (error) return { ok: false, error: 'Gagal menghapus periode: ' + error.message };

  await logHrdAction({
    action: 'period.delete', category: 'periode',
    summary: `Menghapus periode "${p.label}" beserta seluruh datanya`,
    targetType: 'period', targetId: periodId, targetLabel: p.label,
  });
  revalidatePath('/admin/periode');
  revalidatePath('/admin/dashboard');
  return { ok: true };
}
