import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AkunForm } from './akun-form';
import { PanduanCard } from './panduan-card';
import { panduanFor, panduanHref, PANDUAN_VERSION, PANDUAN_UPDATED_LABEL } from '@/lib/panduan';

const ROLE_LABEL: Record<string, string> = {
  employee: 'Pegawai Operasional', spv: 'Supervisor (SPV)', hrd: 'HRD Admin', direksi: 'Direktur',
};

/** Akun Saya — info akun + ganti sandi mandiri (semua peran). */
export default async function AkunPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees')
    .select('name, dept, role, emp_code, is_hrd_admin, is_coordinator').eq('id', user.id).maybeSingle();
  const panduan = panduanFor(me?.role, me?.is_hrd_admin ?? false, me?.is_coordinator ?? false);

  return (
    // Lebar PENUH (tanpa max-w/mx-auto) + tata letak 2 kolom di layar lebar: identitas & panduan
    // di kiri, ganti sandi di kanan → seluruh isi muat satu layar tanpa perlu digulir.
    <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Akun Saya</h1>
          <p className="text-[13.5px] text-ink-soft mt-1">Informasi akun &amp; ganti sandi Anda.</p>
        </div>
        <Link href="/" className="text-xs text-ink-faint hover:text-ink-soft">← Beranda</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {/* Kolom kiri — identitas + panduan */}
        <div className="space-y-4">
          <Section title="Informasi Akun">
            <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 text-xs">
              <Row label="Nama" value={me?.name ?? '—'} />
              <Row label="Email (login)" value={user.email ?? '—'} mono />
              <Row label="Divisi" value={me?.dept ?? '—'} />
              <Row label="Peran" value={ROLE_LABEL[me?.role ?? ''] ?? (me?.role ?? '—')} />
              <Row label="Kode Pegawai" value={me?.emp_code ?? '—'} mono />
            </dl>
          </Section>

          <PanduanCard
            href={panduanHref(panduan)} label={panduan.label} filename={panduan.filename}
            version={PANDUAN_VERSION} updatedLabel={PANDUAN_UPDATED_LABEL} />
        </div>

        {/* Kolom kanan — ganti sandi */}
        <Section title="Ganti Sandi">
          <p className="text-[11px] text-warn-ink bg-warn-tint border border-warn-ink/25 rounded-control p-2 mb-3">
            Jika akun Anda masih memakai <strong>sandi awal bersama</strong>, segera ganti dengan
            sandi pribadi yang hanya Anda ketahui — demi menjaga integritas penilaian 360°.
          </p>
          <AkunForm />
        </Section>
      </div>
    </main>
  );
}

/** Bingkai section: hanya untuk kelompok isi yang berdiri sendiri (identitas, sandi, panduan). */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-line rounded-panel p-5">
      <h2 className="text-[11px] font-semibold text-ink-faint uppercase tracking-[0.07em] mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-faint font-semibold uppercase tracking-wide text-[10px]">{label}</dt>
      <dd className={`mt-0.5 text-ink-soft break-words ${mono ? 'data-value' : 'font-semibold'}`}>{value}</dd>
    </div>
  );
}
