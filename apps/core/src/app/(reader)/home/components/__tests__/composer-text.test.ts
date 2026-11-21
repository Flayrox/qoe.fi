import { describe, expect, it } from 'vitest';
import {
  calculateCharacters,
  detectMentionTrigger,
  formatMentionInsertion,
  isThreadPublishable,
} from '../composer/composer-text';
import { createEmptyThreadNode } from '../composer/types';

describe('composer-text', () => {
  it('compte 20 caractères par URL externe et 0 pour les URLs internes (/post/ ou /article/)', () => {
    const ext = 'https://exemple.fr/un/chemin/tres/long/qui/depasse/vingt';
    expect(calculateCharacters(`Salut ${ext}`)).toBe(6 + 20);

    const internalPost = 'https://qoe.fi/post/1234567890';
    const internalArticle = 'https://media.qoe.fi/article/mon-essai';
    expect(calculateCharacters(`Voir ${internalPost} et ${internalArticle}`)).toBe(9);
  });

  it('détecte les déclencheurs @profil, #tag et :emoji: avant le curseur', () => {
    expect(detectMentionTrigger('Bonjour @ali', 12)).toEqual({
      type: 'profile',
      query: 'ali',
      start: 8,
      end: 12,
    });
    expect(detectMentionTrigger('Sujet #tech ', 11)).toEqual({
      type: 'tag',
      query: 'tech',
      start: 6,
      end: 11,
    });
    expect(detectMentionTrigger('Bravo :roc', 10)).toEqual({
      type: 'emoji',
      query: 'roc',
      start: 6,
      end: 10,
    });
    expect(detectMentionTrigger('Texte normal', 12)).toBeNull();
  });

  it('formate l’insertion selon le type de suggestion', () => {
    expect(formatMentionInsertion({ id: 'u1', _type: 'profile', username: 'ada' })).toBe('@ada ');
    expect(
      formatMentionInsertion({
        id: '1234567890',
        _type: 'profile',
        username: null,
        subdomain: null,
      })
    ).toBe('@12345678 ');
    expect(formatMentionInsertion({ id: 'design', _type: 'tag', value: 'design' })).toBe(
      '#design '
    );
    expect(formatMentionInsertion({ id: 'fire', _type: 'emoji', char: '🔥' })).toBe('🔥 ');
  });

  it('considère un fil publiable si le nœud actif OU un autre nœud a du contenu', () => {
    const emptyA = createEmptyThreadNode();
    const emptyB = createEmptyThreadNode();
    expect(isThreadPublishable('', [], [emptyA, emptyB], 1)).toBe(false);

    const filledA = { ...emptyA, text: 'Première pensée' };
    expect(isThreadPublishable('', [], [filledA, emptyB], 1)).toBe(true);
    expect(isThreadPublishable('  ', [], [emptyA, emptyB], 0)).toBe(false);
    expect(isThreadPublishable('Texte', [], [emptyA], 0)).toBe(true);
  });
});
