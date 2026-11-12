import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { Note, PageTitle } from '@/components/infarm-ui';
import { INFARM_PAGE } from '@/app/infarm-fonts';
import { aiSummaryEnabled } from '@/lib/ai/gemini';
import { loadAiSettings } from '@/lib/ai/settings';
import { ASPECT_PROMPT, QUAL_PROMPT } from '@/lib/ai/summary-prompt';
import { AiSettingsForm } from './settings-form';

/**
 * PENGATURAN AI — satu pengaturan (model, harga, kurs, prompt) untuk SEMUA "Ringkas otomatis" di laporan
 * pegawai, agar hasil seragam (keputusan pemilik 2026-11-12). EKSPERIMEN, hanya dev/staging.
 * Gerbang: HRD Mode Admin berbagian Review & Finalisasi + fitur aktif. Tidak masuk katalog grant.
 */
export default async function AiSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  const hrdMode = (await cookies()).get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';

  if (!aiSummaryEnabled()) {
    return <Shell><PageTitle title="Pengaturan AI" /><Note>Ringkas otomatis tidak aktif di lingkungan ini.</Note></Shell>;
  }
  if (!(canSection(me, 'laporan') && hrdMode === 'admin')) {
    return <Shell><PageTitle title="Pengaturan AI" /><Note>Halaman ini untuk HRD di Mode Admin dengan akses Review &amp; Finalisasi.</Note></Shell>;
  }

  const settings = await loadAiSettings(createAdminClient());

  return (
    <Shell>
      <PageTitle title="Pengaturan AI">
        Model dan prompt di sini dipakai oleh <strong>semua</strong> tombol &quot;Ringkas otomatis&quot; di laporan pegawai,
        supaya hasil antarpegawai seragam. Fitur uji coba — hanya aktif di dev.
      </PageTitle>
      {settings.source === 'missing' && (
        <div className="mb-4">
          <Note tone="warn">Tabel pengaturan belum ada di database ini (migrasi 0060). Ringkas otomatis tetap jalan dengan pengaturan bawaan, tetapi perubahan belum bisa disimpan.</Note>
        </div>
      )}
      <AiSettingsForm initial={settings} defaults={{ aspectPrompt: ASPECT_PROMPT, qualPrompt: QUAL_PROMPT }} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7`}>{children}</main>;
}
