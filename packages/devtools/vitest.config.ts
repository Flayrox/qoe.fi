import { defineConfig } from 'vitest/config';
import { packageWorkers } from '../../vitest.shared';

// Plancher de couverture (politique des autres lots : niveau mesuré au
// 2026-11-19 moins un point). Pas de barrel à exclure : les deux sources
// (`index.ts`, `go-client.ts`) portent de la logique réelle.
//
// `--passWithNoTests` a été retiré : il rendait la CI verte même quand aucune
// suite n'était trouvée (chemin de test mal orthographié, suite supprimée).
export default defineConfig({
  test: {
    maxWorkers: packageWorkers(),
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**'],
      thresholds: {
        statements: 89,
        branches: 58,
        functions: 94,
        lines: 91,
      },
    },
  },
});
