'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useReadingPreferences } from './ReadingPreferencesContext';
import { toast } from '@qoe/ui/toast';
import { t } from '@lingui/core/macro';

export interface TextToSpeechMetadata {
  title: string;
  coverUrl?: string | null;
  authorName?: string | null;
  contentSelector?: string;
}

export interface TextToSpeechContextType {
  isOpen: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  isSupported: boolean;
  articleTitle: string;
  articleCoverUrl: string | null;
  authorName: string | null;
  paragraphs: string[];
  currentParagraphIndex: number | null;
  currentParagraphText: string | null;
  playbackRate: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  totalEstimatedSeconds: number;
  progressPercent: number;
  userScrolledAway: boolean;

  // Actions
  setMetadata: (meta: TextToSpeechMetadata) => void;
  openAndPlay: (options?: { startParagraphIndex?: number; customText?: string }) => void;
  togglePlayPause: () => void;
  jumpToParagraph: (index: number) => void;
  nextParagraph: () => void;
  prevParagraph: () => void;
  skipSeconds: (delta: number) => void;
  setSpeed: (rate: number) => void;
  cycleSpeed: () => void;
  resumeAutoScroll: () => void;
  stopPlayback: () => void;
  closePlayer: () => void;
}

const TextToSpeechContext = createContext<TextToSpeechContextType | null>(null);

export function TextToSpeechProvider({
  children,
  initialMetadata,
}: {
  children: React.ReactNode;
  initialMetadata?: TextToSpeechMetadata;
}) {
  const { preferences, update } = useReadingPreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState<number | null>(null);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [userScrolledAway, setUserScrolledAway] = useState(false);

  const [metadata, setMetadataState] = useState<TextToSpeechMetadata>({
    title: initialMetadata?.title || '',
    coverUrl: initialMetadata?.coverUrl || null,
    authorName: initialMetadata?.authorName || null,
    contentSelector: initialMetadata?.contentSelector || '#article-content',
  });

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isManuallyScrollingRef = useRef(false);

  const setMetadata = useCallback((meta: TextToSpeechMetadata) => {
    setMetadataState((prev) => {
      const nextTitle = meta.title || prev.title;
      const nextCoverUrl = meta.coverUrl !== undefined ? meta.coverUrl : prev.coverUrl;
      const nextAuthorName = meta.authorName !== undefined ? meta.authorName : prev.authorName;
      const nextSelector = meta.contentSelector || prev.contentSelector;

      if (
        prev.title === nextTitle &&
        prev.coverUrl === nextCoverUrl &&
        prev.authorName === nextAuthorName &&
        prev.contentSelector === nextSelector
      ) {
        return prev;
      }

      return {
        title: nextTitle,
        coverUrl: nextCoverUrl,
        authorName: nextAuthorName,
        contentSelector: nextSelector,
      };
    });
  }, []);

  // Recherche dynamique de l'élément DOM vivant correspondant au paragraphe
  const getActiveParagraphElement = useCallback(
    (index: number): HTMLElement | null => {
      if (typeof document === 'undefined') return null;
      const container = document.querySelector(metadata.contentSelector || '#article-content');
      if (!container) return null;

      // 1. Recherche par index déjà attribué
      const indexedEl = container.querySelector<HTMLElement>(
        `[data-audio-paragraph-index="${index}"]`
      );
      if (indexedEl) return indexedEl;

      // 2. Recherche parmi les éléments textuels éligibles du document vivant
      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>(
          'p, h2, h3, blockquote, [data-block-type="paragraph"], [data-block-type="heading"]'
        )
      ).filter((node) => (node.textContent || '').trim().length > 8);

      const target = nodes[index];
      if (target) {
        target.setAttribute('data-audio-paragraph-index', String(index));
        return target;
      }
      return null;
    },
    [metadata.contentSelector]
  );

  // Extraction et indexation des textes de paragraphes dans le DOM
  const extractAndIndexParagraphs = useCallback((): {
    texts: string[];
    elements: HTMLElement[];
  } => {
    if (typeof document === 'undefined') return { texts: [], elements: [] };
    const container = document.querySelector(metadata.contentSelector || '#article-content');
    if (!container) return { texts: [], elements: [] };

    const nodes = container.querySelectorAll<HTMLElement>(
      'p, h2, h3, blockquote, [data-block-type="paragraph"], [data-block-type="heading"]'
    );
    const validElements: HTMLElement[] = [];
    const texts: string[] = [];

    let index = 0;
    nodes.forEach((node) => {
      const text = (node.textContent || '').trim();
      if (text.length > 8) {
        node.setAttribute('data-audio-paragraph-index', String(index));
        validElements.push(node);
        texts.push(text);
        index++;
      }
    });

    return { texts, elements: validElements };
  }, [metadata.contentSelector]);

  const currentParagraphText = useMemo(() => {
    if (currentParagraphIndex === null || !paragraphs[currentParagraphIndex]) return null;
    return paragraphs[currentParagraphIndex];
  }, [currentParagraphIndex, paragraphs]);

  // Estimation du temps total restant en secondes (basé sur ~150 WPM)
  const totalWords = useMemo(() => {
    return paragraphs.reduce((acc, p) => acc + p.split(/\s+/).length, 0);
  }, [paragraphs]);

  const totalEstimatedSeconds = useMemo(() => {
    const wps = (150 / 60) * preferences.ttsSpeed;
    return Math.max(1, Math.round(totalWords / Math.max(wps, 0.5)));
  }, [totalWords, preferences.ttsSpeed]);

  const remainingSeconds = useMemo(() => {
    if (currentParagraphIndex === null || paragraphs.length === 0) {
      return totalEstimatedSeconds;
    }
    const remainingWords = paragraphs
      .slice(currentParagraphIndex)
      .reduce((acc, p) => acc + p.split(/\s+/).length, 0);
    const wps = (150 / 60) * preferences.ttsSpeed;
    return Math.max(0, Math.round(remainingWords / Math.max(wps, 0.5)));
  }, [currentParagraphIndex, paragraphs, preferences.ttsSpeed, totalEstimatedSeconds]);

  const progressPercent = useMemo(() => {
    if (paragraphs.length <= 1 || currentParagraphIndex === null) return 0;
    return Math.min(100, Math.round((currentParagraphIndex / (paragraphs.length - 1)) * 100));
  }, [currentParagraphIndex, paragraphs.length]);

  // Synchronisation visuelle : applique data-audio-active sur le paragraphe actif dans le DOM vivant
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const container = document.querySelector(metadata.contentSelector || '#article-content');
    if (!container) return;

    // Retirer les marques précédentes
    const allMarked = container.querySelectorAll('[data-audio-active="true"]');
    allMarked.forEach((el) => {
      el.removeAttribute('data-audio-active');
      el.classList.remove('qoe-audio-active-highlight');
    });

    if (currentParagraphIndex !== null) {
      const activeEl = getActiveParagraphElement(currentParagraphIndex);
      if (activeEl) {
        activeEl.setAttribute('data-audio-active', 'true');
        activeEl.classList.add('qoe-audio-active-highlight');

        // Auto-scroll si l'utilisateur ne s'est pas éloigné
        if (!userScrolledAway) {
          isManuallyScrollingRef.current = true;
          activeEl.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            isManuallyScrollingRef.current = false;
          }, 600);
        }
      }
    }
  }, [
    currentParagraphIndex,
    metadata.contentSelector,
    userScrolledAway,
    getActiveParagraphElement,
  ]);

  // Détection du scroll manuel de l'utilisateur pour ne pas forcer la vue
  useEffect(() => {
    if (!isPlaying || currentParagraphIndex === null || userScrolledAway) return;

    const handleScroll = () => {
      if (isManuallyScrollingRef.current) return;
      const activeEl = getActiveParagraphElement(currentParagraphIndex);
      if (!activeEl) return;

      const rect = activeEl.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      // Si l'élément actif est sorti du champ visuel confortable (hors de 10% - 90% de la fenêtre)
      if (rect.bottom < viewportHeight * 0.1 || rect.top > viewportHeight * 0.9) {
        setUserScrolledAway(true);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isPlaying, currentParagraphIndex, userScrolledAway, getActiveParagraphElement]);

  // Arrêt complet
  const stopPlayback = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentParagraphIndex(null);
    if (timerRef.current) clearInterval(timerRef.current);
    if (typeof document !== 'undefined') {
      const container = document.querySelector(metadata.contentSelector || '#article-content');
      if (container) {
        container.querySelectorAll('[data-audio-active="true"]').forEach((el) => {
          el.removeAttribute('data-audio-active');
          el.classList.remove('qoe-audio-active-highlight');
        });
      }
    }
  }, [isSupported, metadata.contentSelector]);

  const closePlayer = useCallback(() => {
    stopPlayback();
    setIsOpen(false);
  }, [stopPlayback]);

  // Lecture d'un paragraphe spécifique
  const speakParagraph = useCallback(
    (index: number, textList: string[]) => {
      if (!isSupported) {
        toast.error(t`La synthèse vocale n'est pas supportée sur ce navigateur.`);
        return;
      }
      window.speechSynthesis.cancel();

      if (index >= textList.length) {
        stopPlayback();
        return;
      }

      setCurrentParagraphIndex(index);
      setIsPlaying(true);
      setIsPaused(false);

      const text = textList[index];
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = preferences.ttsSpeed;

      // Voix naturelle adaptée
      const voices = window.speechSynthesis.getVoices();
      const frenchVoice =
        voices.find(
          (v) =>
            (v.lang.startsWith('fr') || v.lang.startsWith('FR')) &&
            (v.name.includes('Natural') ||
              v.name.includes('Premium') ||
              v.name.includes('Siri') ||
              v.name.includes('Google'))
        ) || voices.find((v) => v.lang.startsWith('fr'));

      if (frenchVoice) {
        utterance.voice = frenchVoice;
      }

      utterance.onend = () => {
        if (index + 1 < textList.length) {
          speakParagraph(index + 1, textList);
        } else {
          stopPlayback();
        }
      };

      utterance.onerror = (e) => {
        // En cas d'annulation manuelle, ne pas traiter comme une erreur critique
        if (e.error !== 'canceled' && e.error !== 'interrupted') {
          stopPlayback();
        }
      };

      currentUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [isSupported, preferences.ttsSpeed, stopPlayback]
  );

  // Démarrer ou sauter à un paragraphe
  const openAndPlay = useCallback(
    (options?: { startParagraphIndex?: number; customText?: string }) => {
      if (!isSupported) {
        toast.error(t`La synthèse vocale n'est pas supportée sur ce navigateur.`);
        return;
      }

      const { texts } = extractAndIndexParagraphs();
      let activeTexts = texts;

      if (options?.customText) {
        activeTexts = [options.customText];
      }

      if (activeTexts.length === 0) {
        toast.error(t`Aucun texte à lire trouvé sur cette page.`);
        return;
      }

      setParagraphs(activeTexts);
      setIsOpen(true);
      setUserScrolledAway(false);

      const targetIdx =
        options?.startParagraphIndex !== undefined
          ? Math.max(0, Math.min(options.startParagraphIndex, activeTexts.length - 1))
          : 0;

      speakParagraph(targetIdx, activeTexts);
    },
    [isSupported, extractAndIndexParagraphs, speakParagraph]
  );

  const togglePlayPause = useCallback(() => {
    if (!isSupported) return;
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setIsPaused(true);
    } else {
      let currentTexts = paragraphs;
      if (currentTexts.length === 0) {
        const extracted = extractAndIndexParagraphs();
        currentTexts = extracted.texts;
        setParagraphs(currentTexts);
      }
      if (currentTexts.length > 0) {
        const idx = currentParagraphIndex !== null ? currentParagraphIndex : 0;
        speakParagraph(idx, currentTexts);
      }
    }
  }, [
    isSupported,
    isPlaying,
    paragraphs,
    extractAndIndexParagraphs,
    currentParagraphIndex,
    speakParagraph,
  ]);

  const jumpToParagraph = useCallback(
    (index: number) => {
      if (index >= 0 && index < paragraphs.length) {
        speakParagraph(index, paragraphs);
        setUserScrolledAway(false);
      }
    },
    [paragraphs, speakParagraph]
  );

  const nextParagraph = useCallback(() => {
    if (currentParagraphIndex !== null && currentParagraphIndex + 1 < paragraphs.length) {
      jumpToParagraph(currentParagraphIndex + 1);
    }
  }, [currentParagraphIndex, paragraphs.length, jumpToParagraph]);

  const prevParagraph = useCallback(() => {
    if (currentParagraphIndex !== null && currentParagraphIndex > 0) {
      jumpToParagraph(currentParagraphIndex - 1);
    }
  }, [currentParagraphIndex, jumpToParagraph]);

  const skipSeconds = useCallback(
    (delta: number) => {
      if (paragraphs.length === 0 || currentParagraphIndex === null) return;
      // Estime ~5s par phrase courte ou 15s par paragraphe moyen
      const paragraphsToSkip = Math.round(delta / 15);
      const target = Math.max(
        0,
        Math.min(
          paragraphs.length - 1,
          currentParagraphIndex + (paragraphsToSkip === 0 ? (delta > 0 ? 1 : -1) : paragraphsToSkip)
        )
      );
      jumpToParagraph(target);
    },
    [paragraphs.length, currentParagraphIndex, jumpToParagraph]
  );

  const setSpeed = useCallback(
    (rate: number) => {
      update({ ttsSpeed: rate });
      if (isPlaying && currentParagraphIndex !== null && paragraphs.length > 0) {
        speakParagraph(currentParagraphIndex, paragraphs);
      }
    },
    [update, isPlaying, currentParagraphIndex, paragraphs, speakParagraph]
  );

  const cycleSpeed = useCallback(() => {
    const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
    const nextIdx = (speeds.indexOf(preferences.ttsSpeed) + 1) % speeds.length;
    setSpeed(speeds[nextIdx]);
  }, [preferences.ttsSpeed, setSpeed]);

  const resumeAutoScroll = useCallback(() => {
    setUserScrolledAway(false);
    if (currentParagraphIndex !== null) {
      const activeEl = getActiveParagraphElement(currentParagraphIndex);
      activeEl?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }
  }, [currentParagraphIndex, getActiveParagraphElement]);

  // Chronomètre de temps écoulé
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying]);

  // Support MediaSession API (AirPods, écran de verrouillage, touches clavier)
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    if (isOpen && metadata.title) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: metadata.title,
        artist: metadata.authorName || 'Qoe.fi',
        album: 'Qoe Audio Reader',
        artwork: metadata.coverUrl
          ? [{ src: metadata.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
          : [{ src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }],
      });

      navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
      navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextParagraph());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevParagraph());
      navigator.mediaSession.setActionHandler('seekforward', () => skipSeconds(15));
      navigator.mediaSession.setActionHandler('seekbackward', () => skipSeconds(-15));
      navigator.mediaSession.setActionHandler('stop', () => stopPlayback());
    }

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : isPaused ? 'paused' : 'none';

    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('stop', null);
      }
    };
  }, [
    isOpen,
    isPlaying,
    isPaused,
    metadata,
    togglePlayPause,
    nextParagraph,
    prevParagraph,
    skipSeconds,
    stopPlayback,
  ]);

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return (
    <TextToSpeechContext.Provider
      value={{
        isOpen,
        isPlaying,
        isPaused,
        isSupported,
        articleTitle: metadata.title,
        articleCoverUrl: metadata.coverUrl || null,
        authorName: metadata.authorName || null,
        paragraphs,
        currentParagraphIndex,
        currentParagraphText,
        playbackRate: preferences.ttsSpeed,
        elapsedSeconds,
        remainingSeconds,
        totalEstimatedSeconds,
        progressPercent,
        userScrolledAway,
        setMetadata,
        openAndPlay,
        togglePlayPause,
        jumpToParagraph,
        nextParagraph,
        prevParagraph,
        skipSeconds,
        setSpeed,
        cycleSpeed,
        resumeAutoScroll,
        stopPlayback,
        closePlayer,
      }}
    >
      {children}
    </TextToSpeechContext.Provider>
  );
}

export function useTextToSpeech() {
  const context = useContext(TextToSpeechContext);
  return context;
}
