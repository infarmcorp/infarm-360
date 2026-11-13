import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Flag, Info, Users } from 'lucide-react';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fetchAllByIds } from '@/lib/supabase/paginate';
import { CARD, Note, PageTitle, StatCard, pillCls } from '@/components/infarm-ui';
import { INFARM_PAGE } from '@/app/infarm-fonts';
import { loadViolationReports, sortViolations, violationPageAllowed, OTHER_CATEGORY_LABEL } from '@/lib/outside-notes';
import { ViolationBoard, type BoardPerson } from './violation-board';

/**
 * LAPORAN PELANGGARAN (HRD) — pemantauan laporan pegawai tentang rekan (tabel catatan 0054 + 0058).
 *
 * Akses (`violationPageAllowed`): HRD berbagian Review & Finalisasi di Mode Admin, atau Direksi (semua laporan, hanya
 * baca; keputusan pemilik 2026-11-11). Tidak masuk katalog grant halaman. Tautan Ekspor hanya untuk HRD.
 * Anonim: tabel tak menyimpan pelapor maupun waktu kirim; halaman hanya menampilkan pegawai yang DILAPORKAN dan
 * isian pelapor (tanggal kejadian, kategori, laporan, catatan), satu kartu per laporan. Urutan = tanggal kejadian
 * terbaru, lalu abjad isi (`sortViolations`) — bukan id/urutan masuk. Termasuk laporan tentang HRD sendiri.
 * Baca via service_role (tabel tanpa policy) SETELAH gerbang di bawah.
 */
export default async function LaporanPelanggaranPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  const hrdMode = (await cookies()).get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  if (!violationPageAllowed(me, hrdMode)) {
    return <Shell><p className="text-[13px] text-ink-soft">Halaman ini untuk Direksi dan HRD di Mode Admin dengan akses Review &amp; Finalisasi.</p></Shell>;
  }
  const isDireksi = me?.role === 'direksi';

  const admin = createAdminClient();
  const { period: periodParam } = await searchParams;
  const { data: periodRows } = await admin.from('periods').select('id, label, status, start_date').order('start_date', { ascending: false });
  const periods = periodRows ?? [];
  const sel = periods.find((p) => p.id === periodParam) ?? periods.find((p) => p.status === 'active') ?? periods[0];
  if (!sel) return <Shell><p className="text-[13px] text-ink-soft">Belum ada periode.</p></Shell>;

  const reports = sortViolations(await loadViolationReports(admin as unknown as Parameters<typeof loadViolationReports>[0], sel.id));
  const targetIds = [...new Set(reports.map((r) => r.target_id))];
  const [emps, { data: aspects }] = await Promise.all([
    targetIds.length
      ? fetchAllByIds<{ id: string; name: string; dept: string; is_active: boolean }>(targetIds, (chunk, from, to) =>
        admin.from('employees').select('id, name, dept, is_active').in('id', chunk).order('id').range(from, to))
      : Promise.resolve([]),
    admin.from('culture_aspects').select('id, name, order_idx').eq('period_id', sel.id).order('order_idx'),
  ]);
  const empById = new Map(emps.map((e) => [e.id, e]));
  const aspectName = new Map((aspects ?? []).map((a) => [a.id, a.name]));

  const byTarget = new Map<string, BoardPerson>();
  reports.forEach((r, i) => {
    const e = empById.get(r.target_id);
    let p = byTarget.get(r.target_id);
    if (!p) {
      p = { id: r.target_id, name: e?.name ?? '—', dept: e?.dept ?? '—', isActive: e?.is_active ?? true, reports: [] };
      byTarget.set(r.target_id, p);
    }
    p.reports.push({
      key: String(i),
      date: r.incident_date,
      category: r.is_other ? OTHER_CATEGORY_LABEL : (r.aspect_id ? aspectName.get(r.aspect_id) ?? '—' : '—'),
      isOther: r.is_other,
      body: r.body,
      note: r.note,
    });
  });
  const people = [...byTarget.values()]
    .sort((a, b) => b.reports.length - a.reports.length || a.name.localeCompare(b.name, 'id'));
  const categories = [...(aspects ?? []).map((a) => a.name), OTHER_CATEGORY_LABEL];
  const otherCount = reports.filter((r) => r.is_other).length;

  return (
    <Shell>
      <PageTitle title="Laporan Pelanggaran">
        Laporan pegawai tentang rekan kerja. Nama pelapor dan waktu kirim tidak disimpan.
      </PageTitle>

      <div className="space-y-4">
        {periods.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-ink-soft mr-1">Periode:</span>
            {periods.map((p) => (
              <Link key={p.id} prefetch={false} href={`/admin/pelanggaran?period=${p.id}`} className={`${pillCls(p.id === sel.id)} shrink-0`}>
                {p.label}
              </Link>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard item={{ icon: Flag, tone: 'brand', value: String(reports.length), label: 'Total laporan' }} />
          <StatCard item={{ icon: Users, tone: 'danger', value: String(people.length), label: 'Pegawai terlapor' }} />
          <StatCard item={{ icon: Info, tone: 'soil', value: String(otherCount), label: `Kategori ${OTHER_CATEGORY_LABEL}` }} />
        </div>

        {people.length === 0 ? (
          <div className={CARD}><p className="text-[13px] text-ink-soft">Belum ada laporan di {sel.label}.</p></div>
        ) : (
          <ViolationBoard people={people} categories={categories} />
        )}

        <Note>
          Laporan tidak memengaruhi skor dan tidak tampil di laporan pegawai. Laporan lama tanpa tanggal kejadian
          ditandai &quot;—&quot;.
          {!isDireksi && (
            <>
              {' '}Unduh semua laporan:{' '}
              <Link prefetch={false} href="/admin/ekspor" className="font-semibold text-brand-ink hover:underline">Ekspor Dataset</Link>
              {' '}→ Bahan Laporan per Pegawai, lembar Laporan Pelanggaran.
            </>
          )}
        </Note>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7`}>{children}</main>;
}
