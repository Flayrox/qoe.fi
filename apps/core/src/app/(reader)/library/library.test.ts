import { describe, it, expect } from 'vitest';
import {
  resolveLibraryTab,
  cleanArticleExcerpt,
  filterBookmarks,
  filterBookmarksByTime,
  calculateTotalReadingMinutes,
  formatQuoteForClipboard,
  filterHighlights,
  filterAnnotations,
  generateHighlightsMarkdown,
} from './library-helpers';
import type { LibraryBookmark, LibraryHighlight } from './LibraryClient';

describe('Library Helpers (Bibliothèque 2026)', () => {
  describe('resolveLibraryTab', () => {
    it('résout vers highlights quand tab="highlights"', () => {
      expect(resolveLibraryTab('highlights')).toBe('highlights');
    });

    it('résout vers annotations quand tab="annotations"', () => {
      expect(resolveLibraryTab('annotations')).toBe('annotations');
    });

    it('résout vers bookmarks par défaut ou pour toute autre valeur', () => {
      expect(resolveLibraryTab('bookmarks')).toBe('bookmarks');
      expect(resolveLibraryTab(null)).toBe('bookmarks');
      expect(resolveLibraryTab(undefined)).toBe('bookmarks');
      expect(resolveLibraryTab('unknown')).toBe('bookmarks');
    });
  });

  describe('cleanArticleExcerpt', () => {
    it('nettoie les balises HTML et les espaces multiples', () => {
      const rawHtml = '<p>Voici un <strong>texte</strong> avec des <a href="#">liens</a>.</p>';
      expect(cleanArticleExcerpt(rawHtml, 100)).toBe('Voici un texte avec des liens.');
    });

    it('tronque avec une ellipse si le texte dépasse maxLength', () => {
      const rawText =
        'Ceci est un texte très long qui va dépasser la limite autorisée pour un extrait.';
      const result = cleanArticleExcerpt(rawText, 30);
      expect(result).toBe('Ceci est un texte très long qu…');
      expect(result.endsWith('…')).toBe(true);
    });

    it('gère les chaînes vides ou invalides', () => {
      expect(cleanArticleExcerpt('', 50)).toBe('');
    });
  });

  const mockBookmarks: LibraryBookmark[] = [
    {
      id: 'b1',
      createdAt: '2026-03-01T12:00:00Z',
      article: {
        id: 'a1',
        slug: 'intelligence-artificielle-2026',
        title: 'L’Essor des Agents Autonomes en 2026',
        content: '<p>Une révolution dans le monde du logiciel moderne.</p>',
        readingTime: 5,
        author: {
          name: 'Tech Horizon',
          username: 'tech-horizon',
          subdomain: 'tech',
          customDomain: null,
          logoUrl: null,
          type: 'MEDIA',
        },
        category: { name: 'Technologie' },
      },
    },
    {
      id: 'b2',
      createdAt: '2026-03-02T12:00:00Z',
      article: {
        id: 'a2',
        slug: 'philosophie-du-calme',
        title: 'Éloge de la Lenteur et de l’Attention',
        content: '<p>Retrouver le temps long dans une société accélérée.</p>',
        readingTime: 8,
        author: {
          name: 'Éditions Minuit',
          username: 'editions-minuit',
          subdomain: null,
          customDomain: null,
          logoUrl: null,
          type: 'MEDIA',
        },
        category: { name: 'Philosophie' },
      },
    },
  ];

  describe('filterBookmarks', () => {
    it('retourne tous les signets si la requête est vide', () => {
      expect(filterBookmarks(mockBookmarks, '')).toHaveLength(2);
      expect(filterBookmarks(mockBookmarks, '   ')).toHaveLength(2);
    });

    it('filtre par titre d’article insensible à la casse', () => {
      const filtered = filterBookmarks(mockBookmarks, 'agents');
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.id).toBe('b1');
    });

    it('filtre par nom de publication', () => {
      const filtered = filterBookmarks(mockBookmarks, 'Minuit');
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.id).toBe('b2');
    });

    it('filtre par nom de catégorie', () => {
      const filtered = filterBookmarks(mockBookmarks, 'Philosophie');
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.id).toBe('b2');
    });

    it('retourne une liste vide si aucun élément ne correspond', () => {
      expect(filterBookmarks(mockBookmarks, 'inconnu-xyz')).toHaveLength(0);
    });
  });

  const mockHighlights: LibraryHighlight[] = [
    {
      id: 'h1',
      text: 'Le véritable luxe moderne n’est plus la vitesse mais le discernement.',
      note: 'À citer dans le chapitre 3 sur l’économie de l’attention.',
      createdAt: '2026-03-01T12:00:00Z',
      isPublic: true,
      article: {
        id: 'a2',
        title: 'Éloge de la Lenteur et de l’Attention',
        slug: 'philosophie-du-calme',
        publication: {
          id: 'p2',
          name: 'Éditions Minuit',
          slug: 'editions-minuit',
          subdomain: null,
          customDomain: null,
          type: 'MEDIA',
        },
      },
    },
    {
      id: 'h2',
      text: 'Les modèles génératifs réduisent le coût marginal de la création intellectuelle.',
      note: null,
      createdAt: '2026-03-02T12:00:00Z',
      isPublic: false,
      article: {
        id: 'a1',
        title: 'L’Essor des Agents Autonomes en 2026',
        slug: 'intelligence-artificielle-2026',
        publication: {
          id: 'p1',
          name: 'Tech Horizon',
          slug: 'tech-horizon',
          subdomain: 'tech',
          customDomain: null,
          type: 'MEDIA',
        },
      },
    },
  ];

  describe('filterHighlights', () => {
    it('retourne tous les surlignages si la requête est vide', () => {
      expect(filterHighlights(mockHighlights, '')).toHaveLength(2);
    });

    it('filtre par texte de citation', () => {
      const filtered = filterHighlights(mockHighlights, 'discernement');
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.id).toBe('h1');
    });

    it('filtre par note personnelle', () => {
      const filtered = filterHighlights(mockHighlights, 'chapitre 3');
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.id).toBe('h1');
    });

    it('filtre par titre d’article source', () => {
      const filtered = filterHighlights(mockHighlights, 'Lenteur');
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.id).toBe('h1');
    });
  });

  describe('filterAnnotations', () => {
    it('ne retourne que les surlignages qui possèdent une annotation/note rédigée', () => {
      const annotated = filterAnnotations(mockHighlights, '');
      expect(annotated).toHaveLength(1);
      expect(annotated[0]?.id).toBe('h1');
      expect(annotated[0]?.note).toBe('À citer dans le chapitre 3 sur l’économie de l’attention.');
    });

    it('filtre les annotations par mot-clé dans la note', () => {
      const filtered = filterAnnotations(mockHighlights, 'attention');
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.id).toBe('h1');
    });

    it('retourne vide si le mot-clé ne correspond à aucune annotation', () => {
      const filtered = filterAnnotations(mockHighlights, 'inexistant');
      expect(filtered).toHaveLength(0);
    });
  });

  describe('filterBookmarksByTime', () => {
    const timeBookmarks: LibraryBookmark[] = [
      {
        ...mockBookmarks[0],
        id: 'tb1',
        article: { ...mockBookmarks[0].article, readingTime: 3 },
      },
      {
        ...mockBookmarks[1],
        id: 'tb2',
        article: { ...mockBookmarks[1].article, readingTime: 10 },
      },
      {
        ...mockBookmarks[0],
        id: 'tb3',
        article: { ...mockBookmarks[0].article, readingTime: 25 },
      },
    ];

    it('retourne tous les signets quand le filtre est "all"', () => {
      const result = filterBookmarksByTime(timeBookmarks, 'all');
      expect(result).toHaveLength(3);
    });

    it('filtre les articles rapides (< 5 min) avec "quick"', () => {
      const result = filterBookmarksByTime(timeBookmarks, 'quick');
      expect(result.map((b) => b.id)).toEqual(['tb1']);
    });

    it('filtre les articles moyens (5 à 15 min) avec "medium"', () => {
      const result = filterBookmarksByTime(timeBookmarks, 'medium');
      expect(result.map((b) => b.id)).toEqual(['tb2']);
    });

    it('filtre les articles approfondis (> 15 min) avec "deep"', () => {
      const result = filterBookmarksByTime(timeBookmarks, 'deep');
      expect(result.map((b) => b.id)).toEqual(['tb3']);
    });

    it('gère les tableaux non valides', () => {
      expect(filterBookmarksByTime(null as unknown as LibraryBookmark[], 'all')).toEqual([]);
    });
  });

  describe('calculateTotalReadingMinutes', () => {
    it('calcule la somme exacte des minutes de lecture', () => {
      // mockBookmarks : b1 a 5 min, b2 a 8 min -> 13 min
      const total = calculateTotalReadingMinutes(mockBookmarks);
      expect(total).toBe(13);
    });

    it('retourne 0 si la liste est vide ou non définie', () => {
      expect(calculateTotalReadingMinutes([])).toBe(0);
      expect(calculateTotalReadingMinutes(null as unknown as LibraryBookmark[])).toBe(0);
    });
  });

  describe('formatQuoteForClipboard', () => {
    it('formate une citation complète avec guillemets, publication, titre et URL', () => {
      const formatted = formatQuoteForClipboard(mockHighlights[0]);
      expect(formatted).toContain(
        '« Le véritable luxe moderne n’est plus la vitesse mais le discernement. »'
      );
      expect(formatted).toContain('Éditions Minuit');
      expect(formatted).toContain('Éloge de la Lenteur et de l’Attention');
      expect(formatted).toContain('https://qoe.fi/article/philosophie-du-calme');
    });

    it('utilise un nom de repli si le nom de publication est vide', () => {
      const hWithoutPub: LibraryHighlight = {
        ...mockHighlights[0],
        article: {
          ...mockHighlights[0].article,
          publication: {
            ...mockHighlights[0].article.publication,
            name: '',
          },
        },
      };
      const formatted = formatQuoteForClipboard(hWithoutPub);
      expect(formatted).toContain('Qoe.fi');
    });
  });

  describe('generateHighlightsMarkdown', () => {
    it('génère un fichier Markdown structuré prêt pour Obsidian/Notion', () => {
      const fakeDate = new Date('2026-09-09T12:00:00Z');
      const md = generateHighlightsMarkdown(mockHighlights, fakeDate);

      expect(md).toContain('# 📚 Bibliothèque de Surlignages — Qoe.fi');
      expect(md).toContain('## 📖 Éloge de la Lenteur et de l’Attention');
      expect(md).toContain('*Source : Éditions Minuit*');
      expect(md).toContain(
        '> « Le véritable luxe moderne n’est plus la vitesse mais le discernement. »'
      );
      expect(md).toContain(
        '> ✍️ **Annotation :** *À citer dans le chapitre 3 sur l’économie de l’attention.*'
      );
      expect(md).toContain('## 📖 L’Essor des Agents Autonomes en 2026');
      expect(md).toContain(
        '> « Les modèles génératifs réduisent le coût marginal de la création intellectuelle. »'
      );
    });

    it('retourne une chaîne vide si aucun surlignage', () => {
      expect(generateHighlightsMarkdown([])).toBe('');
    });
  });
});
