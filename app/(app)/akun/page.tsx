import { redirect } from 'next/navigation';
import { KeyRound, UserRound, type LucideIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { CARD, CardTitle, Note, PageTitle } from '@/components/infarm-ui';
import { INFARM_PAGE } from '@/app/infarm-fonts';
import { AkunForm } from './akun-form';
import { PanduanCard } from './panduan-card';
import { panduanFor, panduanHref, PANDUAN_VERSION, PANDUAN_UPDATED_LABEL } from '@/lib/panduan';

const ROLE_LABEL: Record<string, string> = {
  employee: 'Pegawai Operasional', spv: 'Supervisor (SPV)', hrd: 'HRD Admin', direksi: 'Direktur',
};

/** Akun Saya — info akun + ganti sandi mandiri (semua peran). Tampilan: Design System Infarm. */
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
    <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7`}>
      <PageTitle title="Akun Saya">Informasi akun &amp; ganti sandi Anda.</PageTitle>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {/* Kolom kiri — identitas + panduan */}
        <div className="space-y-4">
          <Section title="Informasi Akun" icon={UserRound}>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
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
        <Section title="Ganti Sandi" icon={KeyRound}>
          <div className="mb-4">
            <Note tone="warn">
              Jika akun Anda masih memakai <strong>sandi awal bersama</strong>, segera ganti dengan
              sandi pribadi yang hanya Anda ketahui — demi menjaga integritas penilaian 360°.
            </Note>
          </div>
          <AkunForm />
        </Section>
      </div>
    </main>
  );
}

/** Kartu section: hanya untuk kelompok isi yang berdiri sendiri (identitas, sandi, panduan). */
function Section({ title, icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className={CARD}>
      <CardTitle icon={icon} className="mb-4">{title}</CardTitle>
      {children}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-ink-soft">{label}</dt>
      <dd className={`mt-0.5 text-[13px] text-ink break-words ${mono ? 'font-mono' : 'font-semibold'}`}>{value}</dd>
    </div>
  );
}
