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
    <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">
      <div className="max-w-lg mx-auto bg-surface border border-line rounded-panel p-5">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Akun Saya</h1>
          <Link href="/" className="text-xs text-ink-faint hover:text-ink-soft">← Beranda</Link>
        </div>
        <p className="text-[13.5px] text-ink-soft mt-1">Informasi akun &amp; ganti sandi Anda.</p>

        <dl className="mt-4 space-y-1.5 text-xs">
          <Row label="Nama" value={me?.name ?? '—'} />
          <Row label="Email (login)" value={user.email ?? '—'} mono />
          <Row label="Divisi" value={me?.dept ?? '—'} />
          <Row label="Peran" value={ROLE_LABEL[me?.role ?? ''] ?? (me?.role ?? '—')} />
          <Row label="Kode Pegawai" value={me?.emp_code ?? '—'} mono />
        </dl>

        <div className="mt-5 border-t border-line-soft pt-4">
          <h2 className="text-sm font-bold text-ink mb-2">Ganti Sandi</h2>
          <p className="text-[11px] text-warn-ink bg-warn-tint border border-warn-ink/25 rounded-control p-2 mb-3">
            Jika akun Anda masih memakai <strong>sandi awal bersama</strong>, segera ganti dengan
            sandi pribadi yang hanya Anda ketahui — demi menjaga integritas penilaian 360°.
          </p>
          <AkunForm />
        </div>

        <PanduanCard
          href={panduanHref(panduan)} label={panduan.label} filename={panduan.filename}
          version={PANDUAN_VERSION} updatedLabel={PANDUAN_UPDATED_LABEL} />
      </div>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-ink-faint font-semibold uppercase tracking-wide text-[10px] pt-0.5">{label}</dt>
      <dd className={`text-ink-soft ${mono ? 'data-value' : 'font-semibold'}`}>{value}</dd>
    </div>
  );
}
