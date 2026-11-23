import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // 🕐 Budget par test. Les suites de ce paquet pilotent des interactions
    // `userEvent` réelles (chaque frappe = un rendu complet) : mesuré en L38,
    // 1 à 6 s par test sur la machine de dev quand les 25 paquets compilent en
    // parallèle, d'où des expirations à 5 s sur des tests verts isolément
    // (dette R313). Le budget ne remplace aucune attente d'état : il borne
    // seulement un blocage réel, plus haut que la durée observée.
    testTimeout: 15_000,
    hookTimeout: 15_000,
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
      reportsDirectory: path.resolve(__dirname, '../../coverage/ui'),
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
