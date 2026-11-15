import { describe, expect, it } from 'vitest';
import { buildSourcesHtml } from '../sources';

describe('buildSourcesHtml', () => {
  it('ignore les lignes vides et les schémas dangereux', () => {
    expect(buildSourcesHtml([])).toBeNull();
    expect(buildSourcesHtml([{ label: 'Vide', url: '' }])).toBeNull();
    expect(buildSourcesHtml([{ label: 'Piège', url: 'javascript:alert(1)' }])).toBeNull();
  });

  it('construit une liste de sources et échappe le libellé', () => {
    const html = buildSourcesHtml([
      { label: 'Rapport <public>', url: 'https://exemple.fr/rapport' },
      { label: '', url: 'https://exemple.fr/annexe' },
    ]);

    expect(html).toContain('<h2>Sources</h2>');
    expect(html).toContain('Rapport &lt;public&gt;');
    expect(html).toContain('href="https://exemple.fr/rapport"');
    expect(html).toContain('>https://exemple.fr/annexe</a>');
    expect(html).not.toContain('javascript:');
  });
});
