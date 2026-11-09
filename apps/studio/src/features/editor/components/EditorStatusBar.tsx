'use client';

import React from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { Clock, Highlighter, Type } from 'lucide-react';
import { t } from '@lingui/core/macro';

export interface EditorStatusBarProps {
  editor: Editor;
  /** Ouvre la note d'auteur quand le curseur est dans une annotation. */
  onOpenAnnotation?: () => void;
}

/** Même base de calcul que l'API (`saveArticleAction`) : 200 mots/minute. */
const WORDS_PER_MINUTE = 200;

/**
 * Bandeau d'informations sous le corps d'article. Volontairement muet :
 * trois chiffres utiles au moment de publier, et rien d'autre.
 */
export function EditorStatusBar({ editor, onOpenAnnotation }: EditorStatusBarProps) {
  const stats = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const counter = current.storage.characterCount as
        { words: () => number; characters: () => number } | undefined;
      return {
        words: counter?.words?.() ?? 0,
        characters: counter?.characters?.() ?? 0,
        annotation: current.isActive('annotationMark'),
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
        <button
          type="button"
          // Le bouton est hors de l'éditeur : sans cela, le focus quittait le
          // document et la sélection courante pouvait être perdue.
          onMouseDown={(event) => event.preventDefault()}
          onClick={onOpenAnnotation}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Highlighter className="h-3 w-3 shrink-0" aria-hidden="true" />
          {t`Modifier la note d'auteur`}
        </button>
      )}
      <span className="ml-auto hidden sm:inline text-[11px] text-muted-foreground/60">
        {t`Enregistrement auto · ⌘S pour forcer`}
      </span>
    </div>
  );
}
