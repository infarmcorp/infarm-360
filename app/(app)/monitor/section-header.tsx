import { SectionHeader as DsSectionHeader } from '@/components/infarm-ui';

/**
 * Judul pengelompok section untuk Monitor Kinerja — memisahkan halaman jadi zona berhierarki
 * (makro → mikro): Ringkasan → Komposisi → Arah → Rincian per Pegawai. Sejak redesign Design System
 * Infarm (2026-11-04) memakai `SectionHeader` bersama (components/infarm-ui) + jarak bawah ke isi.
 * `tone` dipertahankan agar pemanggil lama tetap valid (diabaikan — aksen selalu hijau brand).
 */
export function SectionHeader({ label, hint }: { label: string; hint?: string; tone?: string }) {
  return (
    <div className="mb-4">
      <DsSectionHeader label={label} hint={hint} />
    </div>
  );
}
