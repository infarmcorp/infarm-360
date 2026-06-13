'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

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
});

export async function createPeriod(raw: unknown): Promise<Result> {
  const parsed = CreateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const { label, startDate, endDate, has360 } = parsed.data;
  if (endDate < startDate) return { ok: false, error: 'Tanggal selesai sebelum tanggal mulai' };

  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const code = label.replace(/\s+/g, '-');
  const months = monthsBetween(startDate.slice(0, 7), endDate.slice(0, 7));
  if (months.length === 0) return { ok: false, error: 'Rentang bulan kosong' };

  const { data: period, error } = await supabase.from('periods')
    .insert({ code, label, start_date: startDate, end_date: endDate, status: 'ended', has_360: has360 })
    .select('id').single();
  if (error) {
    return { ok: false, error: error.code === '23505' ? `Kode "${code}" sudah ada` : 'Gagal membuat periode: ' + error.message };
  }
  const { error: mErr } = await supabase.from('period_months')
    .insert(months.map((ym) => ({ period_id: period.id, ym })));
  if (mErr) return { ok: false, error: 'Periode dibuat tapi gagal isi bulan: ' + mErr.message };

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
  revalidatePath('/admin/periode');
  return { ok: true };
}

export async function endPeriod(periodId: string): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { error } = await supabase.from('periods').update({ status: 'ended' }).eq('id', periodId);
  if (error) return { ok: false, error: 'Gagal mengunci: ' + error.message };
  revalidatePath('/admin/periode');
  return { ok: true };
}

export async function toggleHas360(periodId: string, value: boolean): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { error } = await supabase.from('periods').update({ has_360: value }).eq('id', periodId);
  if (error) return { ok: false, error: 'Gagal: ' + error.message };
  revalidatePath('/admin/periode');
  revalidatePath('/admin/dashboard');
  return { ok: true };
}
