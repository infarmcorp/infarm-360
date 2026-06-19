'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
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
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') return { ok: false, error: 'Hanya HRD yang dapat mengelola periode' };
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

export async function toggleHas360(periodId: string, value: boolean): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
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
