'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { logHrdAction } from '@/lib/audit/log';
import { aiSummaryEnabled, listGeminiModels } from '@/lib/ai/gemini';
import { MODEL_ID_RE, PROMPT_MAX_LEN, loadAiSettings, tableMissing } from '@/lib/ai/settings';

/**
 * Simpan Pengaturan AI (migrasi 0060) — SATU pengaturan untuk semua "Ringkas otomatis".
 * Hanya HRD Mode Admin berbagian Review & Finalisasi, dan hanya saat fitur aktif (dev/staging).
 * Tulis via service_role (tabel tanpa policy). "Prompt versi" naik HANYA bila teks prompt berubah — model
 * sudah tampil terpisah di layar & log, jadi ganti model tak boleh terbaca sebagai "prompt diubah".
 * Model WAJIB ada di daftar model Google untuk kunci ini (listGeminiModels) — daftar gagal dimuat = tolak.
 */
const Input = z.object({
  model: z.string().trim().regex(MODEL_ID_RE, 'Pilih model dari daftar'),
  priceIn: z.number().finite().min(0).max(1000),
  priceOut: z.number().finite().min(0).max(1000),
  usdIdr: z.number().finite().min(1000).max(100000),
  aspectPrompt: z.string().trim().min(20, 'Prompt aspek minimal 20 karakter').max(PROMPT_MAX_LEN),
  qualPrompt: z.string().trim().min(20, 'Prompt kualitatif minimal 20 karakter').max(PROMPT_MAX_LEN),
});

export async function saveAiSettings(raw: unknown): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  if (!aiSummaryEnabled()) return { ok: false, error: 'Ringkas otomatis tidak aktif di lingkungan ini.' };
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Pengaturan tidak valid' };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections, name').eq('id', user.id).maybeSingle();
  const hrdMode = (await cookies()).get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  if (!(canSection(me, 'laporan') && hrdMode === 'admin')) {
    return { ok: false, error: 'Hanya HRD (Mode Admin) dengan akses Review & Finalisasi yang dapat mengubah Pengaturan AI.' };
  }

  const list = await listGeminiModels();
  if (!list.ok) return { ok: false, error: list.error };
  if (!list.models.some((m) => m.id === v.model)) return { ok: false, error: 'Model tidak tersedia untuk kunci API ini — pilih dari daftar.' };

  const admin = createAdminClient();
  const cur = await loadAiSettings(admin);
  if (cur.source === 'missing') return { ok: false, error: 'Tabel pengaturan belum ada — jalankan migrasi 0060 di database ini dulu.' };
  const changed = cur.aspectPrompt !== v.aspectPrompt || cur.qualPrompt !== v.qualPrompt;
  // Simpan pertama (belum ada baris) = versi 1 walau prompt sama dengan bawaan.
  const version = cur.source !== 'db' ? Math.max(cur.version, 0) + 1 : changed ? cur.version + 1 : cur.version;

  const { error } = await (admin as unknown as { from: (t: string) => { upsert: (r: unknown) => PromiseLike<{ error: { code?: string; message?: string } | null }> } })
    .from('ai_settings').upsert({
      id: 1, model: v.model, price_input_usd: v.priceIn, price_output_usd: v.priceOut, usd_idr: v.usdIdr,
      aspect_prompt: v.aspectPrompt, qual_prompt: v.qualPrompt, version,
      updated_by: user.id, updated_by_name: me?.name ?? null, updated_at: new Date().toISOString(),
    });
  if (error) {
    if (tableMissing(error)) return { ok: false, error: 'Tabel pengaturan belum ada — jalankan migrasi 0060 di database ini dulu.' };
    return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  }

  await logHrdAction({
    action: 'ai.settings_save', category: 'laporan',
    summary: `Mengubah Pengaturan AI (Ringkas otomatis) — model ${v.model}, prompt versi ${version}${changed ? ' (prompt diubah)' : ''}`,
    targetType: 'ai_settings', targetId: '1', targetLabel: 'Pengaturan AI',
    meta: { model: v.model, version, price_in: v.priceIn, price_out: v.priceOut, usd_idr: v.usdIdr, prompt_changed: changed },
  });
  revalidatePath('/admin/ai');
  return { ok: true, version };
}
