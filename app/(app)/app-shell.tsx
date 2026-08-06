'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PANDUAN_VERSION } from '@/lib/panduan';
import {
  Star, FileText, Target, Users, TrendingUp, LayoutDashboard, CalendarRange,
  Network, HelpCircle, Scale, ShieldAlert, ClipboardCheck,
  Menu, X, LogOut, Building2, Briefcase, Award, Clock, CircleCheckBig, UserCog, ScrollText, Bell, Download, KeyRound, AlertTriangle, Home, ChevronDown,
} from 'lucide-react';
import { setHrdMode } from './mode-actions';
import { BrandLogo } from '@/components/brand-logo';
import type { TodoItem, TodoTone } from '@/lib/todos/compute';

export type Role = 'employee' | 'spv' | 'hrd' | 'direksi';
export type HrdMode = 'admin' | 'spv';

type Item = { href: string; label: string; icon: React.ElementType };
type Section = { title?: string; items: Item[] };

const ROLE_LABEL: Record<Role, string> = {
  employee: 'Pegawai Operasional', spv: 'Supervisor (SPV)', hrd: 'HRD Admin', direksi: 'Direktur',
};

type AdminItem = Item & { section?: string };

function menuFor(role: Role, canAdmin: boolean, hrdMode: HrdMode, isCoordinator: boolean, hrdSections: string[] | null, pageGrants: { section: string; scope: string }[] = []): Section[] {
  // Akses HRD granular (Jalur A, migrasi 0023): hrd_sections NULL/kosong = akses penuh;
  // berisi daftar = hanya bagian tercantum. Item tanpa `section` (mis. Suksesi) selalu tampil.
  const allowSec = (s?: string) => !s || !hrdSections || hrdSections.length === 0 || hrdSections.includes(s);
  const filterAdmin = (items: AdminItem[]) => items.filter((it) => allowSec(it.section));
  // Tampilan admin hanya bila punya izin HRD (canAdmin) DAN sedang di mode admin.
  // Mode "posisi-asli" (base) = bukan adminView; HRD-posisi base = perlakuan SPV (legacy).
  const adminView = canAdmin && hrdMode === 'admin';
  const supervisorView = !adminView && (role === 'spv' || role === 'hrd');
  const main: Item[] = [];
  // Tampil untuk semua peran di mode base (termasuk Direksi); hanya disembunyikan di Mode Admin.
  if (!adminView) main.push({ href: '/penilaian', label: 'Daftar Penilaian Saya', icon: Star });
  if (!adminView) main.push({ href: '/laporan', label: 'Laporan Hasil Saya', icon: FileText });
  // Peninjau Hasil Lintas Divisi kini = GRANT halaman "Review Hasil Akhir" (lingkup selain divisinya) —
  // tampil di section "Akses dari HRD" di bawah, bukan menu khusus. (is_cross_reviewer dipensiunkan, migrasi 0033.)
  const sections: Section[] = main.length ? [{ title: 'Menu Utama', items: main }] : [];

  // Koordinator (grant is_coordinator) — grup TERPISAH "Tim Koordinasi" (paritas dgn Menu Supervisor):
  // Input KPI + Laporan Kinerja Tim (tinjau & ACC) + Monitor untuk anggota naungannya. Hanya di mode
  // base & bila BUKAN SPV/HRD (mereka sudah punya Menu Supervisor).
  if (!adminView && isCoordinator && role !== 'spv' && role !== 'hrd') {
    sections.push({
      title: 'Menu Koordinator',
      items: [
        { href: '/kpi', label: 'Input KPI Anggota', icon: Target },
        { href: '/laporan-tim', label: 'Laporan Kinerja Tim', icon: Users },
        { href: '/monitor', label: 'Monitor Kinerja', icon: TrendingUp },
      ],
    });
  }

  // SPV biasa & HRD dalam mode SPV memakai menu Supervisor yang sama (paritas SPV).
  // Rekapitulasi Kuartal TIDAK jadi item terpisah — sudah ada sebagai tab di Input KPI Anggota.
  if (supervisorView) {
    sections.push({
      title: 'Menu Supervisor',
      items: [
        { href: '/kpi', label: 'Input KPI Anggota', icon: Target },
        { href: '/laporan-tim', label: 'Laporan Kinerja Tim', icon: Users },
        { href: '/monitor', label: 'Monitor Kinerja', icon: TrendingUp },
      ],
    });
  }

  // Dual-mode: 'admin' → alat administrator (butuh izin HRD); 'base' → tugas posisi asli.
  // Menu ditata per FASE siklus (bukan satu daftar panjang) + dilipat accordion di render →
  // mengurangi kekusutan. Tiap grup difilter hrd_sections (rekan HRD terbatas lihat subsetnya).
  if (adminView) {
    // Status siklus kini di kartu Beranda (bukan halaman/menu sendiri) → tak ada grup "Mulai di Sini".
    const konfig = filterAdmin([
      { href: '/admin/periode', label: 'Kelola Periode', icon: CalendarRange, section: 'periode' },
      { href: '/admin/pertanyaan', label: 'Kelola Pertanyaan', icon: HelpCircle, section: 'pertanyaan' },
      { href: '/admin/bobot', label: 'Bobot & Kalkulasi 360°', icon: Scale, section: 'bobot' },
      { href: '/admin/pemetaan', label: 'Pemetaan 360°', icon: Network, section: 'pemetaan' },
    ]);
    if (konfig.length) sections.push({ title: 'Persiapan Siklus', items: konfig });

    const pelaksanaan = filterAdmin([
      { href: '/admin/progress', label: 'Progress 360 Feedback', icon: CircleCheckBig, section: 'progress' },
      { href: '/admin/kepatuhan', label: 'Flag Kepatuhan', icon: ShieldAlert, section: 'kepatuhan' },
    ]);
    if (pelaksanaan.length) sections.push({ title: 'Pelaksanaan', items: pelaksanaan });

    const hasil = filterAdmin([
      { href: '/admin/laporan', label: 'Review Hasil Akhir', icon: ClipboardCheck, section: 'laporan' },
      { href: '/suksesi', label: 'Promosi & Suksesi', icon: Award, section: 'suksesi' },
    ]);
    if (hasil.length) sections.push({ title: 'Hasil & Tindak Lanjut', items: hasil });

    const pemantauan = filterAdmin([
      { href: '/admin/dashboard', label: 'Dashboard Organisasi', icon: LayoutDashboard, section: 'dashboard' },
      { href: '/admin/monitor', label: 'Monitor Kinerja Pegawai', icon: TrendingUp, section: 'dashboard' },
      { href: '/admin/struktur', label: 'Struktur Organisasi', icon: Building2, section: 'struktur' },
      { href: '/kpi?tab=riwayat', label: 'Monitoring & Audit KPI', icon: Clock, section: 'audit' },
      { href: '/admin/audit', label: 'Log Aktivitas HRD', icon: ScrollText, section: 'audit' },
      { href: '/admin/ekspor', label: 'Ekspor Dataset', icon: Download, section: 'ekspor' },
    ]);
    if (pemantauan.length) sections.push({ title: 'Pemantauan & Laporan', items: pemantauan });

    // 🔧 Pengaturan — Kelola Pegawai + Manajemen Akses. Akses (RBAC ber-lingkup, migrasi 0024):
    // HANYA HRD PENUH (tak dibatasi hrd_sections) — cegah rekan HRD terbatas menaikkan aksesnya sendiri.
    const pengaturan = filterAdmin([
      { href: '/admin/pegawai', label: 'Kelola Pegawai', icon: UserCog, section: 'pegawai' },
    ]);
    const isFullHrd = !hrdSections || hrdSections.length === 0;
    if (isFullHrd) pengaturan.push({ href: '/admin/akses', label: 'Manajemen Akses', icon: KeyRound });
    if (pengaturan.length) sections.push({ title: 'Administrasi', items: pengaturan });
  }

  if (role === 'direksi') {
    sections.push({
      title: 'Menu Direksi',
      items: [
        { href: '/admin/dashboard', label: 'Dashboard Organisasi', icon: LayoutDashboard },
        { href: '/laporan-tim', label: 'Laporan Kinerja Tim', icon: Users },
        { href: '/review-hasil', label: 'Review Hasil Akhir', icon: ClipboardCheck },
        { href: '/admin/audit', label: 'Log Aktivitas HRD', icon: ScrollText },
        { href: '/suksesi', label: 'Promosi & Suksesi', icon: Award },
      ],
    });
  }

  // "Akses dari HRD" — halaman yang DIBERIKAN HRD lewat Manajemen Akses (grant page_grants), dalam
  // section TERPISAH agar jelas ini pemberian & dapat DICABUT sewaktu-waktu (bukan menu bawaan peran).
  // Hanya di mode base; lingkup ditegakkan server. Selalu di paling bawah sebagai "tambahan".
  if (!adminView) {
    const grantItems: Item[] = [];
    if (pageGrants.some((g) => g.section === 'monitor')) {
      grantItems.push({ href: '/admin/monitor', label: 'Monitor Kinerja Pegawai', icon: TrendingUp });
    }
    if (pageGrants.some((g) => g.section === 'review')) {
      grantItems.push({ href: '/admin/laporan', label: 'Review Hasil Akhir', icon: ClipboardCheck });
    }
    if (pageGrants.some((g) => g.section === 'dashboard')) {
      grantItems.push({ href: '/admin/dashboard', label: 'Dashboard Organisasi', icon: LayoutDashboard });
    }
    if (pageGrants.some((g) => g.section === 'struktur')) {
      grantItems.push({ href: '/admin/struktur', label: 'Struktur Organisasi', icon: Building2 });
    }
    if (pageGrants.some((g) => g.section === 'progress')) {
      grantItems.push({ href: '/admin/progress', label: 'Progress 360 Feedback', icon: CircleCheckBig });
    }
    if (pageGrants.some((g) => g.section === 'kepatuhan')) {
      grantItems.push({ href: '/admin/kepatuhan', label: 'Flag Kepatuhan', icon: ShieldAlert });
    }
    if (pageGrants.some((g) => g.section === 'kpi')) {
      grantItems.push({ href: '/kpi?tab=riwayat', label: 'Monitoring & Audit KPI', icon: Clock });
    }
    if (grantItems.length) sections.push({ title: 'Akses dari HRD', items: grantItems });
  }

  return sections;
}

// Titik penanda tugas di sidebar (latar GELAP) — nada "amber" dipetakan ke oranye terang
// (--color-warn-bright) agar sederet dengan ikon lonceng & badge hitungan di section yang sama.
const TODO_DOT: Record<TodoTone, string> = {
  amber: 'bg-warn-bright', emerald: 'bg-emerald-400', indigo: 'bg-indigo-400', rose: 'bg-rose-400', blue: 'bg-blue-400',
};

export function AppShell({
  role, canAdmin, isCoordinator = false, hrdSections = null, pageGrants = [], hrdMode, name, dept, empCode, periodLabel, periodActive, periodDaysLeft, todos, children,
}: {
  role: Role; canAdmin: boolean; isCoordinator?: boolean; hrdSections?: string[] | null; pageGrants?: { section: string; scope: string }[]; hrdMode: HrdMode; name: string; dept: string; empCode: string;
  periodLabel: string | null; periodActive: boolean; periodDaysLeft?: number | null;
  todos: TodoItem[]; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sections = menuFor(role, canAdmin, hrdMode, isCoordinator, hrdSections, pageGrants);

  // Titik "BARU" pada Akun Saya bila panduan versi terkini belum pernah dibuka (localStorage,
  // tanpa DB). Ditandai sudah dibaca saat pengguna mengunduh dari kartu Panduan di Akun Saya.
  const [panduanNew, setPanduanNew] = useState(false);
  useEffect(() => {
    const check = () => { try { setPanduanNew(localStorage.getItem('panduan_seen_version') !== PANDUAN_VERSION); } catch { /* abaikan */ } };
    check();
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, [pathname]);

  const isActive = (href: string) => {
    const path = href.split('?')[0];
    if (path === '/penilaian') return pathname === '/penilaian' || pathname.startsWith('/penilaian/');
    return pathname === path;
  };

  // Accordion sidebar — HANYA view HRD Admin (menu terbanyak). Hanya section yang memuat halaman
  // aktif yang terbuka; sisanya terlipat → mengurangi kekusutan. Peran lain: semua terbuka (tetap).
  const accordion = canAdmin && hrdMode === 'admin';
  const activeSectionTitle = sections.find((s) => s.items.some((it) => isActive(it.href)))?.title ?? null;
  const firstTitle = sections.find((s) => s.title)?.title ?? null;
  const [openTitle, setOpenTitle] = useState<string | null>(activeSectionTitle ?? firstTitle);
  useEffect(() => {
    if (accordion) setOpenTitle(activeSectionTitle ?? firstTitle);
  }, [accordion, activeSectionTitle, firstTitle]);

  const Sidebar = (
    <aside className="app-sidebar w-64 shrink-0 bg-sidebar text-sidebar-soft border-r border-black/30 flex flex-col h-full">
      {/* Brand */}
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="bg-white/95 rounded-control p-1 shrink-0">
            <BrandLogo className="w-8 h-8" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-extrabold text-white">Infarm 360°</div>
            <div className="text-[10px] text-sidebar-soft">Performance Appraisal</div>
          </div>
        </div>
      </div>

      {/* Toggle dual-mode: tampil bila punya izin HRD (canAdmin). Mode 'base' (token 'spv')
          = bertindak sesuai posisi asli (Pegawai/SPV); 'admin' = mengoperasikan aplikasi. */}
      {canAdmin && (
        <div className="px-3 py-2.5 border-b border-white/[0.06] bg-black/25">
          <div className="grid grid-cols-2 gap-1.5">
            <form action={setHrdMode.bind(null, 'admin')}>
              <button type="submit" className={`w-full flex items-center justify-center gap-1 text-[10px] font-bold py-1.5 rounded-control transition-colors ${
                hrdMode === 'admin' ? 'bg-brand text-white' : 'bg-white/[0.06] text-sidebar-soft hover:bg-white/10 border border-white/10'}`}>
                <Building2 className="w-3 h-3" /> HRD Admin
              </button>
            </form>
            <form action={setHrdMode.bind(null, 'spv')}>
              <button type="submit" className={`w-full flex items-center justify-center gap-1 text-[10px] font-bold py-1.5 rounded-control transition-colors ${
                hrdMode === 'spv' ? 'bg-brand text-white' : 'bg-white/[0.06] text-sidebar-soft hover:bg-white/10 border border-white/10'}`}>
                <Briefcase className="w-3 h-3" /> {role === 'employee' ? 'Mode Pegawai' : 'Mode SPV'}
              </button>
            </form>
          </div>
          <p className="text-[10px] text-sidebar-soft/80 text-center mt-1">
            {hrdMode === 'spv' ? (role === 'employee' ? 'Bertindak sebagai Pegawai' : 'Bertindak sebagai Supervisor') : 'Mengelola seluruh sistem'}
          </p>
        </div>
      )}

      {/* Period indicator + deadline */}
      <div className="px-4 py-2.5 bg-black/25 border-b border-white/[0.06] text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${periodActive ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="font-bold text-white truncate">{periodLabel ?? 'Tanpa Periode'}</span>
          </div>
          <span className={`text-[10px] font-bold uppercase py-0.5 px-2 rounded-full shrink-0 ${
            periodActive ? 'bg-brand/25 text-emerald-200' : 'bg-white/10 text-sidebar-soft'}`}>
            {periodActive ? 'Aktif' : 'Kunci'}
          </span>
        </div>
        {periodActive && periodDaysLeft != null && <Deadline daysLeft={periodDaysLeft} />}
      </div>

      {/* Tugas & Notifikasi (diturunkan dari data) */}
      <div className="px-3 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Bell className="w-3.5 h-3.5 text-warn-bright" />
          <span className="text-[10px] font-bold text-sidebar-soft tracking-wider uppercase">Tugas &amp; Notifikasi</span>
          {todos.length > 0 && (
            <span className="ml-auto text-[10px] font-black text-sidebar bg-warn-bright rounded-full px-1.5 min-w-[18px] text-center">{todos.length}</span>
          )}
        </div>
        {todos.length === 0 ? (
          <p className="text-[10px] text-sidebar-soft/70">Tak ada tugas tertunda. 🎉</p>
        ) : (
          <div className="space-y-1">
            {todos.map((t) => (
              <Link
                key={t.id}
                href={t.href}
                onClick={() => setOpen(false)}
                className="flex items-start gap-1.5 text-[11px] leading-snug text-sidebar-soft hover:text-white hover:bg-white/[0.05] rounded-md px-1.5 py-1 transition-colors"
              >
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${TODO_DOT[t.tone]}`} />
                <span>{t.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="p-2 space-y-1 flex-1 overflow-y-auto">
        {/* Beranda (Pusat Tindakan) HANYA untuk HRD Mode Admin — peran lain langsung ke fiturnya. */}
        {accordion && (
          <Link
            href="/beranda"
            onClick={() => setOpen(false)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-control text-xs font-bold transition-colors ${
              isActive('/beranda') ? 'bg-brand text-white' : 'text-sidebar-soft hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            <Home className={`w-4 h-4 shrink-0 ${isActive('/beranda') ? 'text-white' : 'text-sidebar-soft'}`} />
            <span>Beranda</span>
          </Link>
        )}
        {sections.map((sec) => {
          const collapsible = accordion && !!sec.title;
          const containsActive = sec.items.some((it) => isActive(it.href));
          const isOpen = !collapsible || openTitle === sec.title;
          return (
            <div key={sec.title ?? 'main'}>
              {sec.title && (collapsible ? (
                <button type="button" onClick={() => setOpenTitle(isOpen ? null : sec.title!)}
                  className="w-full flex items-center gap-1.5 px-1.5 pt-3 pb-1 text-[10px] font-bold text-sidebar-soft/80 tracking-wider uppercase hover:text-sidebar-soft">
                  <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                  <span className="flex-1 text-left">{sec.title}</span>
                  {!isOpen && containsActive && <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" aria-label="halaman aktif di grup ini" />}
                </button>
              ) : (
                <div className="text-[10px] font-bold text-sidebar-soft/80 tracking-wider px-1.5 pt-3 pb-1 uppercase">{sec.title}</div>
              ))}
              {isOpen && sec.items.map((it) => {
                const Icon = it.icon;
                const active = isActive(it.href);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className={`w-full flex items-center gap-2 pl-5 pr-3 py-2 rounded-control text-xs font-bold transition-colors ${
                      active ? 'bg-brand text-white' : 'text-sidebar-soft hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-sidebar-soft'}`} />
                    <span>{it.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User + akun + logout */}
      <div className="p-3 border-t border-white/[0.06]">
        <div className="px-1 mb-2">
          <div className="text-xs font-bold text-white truncate">{name}</div>
          <div className="text-[10px] text-sidebar-soft">{dept} · {ROLE_LABEL[role]} · <span className="font-mono">{empCode}</span></div>
        </div>
        <Link
          href="/akun"
          onClick={() => setOpen(false)}
          className={`w-full flex items-center gap-1.5 text-xs font-semibold rounded-control py-2 px-2 mb-1 transition-colors ${
            isActive('/akun') ? 'bg-brand text-white' : 'text-sidebar-soft hover:bg-white/[0.05] hover:text-white'
          }`}
        >
          <KeyRound className={`w-3.5 h-3.5 ${isActive('/akun') ? 'text-white' : 'text-sidebar-soft'}`} /> Akun Saya
          {panduanNew && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-rose-500/90 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white" title="Ada panduan terbaru">
              <span className="w-1.5 h-1.5 rounded-full bg-white" /> Panduan
            </span>
          )}
        </Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/15 hover:text-rose-200 rounded-control py-2 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Keluar
          </button>
        </form>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-bg text-ink">
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
        <header className="app-mobile-header no-print md:hidden flex items-center gap-3 px-4 py-3 bg-surface border-b border-line">
          <button type="button" onClick={() => setOpen((v) => !v)} className="relative text-ink-soft"
            aria-label={open ? 'Tutup menu navigasi' : 'Buka menu navigasi'} aria-expanded={open}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            {!open && todos.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 text-[10px] font-black text-sidebar bg-warn-bright rounded-full px-1 min-w-[14px] text-center leading-[14px]">{todos.length}</span>
            )}
          </button>
          <BrandLogo className="w-8 h-8 shrink-0" />
          <span className="text-sm font-extrabold text-ink">Infarm 360°</span>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/** Indikator tenggat periode aktif: sisa hari + peringatan saat mendekati/melewati end_date. */
function Deadline({ daysLeft }: { daysLeft: number }) {
  // Kontras naik bertahap sesuai urgensi (di atas latar sidebar gelap):
  //  lewat tenggat / hari ini → CHIP oranye solid (--color-warn-bright) = paling menonjol;
  //  ≤7 hari → teks oranye terang; selain itu → teks netral redup (tak menarik perhatian).
  const { text, cls } =
    daysLeft < 0 ? { text: `Lewat tenggat ${Math.abs(daysLeft)} hari`, cls: 'bg-warn-bright text-sidebar font-extrabold px-1.5 py-0.5 rounded-control' }
    : daysLeft === 0 ? { text: 'Berakhir hari ini', cls: 'bg-warn-bright text-sidebar font-extrabold px-1.5 py-0.5 rounded-control' }
    : daysLeft <= 7 ? { text: `${daysLeft} hari lagi (mendekati tenggat)`, cls: 'text-warn-bright font-bold' }
    : { text: `Tenggat: ${daysLeft} hari lagi`, cls: 'text-white/55' };
  return (
    <div className="mt-1.5 flex">
      <div className={`inline-flex items-center gap-1 text-[10px] ${cls}`}>
        {daysLeft <= 7 ? <AlertTriangle className="w-3 h-3 shrink-0" /> : <Clock className="w-3 h-3 shrink-0" />}
        <span>{text}</span>
      </div>
    </div>
  );
}
