import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { collectImagesWithoutAlt, missingAltPositions } from '../alt-coverage';

const schema = new Schema({
  nodes: {
    text: {},
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block' },
    image: { group: 'block', atom: true, attrs: { alt: { default: '' } } },
    imageGallery: { content: 'galleryImage+', group: 'block' },
    galleryImage: { atom: true, attrs: { alt: { default: '' } } },
  },
});

function paragraph(text: string) {
  return schema.node('paragraph', null, text ? [schema.text(text)] : []);
}

describe('collectImagesWithoutAlt', () => {
  it('ignore les images correctement décrites', () => {
    const doc = schema.node('doc', null, [
      paragraph('a'),
      schema.node('image', { alt: 'Une photo décrite' }),
    ]);

    expect(collectImagesWithoutAlt(doc)).toHaveLength(0);
  });

  it('repère les images seules et les images de galerie, y compris un alt blanc', () => {
    const intro = paragraph('a');
    const missing = schema.node('image', { alt: '' });
    const described = schema.node('image', { alt: 'Décrite' });
    const gallery = schema.node('imageGallery', null, [
      schema.node('galleryImage', { alt: '' }),
      schema.node('galleryImage', { alt: '   ' }),
    ]);
    const doc = schema.node('doc', null, [intro, missing, described, gallery]);

    const images = collectImagesWithoutAlt(doc);

    expect(images.map(({ node }) => node.type.name)).toEqual([
      'image',
      'galleryImage',
      'galleryImage',
    ]);
    expect(images.map(({ pos }) => pos)).toEqual([
      intro.nodeSize,
      intro.nodeSize + missing.nodeSize + described.nodeSize + 1,
      intro.nodeSize + missing.nodeSize + described.nodeSize + 2,
    ]);
    expect(missingAltPositions(doc)).toEqual(images.map(({ pos }) => pos));
  });
});
