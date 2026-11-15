import type { EditorView } from '@tiptap/pm/view';
import { NodeSelection } from '@tiptap/pm/state';
import { adjacentImagePosition } from './image-navigation';

export interface EditorKeydownHandlers {
  openImageDetails: () => void;
  openLink: () => void;
  openAnnotation: () => void;
}

/**
 * Raccourcis et navigation clavier du document, hors du composant Editor.
 *
 * - ↑/↓ aux bords d'un bloc sélectionnent l'image voisine ;
 * - Entrée sur une image sélectionnée ouvre ses détails ;
 * - ⌘K ouvre le lien, ⌘⇧A la note d'auteur.
 *
 * Retourne true quand l'événement est consommé.
 */
export function handleEditorKeyDown(
  view: EditorView,
  event: KeyboardEvent,
  handlers: EditorKeydownHandlers
): boolean {
  if (
    (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.ctrlKey
  ) {
    const { selection } = view.state;
    if (selection.empty && !(selection instanceof NodeSelection)) {
      const $pos = selection.$from;
      const atStart = $pos.parentOffset === 0;
      const atEnd = $pos.parentOffset === $pos.parent.content.size;
      const direction = event.key === 'ArrowUp' ? 'before' : 'after';
      if ((direction === 'before' && atStart) || (direction === 'after' && atEnd)) {
        const imagePos = adjacentImagePosition($pos, direction);
        if (imagePos !== null) {
          event.preventDefault();
          view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, imagePos)));
          return true;
        }
      }
    }
  }

  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    view.state.selection instanceof NodeSelection
  ) {
    const { node } = view.state.selection;
    if (node.type.name === 'image' || node.type.name === 'galleryImage') {
      event.preventDefault();
      handlers.openImageDetails();
      return true;
    }
  }

  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    handlers.openLink();
    return true;
  }

  if (
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    (event.key === 'a' || event.key === 'A')
  ) {
    event.preventDefault();
    handlers.openAnnotation();
    return true;
  }

  return false;
}
