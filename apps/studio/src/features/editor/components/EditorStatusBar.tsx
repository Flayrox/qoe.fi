'use client';

import React from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { Clock, Type } from 'lucide-react';
import { t } from '@lingui/core/macro';

export interface EditorStatusBarProps {
  editor: Editor;
}

/** Même base de calcul que l'API (`saveArticleAction`) : 200 mots/minute. */
const WORDS_PER_MINUTE = 200;

/**
 * Bandeau d'informations sous le corps d'article. Volontairement muet :
 * trois chiffres utiles au moment de publier, et rien d'autre.
 */
export function EditorStatusBar({ editor }: EditorStatusBarProps) {
  const stats = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const counter = current.storage.characterCount as
        { words: () => number; characters: () => number } | undefined;
      return {
        words: counter?.words?.() ?? 0,
        characters: counter?.characters?.() ?? 0,
      };
    },
  });

  const minutes = Math.max(1, Math.ceil(stats.words / WORDS_PER_MINUTE));
  const showReadingTime = stats.words > 0;

  return (
    <div className="mt-6 flex items-center gap-4 border-t border-border/40 pt-3 font-sans text-[11px] text-muted-foreground">
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
      <span className="ml-auto hidden sm:inline text-[11px] text-muted-foreground/60">
        {t`Enregistrement auto · ⌘S pour forcer`}
      </span>
    </div>
  );
}
