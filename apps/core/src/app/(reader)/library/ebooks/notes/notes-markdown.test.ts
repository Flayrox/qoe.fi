import { describe, it, expect } from 'vitest';
import { notesToMarkdown, type ExportableNote } from './notes-markdown';

function note(o: Partial<ExportableNote> = {}): ExportableNote {
  return {
    id: 'n1',
    ebookId: 'b1',
    ebookTitle: 'Livre Un',
    ebookAuthor: 'Auteur A',
    chapterIndex: 0,
    chapterTitle: 'Chapitre Un',
    excerpt: '',
    note: '',
    createdAt: '2026-09-01T10:00:00Z',
    ...o,
  };
}

const DATE = new Date(Date.UTC(2026, 8, 29, 12));

describe('notesToMarkdown', () => {
  it('rien à exporter = chaîne vide (pas de fichier avec un titre vide)', () => {
    expect(notesToMarkdown([], DATE)).toBe('');
  });

  it('en-tête avec décompte des notes et des livres', () => {
    const md = notesToMarkdown(
      [note(), note({ id: 'n2', ebookId: 'b2', ebookTitle: 'Livre Deux' })],
      DATE
    );
    expect(md).toContain('Export du 29 septembre 2026');
    expect(md).toContain('2 notes');
    expect(md).toContain('2 livres');
  });

  it('regroupe par livre, les livres triés par titre', () => {
    const md = notesToMarkdown(
      [
        note({ id: 'n1', ebookId: 'b2', ebookTitle: 'Zola' }),
        note({ id: 'n2', ebookId: 'b1', ebookTitle: 'Apollinaire' }),
      ],
      DATE
    );
    expect(md.indexOf('## 📖 Apollinaire')).toBeLessThan(md.indexOf('## 📖 Zola'));
  });

  it('cite le passage, écrit la note, et n’invente rien quand l’un manque', () => {
    const md = notesToMarkdown(
      [
        note({ id: 'n1', excerpt: 'un passage', note: 'mon mot' }),
        note({ id: 'n2', excerpt: 'passage seul', note: '' }),
        note({ id: 'n3', excerpt: '', note: 'mot seul' }),
      ],
      DATE
    );
    expect(md).toContain('> « un passage »');
    expect(md).toContain('**Note :** mon mot');
    expect(md).toContain('> « passage seul »');
    expect(md).toContain('**Note :** mot seul');
    // Jamais de placeholder pour un champ vide.
    expect(md).not.toContain('**Note :** \n');
    expect(md).not.toContain('> «  »');
  });

  it('regroupe par chapitre dans l’ordre de lecture, puis d’écriture', () => {
    const md = notesToMarkdown(
      [
        note({ id: 'n1', chapterIndex: 2, chapterTitle: 'Trois', note: 'tard' }),
        note({ id: 'n2', chapterIndex: 0, chapterTitle: 'Un', note: 'tôt' }),
        note({
          id: 'n3',
          chapterIndex: 0,
          chapterTitle: 'Un',
          createdAt: '2026-09-02T10:00:00Z',
          note: 'encore',
        }),
      ],
      DATE
    );
    expect(md.indexOf('### Un')).toBeLessThan(md.indexOf('### Trois'));
    expect(md.indexOf('**Note :** tôt')).toBeLessThan(md.indexOf('**Note :** encore'));
  });

  it('replie le titre de chapitre manquant sur son numéro', () => {
    const md = notesToMarkdown([note({ chapterIndex: 4, chapterTitle: '' })], DATE);
    expect(md).toContain('### Chapitre 5');
  });
});
