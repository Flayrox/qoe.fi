import { defineConfig } from 'vitest/config';
import { packageWorkers } from '../../vitest.shared.mjs';

// Plancher de couverture (politique des autres lots : niveau mesuré au
// 2026-11-19 moins un point).
// Périmètre : les modules de logique (`events`, `referrers`, `reading`,
// `server`). Les modules React (`client.tsx`, hooks) sont hors mesure faute
// d'infrastructure de test DOM dans ce paquet — dette R75 : ils ne sont
// couverts par aucune suite, y compris avant ce lot.
export default defineConfig({
  test: {
    maxWorkers: packageWorkers(),
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/e2e/**'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/*.ts'],
      exclude: [
        'src/index.ts',
        'src/client.tsx',
        'src/useArticleReadingTracker.ts',
        'src/useFeedImpressionTracker.ts',
      ],
      thresholds: {
        statements: 93,
        branches: 90,
        functions: 100,
        lines: 92,
      },
    },
  },
});
