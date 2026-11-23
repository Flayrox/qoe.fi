import { defineConfig } from 'vitest/config';

// Plancher de couverture du paquet (même politique que @qoe/formatters) :
// mesures du 2026-11-19 au niveau atteint moins un point. Une baisse doit
// s'accompagner de nouveaux tests, jamais d'un seuil abaissé.
// `provider.tsx` est hors périmètre : c'est un wrapper React mince (aucun test
// jsdom dans ce paquet), toute sa logique vit dans `core.ts` et `cookie.ts`,
// couverts à 100 %/97 %.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // 🕐 Budget par test : `i18n-hardening` charge le catalogue serveur par
    // `await import()`, ce qui dépassait 5 s quand les 25 paquets tournaient en
    // parallèle (dette R313). Les assertions ne dépendent d'aucune durée.
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/**/__tests__/**', 'src/**/*.d.ts'],
      thresholds: {
        statements: 94,
        branches: 79,
        functions: 100,
        lines: 94,
      },
    },
  },
});
