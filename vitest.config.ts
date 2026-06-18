import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Alias '@' → root agar import '@/lib/...' resolve di tes (selaras tsconfig paths).
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
