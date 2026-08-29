import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Mobile = pure-logic tests (format, i18n…) en `node`. Les composants
    // React Native nécessiteraient des mocks (react-native, expo modules) :
    // hors scope ce palier.
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/.reference/**', '**/node_modules/**', '**/.expo/**'],
  },
});
