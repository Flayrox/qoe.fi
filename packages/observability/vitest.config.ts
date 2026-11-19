import { defineConfig } from 'vitest/config';

// Plancher de couverture (politique des autres lots : niveau mesuré au
// 2026-11-19 moins un point). Périmètre : le barrel `index.ts` est exclu
// (aucune logique).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/e2e/**'],
    // ⚠️ Pas de `restoreMocks` : les suites historiques posent leurs espions
    // console au niveau du module, une restauration automatique les rendrait
    // inopérants (les logs partiraient réellement dans la sortie de test).
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/server.ts', 'src/__tests__/**'],
      thresholds: {
        statements: 90,
        branches: 86,
        functions: 82,
        lines: 92,
      },
    },
  },
});
