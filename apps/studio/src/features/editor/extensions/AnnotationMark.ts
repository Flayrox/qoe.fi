import { Mark, mergeAttributes } from '@tiptap/core';
import { markSkin } from '@qoe/ui/mark-skin';

export interface AnnotationMarkOptions {
  HTMLAttributes: Record<string, string | number | boolean | null>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    annotationMark: {
      setAnnotationMark: (attributes: { note: string }) => ReturnType;
      unsetAnnotationMark: () => ReturnType;
    };
  }
}

export const AnnotationMark = Mark.create<AnnotationMarkOptions>({
  name: 'annotationMark',
  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {
        // Même peau que la marque officielle de lecture : double trait ambre,
        // et `font: inherit` côté CSS. L'éditeur ne doit pas être le seul
        // endroit où une annotation change la police du texte annoté.
        class: markSkin('official'),
      },
    };
  },

  addAttributes() {
    return {
      note: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-annotation-note'),
        renderHTML: (attributes) => {
          if (!attributes.note) return {};
          return {
            'data-annotation-note': attributes.note,
            'data-is-official': 'true',
            title: `Annotation auteur : ${attributes.note} — Option/Alt+clic pour modifier`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'mark[data-annotation-note]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setAnnotationMark:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      unsetAnnotationMark:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});
