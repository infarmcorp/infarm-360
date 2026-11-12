import { redirect } from 'next/navigation';
import { BookOpen, ExternalLink, KeyRound, UserRound, type LucideIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { CARD, CardTitle, Note, PageTitle } from '@/components/infarm-ui';
import { INFARM_PAGE } from '@/app/infarm-fonts';
import { GUIDES, guidesFor } from '@/lib/panduan';
import { AkunForm } from './akun-form';

const ROLE_LABEL: Record<string, string> = {
  employee: 'Pegawai Operasional', spv: 'Supervisor (SPV)', hrd: 'HRD Admin', direksi: 'Direktur',
};

/** Akun Saya — info akun + ganti sandi mandiri (semua peran). Tampilan: Design System Infarm. */
export default async function AkunPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees')
    .select('name, dept, role, emp_code, is_hrd_admin, is_coordinator, hrd_sections').eq('id', user.id).maybeSingle();
  // Akses halaman dari HRD (RLS page_grants_self_read: hanya baris milik pengguna ini).
  const { data: grants } = await supabase.from('page_grants').select('section').eq('employee_id', user.id).limit(1);
  // Panduan dihitung dari izin TERKINI (lib/panduan.ts) — berubah sendiri saat izin diberi/dicabut.
  const guides = guidesFor(me, (grants ?? []).length > 0);

  return (
    // Lebar PENUH (tanpa max-w/mx-auto) + tata letak 2 kolom di layar lebar: identitas di kiri,
    // ganti sandi di kanan → seluruh isi muat satu layar tanpa perlu digulir.
    <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7`}>
      <PageTitle title="Akun Saya">Informasi akun, panduan, &amp; ganti sandi Anda.</PageTitle>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {/* Kolom kiri — identitas + panduan */}
        <div className="grid gap-4">
          <Section title="Informasi Akun" icon={UserRound}>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Row label="Nama" value={me?.name ?? '—'} />
              <Row label="Email (login)" value={user.email ?? '—'} mono />
              <Row label="Divisi" value={me?.dept ?? '—'} />
              <Row label="Peran" value={ROLE_LABEL[me?.role ?? ''] ?? (me?.role ?? '—')} />
              <Row label="Kode Pegawai" value={me?.emp_code ?? '—'} mono />
            </dl>
          </Section>

          <Section title="Panduan Saya" icon={BookOpen}>
            <p className="text-xs text-ink-soft mb-3">
              Panduan sesuai peran dan izin Anda saat ini. Terbuka di tab baru.
            </p>
            <ul className="grid gap-2">
              {guides.map((k) => (
                <li key={k}>
                  <a
                    href={GUIDES[k].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 rounded-control border border-line px-3 py-2.5 hover:bg-infarm-surface hover:border-line-strong transition-colors"
                  >
                    <BookOpen className="w-4 h-4 mt-0.5 shrink-0 text-brand" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold text-ink">{GUIDES[k].title}</span>
                      <span className="block text-xs text-ink-soft">{GUIDES[k].desc}</span>
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 mt-1 shrink-0 text-ink-soft" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </Section>
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

/** Kartu section: hanya untuk kelompok isi yang berdiri sendiri (identitas, sandi). */
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
