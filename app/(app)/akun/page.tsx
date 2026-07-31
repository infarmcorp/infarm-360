import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AkunForm } from './akun-form';
import { PanduanCard } from './panduan-card';
import { panduanFor, panduanHref, PANDUAN_VERSION, PANDUAN_UPDATED_LABEL, PANDUAN_WHATS_NEW } from '@/lib/panduan';

const ROLE_LABEL: Record<string, string> = {
  employee: 'Pegawai Operasional', spv: 'Supervisor (SPV)', hrd: 'HRD Admin', direksi: 'Direktur',
};

/** Akun Saya — info akun + ganti sandi mandiri (semua peran). */
export default async function AkunPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees')
    .select('name, dept, role, emp_code, is_hrd_admin').eq('id', user.id).maybeSingle();
  const panduan = panduanFor(me?.role, me?.is_hrd_admin ?? false);

  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="max-w-lg mx-auto bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">Akun Saya</h1>
          <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
        </div>
        <p className="text-sm text-gray-500 mt-1">Informasi akun &amp; ganti sandi Anda.</p>

        <dl className="mt-4 space-y-1.5 text-xs">
          <Row label="Nama" value={me?.name ?? '—'} />
          <Row label="Email (login)" value={user.email ?? '—'} mono />
          <Row label="Divisi" value={me?.dept ?? '—'} />
          <Row label="Peran" value={ROLE_LABEL[me?.role ?? ''] ?? (me?.role ?? '—')} />
          <Row label="Kode Pegawai" value={me?.emp_code ?? '—'} mono />
        </dl>

        <div className="mt-5 border-t border-gray-100 pt-4">
          <h2 className="text-sm font-bold text-gray-700 mb-2">Ganti Sandi</h2>
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
            Jika akun Anda masih memakai <strong>sandi awal bersama</strong>, segera ganti dengan
            sandi pribadi yang hanya Anda ketahui — demi menjaga integritas penilaian 360°.
          </p>
          <AkunForm />
        </div>

        <PanduanCard
          href={panduanHref(panduan)} label={panduan.label} filename={panduan.filename}
          version={PANDUAN_VERSION} updatedLabel={PANDUAN_UPDATED_LABEL} whatsNew={PANDUAN_WHATS_NEW} />
      </div>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-gray-500 font-semibold uppercase tracking-wide text-[10px] pt-0.5">{label}</dt>
      <dd className={`text-gray-700 ${mono ? 'font-mono' : 'font-semibold'}`}>{value}</dd>
    </div>
  );
}
