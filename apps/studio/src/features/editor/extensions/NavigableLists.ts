import { ListItem, ListKeymap } from '@tiptap/extension-list';

/**
 * Tiptap réserve `Tab` et `Shift-Tab` à l'imbrication des listes. C'est un
 * piège de focus : impossible de sortir de l'éditeur au clavier.
 *
 * On garde les autres raccourcis de `ListItem` (Entrée, etc.) et de
 * `ListKeymap` (Retour arrière, suppression) mais on retire les deux
 * raccourcis de tabulation. L'imbrication reste disponible dans la barre
 * d'outils, avec `sinkListItem` / `liftListItem`.
 */
export const NavigableListItem = ListItem.extend({
  addKeyboardShortcuts() {
    const shortcuts = { ...this.parent?.() };
    delete shortcuts.Tab;
    delete shortcuts['Shift-Tab'];
    return shortcuts;
  },
});

export const NavigableListKeymap = ListKeymap.extend({
  addKeyboardShortcuts() {
    const shortcuts = { ...this.parent?.() };
    delete shortcuts.Tab;
    return shortcuts;
  },
});
