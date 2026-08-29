// =====================================================================
// 📊 vitest.coverage.config.ts — couverture TypeScript agrégée.
// =====================================================================
// Mesure la couverture des packages critiques (api-client, auth, utils,
// flags) en un seul run, depuis la racine : @vitest/coverage-v8 est
// installé ici et résolu de manière garantie. Seuils progressifs — une
// baisse DOIT s'accompagner de nouveaux tests, pas d'un seuil abaissé.
// =====================================================================

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    // Un seul React partout : sans cet alias, le hook testé importe le react
    // local du sdk pendant que @testing-library/react utilise celui de la
    // racine — deux instances => dispatcher null.
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'packages/sdk/src/**/*.test.{ts,tsx}',
      'packages/auth/src/**/*.test.{ts,tsx}',
      'packages/utils/src/**/*.test.{ts,tsx}',
      'packages/flags/src/**/*.test.{ts,tsx}',
      'apps/core/src/**/*.test.{ts,tsx}',
      'apps/mobile/src/**/*.test.{ts,tsx}',
    ],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage/ts',
      include: [
        'packages/{sdk,auth,utils,flags}/src/**/*.ts',
        'apps/core/src/**/*.ts',
        'apps/mobile/src/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts'],
      // Seuils progressifs par package, mesurés au moment de l'introduction
      // du gate (2026-08). Une baisse DOIT s'accompagner de nouveaux tests,
      // pas d'un seuil abaissé. Objectif final : 80% sur le code métier.
      thresholds: {
        'packages/sdk/**': { lines: 23, statements: 22 },
        'packages/auth/**': { lines: 15, statements: 14 },
        'packages/utils/**': { lines: 44, statements: 41 },
        'packages/flags/**': { lines: 65, statements: 65 },
        // Logic pure des apps front (core) et mobile — gate mesuré séparément
        // car les .ts UI/route/edge sont du glom persistant (pas de test unitaire
        // rentable). Seuils au départ bas (2026-08), objectif 80% sur ce périmètre.
        'apps/core/src/lib/{utils,feed-types,analytics}.ts': { lines: 80, statements: 78 },
        'apps/core/src/lib/supabase/server.ts': { lines: 80, statements: 78 },
        'apps/mobile/src/lib/format.ts': { lines: 95, statements: 95 },
        'apps/mobile/src/components/thought/normalize.ts': { lines: 80, statements: 78 },
        'apps/mobile/src/features/compose/drafts.ts': { lines: 80, statements: 78 },
      },
    },
  },
});
