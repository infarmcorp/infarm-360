'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * ACC Laporan Kinerja Tim (SPV). RLS fr_spv_acc mengizinkan SPV meng-UPDATE laporan
 * anggota timnya (is_my_member). Baris laporan harus sudah dibuat HRD (draf/final).
 */
export type AccResult = { ok: true; acc: boolean } | { ok: false; error: string };

export async function setSpvAcc(employeeId: string, acc: boolean): Promise<AccResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };

  const { data: ap } = await supabase
    .from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  // ACC baru boleh setelah HRD "Rilis ke SPV" (status in_review/finalized). Saat masih
  // draf, SPV belum boleh meng-ACC — tegakkan di server (bukan hanya menyembunyikan tombol).
  const { data: rep } = await supabase
    .from('final_reports').select('status')
    .eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();
  if (!rep) return { ok: false, error: 'Laporan belum tersedia (menunggu HRD membuat draf) atau di luar tim Anda' };
  if (rep.status !== 'in_review' && rep.status !== 'finalized') {
    return { ok: false, error: 'Laporan belum dirilis HRD untuk ditinjau — ACC belum bisa diberikan' };
  }

  // Update spv_acc; RLS membatasi ke anggota tim. 0 baris → belum ada draf HRD / bukan tim.
  const { data, error } = await supabase
    .from('final_reports')
    .update({ spv_acc: acc })
    .eq('employee_id', employeeId).eq('period_id', ap.id)
    .select('employee_id');
  if (error) return { ok: false, error: 'Gagal menyimpan ACC: ' + error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: 'Laporan belum tersedia (menunggu HRD membuat draf) atau di luar tim Anda' };
  }

  revalidatePath('/laporan-tim');
  revalidatePath('/admin/laporan');
  return { ok: true, acc };
}
