import { Node, mergeAttributes } from '@tiptap/core';
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, type EditorState } from '@tiptap/pm/state';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageGallery: {
      moveGalleryImage: (direction: 'left' | 'right') => ReturnType;
      removeGalleryImage: () => ReturnType;
    };
  }
}

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

/** Une image de galerie est sélectionnée comme un nœud atomique. */
function selectedGalleryImage(state: EditorState): NodeSelection | null {
  const { selection } = state;
  return selection instanceof NodeSelection && selection.node.type.name === 'galleryImage'
    ? selection
    : null;
}

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

  addCommands() {
    return {
      moveGalleryImage:
        (direction) =>
        ({ state, dispatch }) => {
          const selection = selectedGalleryImage(state);
          if (!selection) return false;

          const { $from } = selection;
          const parent = $from.parent;
          if (parent.type.name !== 'imageGallery') return false;

          const index = $from.index();
          const targetIndex = index + (direction === 'left' ? -1 : 1);
          if (targetIndex < 0 || targetIndex >= parent.childCount) return false;
          if (!dispatch) return true;

          const nodes: ProseMirrorNode[] = [];
          parent.forEach((node) => nodes.push(node));
          const [moved] = nodes.splice(index, 1);
          nodes.splice(targetIndex, 0, moved);

          const start = $from.start();
          const tr = state.tr.replaceWith(
            start,
            start + parent.content.size,
            Fragment.fromArray(nodes)
          );
          const newPos =
            start + nodes.slice(0, targetIndex).reduce((sum, node) => sum + node.nodeSize, 0);
          tr.setSelection(NodeSelection.create(tr.doc, newPos));
          dispatch(tr.scrollIntoView());
          return true;
        },

      removeGalleryImage:
        () =>
        ({ state, dispatch }) => {
          const selection = selectedGalleryImage(state);
          if (!selection) return false;

          const { $from } = selection;
          const parent = $from.parent;
          if (parent.type.name !== 'imageGallery') return false;
          if (!dispatch) return true;

          const tr = state.tr;
          if (parent.childCount === 1) {
            // Dernière image : on retire la galerie entière pour ne pas laisser
            // un nœud parent vide (le schéma exige au moins une image).
            tr.delete($from.before(), $from.after());
            if (tr.doc.content.size === 0) {
              tr.insert(0, state.schema.nodes.paragraph.create());
            }
          } else {
            tr.deleteSelection();
          }
          dispatch(tr.scrollIntoView());
          return true;
        },
    };
  },
});
