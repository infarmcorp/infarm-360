'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isDireksiReviewSubject } from '@/lib/report';

/**
 * ACC Laporan Kinerja Tim. Dua jalur berdasarkan peran pelaku:
 *  - SPV     → laporan anggota TIM-nya (RLS fr_spv_acc = is_my_member).
 *  - Direksi → laporan SUBJEK SPV (eskalasi Pegawai→SPV, SPV→Direksi). RLS fr_spv_acc
 *    hanya melayani SPV atas timnya, jadi Direksi menulis lewat service_role dengan
 *    penegakan di server: target wajib SPV & laporan sudah dirilis. Kolom yang ditulis
 *    sama (spv_acc) — untuk subjek SPV maknanya "ACC Direksi".
 * Baris laporan harus sudah dibuat HRD (draf/final).
 */
export type AccResult = { ok: true; acc: boolean } | { ok: false; error: string };

export async function setSpvAcc(employeeId: string, acc: boolean): Promise<AccResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();

  const { data: ap } = await supabase
    .from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  // Jalur Direksi: ACC subjek SPV lewat service_role (RLS tak melayaninya). Tegakkan
  // target=SPV & sudah dirilis di server — batas kewenangan nyata, bukan sekadar UI.
  if (me?.role === 'direksi') {
    const admin = createAdminClient();
    if (!(await isDireksiReviewSubject(employeeId))) {
      return { ok: false, error: 'Direksi hanya dapat meng-ACC laporan SPV / pemimpin tim' };
    }
    const { data: rep } = await admin.from('final_reports').select('status')
      .eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle();
    if (!rep) return { ok: false, error: 'Laporan belum tersedia (menunggu HRD membuat draf)' };
    if (rep.status !== 'in_review' && rep.status !== 'finalized') {
      return { ok: false, error: 'Laporan belum dirilis HRD untuk ditinjau — ACC belum bisa diberikan' };
    }
    const { error } = await admin.from('final_reports').update({ spv_acc: acc })
      .eq('employee_id', employeeId).eq('period_id', ap.id);
    if (error) return { ok: false, error: 'Gagal menyimpan ACC: ' + error.message };
    revalidatePath('/laporan-tim');
    revalidatePath('/admin/laporan');
    return { ok: true, acc };
  }

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
