import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

const ROLE_LABEL: Record<string, string> = {
  employee: 'Pegawai Operasional',
  spv: 'Supervisor (SPV)',
  hrd: 'HRD Admin',
  direksi: 'Direktur',
};

/**
 * Hub pegawai yang sudah login (versi termigrasi Supabase).
 * Sementara menautkan fitur yang sudah dimigrasi (Input KPI). Akan bertambah per fase.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: emp } = await supabase
    .from('employees')
    .select('emp_code, name, dept, role')
    .eq('id', user.id)
    .single();

  const role = emp?.role ?? 'employee';
  const canKpi = role === 'spv' || role === 'hrd';

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <p className="text-xs text-gray-400 uppercase tracking-wider font-bold">Selamat datang</p>
        <h1 className="text-xl font-bold text-gray-800 mt-1">{emp?.name ?? user.email}</h1>
        <p className="text-sm text-gray-500">
          {emp?.dept} · {ROLE_LABEL[role] ?? role} · <span className="font-mono">{emp?.emp_code}</span>
        </p>

        <div className="mt-5 grid gap-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Fitur tersedia</p>
          <Link
            href="/penilaian"
            className="block border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <span className="font-bold text-gray-800 text-sm">Daftar Penilaian Saya</span>
            <span className="block text-xs text-gray-400">Orang yang harus Anda nilai di periode aktif.</span>
          </Link>
          <Link
            href="/laporan"
            className="block border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <span className="font-bold text-gray-800 text-sm">Laporan Hasil Saya</span>
            <span className="block text-xs text-gray-400">Skor Akhir Anda (setelah difinalisasi HRD).</span>
          </Link>
          {canKpi && (
            <Link
              href="/kpi"
              className="block border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="font-bold text-gray-800 text-sm">Input KPI Bulanan</span>
              <span className="block text-xs text-gray-400">Isi skor KPI anggota tim Anda.</span>
            </Link>
          )}
          {canKpi && (
            <Link
              href="/laporan-tim"
              className="block border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="font-bold text-gray-800 text-sm">Laporan Kinerja Tim</span>
              <span className="block text-xs text-gray-400">Tinjau &amp; beri ACC laporan anggota tim.</span>
            </Link>
          )}
          {role === 'hrd' && (
            <Link
              href="/admin/laporan"
              className="block border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="font-bold text-gray-800 text-sm">Review Hasil Akhir</span>
              <span className="block text-xs text-gray-400">Finalisasi Skor Akhir kalibrasi pegawai.</span>
            </Link>
          )}
          {role === 'hrd' && (
            <Link
              href="/admin/periode"
              className="block border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="font-bold text-gray-800 text-sm">Kelola Siklus Periode</span>
              <span className="block text-xs text-gray-400">Buat, aktivasi, &amp; kunci periode penilaian.</span>
            </Link>
          )}
          {role === 'hrd' && (
            <Link
              href="/admin/pemetaan"
              className="block border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="font-bold text-gray-800 text-sm">Pemetaan Penilai 360°</span>
              <span className="block text-xs text-gray-400">Atur siapa menilai siapa + relasi &amp; sifat.</span>
            </Link>
          )}
          {role === 'hrd' && (
            <Link
              href="/admin/bobot"
              className="block border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="font-bold text-gray-800 text-sm">Kelola Bobot Penilai</span>
              <span className="block text-xs text-gray-400">Atur bobot Atasan/Peer/Cross/Self skor 360.</span>
            </Link>
          )}
          {role === 'hrd' && (
            <Link
              href="/admin/360"
              className="block border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="font-bold text-gray-800 text-sm">Kalkulasi Skor 360°</span>
              <span className="block text-xs text-gray-400">Hitung skor 360 terbobot dari penilaian terkirim.</span>
            </Link>
          )}
          {role === 'hrd' && (
            <Link
              href="/admin/kepatuhan"
              className="block border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="font-bold text-gray-800 text-sm">Flag Kepatuhan &amp; Punishment</span>
              <span className="block text-xs text-gray-400">Pantau keterlambatan wajib &amp; beri pengurangan poin.</span>
            </Link>
          )}
          {(role === 'hrd' || role === 'direksi') && (
            <Link
              href="/admin/dashboard"
              className="block border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="font-bold text-gray-800 text-sm">Dashboard Organisasi</span>
              <span className="block text-xs text-gray-400">Skor Akhir, klasifikasi 9-Box &amp; A/B/C/D Player.</span>
            </Link>
          )}
        </div>

        <form action="/auth/signout" method="post" className="mt-6">
          <button
            type="submit"
            className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline"
          >
            Keluar
          </button>
        </form>
      </div>

      <p className="mt-4 text-center text-[11px] text-gray-400">
        Versi lama (demo localStorage) masih di{' '}
        <Link href="/" className="underline">halaman utama</Link>.
      </p>
    </main>
  );
}
