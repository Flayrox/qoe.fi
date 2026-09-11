import { describe, expect, it } from 'vitest';
import { escapeHtml, markdownHeadings, markdownToHtml } from '../markdown';

describe('📝 markdown — escapeHtml', () => {
  it('échappe les caractères HTML sensibles', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
  });

  it('échappe les esperluettes et apostrophes', () => {
    expect(escapeHtml("Café & Cie l'été")).toBe('Café &amp; Cie l&#39;été');
  });
});

describe('📝 markdown — markdownToHtml', () => {
  it('rend les titres avec une ancre stable', () => {
    expect(markdownToHtml('## Article 4 — Responsabilités')).toBe(
      '<h2 id="article-4-responsabilites">Article 4 — Responsabilités</h2>'
    );
  });

  it('neutralise le HTML brut (aucune injection possible)', () => {
    const html = markdownToHtml('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('refuse les liens javascript: et garde le libellé', () => {
    expect(markdownToHtml('[clic](javascript:alert(1))')).toBe('<p>clic</p>');
  });

  it('rend les liens externes avec noopener', () => {
    const html = markdownToHtml('[CNIL](https://www.cnil.fr)');
    expect(html).toContain('href="https://www.cnil.fr"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('rend les listes et le gras', () => {
    const html = markdownToHtml('- **Un** élément\n- Un autre');
    expect(html).toContain('<ul><li><strong>Un</strong> élément</li><li>Un autre</li></ul>');
  });

  it('rend les listes ordonnées', () => {
    const html = markdownToHtml('1. Premier\n2. Second');
    expect(html).toContain('<ol><li>Premier</li><li>Second</li></ol>');
  });

  it('rend les tableaux', () => {
    const html = markdownToHtml('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<thead><tr><th>A</th><th>B</th></tr></thead>');
    expect(html).toContain('<tbody><tr><td>1</td><td>2</td></tr></tbody>');
  });

  it('rend les blocs de code sans interpréter le contenu', () => {
    const html = markdownToHtml('```bash\ncurl -X POST https://qoe.fi\n```');
    expect(html).toContain(
      '<pre><code class="language-bash">curl -X POST https://qoe.fi</code></pre>'
    );
  });

  it('rend le code inline sans appliquer le gras', () => {
    expect(markdownToHtml('Utiliser `**pas gras**`')).toBe(
      '<p>Utiliser <code>**pas gras**</code></p>'
    );
  });

  it('rend les citations et séparateurs', () => {
    const html = markdownToHtml('> À noter\n\n---');
    expect(html).toContain('<blockquote><p>À noter</p></blockquote>');
    expect(html).toContain('<hr />');
  });

  it('conserve les sauts de ligne dans un paragraphe', () => {
    expect(markdownToHtml('Ligne 1\nLigne 2')).toBe('<p>Ligne 1<br />Ligne 2</p>');
  });

  it('accepte une entrée vide sans erreur', () => {
    expect(markdownToHtml('')).toBe('');
    expect(markdownToHtml(undefined as unknown as string)).toBe('');
  });
});

describe('📝 markdown — markdownHeadings', () => {
  it('extrait les titres avec leur niveau et leur ancre', () => {
    const headings = markdownHeadings('# Titre\n\ntexte\n\n### Sous-section');
    expect(headings).toEqual([
      { id: 'titre', text: 'Titre', level: 1 },
      { id: 'sous-section', text: 'Sous-section', level: 3 },
    ]);
  });

  it('ignore les dièses dans un bloc de code', () => {
    const headings = markdownHeadings('# Vrai\n\n```\n# Faux\n```');
    expect(headings.map((h) => h.text)).toEqual(['Vrai']);
  });
});
