// =====================================================================
// 🧪 formes d'échec des actions — le type doit dire ce qui existe
// =====================================================================
// Les actions de conformité et de bac à sable déclaraient
// `{ success:false; error: string; challengeToken?; challengeFactor? }`.
// Or rien ne produit `challengeToken`/`challengeFactor` (aucune occurrence hors
// ces déclarations), et rien ne déclare `code`/`level` — que `authzTrailers`
// ajoute pourtant à l'exécution. Le type promettait donc un parcours inexistant
// et cachait celui qui existe : impossible de lire `res.code` pour proposer la
// vérification de facteur sans caster.
//
// Ce test est de TYPAGE : il ne compile pas tant que la forme déclarée ne porte
// pas les champs réellement transportés (`pnpm typecheck` fait foi).
// =====================================================================

import { describe, expect, it } from 'vitest';
import type { executeSeedScenarioAction } from '../admin-sandbox-actions';
import type { eraseUserAction } from '../admin-compliance-actions';

type Failure<T extends (...args: never[]) => unknown> = Extract<
  Awaited<ReturnType<T>>,
  { success: false }
>;

type SeedFailure = Failure<typeof executeSeedScenarioAction>;
type EraseFailure = Failure<typeof eraseUserAction>;

describe('forme des échecs d’action', () => {
  it('porte le code et le niveau du garde', () => {
    const seed: SeedFailure['code'] = 'needs_step_up';
    const level: EraseFailure['level'] = 'N2';

    expect(seed).toBe('needs_step_up');
    expect(level).toBe('N2');
  });

  it('ne promet pas de champ que personne ne produit', () => {
    type HasChallenge<T> = 'challengeToken' extends keyof T ? true : false;
    const phantom: HasChallenge<SeedFailure> = false;

    expect(phantom).toBe(false);
  });
});
