import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { CycleStatus } from './cycle-status';

/**
 * Beranda — landing HRD Mode Admin. Menyapa + status periode, lalu kartu Status Siklus (alur
 * end-to-end + blokir finalisasi). Tugas & Notifikasi TIDAK di sini (satu tempat = panel sidebar,
 * berlaku semua peran). Peran non-admin tak punya Beranda (dialihkan ke fiturnya).
 */
export default async function BerandaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: emp } = await supabase
    .from('employees').select('name, role, is_hrd_admin').eq('id', user.id).maybeSingle();
  const role = (emp?.role ?? 'employee') as 'employee' | 'spv' | 'hrd' | 'direksi';
  const jar = await cookies();
  const hrdMode = jar.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  const adminView = canAdmin(emp) && hrdMode === 'admin';
  // Beranda HANYA untuk HRD Mode Admin. Peran lain (Pegawai/SPV/Direksi/HRD mode-SPV) dialihkan.
  if (!adminView) redirect(role === 'direksi' ? '/admin/dashboard' : '/penilaian');

  const { data: ap } = await supabase
    .from('periods').select('label, status, end_date').eq('status', 'active').limit(1).maybeSingle();
  const daysLeft = ap?.end_date ? daysUntil(ap.end_date) : null;
  const firstName = (emp?.name ?? 'Pengguna').split(' ')[0];

  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Sapaan + status periode */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h1 className="text-xl font-bold text-gray-800">Selamat datang, {firstName} 👋</h1>
          <p className="text-sm text-gray-500 mt-1">
            {ap?.status === 'active' ? (
              <>Periode <strong className="text-gray-700">{ap.label}</strong> sedang aktif
                {daysLeft != null && daysLeft >= 0 && <> · <span className={daysLeft <= 7 ? 'text-rose-600 font-bold' : 'text-gray-600'}>sisa {daysLeft} hari</span></>}
                {daysLeft != null && daysLeft < 0 && <> · <span className="text-rose-600 font-bold">melewati tenggat</span></>}
              </>
            ) : (
              <>Belum ada periode penilaian yang aktif.</>
            )}
          </p>
        </div>

        {/* Status siklus — alur end-to-end + blokir finalisasi (menggantikan halaman /admin/siklus) */}
        <CycleStatus />
      </div>
    </main>
  );
}

function daysUntil(endDate: string): number {
  const end = new Date(endDate + 'T00:00:00Z').getTime();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((end - today) / 86400000);
}
