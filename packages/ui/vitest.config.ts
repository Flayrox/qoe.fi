import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder_anon_key',
    },
    // 📊 Mesuré le 2026-11-14 (docs/TEST-BUNKER-PLAN.md, étape A1) : 82
    // fichiers / 519 tests, 55,4 % lignes. Ce package n'était mesuré nulle
    // part : ses 82 fichiers de test ne comptaient dans aucun chiffre.
    // Seuils = mesure du jour arrondie vers le bas (ratchet : jamais baissés).
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: path.resolve(__dirname, '../../coverage/ui'),
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/**/*.stories.{ts,tsx}',
        'src/**/*.d.ts',
        'src/**/test-support/**',
      ],
      thresholds: { lines: 55, statements: 53, functions: 48, branches: 48 },
    },
  },
});
