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
    // 📊 Mesuré le 2026-11-14 (docs/TEST-BUNKER-PLAN.md, étape B19) : 29 fichiers
    // / 151 tests, 9,31 % lignes. `vendor/` et `src/app/dev` exclus. Ratchet.
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
      thresholds: { lines: 9, statements: 9, functions: 9, branches: 9 },
    },
  },
});
