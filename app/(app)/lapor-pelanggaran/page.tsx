import { redirect } from 'next/navigation';
import { Clock, Flag, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/empty-state';
import { CARD, CardTitle, Note, PageTitle } from '@/components/infarm-ui';
import { INFARM_PAGE } from '@/app/infarm-fonts';
import { loadViolationPeriod, loadViolationCategories } from '@/lib/outside-notes';
import { OutsideNoteButton } from './report-form';

/**
 * LAPORKAN PELANGGARAN (pegawai) — halaman sendiri sejak 0061 (pemilik 2026-11-16), lepas dari Daftar Penilaian Saya:
 * bisa dipakai kapan pun HRD membuka saklarnya pada periode aktif, terlepas dari status 360° / formulir penilaian.
 *
 * Kandidat = aturan Ajukan Penilaian (bukan diri, Direksi, eksternal, nonaktif). Rekan di daftar penilaian dikeluarkan
 * HANYA selama formulir 360° terbuka (mereka disampaikan lewat formulir); server menegakkan aturan yang sama.
 * Penilai eksternal tak bisa mengirim (pemilik 2026-11-03). Tanpa riwayat: laporan tak tersimpan dengan nama pengirim.
 */
export default async function LaporPelanggaranPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('employees').select('is_external').eq('id', user.id).maybeSingle();
  if (!me || me.is_external) {
    return (
      <Shell>
        <EmptyState icon={<Lock className="w-6 h-6" />} title="Fitur ini belum tersedia untuk akun Anda"
          description="Laporkan Pelanggaran saat ini hanya untuk pegawai internal." />
      </Shell>
    );
  }

  const ap = await loadViolationPeriod(supabase);
  if (!ap) {
    return (
      <Shell>
        <EmptyState icon={<Clock className="w-6 h-6" />} title="Belum ada periode aktif"
          description="Laporan bisa dikirim setelah HRD membuka periode dan membuka Laporkan Pelanggaran." />
      </Shell>
    );
  }
  if (!ap.open) {
    return (
      <Shell periodLabel={ap.label}>
        <EmptyState icon={<Lock className="w-6 h-6" />} title="Laporkan Pelanggaran sedang ditutup"
          description={`HRD belum membuka pengiriman laporan untuk ${ap.label}.`}
          note="Halaman ini bisa dipakai lagi setelah HRD membukanya." />
      </Shell>
    );
  }

  const [{ data: emps }, { data: maps }, categories] = await Promise.all([
    supabase.from('employees').select('id, name, dept').neq('role', 'direksi').eq('is_external', false).eq('is_active', true),
    ap.formOpen
      ? supabase.from('mappings').select('target_id').eq('assessor_id', user.id).eq('period_id', ap.id).eq('is_active', true)
      : Promise.resolve({ data: [] as { target_id: string }[] }),
    loadViolationCategories(supabase),
  ]);
  const excluded = new Set<string>([user.id, ...(maps ?? []).map((m) => m.target_id)]);
  const candidates = (emps ?? [])
    .filter((e) => !excluded.has(e.id))
    .map((e) => ({ id: e.id, name: e.name, dept: e.dept }))
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));

  return (
    <Shell periodLabel={ap.label}>
      <div className="space-y-4 max-w-3xl">
        <section className={`${CARD} flex flex-col`}>
          <CardTitle icon={Flag}>Tulis Laporan</CardTitle>
          <p className="text-[13px] text-ink-soft mt-1.5 leading-relaxed">
            Ceritakan kejadian yang Anda alami atau lihat langsung terkait rekan yang dilaporkan, meskipun ia bukan rekan kerja langsung Anda.
          </p>
          {ap.formOpen && (
            <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
              Selama formulir penilaian 360° dibuka, rekan yang ada di daftar penilaian Anda tidak tercantum di sini — sampaikan lewat formulir penilaiannya.
            </p>
          )}
          <div className="pt-3 flex flex-wrap items-center gap-2">
            <OutsideNoteButton candidates={candidates} categories={categories} />
          </div>
        </section>
        <Note>
          Laporan tidak memengaruhi Skor 360° dan tidak bisa diubah atau dihapus setelah dikirim. Laporan Anda tidak
          tercantum di mana pun di akun Anda, karena tidak tersimpan dengan nama Anda.
        </Note>
      </div>
    </Shell>
  );
}

function Shell({ children, periodLabel }: { children: React.ReactNode; periodLabel?: string }) {
  return (
    <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7`}>
      <PageTitle title="Laporkan Pelanggaran">
        {periodLabel ? <>Periode aktif: {periodLabel}</> : null}
      </PageTitle>
      {children}
    </main>
  );
}
