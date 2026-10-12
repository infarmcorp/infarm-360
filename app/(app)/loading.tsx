/**
 * Fallback Suspense untuk semua route di shell `(app)`. Muncul SEKETIKA saat menu
 * diklik (sidebar tetap, hanya area konten yang skeleton), jadi navigasi tak terasa
 * "beku" selama server menyiapkan data. Diganti otomatis begitu halaman siap.
 *
 * Bentuknya meniru halaman ber-token (kanvas `bg-bg`, judul langsung di kanvas, kartu &
 * panel datar ber-border) agar perpindahan ke halaman asli tak "melompat".
 */
export default function Loading() {
  return (
    <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6 animate-pulse motion-reduce:animate-none" aria-busy="true">
      {/* Judul + deskripsi */}
      <div className="h-6 w-56 bg-line-strong/55 rounded mb-2" />
      <div className="h-3.5 w-80 max-w-full bg-neutral-tint rounded mb-6" />

      {/* Baris kartu statistik */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-surface border border-line rounded-panel" />
        ))}
      </div>

      {/* Baris kontrol/filter */}
      <div className="flex gap-2 mb-5">
        <div className="h-9 flex-1 bg-surface border border-line rounded-control" />
        <div className="h-9 w-28 bg-surface border border-line rounded-control" />
        <div className="h-9 w-28 bg-surface border border-line rounded-control" />
      </div>

      {/* Panel tabel */}
      <div className="bg-surface border border-line rounded-panel">
        <div className="h-10 border-b border-line flex items-center px-5">
          <div className="h-2.5 w-32 bg-neutral-tint rounded" />
        </div>
        <div className="p-5 space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 bg-neutral-tint rounded" />
          ))}
        </div>
      </div>
    </main>
  );
}
