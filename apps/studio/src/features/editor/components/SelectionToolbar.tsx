'use client';

import React from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Code2, Highlighter, Italic, Link2, Strikethrough, Underline } from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';

export interface SelectionToolbarProps {
  editor: Editor;
  onLink: () => void;
  onAnnotation: () => void;
}

interface BubbleButtonProps {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}

function BubbleButton({ active, onClick, label, children }: BubbleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active ?? undefined}
      className={cn(
        'h-7 w-7 flex items-center justify-center rounded-md transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function BubbleDivider() {
  return <div className="mx-0.5 h-4 w-px bg-border/70" aria-hidden="true" />;
}

/**
 * Menu flottant sur sélection : la mise en forme est là où le regard est,
 * sans remonter à la barre d'outils. Il ne s'ouvre que sur une sélection de
 * texte — pas sur un nœud (image, galerie, limite paywall) où les marques
 * n'ont pas de sens.
 */
export function SelectionToolbar({ editor, onLink, onAnnotation }: SelectionToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      strike: current.isActive('strike'),
      code: current.isActive('code'),
      link: current.isActive('link'),
    }),
  });

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 10 }}
      shouldShow={({ from, to, editor: current }) => {
        // Seule une sélection de texte ouvre le menu : une sélection de nœud
        // (image, galerie, limite paywall) n'accepte aucune marque.
        if (from === to || !(current.state.selection instanceof TextSelection)) return false;
        if (current.isActive('codeBlock')) return false;
        const block = current.state.selection.$from.parent.type.name;
        return block === 'paragraph' || block === 'heading';
      }}
      className="flex items-center gap-0.5 rounded-xl border border-border/70 bg-popover/95 p-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.24)] backdrop-blur-xl"
    >
      <BubbleButton
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label={t`Gras`}
      >
        <Bold className="h-3.5 w-3.5 stroke-2" />
      </BubbleButton>
      <BubbleButton
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label={t`Italique`}
      >
        <Italic className="h-3.5 w-3.5 stroke-2" />
      </BubbleButton>
      <BubbleButton
        active={state.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        label={t`Souligné`}
      >
        <Underline className="h-3.5 w-3.5 stroke-2" />
      </BubbleButton>
      <BubbleButton
        active={state.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        label={t`Barré`}
      >
        <Strikethrough className="h-3.5 w-3.5 stroke-2" />
      </BubbleButton>
      <BubbleButton
        active={state.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
        label={t`Code en ligne`}
      >
        <Code2 className="h-3.5 w-3.5 stroke-2" />
      </BubbleButton>

      <BubbleDivider />

      <BubbleButton active={state.link} onClick={onLink} label={t`Lien`}>
        <Link2 className="h-3.5 w-3.5 stroke-2" />
      </BubbleButton>
      <BubbleButton onClick={onAnnotation} label={t`Note d'auteur`}>
        <Highlighter className="h-3.5 w-3.5 stroke-2" />
      </BubbleButton>
    </BubbleMenu>
  );
}
