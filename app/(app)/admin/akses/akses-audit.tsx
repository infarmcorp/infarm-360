/**
 * Audit Akses (status) — tabel rincian: pegawai mana memegang akses/grant apa saja (di luar default
 * peran). TERPISAH dari Log Aktivitas HRD (yang mencatat riwayat aksi); ini snapshot "siapa punya apa
 * SEKARANG" dihitung dari data. Read-only, server component.
 */
export type AuditRow = {
  id: string;
  name: string;
  dept: string;
  role: string;
  access: { label: string; tone: 'indigo' | 'sky' | 'amber' | 'emerald' }[];
};

const ROLE_LABEL: Record<string, string> = { employee: 'Pegawai', spv: 'SPV', hrd: 'HRD', direksi: 'Direksi' };
const TONE: Record<string, string> = {
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export function AksesAudit({ rows }: { rows: AuditRow[] }) {
  return (
    <section className="mt-8 pt-6 border-t border-gray-200">
      <h2 className="text-base font-bold text-gray-800">Audit Akses</h2>
      <p className="text-sm text-gray-500 max-w-3xl">
        Rincian pegawai yang memegang akses/izin di luar akses bawaan perannya — status saat ini
        (dihitung dari data). Terpisah dari <span className="font-semibold text-gray-600">Log Aktivitas HRD</span>{' '}
        yang mencatat riwayat perubahan.
      </p>

      <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 font-semibold">Pegawai</th>
              <th className="px-3 py-2 font-semibold">Divisi</th>
              <th className="px-3 py-2 font-semibold">Peran</th>
              <th className="px-3 py-2 font-semibold">Akses yang Dimiliki</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2 font-medium text-gray-800">{r.name}</td>
                <td className="px-3 py-2 text-gray-600">{r.dept}</td>
                <td className="px-3 py-2 text-gray-600">{ROLE_LABEL[r.role] ?? r.role}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {r.access.map((a, i) => (
                      <span key={i} className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium ${TONE[a.tone]}`}>
                        {a.label}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">Belum ada pegawai dengan akses tambahan.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">{rows.length} pegawai memegang akses tambahan.</p>
    </section>
  );
}
