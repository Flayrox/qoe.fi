import { defineConfig } from 'vitest/config';
import { packageWorkers } from '../../vitest.shared';

// ⏱️ Plafond de workers : voir `vitest.shared.ts` (R313, clos en L39). Aucun
// autre réglage ici — les valeurs par défaut de Vitest restent celles du paquet.
export default defineConfig({
  test: {
    maxWorkers: packageWorkers(),
  },
});
