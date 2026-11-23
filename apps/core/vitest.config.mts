import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { packageWorkers } from '../../vitest.shared.mjs';

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
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    maxWorkers: packageWorkers(),
    // Apps/core est du Node/Next (server actions, serveur) : les tests purs
    // logique tournent en `node`. Les tests de composants déclarent
    // `// @vitest-environment jsdom` en tête de fichier.
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Les rendus jsdom de fils de discussion complets dépassent 5 s sur les
    // runners CI partagés (flake observé sur
    // `thought-thread-nested-hidden-parent`), sans être lents en local.
    // Même plancher que studio et tenants : on ne touche pas aux assertions.
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/.reference/**', '**/node_modules/**', '**/.next/**', '**/e2e/**'],
  },
});
