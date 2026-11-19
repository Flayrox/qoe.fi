import { describe, expect, it } from 'vitest';
import {
  extractHashtags,
  extractMentions,
  extractUrls,
  formatPollData,
  segmentText,
} from '../index';

describe('@qoe/social — sondages (L18)', () => {
  const now = new Date('2026-08-15T12:00:00Z').getTime();

  it("préserve un sondage déjà formaté par l'API Go (parité DTO posts.Poll)", () => {
    // Shape réelle de GET /v1/feed/hydrate : les compteurs et pourcentages sont
    // calculés côté Go (posts/dto.go, « miroir de formatPollData TS »).
    const goPoll = {
      id: 'poll-1',
      thoughtId: 'thought-1',
      expiresAt: '2026-08-16T12:00:00Z',
      isExpired: false,
      totalVotes: 4,
      userVotedOptionId: 'opt-1',
      options: [
        { id: 'opt-1', text: 'Option A', order: 1, voteCount: 3, percentage: 75 },
        { id: 'opt-2', text: 'Option B', order: 2, voteCount: 1, percentage: 25 },
      ],
    };

    const formatted = formatPollData(goPoll, 'user-1', now);

    expect(formatted?.totalVotes).toBe(4);
    expect(formatted?.userVotedOptionId).toBe('opt-1');
    expect(formatted?.options[0]?.voteCount).toBe(3);
    expect(formatted?.options[0]?.percentage).toBe(75);
    expect(formatted?.options[1]?.percentage).toBe(25);
  });
});

describe('@qoe/social — facets (L18)', () => {
  describe('ponctuation finale', () => {
    it("ne colle pas le point final d'une phrase au lien", () => {
      expect(segmentText('Voir https://qoe.fi/test.')).toEqual([
        { kind: 'text', value: 'Voir ' },
        { kind: 'link', value: 'https://qoe.fi/test', url: 'https://qoe.fi/test' },
        { kind: 'text', value: '.' },
      ]);
    });

    it("retire la parenthèse fermante d'un lien encadré", () => {
      expect(extractUrls('(voir https://qoe.fi/a)')).toEqual(['https://qoe.fi/a']);
    });

    it('conserve les parenthèses équilibrées du lien', () => {
      expect(extractUrls('https://fr.wikipedia.org/wiki/Qoe_(marque)')).toEqual([
        'https://fr.wikipedia.org/wiki/Qoe_(marque)',
      ]);
    });

    it("n'inclut pas la ponctuation finale dans un handle", () => {
      expect(extractMentions('Salut @alice. Et @bob, ca va ?')).toEqual(['alice', 'bob']);
      expect(segmentText('Salut @alice.')).toEqual([
        { kind: 'text', value: 'Salut ' },
        { kind: 'mention', value: '@alice', handle: 'alice' },
        { kind: 'text', value: '.' },
      ]);
    });

    it("n'inclut pas le tiret final dans un hashtag", () => {
      expect(extractHashtags('Sujet #tech- puis #ai')).toEqual(['tech', 'ai']);
    });
  });

  describe('frontières des tokens', () => {
    it('détecte un hashtag entre parenthèses', () => {
      expect(extractHashtags('Le sujet (#tech) est vaste')).toEqual(['tech']);
    });

    it('détecte une mention après une ponctuation', () => {
      expect(extractMentions('Merci (@alice) !')).toEqual(['alice']);
      expect(extractMentions('«@bob» a raison')).toEqual(['bob']);
    });

    it('ne transforme pas une adresse e-mail en mention', () => {
      expect(extractMentions('ecrire a alice@qoe.fi')).toEqual([]);
    });

    it('ne transforme pas une adresse e-mail a alias en mention (parité antispam Go)', () => {
      expect(extractMentions('contact alice+tag@qoe.fi')).toEqual([]);
      expect(extractMentions('facturation alice%test@qoe.fi')).toEqual([]);
    });

    it("exige le même début et la même longueur de handle que l'antispam Go", () => {
      // Go : `@([a-zA-Z0-9_][a-zA-Z0-9_.-]{0,39})` — pas de `.` ni `-` en tête.
      expect(extractMentions('salut @.alice')).toEqual([]);
      expect(extractMentions('salut @-alice')).toEqual([]);
      expect(extractMentions(`salut @${'a'.repeat(40)}`)).toEqual(['a'.repeat(40)]);
      // Au-delà de 40, on s'arrête au 40ᵉ caractère comme le parseur Go.
      expect(extractMentions(`salut @${'a'.repeat(45)}`)).toEqual(['a'.repeat(40)]);
    });

    it("ne transforme pas un fragment d'URL en hashtag ni en mention", () => {
      expect(extractHashtags('https://qoe.fi/tag#tech')).toEqual([]);
      expect(extractMentions('https://qoe.fi/@alice')).toEqual([]);
    });
  });
});
