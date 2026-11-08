import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Env de test minimal (les mêmes fallbacks que vitest.workspace.ts à la racine),
// appliqué en local quand on run `vitest run` depuis ce package.
process.env.SKIP_ENV_VALIDATION = 'true';
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_anon_key';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Apps/core est du Node/Next (server actions, serveur) : les tests purs
    // logique tournent en `node`. Les tests de composants déclarent
    // `// @vitest-environment jsdom` en tête de fichier.
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/.reference/**', '**/node_modules/**', '**/.next/**', '**/e2e/**'],
  },
});
