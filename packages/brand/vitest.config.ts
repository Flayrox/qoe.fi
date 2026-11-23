import { defineConfig } from 'vitest/config';
import { packageWorkers } from '../../vitest.shared';

export default defineConfig({
  test: {
    maxWorkers: packageWorkers(),
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
