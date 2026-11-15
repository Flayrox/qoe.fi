import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { t } from '@lingui/core/macro';
import { collectImagesWithoutAlt } from '../lib/alt-coverage';

/**
 * Événement DOM émis par le badge « Alt manquant ». Le badge est une
 * décoration, pas un nœud du document : il ne peut pas appeler directement
 * `openImageDetails`, d'où ce passage par l'éditeur.
 */
export const ALT_DETAILS_EVENT = 'qoe:image-alt-details';

const ALT_COVERAGE_KEY = new PluginKey('altCoverage');

/**
 * Marque les images sans description alternative et pose un badge cliquable
 * sur les images seules. Les images de galerie sont déjà dans une grille :
 * un badge en flux casserait la mise en page, l'encadré ambre suffit et le
 * compteur de la barre de statut donne l'accès direct.
 */
function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];

  for (const { node, pos } of collectImagesWithoutAlt(doc)) {
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: 'qoe-image-missing-alt',
      })
    );

    if (node.type.name !== 'image') continue;

    decorations.push(
      Decoration.widget(
        pos + node.nodeSize,
        (view) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'qoe-image-alt-badge';
          button.contentEditable = 'false';
          // Le badge ne prend pas la tabulation : `Tab` reste la navigation
          // du texte, et la barre de statut offre le même accès au clavier.
          button.tabIndex = -1;
          button.textContent = t`Alt manquant`;
          button.title = t`Ouvrir les détails de l'image`;
          button.setAttribute('aria-label', t`Ajouter une description alternative`);

          button.addEventListener('mousedown', (event) => event.preventDefault());
          button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            view.dom.dispatchEvent(
              new CustomEvent(ALT_DETAILS_EVENT, {
                bubbles: true,
                detail: { pos },
              })
            );
          });

          return button;
        },
        { side: 1 }
      )
    );
  }

  return DecorationSet.create(doc, decorations);
}

export const AltCoverage = Extension.create({
  name: 'altCoverage',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: ALT_COVERAGE_KEY,
        props: {
          decorations: (state) => buildDecorations(state.doc),
        },
      }),
    ];
  },
});
