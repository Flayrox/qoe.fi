// =====================================================================
// 📊 vitest.coverage.config.ts — couverture TypeScript agrégée.
// =====================================================================
// Mesure la couverture des packages critiques (api-client, auth, utils,
// flags) en un seul run, depuis la racine : @vitest/coverage-v8 est
// installé ici et résolu de manière garantie. Seuils progressifs — une
// baisse DOIT s'accompagner de nouveaux tests, pas d'un seuil abaissé.
// =====================================================================

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/sdk/src/**/*.test.ts',
      'packages/auth/src/**/*.test.ts',
      'packages/utils/src/**/*.test.ts',
      'packages/flags/src/**/*.test.ts',
    ],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage/ts',
      include: ['packages/{sdk,auth,utils,flags}/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts'],
      // Seuils progressifs par package, mesurés au moment de l'introduction
      // du gate (2026-08). Une baisse DOIT s'accompagner de nouveaux tests,
      // pas d'un seuil abaissé. Objectif final : 80% sur le code métier.
      thresholds: {
        'packages/sdk/**': { lines: 20, statements: 19 },
        'packages/auth/**': { lines: 15, statements: 14 },
        'packages/utils/**': { lines: 44, statements: 41 },
        'packages/flags/**': { lines: 65, statements: 65 },
      },
    },
  },
});
