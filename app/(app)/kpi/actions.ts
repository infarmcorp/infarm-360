'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Input KPI bulanan (peran SPV). PANDUAN: "Pengisian Manual Apps".
 *
 * Keamanan (jangan dilemahkan):
 *  - Otorisasi nyata ada di RLS `kpi_scores`/`kpi_audit` (hanya SPV-tim/HRD).
 *    Validasi di sini = defense-in-depth + pesan error yang ramah.
 *  - Tiap perubahan WAJIB menulis baris `kpi_audit` (append-only) untuk jejak audit.
 */
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
  const empIds = rows.map((r) => r.employeeId);
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

  // Upsert skor terkini. RLS menolak baris di luar tim SPV → ditangkap sebagai error.
  const { error: upsertErr } = await supabase.from('kpi_scores').upsert(
    rows.map((r) => ({
      employee_id: r.employeeId,
      ym,
      score: r.score,
      updated_by: auth.user!.id,
    })),
    { onConflict: 'employee_id,ym' },
  );
  if (upsertErr) {
    return { ok: false, error: 'Gagal menyimpan: ' + upsertErr.message };
  }

  // Jejak audit append-only (Riwayat & Audit Perubahan).
  const { error: auditErr } = await supabase.from('kpi_audit').insert(
    rows.map((r) => ({
      employee_id: r.employeeId,
      ym,
      score: r.score,
      changed_by: auth.user!.id,
      note: r.note ?? 'Input bulanan',
    })),
  );
  if (auditErr) {
    return { ok: false, error: 'Skor tersimpan tapi audit gagal: ' + auditErr.message };
  }

  revalidatePath('/kpi');
  return { ok: true, saved: rows.length };
}
