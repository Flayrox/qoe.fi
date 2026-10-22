import { Node, mergeAttributes } from '@tiptap/core';

const GALLERY_STYLE =
  'display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:0.75rem;margin:2rem 0;';
const ITEM_STYLE =
  'width:100%;height:100%;aspect-ratio:4/3;object-fit:cover;border-radius:0.75rem;display:block;border:1px solid rgba(0,0,0,0.06);';

/**
 * 🖼️ Galerie d'images — plusieurs images sur la même ligne.
 * Le HTML produit reste du `<div data-image-gallery><img …></div>` : lisible
 * par le sanitizer des tenants et sans dépendance CSS côté lecture publique.
 */
export const GalleryImage = Node.create({
  name: 'galleryImage',
  inline: false,
  group: 'imageGalleryItem',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'img[data-gallery-image]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        'data-gallery-image': 'true',
        style: ITEM_STYLE,
        loading: 'lazy',
      }),
    ];
  },
});

export const ImageGallery = Node.create({
  name: 'imageGallery',
  group: 'block',
  content: 'galleryImage+',
  isolating: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'div[data-image-gallery]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-image-gallery': 'true',
        style: GALLERY_STYLE,
      }),
      0,
    ];
  },
});
