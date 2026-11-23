// =====================================================================
// ⏱️ Budget d'exécution des suites — une seule source, bornée par la machine
// =====================================================================
// 📖 R313 : les suites jsdom expiraient quand toute la machine était saturée,
//    parce que chaque paquet laissait Vitest ouvrir `cœurs − 1` workers et que
//    `turbo` lançait jusqu'à 25 paquets à la fois : des centaines de processus
//    jsdom sur 8 cœurs. Le remède n'est pas un délai plus long, c'est un
//    **plafond explicite** : au plus `TURBO_TEST_CONCURRENCY` paquets en
//    parallèle, chacun avec `floor(cœurs / TURBO_TEST_CONCURRENCY)` workers —
//    soit ≈ un worker par cœur, quelle que soit la taille du dépôt.
//
// 🔁 Les deux nombres sont dérivés de la machine, jamais figés : un runner CI à
//    4 cœurs obtient 1 worker par paquet, un poste à 16 cœurs en obtient 4.
//
// ⚠️ `turbo` doit utilisER la même concurrence : c'est ce que fait le script
//    racine `test` (`turbo run test --concurrency=<TURBO_TEST_CONCURRENCY>`).
// =====================================================================

import { availableParallelism } from 'node:os';

/** Paquets lancés en parallèle par `turbo run test` (script racine `test`). */
export const TURBO_TEST_CONCURRENCY = 4;

/** Workers Vitest par paquet : la part de cœurs qui lui revient. */
export function packageWorkers(): number {
  return Math.max(1, Math.floor(availableParallelism() / TURBO_TEST_CONCURRENCY));
}

/**
 * Workers du run de couverture agrégé (`pnpm test:coverage`) : il est seul sur
 * la machine, il peut donc prendre tous les cœurs sauf un.
 */
export function coverageWorkers(): number {
  return Math.max(1, availableParallelism() - 1);
}
