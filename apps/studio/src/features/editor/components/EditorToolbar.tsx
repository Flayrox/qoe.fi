'use client';

import React from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
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
  Code2,
  Minus,
  Eraser,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@qoe/ui/ui/tooltip';

interface ToolbarButtonProps {
  /** État « allumé » : la mise en forme est active au curseur. */
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
}

/**
 * Un bouton de barre d'outils a trois états lisibles d'un coup d'œil :
 *
 *  - allumé  → pastille inversée (fond `foreground`, icône `background`) ;
 *  - éteint  → icône discrète, fond au survol seulement ;
 *  - bloqué  → icône très effacée, curseur interdit, pas de survol.
 *
 * Pas de halo coloré ni de mise à l'échelle : l'ancien style se confondait
 * avec le survol, d'où l'impression que la barre ne disait pas son état.
 */
function ToolbarButton({ active, onClick, icon, label, shortcut, disabled }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        onClick={disabled ? undefined : onClick}
        aria-label={shortcut ? `${label} (${shortcut})` : label}
        aria-pressed={active ?? undefined}
        // `aria-disabled` plutôt que `disabled` : un bouton réellement
        // désactivé ne peut plus afficher son infobulle, donc plus expliquer
        // pourquoi il l'est.
        aria-disabled={disabled ?? undefined}
        className={cn(
          'relative h-8 w-8 shrink-0 flex items-center justify-center rounded-[10px] font-sans',
          'transition-[background-color,color,opacity] duration-150 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          active
            ? 'bg-foreground text-background'
            : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
          disabled &&
            'opacity-35 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground'
        )}
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        <span>{label}</span>
        {shortcut && (
          <kbd
            data-slot="kbd"
            className="border border-background/25 bg-background/15 px-1 py-px text-[10px] leading-4 text-background/90"
          >
            {shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function Separator() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-border/50" aria-hidden="true" />;
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
 * Touche de commande affichée dans les infobulles. Résolue après le montage
 * pour que le HTML serveur et le premier rendu client soient identiques
 * (sinon les `aria-label` divergent et React signale une erreur d'hydratation).
 */
function useModKey(): string {
  const [mod, setMod] = React.useState('Ctrl');
  React.useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setMod('⌘');
  }, []);
  return mod;
}

/** `can()` lève une erreur si la commande n'existe pas (mode co-édition). */
function safeCan(run: () => boolean): boolean {
  try {
    return run();
  } catch {
    return true;
  }
}

/**
 * Barre d'outils horizontale. Elle passe en deux lignes sur petit écran
 * plutôt que de cacher des boutons derrière un défilement muet.
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
  const MOD = useModKey();
  // Tiptap v3 ne re-rend plus à chaque transaction par défaut : lire
  // `editor.isActive()` pendant le rendu laissait la barre figée jusqu'au
  // prochain changement de document. `useEditorState` abonne la barre à la
  // sélection et aux marques : l'état suit le clic et le curseur.
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const inCodeBlock = current.isActive('codeBlock');
      return {
        bold: current.isActive('bold'),
        italic: current.isActive('italic'),
        underline: current.isActive('underline'),
        strike: current.isActive('strike'),
        link: current.isActive('link'),
        code: current.isActive('code'),
        h1: current.isActive('heading', { level: 1 }),
        h2: current.isActive('heading', { level: 2 }),
        h3: current.isActive('heading', { level: 3 }),
        bulletList: current.isActive('bulletList'),
        orderedList: current.isActive('orderedList'),
        blockquote: current.isActive('blockquote'),
        codeBlock: inCodeBlock,
        annotation: current.isActive('annotationMark'),
        hasPaywall: current.state.doc.content.content.some(
          (node) => node.type.name === 'paywallDivider'
        ),
        canUndo: safeCan(() => current.can().undo()),
        canRedo: safeCan(() => current.can().redo()),
        // Dans un bloc de code, les marques de texte ne s'appliquent pas.
        canFormat: !inCodeBlock,
      };
    },
  });

  return (
    <TooltipProvider delay={450}>
      <div
        role="toolbar"
        aria-label={t`Mise en forme`}
        className={cn(
          'sticky top-14 z-20 transition-all duration-300 py-1.5 px-2',
          docked
            ? 'bg-background/85 backdrop-blur-2xl border-x border-b border-border/80 dark:border-primary/25 rounded-2xl shadow-[0_16px_36px_-6px_rgba(0,0,0,0.18)]'
            : 'bg-card/60 backdrop-blur-md border border-border/40 rounded-2xl shadow-2xs'
        )}
      >
        <div className="flex flex-wrap items-center gap-y-1">
          <div role="group" aria-label={t`Historique`} className="flex items-center gap-0.5">
            <ToolbarButton
              onClick={() => editor.chain().focus().undo().run()}
              icon={<Undo2 className="h-3.5 w-3.5 stroke-2" />}
              label={t`Annuler`}
              shortcut={`${MOD}Z`}
              disabled={!state.canUndo}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().redo().run()}
              icon={<Redo2 className="h-3.5 w-3.5 stroke-2" />}
              label={t`Rétablir`}
              shortcut={`${MOD}⇧Z`}
              disabled={!state.canRedo}
            />
          </div>

          <Separator />

          <div role="group" aria-label={t`Style de texte`} className="flex items-center gap-0.5">
            <ToolbarButton
              active={state.bold}
              onClick={() => editor.chain().focus().toggleBold().run()}
              icon={<Bold className="h-3.5 w-3.5 stroke-2" />}
              label={t`Gras`}
              shortcut={`${MOD}B`}
              disabled={!state.canFormat}
            />
            <ToolbarButton
              active={state.italic}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              icon={<Italic className="h-3.5 w-3.5 stroke-2" />}
              label={t`Italique`}
              shortcut={`${MOD}I`}
              disabled={!state.canFormat}
            />
            <ToolbarButton
              active={state.underline}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              icon={<UnderlineIcon className="h-3.5 w-3.5 stroke-2" />}
              label={t`Souligné`}
              shortcut={`${MOD}U`}
              disabled={!state.canFormat}
            />
            <ToolbarButton
              active={state.strike}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              icon={<Strikethrough className="h-3.5 w-3.5 stroke-2" />}
              label={t`Barré`}
              shortcut={`${MOD}⇧X`}
              disabled={!state.canFormat}
            />
            <ToolbarButton
              active={state.code}
              onClick={() => editor.chain().focus().toggleCode().run()}
              icon={<Code2 className="h-3.5 w-3.5 stroke-2" />}
              label={t`Code en ligne`}
              shortcut={`${MOD}E`}
              disabled={!state.canFormat}
            />
            <ToolbarButton
              active={state.link}
              onClick={onLink}
              icon={<Link2 className="h-3.5 w-3.5 stroke-2" />}
              label={state.link ? t`Modifier le lien` : t`Ajouter un lien`}
              shortcut={`${MOD}K`}
            />
          </div>

          <Separator />

          <div role="group" aria-label={t`Niveau de titre`} className="flex items-center gap-0.5">
            <ToolbarButton
              active={state.h1}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              icon={<Heading1 className="h-3.5 w-3.5 stroke-2" />}
              label={t`Titre 1`}
              shortcut={`${MOD}⌥1`}
            />
            <ToolbarButton
              active={state.h2}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              icon={<Heading2 className="h-3.5 w-3.5 stroke-2" />}
              label={t`Titre 2`}
              shortcut={`${MOD}⌥2`}
            />
            <ToolbarButton
              active={state.h3}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              icon={<Heading3 className="h-3.5 w-3.5 stroke-2" />}
              label={t`Titre 3`}
              shortcut={`${MOD}⌥3`}
            />
          </div>

          <Separator />

          <div role="group" aria-label={t`Listes`} className="flex items-center gap-0.5">
            <ToolbarButton
              active={state.bulletList}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              icon={<List className="h-3.5 w-3.5 stroke-2" />}
              label={t`Liste à puces`}
              shortcut={`${MOD}⇧8`}
            />
            <ToolbarButton
              active={state.orderedList}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              icon={<ListOrdered className="h-3.5 w-3.5 stroke-2" />}
              label={t`Liste numérotée`}
              shortcut={`${MOD}⇧7`}
            />
          </div>

          <Separator />

          <div role="group" aria-label={t`Blocs`} className="flex items-center gap-0.5">
            <ToolbarButton
              active={state.blockquote}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              icon={<Quote className="h-3.5 w-3.5 stroke-2" />}
              label={t`Citation`}
              shortcut={`${MOD}⇧B`}
            />
            <ToolbarButton
              active={state.codeBlock}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              icon={<Code className="h-3.5 w-3.5 stroke-2" />}
              label={t`Bloc de code`}
              shortcut={`${MOD}⌥C`}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              icon={<Minus className="h-3.5 w-3.5 stroke-2" />}
              label={t`Séparateur`}
            />
          </div>

          <Separator />

          <div role="group" aria-label={t`Médias`} className="flex items-center gap-0.5">
            <ToolbarButton
              onClick={onPickImage}
              icon={
                isUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5 stroke-2" />
                )
              }
              label={
                isUploading && uploadCount > 0
                  ? t`Envoi en cours (${uploadCount})`
                  : t`Insérer une image`
              }
              disabled={isUploading}
            />
            <ToolbarButton
              onClick={onPickGallery}
              icon={<Images className="h-3.5 w-3.5 stroke-2" />}
              label={t`Insérer une galerie`}
              disabled={isUploading}
            />
            <ToolbarButton
              onClick={onImageDetails}
              icon={<TextQuote className="h-3.5 w-3.5 stroke-2" />}
              label={t`Légende et crédit de l'image`}
            />
          </div>

          <Separator />

          <div role="group" aria-label={t`Annotations`} className="flex items-center gap-0.5">
            <ToolbarButton
              active={state.annotation}
              onClick={onAnnotation}
              icon={<Highlighter className="h-3.5 w-3.5 stroke-2" />}
              label={state.annotation ? t`Modifier la note d'auteur` : t`Ajouter une note d'auteur`}
              shortcut={`${MOD}⇧A`}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
              icon={<Eraser className="h-3.5 w-3.5 stroke-2" />}
              label={t`Effacer la mise en forme`}
              disabled={!state.canFormat}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().setPaywallDivider().run()}
              icon={<Lock className="h-3.5 w-3.5 stroke-2" />}
              label={
                state.hasPaywall
                  ? t`Une limite Paywall est déjà placée`
                  : t`Insérer la limite Paywall`
              }
              disabled={state.hasPaywall}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
