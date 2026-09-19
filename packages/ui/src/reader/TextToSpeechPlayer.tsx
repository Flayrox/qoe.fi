'use client';

import React, { useEffect } from 'react';
import { t } from '@lingui/core/macro';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  X,
  Gauge,
  RotateCcw,
  RotateCw,
  Compass,
} from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { cn } from '@qoe/utils';
import { useTextToSpeech, TextToSpeechProvider } from './TextToSpeechContext';
import { useReadingPreferences } from './ReadingPreferencesContext';

function formatTime(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.floor(Math.max(0, seconds) % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

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
  const { preferences } = useReadingPreferences();

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

  if (!tts) return null;

  const {
    isOpen,
    isPlaying,
    currentParagraphIndex,
    paragraphs,
    playbackRate,
    elapsedSeconds,
    remainingSeconds,
    progressPercent,
    userScrolledAway,
    togglePlayPause,
    prevParagraph,
    nextParagraph,
    skipSeconds,
    jumpToParagraph,
    cycleSpeed,
    resumeAutoScroll,
    closePlayer,
  } = tts;

  const currentIdx = currentParagraphIndex !== null ? currentParagraphIndex : 0;
  const totalParas = Math.max(1, paragraphs.length);

  return (
    <>
      {/* 1. Bouton persistant dans le Header ou l'Auteur (actif si lecture en cours) */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-xs transition-all cursor-pointer select-none',
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

      {/* 2. Mini-Lecteur Audio Flottant Immersif avec Scrubber & Karaoké */}
      {isOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[94%] sm:w-auto min-w-[340px] max-w-xl bg-popover/95 text-popover-foreground backdrop-blur-2xl border border-border/60 shadow-2xl rounded-2xl p-3 flex flex-col gap-2 font-sans animate-in fade-in-0 slide-in-from-bottom-4 duration-200">
          {/* Puce flottante : Reprendre le suivi automatique si l'utilisateur a scrollé ailleurs */}
          {userScrolledAway && (
            <button
              type="button"
              onClick={resumeAutoScroll}
              className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-background/95 text-foreground border border-border/50 shadow-lg text-[11px] font-semibold backdrop-blur-md hover:bg-muted cursor-pointer transition-all animate-in fade-in slide-in-from-bottom-2"
              title={t`Recentrer le texte sur la lecture en cours`}
            >
              <Compass className="w-3.5 h-3.5 text-primary animate-pulse" />
              <span>{t`Suivre la lecture`}</span>
            </button>
          )}

          {/* Ligne 1 : Play/Pause, Titre, Numéro de paragraphe et Contrôles */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 pr-1">
              <button
                type="button"
                onClick={togglePlayPause}
                className="w-9 h-9 rounded-xl bg-foreground text-background dark:bg-white dark:text-black flex items-center justify-center shadow-xs hover:opacity-90 transition-all cursor-pointer shrink-0"
                title={isPlaying ? t`Mettre en pause` : t`Reprendre la lecture`}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5 fill-current" />
                )}
              </button>

              <div className="min-w-0">
                <p className="text-xs font-semibold truncate text-foreground">{articleTitle}</p>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">
                    {t`Paragraphe`} {currentIdx + 1} / {totalParas}
                  </span>
                  <span>·</span>
                  <span>
                    {formatTime(remainingSeconds)} {t`restant`}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Recul 15s */}
              <button
                type="button"
                onClick={() => skipSeconds(-15)}
                className="w-7 h-7 rounded-lg hover:bg-muted/70 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title={t`Reculer de 15 secondes`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              {/* Paragraphe précédent */}
              <button
                type="button"
                onClick={prevParagraph}
                disabled={currentIdx === 0}
                className="w-7 h-7 rounded-lg hover:bg-muted/70 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer transition-colors"
                title={t`Paragraphe précédent`}
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>

              {/* Paragraphe suivant */}
              <button
                type="button"
                onClick={nextParagraph}
                disabled={currentIdx + 1 >= totalParas}
                className="w-7 h-7 rounded-lg hover:bg-muted/70 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer transition-colors"
                title={t`Paragraphe suivant`}
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>

              {/* Avance 15s */}
              <button
                type="button"
                onClick={() => skipSeconds(15)}
                className="w-7 h-7 rounded-lg hover:bg-muted/70 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title={t`Avancer de 15 secondes`}
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              {/* Vitesse */}
              <button
                type="button"
                onClick={cycleSpeed}
                className="px-2 h-7 rounded-lg hover:bg-muted/70 flex items-center gap-1 text-[11px] font-bold text-foreground cursor-pointer transition-colors ml-0.5"
                title={t`Changer la vitesse de lecture`}
              >
                <Gauge className="w-3 h-3 text-primary opacity-80" />
                <span>{playbackRate || preferences.ttsSpeed}x</span>
              </button>

              <div className="w-px h-4 bg-border/50 mx-0.5" />

              {/* Fermer */}
              <button
                type="button"
                onClick={closePlayer}
                className="w-7 h-7 rounded-lg hover:bg-muted/70 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title={t`Fermer le lecteur`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Ligne 2 : Scrubber interactif & Temps */}
          <div className="w-full flex items-center gap-2 pt-0.5 select-none">
            <span className="text-[10px] tabular-nums font-mono text-muted-foreground shrink-0 w-8">
              {formatTime(elapsedSeconds)}
            </span>

            {/* Scrubber Track */}
            <div
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const ratio = Math.max(0, Math.min(1, clickX / rect.width));
                const targetIndex = Math.round(ratio * (totalParas - 1));
                jumpToParagraph(targetIndex);
              }}
              className="relative flex-1 h-2 rounded-full bg-muted/60 hover:bg-muted/90 transition-colors cursor-pointer group flex items-center"
              title={t`Naviguer dans l'article`}
            >
              {/* Filled Track */}
              <div
                className="h-full qoe-audio-scrubber-fill rounded-full transition-all duration-150"
                style={{ width: `${progressPercent}%` }}
              />
              {/* Draggable thumb appearance on hover */}
              <div
                className="absolute w-3.5 h-3.5 rounded-full qoe-audio-scrubber-fill shadow-md -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${progressPercent}%` }}
              />
            </div>

            <span className="text-[10px] tabular-nums font-mono text-muted-foreground shrink-0 w-10 text-right">
              -{formatTime(remainingSeconds)}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
