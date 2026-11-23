import { defineConfig } from 'vitest/config';
import { packageWorkers } from '../../vitest.shared.mjs';

export default defineConfig({
  test: {
    maxWorkers: packageWorkers(),
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/**/__tests__/**'],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
  },
});
