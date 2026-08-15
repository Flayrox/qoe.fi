import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Les tests d'intégration (src/__tests__/integration) démarrent un
    // conteneur Postgres via Testcontainers puis poussent le schéma Prisma
    // dans beforeAll : sous charge parallèle (turbo + workers), ça dépasse
    // largement le hookTimeout de 10s par défaut.
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
});
