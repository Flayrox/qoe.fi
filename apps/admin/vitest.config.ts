import { defineConfig } from 'vitest/config';
import path from 'path';

// =====================================================================
// 🧪 vitest.config.ts — tests unitaires de la console superadmin.
// =====================================================================
// Périmètre volontairement étroit : la logique de données / lib pure
// (`src/lib/**`). Les composants serveur et les pages Next sont couverts par
// les e2e — ici on verrouille les contrats de données (jamais de `items`
// `null` qui ferait crasher `data.items.filter`).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/.reference/**', '**/node_modules/**', '**/.next/**', '**/e2e/**'],
  },
});
