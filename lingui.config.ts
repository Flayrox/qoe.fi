import { defineConfig } from '@lingui/cli';
import { formatter } from '@lingui/format-po';

export default defineConfig({
  sourceLocale: 'fr',
  locales: ['fr', 'en'],
  catalogs: [
    {
      path: '<rootDir>/messages/{locale}',
      include: ['<rootDir>/apps', '<rootDir>/packages'],
      exclude: [
        '**/node_modules/**',
        '**/.next/**',
        '**/dist/**',
        '**/*.test.*',
        '**/__tests__/**',
      ],
    },
  ],
  format: formatter({ origins: false }),
});
