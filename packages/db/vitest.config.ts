import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['**/.reference/**', '**/node_modules/**', '**/.next/**', '**/e2e/**'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // ⚠️ Les tests d'intégration (src/__tests__/integration) démarrent chacun un
    // conteneur Postgres Testcontainers : on force l'exécution séquentielle en
    // un seul fork pour éviter la course entre conteneurs (flakes CI locaux).
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    fileParallelism: false,
  },
});
