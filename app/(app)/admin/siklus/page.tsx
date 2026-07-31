import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { CheckCircle2, Circle, CircleDot, AlertTriangle, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';

/**
 * Panduan Siklus (HRD, Mode Admin) — ikhtisar TAHAP periode aktif + "apa yang memblokir finalisasi".
 * Menyatukan urutan yang selama ini tersebar di banyak halaman (SOP-SIKLUS-PERIODE) menjadi satu
 * layar berstatus, tiap langkah & blokir jadi tautan. HANYA membaca (tak mengubah) — sumber angka
 * = tabel yang sudah ada; dibaca via RLS is_hrd (user-scoped).
 */
type StageStatus = 'done' | 'current' | 'todo';
type Stage = { label: string; detail?: string; href?: string; status: StageStatus };

export default async function SiklusPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: emp } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  const jar = await cookies();
  const adminView = canAdmin(emp) && jar.get('hrd_mode')?.value === 'admin';
  if (!adminView) redirect('/beranda');

  const { data: ap } = await supabase
    .from('periods').select('id, label, status, has_360, form_open').eq('status', 'active').limit(1).maybeSingle();

  if (!ap) {
    return (
      <Shell>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Belum ada periode aktif. Mulai siklus di{' '}
          <Link href="/admin/periode" className="font-bold underline">Kelola Periode</Link> (buat → aktifkan).
        </div>
      </Shell>
    );
  }

  // Sinyal-sinyal (paralel, count head bila bisa). RLS is_hrd → HRD baca penuh.
  const [
    { count: totalEmp }, { count: mappingActive }, { count: submitted },
    { count: result360 }, { count: finalized }, { count: inReview }, { count: corrPending },
  ] = await Promise.all([
    supabase.from('employees').select('*', { count: 'exact', head: true }).eq('is_active', true).neq('role', 'direksi').eq('is_external', false),
    supabase.from('mappings').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('is_active', true),
    supabase.from('assessments').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('status', 'submitted'),
    supabase.from('result_360').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).not('score', 'is', null),
    supabase.from('final_reports').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('status', 'finalized'),
    supabase.from('final_reports').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('status', 'in_review'),
    supabase.from('relation_correction_requests').select('*', { count: 'exact', head: true }).eq('period_id', ap.id).eq('status', 'pending'),
  ]);

  const nEmp = totalEmp ?? 0, nMap = mappingActive ?? 0, nSub = submitted ?? 0;
  const nRes = result360 ?? 0, nFinal = finalized ?? 0, nReview = inReview ?? 0, nCorr = corrPending ?? 0;
  const has360 = ap.has_360;

  // Susun tahap sesuai SOP. Status diturunkan dari sinyal; "current" = tahap belum-selesai pertama.
  const raw: Omit<Stage, 'status'>[] = [
    { label: 'Periode dibuat & diaktifkan', detail: ap.label, href: '/admin/periode' },
    ...(has360 ? [
      { label: 'Pertanyaan, bobot & pemetaan disiapkan', detail: `${nMap} pemetaan aktif`, href: '/admin/pemetaan' },
      { label: '360° diluncurkan (form dibuka)', detail: ap.form_open ? 'form terbuka' : 'form ditutup', href: '/admin/360' },
      { label: 'Pengisian 360° oleh pegawai', detail: `${nSub}/${nMap} penilaian terkirim`, href: '/admin/progress' },
      { label: '① Hitung Ulang Skor 360°', detail: `${nRes} pegawai berskor 360°`, href: '/admin/laporan' },
      { label: 'Review & susun ringkasan (opsional rilis ke SPV)', detail: nReview > 0 ? `${nReview} sedang ditinjau` : undefined, href: '/admin/laporan' },
    ] : []),
    { label: 'Finalisasi laporan', detail: `${nFinal}/${nEmp} pegawai difinalkan`, href: '/admin/laporan' },
    { label: 'Kunci & akhiri periode', detail: 'setelah semua difinalkan', href: '/admin/periode' },
  ];

  // Aturan "done" per tahap (indeks fleksibel; hitung dari sinyal, bukan urutan hardcode).
  const doneOf = (label: string): boolean => {
    if (label.startsWith('Periode dibuat')) return true; // periode aktif ada
    if (label.startsWith('Pertanyaan')) return nMap > 0;
    if (label.startsWith('360° diluncurkan')) return has360; // has_360 = sudah diaktifkan
    if (label.startsWith('Pengisian')) return nMap > 0 && nSub >= nMap;
    if (label.startsWith('① Hitung')) return nRes > 0;
    if (label.startsWith('Review')) return nFinal > 0 || nReview > 0; // sudah mulai review/final
    if (label.startsWith('Finalisasi')) return nEmp > 0 && nFinal >= nEmp;
    if (label.startsWith('Kunci')) return false; // periode masih aktif
    return false;
  };
  let currentAssigned = false;
  const stages: Stage[] = raw.map((s) => {
    const done = doneOf(s.label);
    let status: StageStatus = done ? 'done' : 'todo';
    if (!done && !currentAssigned) { status = 'current'; currentAssigned = true; }
    return { ...s, status };
  });

  // Blokir finalisasi — hal yang harus beres sebelum "Finalisasi" bisa tuntas.
  const blockers: { label: string; href: string }[] = [];
  if (nCorr > 0) blockers.push({ label: `${nCorr} permohonan koreksi relasi belum diproses`, href: '/admin/pemetaan' });
  if (has360 && nEmp - nRes > 0) blockers.push({ label: `${nEmp - nRes} pegawai belum punya Skor 360° (jalankan ① Hitung Ulang)`, href: '/admin/laporan' });
  if (nEmp - nFinal > 0) blockers.push({ label: `${nEmp - nFinal} laporan belum difinalisasi`, href: '/admin/laporan' });

  return (
    <Shell>
      <div className="rounded-xl border border-gray-200 p-4 mb-4">
        <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Siklus berjalan</div>
        <div className="text-lg font-bold text-gray-800">{ap.label}</div>
        <div className="text-xs text-gray-500 mt-0.5">
          Tahap saat ini: <strong className="text-emerald-700">{stages.find((s) => s.status === 'current')?.label ?? 'Siap dikunci'}</strong>
        </div>
      </div>

      <ol className="relative space-y-1">
        {stages.map((s, i) => (
          <li key={i} className={`flex items-start gap-3 rounded-xl border p-3 ${
            s.status === 'current' ? 'border-emerald-300 bg-emerald-50/60' : 'border-gray-200'
          }`}>
            <span className="mt-0.5 shrink-0">
              {s.status === 'done' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                : s.status === 'current' ? <CircleDot className="w-5 h-5 text-emerald-600" />
                : <Circle className="w-5 h-5 text-gray-300" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-semibold ${s.status === 'todo' ? 'text-gray-500' : 'text-gray-800'}`}>{s.label}</div>
              {s.detail && <div className="text-[11px] text-gray-500">{s.detail}</div>}
            </div>
            {s.href && (
              <Link href={s.href} className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline">
                Buka <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-5 rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-bold text-gray-700">Apa yang memblokir finalisasi</h2>
        </div>
        {blockers.length === 0 ? (
          <p className="text-sm text-emerald-700 font-semibold">Tak ada penghalang — siap difinalisasi & dikunci. 🎉</p>
        ) : (
          <ul className="space-y-1.5">
            {blockers.map((b, i) => (
              <li key={i}>
                <Link href={b.href} className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:brightness-95">
                  <span>{b.label}</span>
                  <span className="text-xs font-bold opacity-70 shrink-0">Selesaikan →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 text-[11px] text-gray-400 leading-snug">
        Panduan lengkap tiap langkah: <Link href="/akun" className="underline">unduh Panduan HRD</Link> di Akun Saya,
        atau baca SOP Menjalankan Satu Periode di dokumentasi. Halaman ini hanya menampilkan status — aksi dilakukan di halaman terkait.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Panduan Siklus</h1>
            <p className="text-sm text-gray-500">Tahap periode berjalan & apa yang perlu diselesaikan.</p>
          </div>
          <Link href="/beranda" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
        </div>
        {children}
      </div>
    </main>
  );
}
