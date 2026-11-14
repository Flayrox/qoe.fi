import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { lingui } from '@lingui/vite-plugin';
import path from 'path';

export default defineConfig({
  plugins: [react(), lingui()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/.reference/**', '**/node_modules/**', '**/.next/**', '**/e2e/**'],
    testTimeout: 20_000,
    // 🧪 Hermétique : les tests jsdom passent par la branche « client » de
    // @qoe/config/env (validation stricte). Les .env sont gitignorés donc
    // absents en CI → on fournit les valeurs minimales ici.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder_anon_key',
    },
    // 📊 Mesuré le 2026-11-14 (docs/TEST-BUNKER-PLAN.md, étape A2) : 10 fichiers
    // / 34 tests, 23,52 % lignes. Ratchet : le seuil ne baisse jamais.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: path.resolve(__dirname, '../../coverage/tenants'),
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/**/*.stories.{ts,tsx}',
        'src/**/*.d.ts',
        'src/**/test-support/**',
      ],
      thresholds: { lines: 23, statements: 22, functions: 17, branches: 24 },
    },
  },
});
