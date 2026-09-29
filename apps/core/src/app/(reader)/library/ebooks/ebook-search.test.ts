import { describe, it, expect } from 'vitest';
import {
  htmlToPlainText,
  normalizeForSearch,
  searchEbookChapters,
  type EbookChapterLike,
} from './ebook-search';

const chapters: EbookChapterLike[] = [
  {
    title: 'Les résumés',
    html: '<h1>Les résumés</h1><p>Un résumé fidèle <em>du</em> chapitre.</p><p>Rien ici.</p>',
  },
  {
    title: 'Autre',
    html: '<p>Le résumé revient encore, puis le résumé final.</p><p>Le résumé final.</p>',
  },
  { title: '', html: '<p>Aucun rapport.</p>' },
];

describe('htmlToPlainText', () => {
  it('défait les balises et décode les entités', () => {
    expect(htmlToPlainText('<p>Bonjour <em>le monde</em> &amp; plus</p>')).toBe(
      'Bonjour le monde & plus'
    );
    expect(htmlToPlainText('<p>a</p><p>b</p>')).toBe('a b');
    expect(htmlToPlainText('<p>l&apos;un &#39;l&#39;autre &quot;ok&quot;</p>')).toBe(
      "l'un 'l'autre \"ok\""
    );
  });
  it('ne recolle pas les mots de part et d’autre d’une balise', () => {
    expect(htmlToPlainText('<h2>tit</h2><p>re</p>')).toBe('tit re');
  });
});

describe('normalizeForSearch', () => {
  it('ignore casse et accents', () => {
    expect(normalizeForSearch('Résumé')).toBe('resume');
    expect(normalizeForSearch('CHAPITRE ÉTÉ')).toBe('chapitre ete');
  });
});

describe('searchEbookChapters', () => {
  it('trouve malgré les accents (résumé ↔ resume)', () => {
    const hits = searchEbookChapters(chapters, 'resume');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].chapterIndex).toBe(0);
    expect(hits[0].chapterTitle).toBe('Les résumés');
    expect(hits[0].snippet).toContain('résumé');
  });

  it('surligne la bonne occurrence DANS l’extrait', () => {
    const [hit] = searchEbookChapters(chapters, 'fidèle');
    expect(hit.snippet.slice(hit.matchStart, hit.matchStart + hit.matchLength)).toBe('fidèle');
  });

  it('remonte les chapitres dans l’ordre, avec leur titre de repli', () => {
    const hits = searchEbookChapters(chapters, 'aucun rapport');
    expect(hits).toHaveLength(1);
    expect(hits[0].chapterIndex).toBe(2);
    expect(hits[0].chapterTitle).toBe('Chapitre 3');
  });

  it('borne par chapitre puis au total', () => {
    const perChapter = searchEbookChapters(chapters, 'resume', { perChapter: 1 });
    expect(perChapter.filter((h) => h.chapterIndex === 1)).toHaveLength(1);
    const limited = searchEbookChapters(chapters, 'resume', { limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it('ignore les requêtes trop courtes et les vides', () => {
    expect(searchEbookChapters(chapters, '')).toEqual([]);
    expect(searchEbookChapters(chapters, 'r')).toEqual([]);
    expect(searchEbookChapters(chapters, '   ')).toEqual([]);
  });

  it('traite les caractères spéciaux comme du texte (aucune regex)', () => {
    const book: EbookChapterLike[] = [{ title: 'T', html: '<p>prix (a+b) * c?</p>' }];
    expect(searchEbookChapters(book, '(a+b)')).toHaveLength(1);
    expect(searchEbookChapters(book, '.*')).toEqual([]);
  });

  it('ne boucle pas sur une occurrence qui se chevauche', () => {
    const book: EbookChapterLike[] = [{ title: 'T', html: '<p>aaaa</p>' }];
    expect(searchEbookChapters(book, 'aa')).toHaveLength(2);
  });

  it('borne la longueur des extraits', () => {
    const long = 'mot '.repeat(200) + 'aiguille' + ' mot'.repeat(200);
    const book: EbookChapterLike[] = [{ title: 'T', html: `<p>${long}</p>` }];
    const [hit] = searchEbookChapters(book, 'aiguille', { context: 20 });
    expect(hit.snippet.length).toBeLessThan(80);
    expect(hit.snippet).toContain('aiguille');
  });
});
