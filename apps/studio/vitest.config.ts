import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { lingui } from '@lingui/vite-plugin';
import path from 'path';

export default defineConfig({
  plugins: [react(), lingui()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@qoe/sdk/actions/search': path.resolve(
        __dirname,
        './src/test-support/search-action-stub.ts'
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/.reference/**', '**/node_modules/**', '**/.next/**', '**/e2e/**', '**/vendor/**'],
    testTimeout: 20_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder_anon_key',
    },
    // 📊 Mesuré le 2026-11-16 : 59 fichiers / 477 tests, 27,91 % lignes.
    // `vendor/` et `src/app/dev` exclus. Ratchet (seuil plancher : 9 %).
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: path.resolve(__dirname, '../../coverage/studio'),
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/**/*.stories.{ts,tsx}',
        'src/**/*.d.ts',
        'src/**/test-support/**',
        'src/**/vendor/**',
        'src/app/dev/**',
      ],
      // Mesuré le 2026-11-16 : 27,91 % lignes · 27,82 % statements · 26,15 %
      // fonctions · 26,66 % branches (en plus de la passe précédente : actions
      // groupées sur les articles — paramètres et transfert).
      thresholds: { lines: 26, statements: 26, functions: 25, branches: 25 },
    },
  },
});
