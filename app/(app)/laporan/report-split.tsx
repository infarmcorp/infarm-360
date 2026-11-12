/**
 * Tata letak tinjau laporan dua kolom (HRD / pemegang akses Review): KIRI = dokumen laporan + editor
 * ringkasan, KANAN = komentar murni (raw feedback). Kolom kanan menempel (sticky) dengan gulir sendiri,
 * jadi HRD bisa membaca komentar sambil menulis ringkasan tanpa menggulir ke dasar halaman.
 * Layar < xl (1280px) & saat cetak: bertumpuk seperti semula (laporan dulu, lalu komentar).
 * Tanpa hook — aman dipakai dari Server Component.
 */
export function ReportSplit({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:gap-5 xl:items-start print:block">
      <div className="min-w-0">{left}</div>
      <aside className="min-w-0 mt-4 xl:mt-0 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:rounded-card [scrollbar-gutter:stable] print:static print:max-h-none print:overflow-visible print:mt-4">
        {right}
      </aside>
    </div>
  );
}
