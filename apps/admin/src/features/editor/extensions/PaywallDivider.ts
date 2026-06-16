import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { PaywallDividerComponent } from "./PaywallDividerComponent"

export interface PaywallDividerOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paywallDivider: {
      /**
       * Insert a paywall divider
       */
      setPaywallDivider: () => ReturnType,
    }
  }
}

export const PaywallDivider = Node.create<PaywallDividerOptions>({
  name: 'paywallDivider',

  group: 'block',

  selectable: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'paywall-divider',
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="paywall-divider"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }: any) {
    return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-type': 'paywall-divider' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PaywallDividerComponent)
  },

  addCommands() {
    return {
      setPaywallDivider: () => ({ commands }: any) => {
        return commands.insertContent({
          type: this.name,
        })
      },
    }
  },
})
