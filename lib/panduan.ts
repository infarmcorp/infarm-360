/**
 * Tautan Panduan Pengguna (Notion "Infarm Performance Appraisal — Docs" › Panduan Pengguna) untuk kartu
 * "Panduan Saya" di Akun Saya.
 *
 * Ditentukan dari izin TERKINI setiap kali halaman dibuka (sama seperti menu sidebar) — tak disimpan per
 * orang. Jadi pegawai yang diberi izin Koordinator langsung melihat 2C, dan kembali ke 2A begitu izinnya
 * dicabut, tanpa data yang perlu diubah.
 *
 * Tiap panduan peran berdiri sendiri (sudah mencakup tugas sebagai penilai 360° & laporan/rencana sendiri),
 * jadi cukup SATU panduan utama per orang. Pengecualian (keputusan pemilik 2026-11-12):
 *  - SPV yang memegang izin HRD Admin → 2D + 2B (bagian Mode SPV di 2D hanya ringkas).
 *  - Pemegang akses halaman dari HRD / HRD terbatas → + 2F.
 *
 * URL = halaman Notion; agar terbuka bagi pegawai tanpa akun Notion, halaman "Panduan Pengguna" harus
 * dibagikan ke web (Share → Publish). Halaman induk "Docs" JANGAN dibagikan (berisi catatan internal).
 */
import { canAdmin, canCoordinate, isFullHrd, type ActorRow } from '@/lib/auth/roles';

export type GuideKey = '2A' | '2B' | '2C' | '2D' | '2E' | '2F';

export const GUIDES: Record<GuideKey, { title: string; desc: string; url: string }> = {
  '2A': { title: 'Panduan Pegawai', desc: 'Menilai rekan, membaca laporan, dan mengisi Rencana Pengembangan.', url: 'https://www.notion.so/3eb357aaede581d89775d6dbb7e1ec12' },
  '2B': { title: 'Panduan SPV (Supervisor)', desc: 'Input KPI tim, ACC laporan anggota, Monitor, dan rencana tim — termasuk tugas Anda sebagai penilai.', url: 'https://www.notion.so/3eb357aaede58135a201e6604b9c0d91' },
  '2C': { title: 'Panduan Koordinator', desc: 'KPI, ACC, dan rencana pegawai binaan — termasuk tugas Anda sebagai penilai.', url: 'https://www.notion.so/3eb357aaede581b6bef5d8bd18d1d14a' },
  '2D': { title: 'Panduan HRD Admin', desc: 'Siklus penilaian dari persiapan sampai laporan Final, serta tugas di Mode SPV/Pegawai.', url: 'https://www.notion.so/3eb357aaede58157a483ebf9ce2f914d' },
  '2E': { title: 'Panduan Direksi', desc: 'Dashboard, ACC laporan SPV, Promosi & Suksesi — termasuk tugas Anda sebagai penilai.', url: 'https://www.notion.so/3eb357aaede581c091b3dedaeaa891e1' },
  '2F': { title: 'Akses Khusus dari HRD', desc: 'Apa yang bisa dilakukan dengan akses halaman atau izin HRD terbatas yang Anda terima.', url: 'https://www.notion.so/3eb357aaede58130a96cfc66d9c1536e' },
};

/**
 * Panduan yang relevan untuk satu orang, urut tampil. `hasPageGrants` = punya baris `page_grants`.
 * Izin HRD terbatas (`hrd_sections` terisi) juga dijelaskan di 2F.
 */
export function guidesFor(m: ActorRow | null | undefined, hasPageGrants: boolean): GuideKey[] {
  const role = m?.role ?? 'employee';
  const out: GuideKey[] = [];
  if (canAdmin(m)) {
    out.push('2D');
    if (role === 'spv') out.push('2B');
  } else if (role === 'spv') out.push('2B');
  else if (role === 'direksi') out.push('2E');
  // Koordinator hanya berlaku untuk posisi Pegawai (sama dengan gerbang menu Koordinator).
  if (role === 'employee' && canCoordinate(m)) out.push('2C');
  else if (role === 'employee' && !canAdmin(m)) out.push('2A');
  const hrdLimited = canAdmin(m) && !isFullHrd(m);
  if (hasPageGrants || hrdLimited) out.push('2F');
  return out;
}
