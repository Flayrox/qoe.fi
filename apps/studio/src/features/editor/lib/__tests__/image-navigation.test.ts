import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { adjacentImagePosition } from '../image-navigation';

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

describe('adjacentImagePosition', () => {
  it('renvoie la position de l’image située avant le curseur', () => {
    const first = paragraph('avant');
    const image = schema.node('image', { alt: '' });
    const doc = schema.node('doc', null, [first, image, paragraph('après')]);
    const $pos = doc.resolve(first.nodeSize + image.nodeSize);

    expect(adjacentImagePosition($pos, 'before')).toBe(first.nodeSize);
  });

  it('renvoie la position de l’image située après le curseur', () => {
    const first = paragraph('avant');
    const image = schema.node('image', { alt: '' });
    const last = paragraph('après');
    const doc = schema.node('doc', null, [first, image, last, schema.node('image', { alt: '' })]);
    const $pos = doc.resolve(first.nodeSize + image.nodeSize + last.content.size + 1);

    expect(adjacentImagePosition($pos, 'after')).toBe(
      first.nodeSize + image.nodeSize + last.nodeSize
    );
  });

  it('vise la première image d’une galerie', () => {
    const first = paragraph('a');
    const gallery = schema.node('imageGallery', null, [
      schema.node('galleryImage', { alt: '' }),
      schema.node('galleryImage', { alt: '' }),
    ]);
    const doc = schema.node('doc', null, [first, gallery, paragraph('b')]);
    const $pos = doc.resolve(first.nodeSize + gallery.nodeSize);

    expect(adjacentImagePosition($pos, 'before')).toBe(first.nodeSize + 1);
  });

  it('ignore un voisin qui n’est pas une image', () => {
    const first = paragraph('a');
    const doc = schema.node('doc', null, [first, paragraph('b')]);
    const $pos = doc.resolve(first.nodeSize);

    expect(adjacentImagePosition($pos, 'before')).toBeNull();
  });
});
