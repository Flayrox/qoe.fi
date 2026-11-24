// =====================================================================
// 🧭 Éligibilité par surface (L43) — surface validée, ordre stable, action
// =====================================================================
// 🐛 Régression couverte : une surface inconnue ne doit jamais être rabattue
//    sur un défaut (sinon un écran de debug explique la mauvaise politique),
//    et deux décisions de même score doivent garder un ordre déterministe
//    quand on fusionne des pages. L'action doit transmettre la surface et le
//    plafond de limite au bon endpoint, sans jeter `why`.
// =====================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const goFetch = vi.fn();

vi.mock('../actions/utils/go-client', () => ({
  goFetch: (...args: unknown[]) => goFetch(...args),
}));

vi.mock('../actions/utils/safe-action', () => ({
  safeAction:
    (fn: (input: unknown, user: unknown) => Promise<unknown>) => async (input: unknown) => ({
      ok: true,
      data: await fn(input, { id: 'user_viewer' }),
    }),
}));

import {
  ELIGIBILITY_SURFACES,
  filterEligibleDecisions,
  parseEligibilitySurface,
  sortEligibilityDecisions,
  type EligibilityDecision,
} from '../actions/feed/eligibility';
import { getSurfaceEligibilityAction } from '../actions/feed';

beforeEach(() => {
  goFetch.mockReset();
});

function decision(overrides: Partial<EligibilityDecision>): EligibilityDecision {
  return {
    surface: 'discover',
    postId: 'post-1',
    eligible: true,
    reason: 'eligible',
    why: 'Sélectionné pour la découverte.',
    score: 0.5,
    ...overrides,
  };
}

describe('parseEligibilitySurface', () => {
  it('accepte toutes les surfaces servies, casse et espaces compris', () => {
    for (const surface of ELIGIBILITY_SURFACES) {
      expect(parseEligibilitySurface(` ${surface.toUpperCase()} `)).toBe(surface);
    }
  });

  it('refuse une surface inconnue au lieu de la rabattre sur un défaut', () => {
    for (const raw of ['', 'home', 'feed', 'explore']) {
      expect(parseEligibilitySurface(raw)).toBeNull();
    }
  });
});

describe('sortEligibilityDecisions', () => {
  it('classe par score décroissant et tranche les égalités par postId', () => {
    const sorted = sortEligibilityDecisions([
      decision({ postId: 'post-a', score: 0.5 }),
      decision({ postId: 'post-c', score: 0.9 }),
      decision({ postId: 'post-b', score: 0.5 }),
    ]);

    expect(sorted.map((d) => d.postId)).toEqual(['post-c', 'post-b', 'post-a']);
  });

  it('ne mute pas l’entrée et reste stable sur deux appels identiques', () => {
    const input = [
      decision({ postId: 'post-a', score: 0.2 }),
      decision({ postId: 'post-b', score: 0.2 }),
    ];
    const first = sortEligibilityDecisions(input);
    const second = sortEligibilityDecisions(input);

    expect(input.map((d) => d.postId)).toEqual(['post-a', 'post-b']);
    expect(second.map((d) => d.postId)).toEqual(first.map((d) => d.postId));
  });
});

describe('filterEligibleDecisions', () => {
  it('sépare les retenus des exclus sans toucher aux raisons', () => {
    const kept = decision({ postId: 'visible', score: 0.4 });
    const hidden = decision({
      postId: 'moderated',
      eligible: false,
      reason: 'moderated',
      why: 'Masqué par la modération.',
      score: 0.9,
    });

    const eligible = filterEligibleDecisions([kept, hidden]);

    expect(eligible.map((d) => d.postId)).toEqual(['visible']);
    expect(hidden.why).toBe('Masqué par la modération.');
  });
});

describe('getSurfaceEligibilityAction', () => {
  it('interroge l’endpoint avec la surface et une limite plafonnée, sans jeter why', async () => {
    goFetch.mockResolvedValueOnce({
      surface: 'thread',
      weights: { fresh: 0.35, engagement: 0.65, affinity: 0, minScore: 0, maxAgeDays: 7 },
      items: [decision({ surface: 'thread', postId: 'post-1' })],
      excluded: [
        decision({
          surface: 'thread',
          postId: 'post-2',
          eligible: false,
          reason: 'blocked',
          why: 'Compte bloqué : contenu masqué.',
          score: 0,
        }),
      ],
    });

    const res = await getSurfaceEligibilityAction({ surface: 'thread', limit: 500 });

    expect(goFetch).toHaveBeenCalledWith('/v1/feed/eligibility?surface=thread&limit=100');
    if (!res.ok) throw new Error('action en échec');
    expect(res.data.excluded[0].why).toBe('Compte bloqué : contenu masqué.');
    expect(res.data.weights.engagement).toBe(0.65);
  });
});
