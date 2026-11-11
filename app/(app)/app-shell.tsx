'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { KPI_AUDIT_HREF } from '@/lib/kpi-links';
import {
  Star, FileText, Target, Users, TrendingUp, LayoutDashboard, CalendarRange,
  Network, HelpCircle, Scale, ShieldAlert, ClipboardCheck, Flag,
  Menu, X, LogOut, Building2, Briefcase, Award, Clock, CircleCheckBig, UserCog, ScrollText, Bell, Download, KeyRound, AlertTriangle, ChevronDown, ChevronRight, Check, Sprout,
} from 'lucide-react';
import { setHrdMode } from './mode-actions';
import { BrandLogo } from '@/components/brand-logo';
import { ActionGuard } from '@/components/action-guard';
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
  // Rencana Pengembangan (0055): rencana sendiri + tab Tim Saya bagi atasan — semua peran di mode base.
  if (!adminView) main.push({ href: '/pengembangan', label: 'Rencana Pengembangan', icon: Sprout });
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
      { href: '/admin/laporan', label: 'Review & Finalisasi', icon: ClipboardCheck, section: 'laporan' },
      // Laporan Pelanggaran: gerbang = bagian Review & Finalisasi + Mode Admin (menu admin hanya tampil di Mode Admin).
      { href: '/admin/pelanggaran', label: 'Laporan Pelanggaran', icon: Flag, section: 'laporan' },
      { href: '/admin/pengembangan', label: 'Pantauan Rencana Pengembangan', icon: Sprout, section: 'pengembangan' },
      { href: '/suksesi', label: 'Promosi & Suksesi', icon: Award, section: 'suksesi' },
    ]);
    if (hasil.length) sections.push({ title: 'Hasil & Tindak Lanjut', items: hasil });

    const pemantauan = filterAdmin([
      { href: '/admin/dashboard', label: 'Dashboard Organisasi', icon: LayoutDashboard, section: 'dashboard' },
      { href: '/admin/monitor', label: 'Monitor Kinerja Pegawai', icon: TrendingUp, section: 'dashboard' },
      { href: '/admin/struktur', label: 'Struktur Organisasi', icon: Building2, section: 'struktur' },
      { href: KPI_AUDIT_HREF, label: 'Monitoring & Audit KPI', icon: Clock, section: 'audit' },
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
        { href: '/review-hasil', label: 'Tinjauan Hasil Akhir', icon: ClipboardCheck },
        { href: '/admin/pelanggaran', label: 'Laporan Pelanggaran', icon: Flag },
        { href: '/admin/pengembangan', label: 'Pantauan Rencana Pengembangan', icon: Sprout },
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
      grantItems.push({ href: '/admin/laporan', label: 'Review & Finalisasi', icon: ClipboardCheck });
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
      grantItems.push({ href: KPI_AUDIT_HREF, label: 'Monitoring & Audit KPI', icon: Clock });
    }
    if (grantItems.length) sections.push({ title: 'Akses dari HRD', items: grantItems });
  }

  return sections;
}

// Titik penanda tugas di sidebar (latar PUTIH, Design System Infarm 2026-11-04) — tanpa biru/ungu.
const TODO_DOT: Record<TodoTone, string> = {
  amber: 'bg-warn', emerald: 'bg-brand', indigo: 'bg-infarm-soil', rose: 'bg-danger-ink', blue: 'bg-ink-faint',
};

/** Cookie preferensi sidebar desktop (dibaca layout di server → tak ada kedip saat halaman dimuat). */
const SIDEBAR_COOKIE = 'sidebar_collapsed';

export function AppShell({
  role, canAdmin, isCoordinator = false, hrdSections = null, pageGrants = [], hrdMode, name, dept, empCode, periodLabel, periodActive, periodDaysLeft, todos, initialCollapsed = false, children,
}: {
  role: Role; canAdmin: boolean; isCoordinator?: boolean; hrdSections?: string[] | null; pageGrants?: { section: string; scope: string }[]; hrdMode: HrdMode; name: string; dept: string; empCode: string;
  periodLabel: string | null; periodActive: boolean; periodDaysLeft?: number | null;
  todos: TodoItem[]; initialCollapsed?: boolean; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);                        // laci menu (HP)
  const [collapsed, setCollapsed] = useState(initialCollapsed);   // sidebar desktop ditutup
  const [popover, setPopover] = useState<'pages' | 'todos' | null>(null);
  const sections = menuFor(role, canAdmin, hrdMode, isCoordinator, hrdSections, pageGrants);

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
  // Pindah halaman/mode → buka section halaman aktif & tutup popover. Pola resmi React "sesuaikan state
  // saat nilai berubah" (dibandingkan saat render, bukan lewat effect yang memicu render berantai).
  const navKey = `${accordion}|${activeSectionTitle}|${firstTitle}|${pathname}`;
  const [prevNavKey, setPrevNavKey] = useState(navKey);
  if (navKey !== prevNavKey) {
    setPrevNavKey(navKey);
    if (accordion) setOpenTitle(activeSectionTitle ?? firstTitle);
    setPopover(null);
  }

  // Jejak "Grup › Halaman" di bilah atas: cocokkan prefiks TERPANJANG agar halaman detail
  // (mis. /laporan/[id]) ikut induknya. Akun Saya tak ada di menu → label manual.
  let crumb: { sec: Section; item: Item } | null = null;
  let crumbLen = -1;
  for (const sec of sections) for (const it of sec.items) {
    const p = it.href.split('?')[0];
    if ((pathname === p || pathname.startsWith(`${p}/`)) && p.length > crumbLen) { crumb = { sec, item: it }; crumbLen = p.length; }
  }
  const pageLabel = crumb?.item.label ?? (pathname.startsWith('/akun') ? 'Akun Saya' : null);

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    setPopover(null);
    try { document.cookie = `${SIDEBAR_COOKIE}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`; } catch { /* abaikan */ }
  };

  const modeLabel = role === 'employee' ? 'Mode Pegawai' : 'Mode SPV';
  // Toggle dual-mode (fungsi render biasa, bukan komponen di dalam komponen — aturan lint hooks).
  const modeSwitch = (compact: boolean) => (
    <div className={`grid grid-cols-2 gap-0.5 p-[3px] rounded-full border border-line bg-surface ${compact ? '' : 'w-full'}`}>
      <form action={setHrdMode.bind(null, 'admin')}>
        <button type="submit" className={`w-full flex items-center justify-center gap-1 font-semibold rounded-full transition-colors ${compact ? 'text-[11px] px-3 h-7' : 'text-[11px] py-1.5'} ${
          hrdMode === 'admin' ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'}`}>
          <Building2 className="w-3.5 h-3.5" /> HRD Admin
        </button>
      </form>
      <form action={setHrdMode.bind(null, 'spv')}>
        <button type="submit" className={`w-full flex items-center justify-center gap-1 font-semibold rounded-full transition-colors ${compact ? 'text-[11px] px-3 h-7' : 'text-[11px] py-1.5'} ${
          hrdMode === 'spv' ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'}`}>
          <Briefcase className="w-3.5 h-3.5" /> {modeLabel}
        </button>
      </form>
    </div>
  );

  const Sidebar = (
    <aside className="app-sidebar w-64 shrink-0 bg-surface text-ink-soft border-r border-line-strong shadow-[4px_0_14px_-6px_rgb(27_31_28/0.22)] relative z-10 flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 h-14 shrink-0 flex items-center bg-brand">
        <div className="flex items-center gap-2.5">
          <div className="bg-surface rounded-xl p-0.5 shrink-0">
            <BrandLogo className="w-8 h-8" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-white">Infarm 360°</div>
            <div className="text-[10px] text-white/85">Performance Appraisal</div>
          </div>
        </div>
      </div>

      {/* Toggle dual-mode: tampil bila punya izin HRD (canAdmin). Mode 'base' (token 'spv')
          = bertindak sesuai posisi asli (Pegawai/SPV); 'admin' = mengoperasikan aplikasi. */}
      <div className="border-b border-line">
      {canAdmin && (
        <div className="px-3.5 py-3">
          {modeSwitch(false)}
          <p className="text-[10px] text-ink-soft text-center mt-1.5">
            {hrdMode === 'spv' ? (role === 'employee' ? 'Bertindak sebagai Pegawai' : 'Bertindak sebagai Supervisor') : 'Mengelola seluruh sistem'}
          </p>
        </div>
      )}

      {/* Period indicator + deadline — kartu krem */}
      <div className={`px-3.5 py-3 ${canAdmin ? 'border-t border-brand/15' : ''}`}>
        <div className="bg-infarm-cream rounded-xl px-3 py-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${periodActive ? 'bg-brand animate-pulse' : 'bg-danger-ink'}`} />
              <span className="font-bold text-ink truncate">{periodLabel ?? 'Tanpa Periode'}</span>
            </div>
            <span className={`text-[10px] font-bold uppercase py-0.5 px-2 rounded-full shrink-0 ${
              periodActive ? 'bg-brand text-white' : 'bg-surface text-ink-soft'}`}>
              {periodActive ? 'Aktif' : 'Kunci'}
            </span>
          </div>
          {periodActive && periodDaysLeft != null && <Deadline daysLeft={periodDaysLeft} />}
        </div>
      </div>

      {/* Tugas & Notifikasi (diturunkan dari data) */}
      <div className="px-3.5 py-3 border-t border-brand/15">
        <div className="flex items-center gap-1.5 mb-1.5 px-1">
          <Bell className="w-3.5 h-3.5 text-warn" />
          <span className="text-[10px] font-bold text-infarm-soil tracking-[0.08em] uppercase">Tugas &amp; Notifikasi</span>
          {todos.length > 0 && (
            <span className="ml-auto text-[11px] font-bold text-ink bg-warn rounded-full px-1.5 min-w-[20px] text-center">{todos.length}</span>
          )}
        </div>
        {todos.length === 0 ? (
          <p className="text-[11px] text-ink-faint px-1">Tak ada tugas tertunda.</p>
        ) : (
          <div className="space-y-0.5">
            {todos.map((t) => (
              <Link
                key={t.id}
                href={t.href}
                prefetch={false}
                onClick={() => setOpen(false)}
                className="flex items-start gap-2 text-[11px] leading-snug text-ink-soft hover:text-ink hover:bg-infarm-surface rounded-lg px-1.5 py-1.5 transition-colors"
              >
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${TODO_DOT[t.tone]}`} />
                <span>{t.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
      </div>

      {/* Nav */}
      <nav className="px-2.5 pb-2 space-y-0.5 flex-1 overflow-y-auto">
        {/* Halaman Beranda dihapus 2026-08 → tak ada lagi item menu "Beranda". Landing Mode Admin
            = Dashboard Organisasi (lihat app/page.tsx); kartu Status Siklus pindah ke Kelola Periode. */}
        {sections.map((sec) => {
          const collapsible = accordion && !!sec.title;
          const containsActive = sec.items.some((it) => isActive(it.href));
          const isOpen = !collapsible || openTitle === sec.title;
          return (
            <div key={sec.title ?? 'main'}>
              {sec.title && (collapsible ? (
                <button type="button" onClick={() => setOpenTitle(isOpen ? null : sec.title!)}
                  className="w-full flex items-center gap-1.5 px-1.5 pt-3.5 pb-1.5 text-[10px] font-bold text-infarm-soil tracking-[0.08em] uppercase hover:text-ink">
                  <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                  <span className="flex-1 text-left">{sec.title}</span>
                  {!isOpen && containsActive && <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" aria-label="halaman aktif di grup ini" />}
                </button>
              ) : (
                <div className="text-[10px] font-bold text-infarm-soil tracking-[0.08em] px-1.5 pt-3.5 pb-1.5 uppercase">{sec.title}</div>
              ))}
              {isOpen && sec.items.map((it) => {
                const Icon = it.icon;
                const active = isActive(it.href);
                return (
                  // prefetch={false}: prefetch otomatis puluhan tautan menu (diulang tiap pindah halaman) =
                  // pemakai terbesar kuota log Supabase (tiap prefetch = 1 cek sesi). Klik tetap memuat normal.
                  <Link
                    key={it.href}
                    href={it.href}
                    prefetch={false}
                    onClick={() => setOpen(false)}
                    className={`w-full flex items-center gap-2.5 pl-4 pr-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                      active ? 'bg-brand text-white' : 'text-ink-soft hover:bg-infarm-surface hover:text-brand-ink'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{it.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User + akun + logout */}
      <div className="p-3 border-t border-line">
        <div className="px-1 mb-2">
          <div className="text-xs font-bold text-ink truncate">{name}</div>
          <div className="text-[10px] text-ink-soft">{dept} · {ROLE_LABEL[role]} · <span className="font-mono">{empCode}</span></div>
        </div>
        <Link
          href="/akun"
          prefetch={false}
          onClick={() => setOpen(false)}
          className={`w-full flex items-center gap-2 text-xs font-semibold rounded-lg py-2 px-2 mb-1 transition-colors ${
            isActive('/akun') ? 'bg-brand text-white' : 'text-ink-soft hover:bg-infarm-surface hover:text-ink'
          }`}
        >
          <KeyRound className="w-4 h-4" /> Akun Saya
        </Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className="w-full flex items-center gap-2 text-xs font-semibold text-danger-ink hover:bg-danger-tint rounded-lg py-2 px-2 transition-colors">
            <LogOut className="w-4 h-4" /> Keluar
          </button>
        </form>
      </div>
    </aside>
  );

  const deadline = periodActive && periodDaysLeft != null ? deadlineInfo(periodDaysLeft) : null;

  return (
    <div className="flex h-screen bg-bg text-ink">
      {/* Desktop sidebar (bisa ditutup; pilihan disimpan di cookie) */}
      {!collapsed && <div className="hidden md:block h-full">{Sidebar}</div>}

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative h-full">{Sidebar}</div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="app-mobile-header no-print md:hidden flex items-center gap-3 px-4 py-3 bg-brand">
          <button type="button" onClick={() => setOpen((v) => !v)} className="relative text-white"
            aria-label={open ? 'Tutup menu navigasi' : 'Buka menu navigasi'} aria-expanded={open}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            {!open && todos.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 text-[10px] font-bold text-ink bg-warn rounded-full px-1 min-w-[14px] text-center leading-[14px]">{todos.length}</span>
            )}
          </button>
          <span className="bg-surface rounded-lg p-0.5 shrink-0"><BrandLogo className="w-7 h-7" /></span>
          <span className="text-sm font-extrabold text-white">Infarm 360°</span>
        </header>

        {/* Bilah atas desktop: tombol ☰ (tempatnya tetap, sidebar terbuka maupun ditutup) + jejak
            "Grup › Halaman". Saat sidebar DITUTUP: ▾ membuka halaman lain di grup yang sama, dan
            periode / Tugas / mode pindah ke kanan sebagai pil (pilihan pemilik 2026-11-04, mockup B). */}
        <div className="app-topbar no-print hidden md:flex items-center gap-3 px-5 h-14 shrink-0 bg-brand relative">
          {popover && <div className="fixed inset-0 z-20" onClick={() => setPopover(null)} aria-hidden />}
          <button type="button" onClick={toggleSidebar}
            className="w-8 h-8 rounded-control border border-white/40 text-white hover:bg-white/15 flex items-center justify-center shrink-0"
            aria-label={collapsed ? 'Buka sidebar' : 'Tutup sidebar'} title={collapsed ? 'Buka sidebar' : 'Tutup sidebar'} aria-expanded={!collapsed}>
            <Menu className="w-[18px] h-[18px]" />
          </button>
          {pageLabel && (
            <div className="relative z-30 flex items-center gap-1.5 min-w-0 text-[13px]">
              {crumb?.sec.title && <>
                <span className="font-semibold text-white/85 truncate">{crumb.sec.title}</span>
                <ChevronRight className="w-4 h-4 text-white/70 shrink-0" />
              </>}
              <span className="font-bold text-white truncate">{pageLabel}</span>
              {collapsed && crumb && crumb.sec.items.length > 1 && (
                <button type="button" onClick={() => setPopover(popover === 'pages' ? null : 'pages')} aria-expanded={popover === 'pages'}
                  aria-label="Pindah ke halaman lain di grup ini" title="Pindah ke halaman lain di grup ini"
                  className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                    popover === 'pages' ? 'border-surface bg-surface text-brand' : 'border-white/40 text-white hover:bg-white/15'}`}>
                  <ChevronDown className="w-4 h-4" />
                </button>
              )}
              {popover === 'pages' && crumb && (
                <div className="absolute left-0 top-full mt-2 w-72 bg-surface border border-line rounded-card shadow-card p-2">
                  {crumb.sec.title && <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-infarm-soil">{crumb.sec.title}</div>}
                  {crumb.sec.items.map((it) => {
                    const Icon = it.icon;
                    const here = it.href === crumb!.item.href;
                    return (
                      <Link key={it.href} href={it.href} prefetch={false} onClick={() => setPopover(null)}
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] ${here ? 'bg-infarm-surface text-brand-ink font-semibold' : 'text-ink-soft hover:bg-infarm-surface hover:text-ink'}`}>
                        <Icon className="w-4 h-4 shrink-0" /> <span className="flex-1">{it.label}</span>
                        {here && <Check className="w-4 h-4 text-brand" />}
                      </Link>
                    );
                  })}
                  <div className="h-px bg-line-soft my-1.5 mx-1" />
                  <button type="button" onClick={toggleSidebar}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-semibold text-brand hover:bg-infarm-surface">
                    <Menu className="w-4 h-4" /> Lihat semua menu
                  </button>
                </div>
              )}
            </div>
          )}
          {collapsed && (
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-infarm-cream text-xs text-ink" title={deadline?.text}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${periodActive ? 'bg-brand' : 'bg-danger-ink'}`} />
                <span className="font-bold">{periodLabel ?? 'Tanpa Periode'}</span>
                {deadline && <span className={deadline.urgent ? 'text-warn-ink font-bold' : 'text-infarm-soil'}>· {deadline.short}</span>}
              </span>
              <div className="relative z-30">
                <button type="button" onClick={() => setPopover(popover === 'todos' ? null : 'todos')} aria-expanded={popover === 'todos'}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-surface text-xs font-semibold text-ink-soft hover:text-ink">
                  <Bell className="w-3.5 h-3.5 text-warn" /> Tugas
                  {todos.length > 0 && <span className="text-[11px] font-bold text-ink bg-warn rounded-full px-1.5 min-w-[20px] text-center">{todos.length}</span>}
                </button>
                {popover === 'todos' && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-surface border border-line rounded-card shadow-card p-2">
                    <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-infarm-soil">Tugas &amp; Notifikasi</div>
                    {todos.length === 0
                      ? <p className="px-2.5 py-2 text-xs text-ink-faint">Tak ada tugas tertunda.</p>
                      : todos.map((t) => (
                        <Link key={t.id} href={t.href} prefetch={false} onClick={() => setPopover(null)}
                          className="flex items-start gap-2 px-2.5 py-2 rounded-lg text-[13px] leading-snug text-ink-soft hover:bg-infarm-surface hover:text-ink">
                          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${TODO_DOT[t.tone]}`} />
                          <span>{t.label}</span>
                        </Link>
                      ))}
                  </div>
                )}
              </div>
              {canAdmin && modeSwitch(true)}
            </div>
          )}
        </div>

        {/* scrollbar-gutter: tempat scrollbar selalu disediakan → lebar konten (dan kolom tabel ber-persen)
            tak berubah saat halaman/tab berganti antara pendek (tanpa scrollbar) dan panjang. */}
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">{children}</div>
        <ActionGuard />
      </div>
    </div>
  );
}

/** Teks tenggat periode aktif (deadline penilaian, fallback end_date): `text` lengkap, `short` untuk pil. */
function deadlineInfo(daysLeft: number): { text: string; short: string; urgent: boolean; overdue: boolean } {
  if (daysLeft < 0) return { text: `Lewat tenggat ${Math.abs(daysLeft)} hari`, short: `lewat ${Math.abs(daysLeft)} hari`, urgent: true, overdue: true };
  if (daysLeft === 0) return { text: 'Berakhir hari ini', short: 'berakhir hari ini', urgent: true, overdue: true };
  if (daysLeft <= 7) return { text: `${daysLeft} hari lagi (mendekati tenggat)`, short: `${daysLeft} hari lagi`, urgent: true, overdue: false };
  return { text: `Tenggat: ${daysLeft} hari lagi`, short: `${daysLeft} hari lagi`, urgent: false, overdue: false };
}

/** Indikator tenggat di kartu periode sidebar (latar krem). */
function Deadline({ daysLeft }: { daysLeft: number }) {
  // Kontras naik bertahap sesuai urgensi:
  //  lewat tenggat / hari ini → CHIP oranye solid = paling menonjol;
  //  ≤7 hari → teks peringatan tebal; selain itu → teks cokelat tanah (tak menarik perhatian).
  const d = deadlineInfo(daysLeft);
  const cls = d.overdue ? 'bg-warn text-ink font-extrabold px-1.5 py-0.5 rounded-control'
    : d.urgent ? 'text-warn-ink font-bold' : 'text-infarm-soil font-semibold';
  return (
    <div className="mt-1.5 flex">
      <div className={`inline-flex items-center gap-1 text-[11px] ${cls}`}>
        {d.urgent ? <AlertTriangle className="w-3 h-3 shrink-0" /> : <Clock className="w-3 h-3 shrink-0" />}
        <span>{d.text}</span>
      </div>
    </div>
  );
}
