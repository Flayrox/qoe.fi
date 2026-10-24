'use client';

import React from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  ImageIcon,
  Loader2,
  Highlighter,
  Lock,
  Images,
  Undo2,
  Redo2,
  Link2,
  TextQuote,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';

interface ToolbarButtonProps {
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  tooltip: string;
  disabled?: boolean;
}

function ToolbarButton({ active, onClick, icon, tooltip, disabled }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      aria-label={tooltip}
      disabled={disabled}
      className={cn(
        'h-8 w-8 shrink-0 flex items-center justify-center rounded-lg transition-all duration-150 font-sans text-sm cursor-pointer active:scale-90 hover:scale-105',
        active
          ? 'bg-primary text-primary-foreground shadow-[0_0_12px_rgba(238,75,43,0.35)] font-semibold'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
        disabled && 'opacity-50 cursor-not-allowed hover:scale-100 active:scale-100'
      )}
    >
      {icon}
    </button>
  );
}

function Separator() {
  return <div className="h-4 w-px shrink-0 bg-border/40 mx-1.5" aria-hidden="true" />;
}

export interface EditorToolbarProps {
  editor: Editor;
  docked: boolean;
  isUploading: boolean;
  uploadCount: number;
  onPickImage: () => void;
  onPickGallery: () => void;
  onAnnotation: () => void;
  onLink: () => void;
  onImageDetails: () => void;
}

/**
 * Barre d'outils horizontale : ne passe plus sur deux lignes au risque de
 * pousser le contenu. Sur petit écran elle défile horizontalement.
 */
export function EditorToolbar({
  editor,
  docked,
  isUploading,
  uploadCount,
  onPickImage,
  onPickGallery,
  onAnnotation,
  onLink,
  onImageDetails,
}: EditorToolbarProps) {
  return (
    <div
      className={cn(
        'sticky top-14 z-20 transition-all duration-300 py-1.5 px-2',
        docked
          ? 'bg-background/85 backdrop-blur-2xl border-x border-b border-border/80 dark:border-primary/25 rounded-2xl shadow-[0_16px_36px_-6px_rgba(0,0,0,0.18),0_0_15px_rgba(238,75,43,0.06)]'
          : 'bg-card/60 backdrop-blur-md border border-border/40 rounded-2xl shadow-2xs'
      )}
    >
      <div className="flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          icon={<Undo2 className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Annuler (⌘Z)`}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          icon={<Redo2 className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Rétablir (⌘⇧Z)`}
        />

        <Separator />

        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          icon={<Bold className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Gras`}
        />
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          icon={<Italic className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Italique`}
        />
        <ToolbarButton
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          icon={<UnderlineIcon className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Souligné`}
        />
        <ToolbarButton
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          icon={<Strikethrough className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Barré`}
        />
        <ToolbarButton
          active={editor.isActive('link')}
          onClick={onLink}
          icon={<Link2 className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Lien (⌘K)`}
        />
        <ToolbarButton
          onClick={onImageDetails}
          icon={<TextQuote className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Légende et crédit de l'image`}
        />

        <Separator />

        <ToolbarButton
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          icon={<Heading1 className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Titre 1`}
        />
        <ToolbarButton
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          icon={<Heading2 className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Titre 2`}
        />
        <ToolbarButton
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          icon={<Heading3 className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Titre 3`}
        />

        <Separator />

        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          icon={<List className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Liste à puces`}
        />
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          icon={<ListOrdered className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Liste numérotée`}
        />

        <Separator />

        <ToolbarButton
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          icon={<Quote className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Citation`}
        />
        <ToolbarButton
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          icon={<Code className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Bloc de Code`}
        />

        <Separator />

        <ToolbarButton
          onClick={onPickImage}
          icon={
            isUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5 stroke-[2]" />
            )
          }
          tooltip={
            isUploading && uploadCount > 0
              ? t`Upload en cours (${uploadCount})`
              : t`Insérer une image`
          }
          disabled={isUploading}
        />
        <ToolbarButton
          onClick={onPickGallery}
          icon={<Images className="h-3.5 w-3.5 stroke-[2]" />}
          tooltip={t`Insérer une galerie (plusieurs images sur une ligne)`}
          disabled={isUploading}
        />

        <Separator />

        <ToolbarButton
          active={editor.isActive('annotationMark')}
          onClick={onAnnotation}
          icon={<Highlighter className="h-3.5 w-3.5 text-highlight stroke-[2]" />}
          tooltip={
            editor.isActive('annotationMark')
              ? t`Modifier / Supprimer la note d'auteur`
              : t`Ajouter une note d'auteur (⌘+Shift+A)`
          }
        />

        <Separator />

        <ToolbarButton
          onClick={() => editor.chain().focus().setPaywallDivider().run()}
          icon={<Lock className="h-3.5 w-3.5 text-highlight stroke-[2]" />}
          tooltip={t`Insérer la limite Paywall (Contenu Premium)`}
        />
      </div>
    </div>
  );
}
