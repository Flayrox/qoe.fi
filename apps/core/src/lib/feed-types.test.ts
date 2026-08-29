import { describe, it, expect } from 'vitest';
import { formatPollData, type FeedPoll } from './feed-types';

function poll(overrides: Partial<FeedPoll> = {}): FeedPoll {
  return {
    id: 'poll_1',
    thoughtId: 'thought_1',
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    options: [
      { id: 'opt_a', text: 'A', order: 0, _count: { votes: 60 } },
      { id: 'opt_b', text: 'B', order: 1, _count: { votes: 40 } },
    ],
    votes: [{ optionId: 'opt_a', userId: 'user_1' }],
    ...overrides,
  };
}

describe('formatPollData', () => {
  it('return null sur un poll absent', () => {
    expect(formatPollData(null)).toBeNull();
    expect(formatPollData(undefined)).toBeNull();
  });

  it('sans options : totalVotes = 0 et options vides', () => {
    const out = formatPollData({ id: 'p', thoughtId: 't', expiresAt: new Date().toISOString() });
    expect(out?.totalVotes).toBe(0);
    expect(out?.options).toEqual([]);
  });

  it('calcule les pourcentages arrondis depuis _count.votes', () => {
    const out = formatPollData(poll());
    expect(out?.totalVotes).toBe(100);
    expect(out?.options[0]).toMatchObject({ id: 'opt_a', voteCount: 60, percentage: 60 });
    expect(out?.options[1]).toMatchObject({ id: 'opt_b', voteCount: 40, percentage: 40 });
  });

  it('détecte le vote de l’utilisateur courant', () => {
    const out = formatPollData(poll(), 'user_1');
    expect(out?.userVotedOptionId).toBe('opt_a');
    // Vote d'un autre utilisateur → null.
    expect(formatPollData(poll(), 'someone_else')?.userVotedOptionId).toBeNull();
    expect(formatPollData(poll(), null)?.userVotedOptionId).toBeNull();
  });

  it('marque isExpired lorsque la date est passée', () => {
    const expired = formatPollData(
      poll({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
      null
    );
    expect(expired?.isExpired).toBe(true);
    const fresh = formatPollData(
      poll({ expiresAt: new Date(Date.now() + 86_400_000).toISOString() }),
      null
    );
    expect(fresh?.isExpired).toBe(false);
  });

  it('gère un totalVotes à zéro (percentage 0, pas de division par zéro)', () => {
    const out = formatPollData(
      poll({ options: [{ id: 'opt_a', text: 'A', order: 0, _count: { votes: 0 } }] }),
      null
    );
    expect(out?.totalVotes).toBe(0);
    expect(out?.options[0].percentage).toBe(0);
  });
});
