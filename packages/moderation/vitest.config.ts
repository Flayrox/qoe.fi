import { defineConfig } from 'vitest/config';

// Plancher de couverture du paquet (politique des autres lots : niveau mesuré
// au 2026-11-19 moins un point — une baisse doit amener des tests, jamais un
// seuil abaissé). Les barrels `index.ts` et le fichier de types sont exclus :
// ils ne portent aucune logique.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/**/__tests__/**', 'src/**/types.ts', 'src/**/*.d.ts'],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 100,
        lines: 92,
      },
    },
  },
});
