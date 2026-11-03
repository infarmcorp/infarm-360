import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// Konfigurasi ESLint (flat config, template resmi Next 16). `next lint` sudah dihapus di Next 16 —
// jalankan lewat `npm run lint` (= `eslint .`). Belum dipasang di CI (keputusan gelombang 2b).
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Konvensi: parameter/variabel berawalan `_` = sengaja tak dipakai (mis. tanda tangan fungsi tiruan di tes).
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  globalIgnores([
    '.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts',
    // Folder lokal yang di-gitignore (backup & berkas kerja) — bukan kode aplikasi.
    'backups/**', 'files (1)/**',
  ]),
]);
