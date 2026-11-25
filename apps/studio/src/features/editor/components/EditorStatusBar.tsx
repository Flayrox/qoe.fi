'use client';

import React from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { Clock, Highlighter, ImageOff, Keyboard, ShieldCheck, Type } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { useModKey } from '../hooks/useModKey';
import { countMissingAlt } from '../lib/alt-coverage';
import { Button } from '@qoe/ui/button';

export interface EditorStatusBarProps {
  editor: Editor;
  /** Ouvre la note d'auteur quand le curseur est dans une annotation. */
  onOpenAnnotation?: () => void;
  /** Ouvre le panneau de détails de la première image sans alt. */
  onFixAltMissing?: () => void;
  /** Ouvre l'aide des raccourcis. */
  onOpenShortcuts?: () => void;
  /** Ouvre le préflight de publication. */
  onOpenPreflight?: () => void;
}

/** Même base de calcul que l'API (`saveArticleAction`) : 200 mots/minute. */
const WORDS_PER_MINUTE = 200;

/**
 * Bandeau d'informations sous le corps d'article. Volontairement muet :
 * trois chiffres utiles au moment de publier, et rien d'autre.
 */
export function EditorStatusBar({
  editor,
  onOpenAnnotation,
  onFixAltMissing,
  onOpenShortcuts,
  onOpenPreflight,
}: EditorStatusBarProps) {
  const MOD = useModKey();

  const stats = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const counter = current.storage.characterCount as
        { words: () => number; characters: () => number } | undefined;

      // B2 : le compteur est la seule vue d'ensemble des images sans alt.
      // Il est recalculé avec la sélection, donc il suit immédiatement une
      // correction dans le panneau de détails.
      return {
        words: counter?.words?.() ?? 0,
        characters: counter?.characters?.() ?? 0,
        annotation: current.isActive('annotationMark'),
        altMissing: countMissingAlt(current.state.doc),
      };
    },
  });

  const minutes = Math.max(1, Math.ceil(stats.words / WORDS_PER_MINUTE));
  const showReadingTime = stats.words > 0;

  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/40 pt-3 font-sans text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        <Type className="h-3 w-3" aria-hidden="true" />
        {stats.words} {stats.words === 1 ? t`mot` : t`mots`}
        <span className="text-muted-foreground/40" aria-hidden="true">
          ·
        </span>
        {stats.characters.toLocaleString()} {t`caractères`}
      </span>
      {showReadingTime && (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {minutes} {t`min de lecture`}
        </span>
      )}
      {stats.annotation && onOpenAnnotation && (
        <Button
          variant="soft"
          tone="brand"
          size="xs"
          // Le bouton est hors de l'éditeur : sans cela, le focus quittait le
          // document et la sélection courante pouvait être perdue.
          onMouseDown={(event) => event.preventDefault()}
          onClick={onOpenAnnotation}
          className="h-auto items-center gap-1.5 rounded-md border border-primary/20 px-2 py-1 font-semibold text-primary hover:bg-primary/15"
        >
          <Highlighter className="h-3 w-3 shrink-0" aria-hidden="true" />
          {t`Modifier la note d'auteur`}
        </Button>
      )}
      {stats.altMissing > 0 && onFixAltMissing && (
        <Button
          variant="ghost"
          size="xs"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onFixAltMissing}
          title={t`Corriger la première image sans description`}
          className="items-center gap-1.5 rounded-md border border-highlight/25 bg-highlight/10 px-2 py-1 font-semibold! text-highlight hover:bg-highlight/15 h-auto! [font-size:inherit]! leading-[inherit]! whitespace-normal! justify-normal "
        >
          <ImageOff className="h-3! w-3! shrink-0" aria-hidden="true" />
          {stats.altMissing} {stats.altMissing === 1 ? t`image sans alt` : t`images sans alt`}
        </Button>
      )}
      <div className="ml-auto flex items-center gap-3">
        {onOpenPreflight && (
          <Button
            variant="outline"
            size="xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onOpenPreflight}
            title={t`Vérifier l'article avant publication`}
            className="items-center gap-1.5 rounded-md border-border/50 bg-background/60 px-2 py-1 font-semibold! text-foreground hover:bg-muted/60 h-auto! [font-size:inherit]! leading-[inherit]! whitespace-normal! justify-normal "
          >
            <ShieldCheck className="h-3! w-3!" aria-hidden="true" />
            {t`Prêt à publier`}
          </Button>
        )}
        {onOpenShortcuts && (
          <Button
            variant="ghost"
            size="xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onOpenShortcuts}
            title={t`Afficher les raccourcis`}
            className="items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]! text-muted-foreground hover:bg-muted/60 hover:text-foreground h-auto! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal "
          >
            <Keyboard className="h-3! w-3!" aria-hidden="true" />
            {t`Raccourcis`}
          </Button>
        )}
        <span className="hidden text-[11px] text-muted-foreground/60 sm:inline">
          {t`Enregistrement auto · ${MOD}S pour forcer`}
        </span>
      </div>
    </div>
  );
}
