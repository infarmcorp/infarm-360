import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import {
  Star, FileText, Target, Users, TrendingUp, LayoutDashboard, CalendarRange, ClipboardCheck, Award, KeyRound,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { canAdmin, canCoordinate } from '@/lib/auth/roles';
import { getTodos, type TodoItem, type TodoTone } from '@/lib/todos/compute';

/**
 * Beranda — "Pusat Tindakan" per peran. Landing setelah login (menggantikan lempar-langsung ke
 * fitur). Menyapa, menampilkan status periode, lalu daftar "yang perlu Anda lakukan" (dari
 * lib/todos — data yang sudah ada, tanpa tabel baru) + pintasan cepat sesuai peran & mode.
 */
const TODO_STYLE: Record<TodoTone, string> = {
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  rose: 'border-rose-200 bg-rose-50 text-rose-900',
  blue: 'border-sky-200 bg-sky-50 text-sky-900',
};

type Shortcut = { href: string; label: string; icon: React.ElementType };

export default async function BerandaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: emp } = await supabase
    .from('employees').select('name, role, is_hrd_admin, is_coordinator').eq('id', user.id).maybeSingle();
  const role = (emp?.role ?? 'employee') as 'employee' | 'spv' | 'hrd' | 'direksi';
  const jar = await cookies();
  const hrdMode = jar.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  const adminView = canAdmin(emp) && hrdMode === 'admin';

  const { data: ap } = await supabase
    .from('periods').select('label, status, end_date').eq('status', 'active').limit(1).maybeSingle();
  const daysLeft = ap?.end_date ? daysUntil(ap.end_date) : null;

  const todos = await getTodos(supabase, user.id, role, hrdMode);
  const shortcuts = shortcutsFor(role, adminView, !!emp?.is_coordinator);
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

        {/* Yang perlu dilakukan */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Yang Perlu Anda Lakukan</h2>
          {todos.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Tak ada tugas tertunda saat ini. 🎉</p>
          ) : (
            <div className="space-y-2">
              {todos.map((t: TodoItem) => (
                <Link key={t.id} href={t.href}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors hover:brightness-95 ${TODO_STYLE[t.tone]}`}>
                  <span>{t.label}</span>
                  <span className="text-xs font-bold opacity-70 shrink-0">Buka →</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Pintasan cepat */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Pintasan</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {shortcuts.map((s) => {
              const Icon = s.icon;
              return (
                <Link key={s.href} href={s.href}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors">
                  <Icon className="w-4 h-4 text-emerald-700 shrink-0" /> {s.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}

/** Pintasan sesuai peran & mode (subset menu paling sering dipakai). */
function shortcutsFor(role: string, adminView: boolean, isCoordinator: boolean): Shortcut[] {
  if (adminView) return [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/periode', label: 'Kelola Periode', icon: CalendarRange },
    { href: '/admin/laporan', label: 'Finalisasi', icon: Award },
    { href: '/admin/pegawai', label: 'Kelola Pegawai', icon: Users },
    { href: '/monitor', label: 'Monitor Kinerja', icon: TrendingUp },
    { href: '/akun', label: 'Akun Saya', icon: KeyRound },
  ];
  if (role === 'direksi') return [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/laporan-tim', label: 'Tinjau Laporan Tim', icon: ClipboardCheck },
    { href: '/suksesi', label: 'Suksesi & Promosi', icon: Award },
    { href: '/akun', label: 'Akun Saya', icon: KeyRound },
  ];
  if (role === 'spv' || role === 'hrd' || isCoordinator) return [
    { href: '/penilaian', label: 'Isi Penilaian 360°', icon: Star },
    { href: '/kpi', label: 'Input KPI', icon: Target },
    { href: '/monitor', label: 'Monitor Kinerja', icon: TrendingUp },
    { href: '/laporan-tim', label: 'Laporan Kinerja Tim', icon: FileText },
    { href: '/laporan', label: 'Laporan Hasil Saya', icon: FileText },
    { href: '/akun', label: 'Akun Saya', icon: KeyRound },
  ];
  return [
    { href: '/penilaian', label: 'Isi Penilaian 360°', icon: Star },
    { href: '/laporan', label: 'Laporan Hasil Saya', icon: FileText },
    { href: '/akun', label: 'Akun Saya', icon: KeyRound },
  ];
}

function daysUntil(endDate: string): number {
  const end = new Date(endDate + 'T00:00:00Z').getTime();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((end - today) / 86400000);
}
