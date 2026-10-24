// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ArticleImage } from '../ArticleImage';

let editor: Editor | null = null;

function create(content: string) {
  editor = new Editor({
    extensions: [StarterKit, ArticleImage],
    content,
    element: document.createElement('div'),
  });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('ArticleImage', () => {
  it('garde une image seule en <img> (compatibilité des anciens articles)', () => {
    const instance = create('<img src="https://cdn.qoe.fi/a.jpg" alt="Une photo">');
    const html = instance.getHTML();

    expect(html).toContain('<img');
    expect(html).toContain('alt="Une photo"');
    expect(html).not.toContain('<figure');
  });

  it('sérialise légende et crédit dans un <figure>', () => {
    const instance = create('<img src="https://cdn.qoe.fi/a.jpg" alt="">');
    instance
      .chain()
      .updateAttributes('image', {
        alt: 'Manifestation',
        caption: 'Devant la préfecture',
        credit: 'AFP',
      })
      .run();

    const html = instance.getHTML();
    expect(html).toContain('<figure');
    expect(html).toContain('data-credit="AFP"');
    expect(html).toContain('Devant la préfecture');
    expect(html).toContain('© AFP');
    expect(html).toContain('alt="Manifestation"');
  });

  it('relit un <figure> existant sans dupliquer le crédit dans la légende', () => {
    const instance = create(
      '<figure data-article-image="true" data-credit="AFP">' +
        '<img src="https://cdn.qoe.fi/a.jpg" alt="Photo">' +
        '<figcaption>Devant la préfecture<span class="image-credit">© AFP</span></figcaption>' +
        '</figure>'
    );

    const html = instance.getHTML();
    const occurrences = html.match(/© AFP/g) ?? [];

    expect(occurrences).toHaveLength(1);
    expect(html).toContain('Devant la préfecture');
    expect(html).toContain('alt="Photo"');
  });
});
