import Link from 'next/link';

/**
 * Panel "Kesiapan Peluncuran 360°" — penuntun setup untuk periode AKTIF.
 * Murni informatif (read-only): menampilkan apakah prasyarat peluncuran 360° sudah
 * lengkap (pertanyaan, pemetaan, bobot) + status form, sehingga HRD tahu HARUS menekan
 * "Aktifkan 360°" sebagai langkah terpisah dari "Aktivasi periode". Tak menyentuh skor.
 */
export function ReadinessPanel({
  periodLabel, indCount, mapCount, hasWeights, has360,
}: {
  periodLabel: string;
  indCount: number;   // indikator (pertanyaan) AKTIF di periode
  mapCount: number;   // pemetaan penilai→target AKTIF
  hasWeights: boolean; // skema bobot tersimpan
  has360: boolean;     // form 360° sudah dibuka ke pegawai?
}) {
  const ready = indCount > 0 && mapCount > 0;

  const Row = ({ ok, label, value, href, hint }: {
    ok: boolean; label: string; value: string; href?: string; hint?: string;
  }) => (
    <li className="flex items-center gap-2">
      <span aria-hidden className={ok ? 'text-emerald-600' : 'text-rose-500'}>{ok ? '✓' : '✗'}</span>
      <span className="font-semibold text-gray-700">{label}:</span>
      <span className={`font-mono ${ok ? 'text-gray-700' : 'text-rose-600'}`}>{value}</span>
      {hint && <span className="text-[10px] text-gray-500">{hint}</span>}
      {href && !ok && (
        <Link href={href} className="text-[10px] font-bold text-emerald-700 hover:underline ml-auto">Lengkapi →</Link>
      )}
    </li>
  );

  return (
    <div className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-bold text-indigo-900">Kesiapan Peluncuran 360° — {periodLabel}</h2>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
          has360 ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
            : ready ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
            : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
          {has360 ? 'Form 360° TERBUKA' : ready ? 'Siap diluncurkan' : 'Belum lengkap'}
        </span>
      </div>

      <ul className="space-y-1 text-xs">
        <Row ok={indCount > 0} label="Pertanyaan (indikator aktif)" value={`${indCount}`}
          href="/admin/pertanyaan" hint="dari Kelola Pertanyaan" />
        <Row ok={mapCount > 0} label="Pemetaan penilai→target" value={`${mapCount} pasangan`}
          href="/admin/pemetaan" hint="dari Pemetaan" />
        <Row ok={hasWeights} label="Bobot penilai" value={hasWeights ? 'tersimpan' : 'pakai default'}
          href="/admin/bobot" hint={hasWeights ? '' : 'opsional — default berlaku bila tak diatur'} />
      </ul>

      <p className="mt-3 text-[11px] text-indigo-900/90 leading-relaxed">
        {has360 ? (
          <>Form 360° <strong>sudah terbuka</strong> untuk pegawai berpemetaan. Untuk menutup sementara
            (mis. revisi pertanyaan), pakai <strong>Set Tanpa 360°</strong> di baris periode.</>
        ) : ready ? (
          <>Prasyarat lengkap. Tekan <strong>Aktifkan 360°</strong> di baris periode untuk
            <strong> meluncurkan form serentak</strong> ke semua pegawai berpemetaan.</>
        ) : (
          <>Lengkapi pertanyaan &amp; pemetaan dulu (form 360° masih tertutup), baru tekan
            <strong> Aktifkan 360°</strong> untuk meluncurkan.</>
        )}
      </p>

      {/* Legenda: bedakan DUA saklar yang sering tertukar. */}
      <div className="mt-3 grid sm:grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-lg border border-indigo-200 bg-white/70 p-2">
          <span className="font-bold text-indigo-800">Aktivasi / Kunci &amp; Akhiri</span>
          <p className="text-gray-600 mt-0.5">Hidup-mati <strong>seluruh periode</strong> (KPI <em>dan</em> 360°). Awal &amp; akhir siklus.</p>
        </div>
        <div className="rounded-lg border border-indigo-200 bg-white/70 p-2">
          <span className="font-bold text-indigo-800">Aktifkan 360° / Set Tanpa 360°</span>
          <p className="text-gray-600 mt-0.5">Buka-tutup <strong>bagian 360° saja</strong> (form + skor). Di tengah persiapan/berjalan.</p>
        </div>
      </div>
    </div>
  );
}
