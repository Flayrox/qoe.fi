import { Mark, mergeAttributes } from '@tiptap/core'

export interface AnnotationMarkOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    annotationMark: {
      setAnnotationMark: (attributes: { note: string }) => ReturnType
      unsetAnnotationMark: () => ReturnType
    }
  }
}

export const AnnotationMark = Mark.create<AnnotationMarkOptions>({
  name: 'annotationMark',

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'bg-amber-500/20 text-foreground border-b-2 border-amber-500 font-medium cursor-pointer rounded-xs px-1',
      },
    }
  },

  addAttributes() {
    return {
      note: {
        default: null,
        parseHTML: element => element.getAttribute('data-annotation-note'),
        renderHTML: attributes => {
          if (!attributes.note) return {}
          return {
            'data-annotation-note': attributes.note,
            'data-is-official': 'true',
            'title': `Annotation auteur : ${attributes.note}`,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'mark[data-annotation-note]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setAnnotationMark:
        attributes =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes)
        },
      unsetAnnotationMark:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name)
        },
    }
  },
})
