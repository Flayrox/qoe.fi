import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// =====================================================================
// 🧪 vitest.config.ts — tests unitaires de la console superadmin.
// =====================================================================
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@qoe/sdk': path.resolve(__dirname, '../../packages/sdk/src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder_anon_key',
    },
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/.reference/**', '**/node_modules/**', '**/.next/**', '**/e2e/**'],
    // 📊 Mesuré le 2026-11-16 : 14 fichiers / 88 tests, 10,88 % lignes.
    // Baseline honnête : la console est surtout du rendu de page, mais ses `lib/`
    // critiques doivent être vus. Ratchet (seuil plancher : 4 %).
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: path.resolve(__dirname, '../../coverage/admin'),
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/**/*.stories.{ts,tsx}',
        'src/**/*.d.ts',
        'src/**/test-support/**',
      ],
      // Mesuré le 2026-11-16 : 10,88 % lignes · 10,66 % statements · 7,94 %
      // fonctions · 9,48 % branches (grille, modération, actions auxiliaires).
      thresholds: { lines: 9, statements: 9, functions: 6, branches: 8 },
    },
  },
});
