// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ArticleImage } from '../ArticleImage';
import { GalleryImage, ImageGallery } from '../ImageGallery';

let editor: Editor | null = null;

function create(content: string) {
  editor = new Editor({
    extensions: [StarterKit, ArticleImage, ImageGallery, GalleryImage],
    content,
    element: document.createElement('div'),
  });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('ImageGallery', () => {
  it('relit une galerie sans perdre le src ni dupliquer l’image', () => {
    const instance = create(
      '<div data-image-gallery="true">' +
        '<img data-gallery-image="true" src="https://cdn.qoe.fi/a.jpg" alt="Une photo">' +
        '</div>'
    );

    const json = instance.getJSON();
    const blocks = json.content ?? [];

    expect(blocks.map((node) => node.type)).toEqual(['imageGallery']);
    expect(blocks[0].content).toHaveLength(1);
    expect(blocks[0].content?.[0]).toMatchObject({
      type: 'galleryImage',
      attrs: { src: 'https://cdn.qoe.fi/a.jpg', alt: 'Une photo' },
    });
  });

  it('conserve plusieurs images de galerie dans l’ordre', () => {
    const instance = create(
      '<div data-image-gallery="true">' +
        '<img data-gallery-image="true" src="https://cdn.qoe.fi/a.jpg" alt="A">' +
        '<img data-gallery-image="true" src="https://cdn.qoe.fi/b.jpg" alt="">' +
        '</div>'
    );

    const gallery = instance.getJSON().content?.[0];
    expect(gallery?.type).toBe('imageGallery');
    expect(
      gallery?.content?.map((node) => ('attrs' in node ? node.attrs?.src : undefined))
    ).toEqual(['https://cdn.qoe.fi/a.jpg', 'https://cdn.qoe.fi/b.jpg']);
  });
});
