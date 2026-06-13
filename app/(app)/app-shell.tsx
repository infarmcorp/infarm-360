'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Star, FileText, Target, Users, TrendingUp, LayoutDashboard, CalendarRange,
  Network, HelpCircle, Scale, ShieldAlert, ClipboardCheck, BarChart3,
  Menu, X, LogOut, Building2, Briefcase, Award,
} from 'lucide-react';
import { setHrdMode } from './mode-actions';

export type Role = 'employee' | 'spv' | 'hrd' | 'direksi';
export type HrdMode = 'admin' | 'spv';

type Item = { href: string; label: string; icon: React.ElementType };
type Section = { title?: string; items: Item[] };

const ROLE_LABEL: Record<Role, string> = {
  employee: 'Pegawai Operasional', spv: 'Supervisor (SPV)', hrd: 'HRD Admin', direksi: 'Direktur',
};

function menuFor(role: Role, hrdMode: HrdMode): Section[] {
  const main: Item[] = [{ href: '/penilaian', label: 'Daftar Penilaian Saya', icon: Star }];
  if (role === 'employee' || role === 'spv') main.push({ href: '/laporan', label: 'Laporan Hasil Saya', icon: FileText });

  const sections: Section[] = [{ title: 'Navigasi Utama', items: main }];

  if (role === 'spv') {
    sections.push({
      title: 'Menu Supervisor',
      items: [
        { href: '/kpi', label: 'Input KPI Anggota', icon: Target },
        { href: '/laporan-tim', label: 'Laporan Kinerja Tim', icon: Users },
        { href: '/monitor', label: 'Monitor Kinerja', icon: TrendingUp },
      ],
    });
  }

  // HRD dual-mode: 'admin' → alat administrator; 'spv' → tugas supervisor.
  if (role === 'hrd' && hrdMode === 'admin') {
    sections.push({
      title: 'Menu Administrator',
      items: [
        { href: '/admin/dashboard', label: 'Dashboard Organisasi', icon: LayoutDashboard },
        { href: '/admin/periode', label: 'Kelola Periode', icon: CalendarRange },
        { href: '/admin/pemetaan', label: 'Pemetaan 360°', icon: Network },
        { href: '/admin/pertanyaan', label: 'Kelola Pertanyaan', icon: HelpCircle },
        { href: '/admin/bobot', label: 'Bobot & Kalkulasi 360°', icon: Scale },
        { href: '/admin/kepatuhan', label: 'Flag Kepatuhan', icon: ShieldAlert },
        { href: '/admin/laporan', label: 'Review Hasil Akhir', icon: ClipboardCheck },
        { href: '/suksesi', label: 'Promosi & Suksesi', icon: Award },
      ],
    });
    sections.push({
      title: 'Pemantauan',
      items: [
        { href: '/monitor', label: 'Monitor Kinerja', icon: TrendingUp },
        { href: '/kpi?tab=rekap', label: 'Rekapitulasi Kuartal', icon: BarChart3 },
      ],
    });
  }

  if (role === 'hrd' && hrdMode === 'spv') {
    // ACC laporan tim adalah fungsi SPV (RLS is_my_member) → HRD pakai "Review Hasil
    // Akhir" di mode Admin; di sini hanya tugas yang relevan untuk HRD-as-SPV.
    sections.push({
      title: 'Menu Supervisor',
      items: [
        { href: '/kpi', label: 'Input KPI', icon: Target },
        { href: '/monitor', label: 'Monitor Kinerja', icon: TrendingUp },
        { href: '/kpi?tab=rekap', label: 'Rekapitulasi Kuartal', icon: BarChart3 },
      ],
    });
  }

  if (role === 'direksi') {
    sections.push({
      title: 'Eksekutif',
      items: [
        { href: '/admin/dashboard', label: 'Dashboard Organisasi', icon: LayoutDashboard },
        { href: '/monitor', label: 'Monitor Kinerja', icon: TrendingUp },
        { href: '/kpi?tab=rekap', label: 'Rekapitulasi Kuartal', icon: BarChart3 },
        { href: '/suksesi', label: 'Promosi & Suksesi', icon: Award },
      ],
    });
  }

  return sections;
}

export function AppShell({
  role, hrdMode, name, dept, empCode, periodLabel, periodActive, children,
}: {
  role: Role; hrdMode: HrdMode; name: string; dept: string; empCode: string;
  periodLabel: string | null; periodActive: boolean; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sections = menuFor(role, hrdMode);

  const isActive = (href: string) => {
    const path = href.split('?')[0];
    if (path === '/penilaian') return pathname === '/penilaian' || pathname.startsWith('/penilaian/');
    return pathname === path;
  };

  const Sidebar = (
    <aside className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Brand */}
      <div className="p-4 border-b border-gray-150">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-sm">i</div>
          <div className="leading-tight">
            <div className="text-sm font-extrabold text-gray-800">Infarm 360°</div>
            <div className="text-[10px] text-gray-400">Performance Appraisal</div>
          </div>
        </div>
      </div>

      {/* Toggle dual-mode HRD */}
      {role === 'hrd' && (
        <div className="px-3 py-2.5 border-b border-gray-150 bg-indigo-50/40">
          <div className="grid grid-cols-2 gap-1.5">
            <form action={setHrdMode.bind(null, 'admin')}>
              <button type="submit" className={`w-full flex items-center justify-center gap-1 text-[10px] font-bold py-1.5 rounded-lg transition-colors ${
                hrdMode === 'admin' ? 'bg-emerald-700 text-white shadow-2xs' : 'bg-white text-gray-500 hover:text-gray-700 border border-gray-200'}`}>
                <Building2 className="w-3 h-3" /> HRD Admin
              </button>
            </form>
            <form action={setHrdMode.bind(null, 'spv')}>
              <button type="submit" className={`w-full flex items-center justify-center gap-1 text-[10px] font-bold py-1.5 rounded-lg transition-colors ${
                hrdMode === 'spv' ? 'bg-emerald-700 text-white shadow-2xs' : 'bg-white text-gray-500 hover:text-gray-700 border border-gray-200'}`}>
                <Briefcase className="w-3 h-3" /> SPV Mode
              </button>
            </form>
          </div>
          <p className="text-[9px] text-gray-400 text-center mt-1">
            {hrdMode === 'spv' ? 'Bertindak sebagai Supervisor' : 'Mengelola seluruh sistem'}
          </p>
        </div>
      )}

      {/* Period indicator */}
      <div className="px-4 py-2.5 bg-emerald-50/50 border-b border-gray-150 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${periodActive ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          <span className="font-bold text-emerald-900 truncate">{periodLabel ?? 'Tanpa Periode'}</span>
        </div>
        <span className="text-[9px] bg-emerald-100 font-bold uppercase py-0.5 px-2 rounded-full border border-emerald-200 shrink-0">
          {periodActive ? 'Aktif' : 'Kunci'}
        </span>
      </div>

      {/* Nav */}
      <nav className="p-2 space-y-1 flex-1 overflow-y-auto">
        {sections.map((sec) => (
          <div key={sec.title ?? 'main'}>
            {sec.title && <div className="text-[9px] font-bold text-gray-400 tracking-wider px-3 pt-3 pb-1 uppercase">{sec.title}</div>}
            {sec.items.map((it) => {
              const Icon = it.icon;
              const active = isActive(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                    active ? 'bg-emerald-50 text-emerald-900 shadow-3xs' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{it.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User + logout */}
      <div className="p-3 border-t border-gray-150">
        <div className="px-1 mb-2">
          <div className="text-xs font-bold text-gray-800 truncate">{name}</div>
          <div className="text-[10px] text-gray-400">{dept} · {ROLE_LABEL[role]} · <span className="font-mono">{empCode}</span></div>
        </div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg py-2 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Keluar
          </button>
        </form>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      {/* Desktop sidebar */}
      <div className="hidden md:block h-full">{Sidebar}</div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative h-full">{Sidebar}</div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-gray-600">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="text-sm font-extrabold text-gray-800">Infarm 360°</span>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
