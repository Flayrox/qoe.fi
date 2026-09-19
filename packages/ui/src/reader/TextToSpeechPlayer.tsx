'use client';

import React, { useEffect } from 'react';
import { t } from '@lingui/core/macro';
import { Volume2 } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { cn } from '@qoe/utils';
import { useTextToSpeech, TextToSpeechProvider } from './TextToSpeechContext';

export interface TextToSpeechPlayerProps {
  articleTitle: string;
  articleCoverUrl?: string | null;
  authorName?: string | null;
  articleContentSelector?: string;
  lang?: string;
  className?: string;
}

export function TextToSpeechPlayer(props: TextToSpeechPlayerProps) {
  const tts = useTextToSpeech();

  if (!tts) {
    return (
      <TextToSpeechProvider
        initialMetadata={{
          title: props.articleTitle,
          coverUrl: props.articleCoverUrl,
          authorName: props.authorName,
          contentSelector: props.articleContentSelector,
        }}
      >
        <TextToSpeechPlayerInner {...props} />
      </TextToSpeechProvider>
    );
  }

  return <TextToSpeechPlayerInner {...props} />;
}

function TextToSpeechPlayerInner({
  articleTitle,
  articleCoverUrl,
  authorName,
  articleContentSelector = '#article-content',
  className = '',
}: TextToSpeechPlayerProps) {
  const tts = useTextToSpeech()!;

  const setMetadata = tts.setMetadata;

  // Enregistre les métadonnées de l'article uniquement si elles ont changé
  useEffect(() => {
    if (
      articleTitle &&
      (tts.articleTitle !== articleTitle ||
        tts.articleCoverUrl !== (articleCoverUrl || null) ||
        tts.authorName !== (authorName || null))
    ) {
      setMetadata({
        title: articleTitle,
        coverUrl: articleCoverUrl,
        authorName,
        contentSelector: articleContentSelector,
      });
    }
  }, [
    setMetadata,
    articleTitle,
    articleCoverUrl,
    authorName,
    articleContentSelector,
    tts.articleTitle,
    tts.articleCoverUrl,
    tts.authorName,
  ]);

  const handleToggle = () => {
    if (!tts) {
      toast.error(t`La synthèse vocale n'est pas initialisée.`);
      return;
    }
    if (!tts.isSupported) {
      toast.error(t`La synthèse vocale n'est pas supportée sur ce navigateur.`);
      return;
    }
    if (tts.isPlaying || tts.isOpen) {
      tts.closePlayer();
    } else {
      tts.openAndPlay();
    }
  };

  const isPlaying = tts.isPlaying;

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-xs transition-all cursor-pointer select-none font-sans',
        isPlaying
          ? 'qoe-audio-btn-active hover:opacity-90'
          : 'border-border/60 bg-background/90 hover:bg-muted/80 text-foreground',
        className
      )}
      title={isPlaying ? t`Arrêter la lecture audio` : t`Écouter l'article`}
    >
      {isPlaying ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full qoe-audio-dot-ping opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 qoe-audio-dot" />
          </span>
          <Volume2 className="w-3.5 h-3.5 qoe-audio-icon animate-pulse" />
          <span>{t`Arrêter`}</span>
        </>
      ) : (
        <>
          <Volume2 className="w-3.5 h-3.5 text-primary" />
          <span>{t`Écouter`}</span>
        </>
      )}
    </button>
  );
}
