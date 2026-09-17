'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { t } from '@lingui/core/macro';
import { Play, Pause, SkipBack, SkipForward, Volume2, X, Gauge } from 'lucide-react';
import { useReadingPreferences } from './ReadingPreferencesContext';

interface TextToSpeechPlayerProps {
  articleTitle: string;
  articleContentSelector?: string;
  lang?: string;
  onActiveParagraphChange?: (index: number | null) => void;
  className?: string;
}

export function TextToSpeechPlayer({
  articleTitle,
  articleContentSelector = '#article-content',
  lang = 'fr-FR',
  onActiveParagraphChange,
  className = '',
}: TextToSpeechPlayerProps) {
  const { preferences, update } = useReadingPreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Extract paragraphs from article DOM
  const extractParagraphs = useCallback(() => {
    if (typeof document === 'undefined') return [];
    const container = document.querySelector(articleContentSelector);
    if (!container) return [];

    const nodes = container.querySelectorAll('p, h2, h3, blockquote');
    const texts: string[] = [];
    nodes.forEach((node) => {
      const text = (node.textContent || '').trim();
      if (text.length > 10) {
        texts.push(text);
      }
    });
    return texts;
  }, [articleContentSelector]);

  const stopPlayback = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    onActiveParagraphChange?.(null);
  }, [isSupported, onActiveParagraphChange]);

  const speakParagraph = useCallback(
    (index: number, textList: string[]) => {
      if (!isSupported) return;
      window.speechSynthesis.cancel();

      if (index >= textList.length) {
        stopPlayback();
        return;
      }

      setCurrentIndex(index);
      onActiveParagraphChange?.(index);

      const text = textList[index];
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = preferences.ttsSpeed;

      // Select high-quality voice for the target language if available
      const voices = window.speechSynthesis.getVoices();
      const matchingVoice =
        voices.find(
          (v) =>
            v.lang.startsWith(lang.slice(0, 2)) &&
            (v.name.includes('Natural') || v.name.includes('Premium'))
        ) || voices.find((v) => v.lang.startsWith(lang.slice(0, 2)));

      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }

      utterance.onend = () => {
        if (index + 1 < textList.length) {
          speakParagraph(index + 1, textList);
        } else {
          stopPlayback();
        }
      };

      utterance.onerror = () => {
        stopPlayback();
      };

      currentUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
    },
    [isSupported, lang, preferences.ttsSpeed, onActiveParagraphChange, stopPlayback]
  );

  const startPlayback = () => {
    const extracted = paragraphs.length > 0 ? paragraphs : extractParagraphs();
    if (extracted.length === 0) return;

    setParagraphs(extracted);
    setIsOpen(true);
    speakParagraph(currentIndex, extracted);
  };

  const togglePlayPause = () => {
    if (!isSupported) return;
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      const extracted = paragraphs.length > 0 ? paragraphs : extractParagraphs();
      if (extracted.length > 0) {
        setParagraphs(extracted);
        speakParagraph(currentIndex, extracted);
      }
    }
  };

  const handleNext = () => {
    if (currentIndex + 1 < paragraphs.length) {
      speakParagraph(currentIndex + 1, paragraphs);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      speakParagraph(currentIndex - 1, paragraphs);
    }
  };

  const cycleSpeed = () => {
    const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
    const nextIdx = (speeds.indexOf(preferences.ttsSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    update({ ttsSpeed: nextSpeed });

    if (isPlaying && paragraphs.length > 0) {
      speakParagraph(currentIndex, paragraphs);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!isSupported) return null;

  return (
    <>
      {/* 1. Trigger Button in Header/Article */}
      {!isOpen && (
        <button
          type="button"
          onClick={startPlayback}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-background/90 hover:bg-muted/80 text-foreground text-xs font-semibold shadow-xs transition-colors cursor-pointer select-none ${className}`}
          title={t`Écouter l'article`}
        >
          <Volume2 className="w-3.5 h-3.5 text-primary" />
          <span>{t`Écouter`}</span>
        </button>
      )}

      {/* 2. Floating Sleek Audio Bar when Active */}
      {isOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] sm:w-auto min-w-[320px] max-w-lg bg-popover/95 text-popover-foreground backdrop-blur-xl border border-border/80 shadow-2xl rounded-2xl p-2.5 flex items-center justify-between gap-3 font-sans animate-in fade-in-0 duration-150">
          <div className="flex items-center gap-2 min-w-0 pr-1">
            <button
              type="button"
              onClick={togglePlayPause}
              className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs hover:opacity-90 transition-opacity cursor-pointer shrink-0"
              title={isPlaying ? t`Mettre en pause` : t`Reprendre la lecture`}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <div className="min-w-0">
              <p className="text-xs font-semibold truncate text-foreground">{articleTitle}</p>
              <p className="text-[10px] text-muted-foreground">
                {t`Paragraphe`} {currentIndex + 1} / {Math.max(1, paragraphs.length)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Previous paragraph */}
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="w-7 h-7 rounded-lg hover:bg-muted/70 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
              title={t`Paragraphe précédent`}
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            {/* Next paragraph */}
            <button
              type="button"
              onClick={handleNext}
              disabled={currentIndex + 1 >= paragraphs.length}
              className="w-7 h-7 rounded-lg hover:bg-muted/70 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
              title={t`Paragraphe suivant`}
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {/* Speed toggle */}
            <button
              type="button"
              onClick={cycleSpeed}
              className="px-2 h-7 rounded-lg hover:bg-muted/70 flex items-center gap-1 text-[11px] font-bold text-foreground cursor-pointer"
              title={t`Changer la vitesse de lecture`}
            >
              <Gauge className="w-3 h-3 text-primary opacity-80" />
              <span>{preferences.ttsSpeed}x</span>
            </button>

            <div className="w-px h-4 bg-border/50 mx-0.5" />

            {/* Close */}
            <button
              type="button"
              onClick={() => {
                stopPlayback();
                setIsOpen(false);
              }}
              className="w-7 h-7 rounded-lg hover:bg-muted/70 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
              title={t`Fermer le lecteur`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
