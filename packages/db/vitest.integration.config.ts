import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/integration/**/*.test.ts'],
    exclude: ['**/.reference/**', '**/node_modules/**', '**/.next/**', '**/e2e/**'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // ⚠️ CRITIQUE : un seul fork pour que tous les fichiers partagent le même
    // conteneur Postgres sans race (chaque fork aurait son propre process mais
    // le conteneur est unique — les stop() simultanés casseraient l'autre).
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    fileParallelism: false,
  },
});
