/**
 * Fungsi database (RPC) belum ada — migrasinya belum diterapkan di database ini. Server Action yang
 * memakai fungsi baru WAJIB jatuh ke cara lama bila ini true, agar urutan rilis (kode dulu, migrasi
 * kemudian) tak mematahkan production.
 */
export const rpcMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message ?? ''));
