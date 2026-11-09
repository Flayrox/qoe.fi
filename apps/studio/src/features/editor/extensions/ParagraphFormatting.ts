import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormatting: {
      toggleParagraphIndent: () => ReturnType;
      setParagraphIndent: (indent: boolean) => ReturnType;
      toggleDropCap: () => ReturnType;
    };
  }
}

/**
 * Mise en forme typographique des paragraphes :
 * - Alinéa de première ligne (`data-indent="true"` / `.has-indent`), pilotable au clavier (`Tab` / `Shift+Tab` / `Backspace` en début de ligne).
 * - Lettrine (`data-drop-cap="true"` / `.has-drop-cap`) pour les ouvertures d'article ou de section.
 */
export const ParagraphFormatting = Extension.create({
  name: 'paragraphFormatting',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          indent: {
            default: false,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute('data-indent') === 'true' ||
              element.classList.contains('has-indent'),
            renderHTML: (attributes: { indent?: boolean }) =>
              attributes.indent ? { 'data-indent': 'true', class: 'has-indent' } : {},
          },
          dropCap: {
            default: false,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute('data-drop-cap') === 'true' ||
              element.classList.contains('has-drop-cap'),
            renderHTML: (attributes: { dropCap?: boolean }) =>
              attributes.dropCap ? { 'data-drop-cap': 'true', class: 'has-drop-cap' } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      toggleParagraphIndent:
        () =>
        ({ editor, commands }) => {
          const current = Boolean(editor.getAttributes('paragraph').indent);
          return commands.updateAttributes('paragraph', { indent: !current });
        },
      setParagraphIndent:
        (indent: boolean) =>
        ({ commands }) => {
          return commands.updateAttributes('paragraph', { indent });
        },
      toggleDropCap:
        () =>
        ({ editor, commands }) => {
          const current = Boolean(editor.getAttributes('paragraph').dropCap);
          return commands.updateAttributes('paragraph', { dropCap: !current });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive('listItem') || this.editor.isActive('codeBlock')) {
          return false;
        }
        if (this.editor.isActive('paragraph')) {
          this.editor.commands.setParagraphIndent(true);
          return true;
        }
        return false;
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('listItem') || this.editor.isActive('codeBlock')) {
          return false;
        }
        if (this.editor.isActive('paragraph')) {
          if (this.editor.getAttributes('paragraph').indent) {
            this.editor.commands.setParagraphIndent(false);
          }
          return true;
        }
        return false;
      },
      Backspace: () => {
        const { selection } = this.editor.state;
        if (!selection.empty) return false;
        const { $from } = selection;
        if (
          $from.parent.type.name === 'paragraph' &&
          $from.parentOffset === 0 &&
          $from.parent.attrs.indent === true
        ) {
          return this.editor.commands.setParagraphIndent(false);
        }
        return false;
      },
    };
  },
});
