/**
 * Fallback Suspense untuk semua route di shell `(app)`. Muncul SEKETIKA saat menu
 * diklik (sidebar tetap, hanya area konten yang skeleton), jadi navigasi tak terasa
 * "beku" selama server menyiapkan data. Diganti otomatis begitu halaman siap.
 */
export default function Loading() {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm animate-pulse">
        {/* Judul */}
        <div className="h-6 w-56 bg-gray-200 rounded mb-2" />
        <div className="h-3.5 w-80 max-w-full bg-gray-100 rounded mb-6" />

        {/* Baris kartu statistik */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl" />
          ))}
        </div>

        {/* Baris kontrol/filter */}
        <div className="flex gap-2 mb-5">
          <div className="h-9 flex-1 bg-gray-100 rounded-lg" />
          <div className="h-9 w-28 bg-gray-100 rounded-lg" />
          <div className="h-9 w-28 bg-gray-100 rounded-lg" />
        </div>

        {/* Baris tabel */}
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    </main>
  );
}
