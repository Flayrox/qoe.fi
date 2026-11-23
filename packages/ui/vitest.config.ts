import { defineConfig } from 'vitest/config';
import path from 'path';
import { packageWorkers } from '../../vitest.shared';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // ⏱️ Aucun budget relevé : le test le plus lent de ce paquet dure ~1 s
    // (mesure L39, `selection-creation-gesture`) et le parallélisme est borné
    // (`packageWorkers()` = un worker par cœur, script racine `test` à quatre
    // paquets) : le défaut de 5 s garde 5× de marge sous charge (R313).
    maxWorkers: packageWorkers(),
    setupFiles: ['./vitest.setup.ts'],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder_anon_key',
    },
    // 📊 Mesuré le 2026-11-14 (mesure du 2026-11-14, étape A1) : 82
    // fichiers / 519 tests, 55,4 % lignes. Ce package n'était mesuré nulle
    // part : ses 82 fichiers de test ne comptaient dans aucun chiffre.
    // Seuils = mesure du jour arrondie vers le bas (ratchet : jamais baissés).
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: path.resolve(import.meta.dirname, '../../coverage/ui'),
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/**/*.stories.{ts,tsx}',
        'src/**/*.d.ts',
        'src/**/test-support/**',
      ],
      // Mesuré le 2026-11-16 : 56,50 % lignes · 54,44 % statements · 49,77 %
      // fonctions · 49,49 % branches (lecteur audio flottant inclus).
      thresholds: { lines: 55, statements: 53, functions: 48, branches: 49 },
    },
  },
});
