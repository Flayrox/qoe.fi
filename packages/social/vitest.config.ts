import { defineConfig } from 'vitest/config';
import { packageWorkers } from '../../vitest.shared';

export default defineConfig({
  test: {
    maxWorkers: packageWorkers(),
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/**/__tests__/**'],
      // Plancher recalibré au niveau mesuré le 2026-11-19 (96,75/87,87/100/99,3)
      // moins un point : les anciens seuils (85/80/85/85) laissaient 11 points
      // de marge, donc une régression de la moitié du paquet passait.
      thresholds: {
        statements: 95,
        branches: 86,
        functions: 99,
        lines: 98,
      },
    },
  },
});
