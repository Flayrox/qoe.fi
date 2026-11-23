import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { packageWorkers } from '../../vitest.shared.mjs';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Un seul React partout : sans cet alias, le composant testé importe le
    // React de l'app pendant que @testing-library/react utilise celui de la
    // racine — deux instances → `useContext` d'un dispatcher nul.
    alias: {
      react: path.resolve(import.meta.dirname, '../../node_modules/react'),
      'react-dom': path.resolve(import.meta.dirname, '../../node_modules/react-dom'),
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    maxWorkers: packageWorkers(),
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/.reference/**', '**/node_modules/**', '**/.next/**', '**/e2e/**'],
    // 🧪 Même herméticité que les autres apps : les .env sont gitignorés et
    // absents en CI, la validation d'env client de @qoe/config exige ces deux
    // valeurs minimales.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder_anon_key',
    },
  },
});
