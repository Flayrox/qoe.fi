'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  Check,
  Loader2,
  X,
  Plus,
  Globe,
  Lock,
  Quote,
  Eye,
  Volume2,
  Sparkles,
  Highlighter,
  PenLine,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { TextSelectionPopover } from './TextSelectionPopover';
import { AnnotationSideDrawer } from './AnnotationSideDrawer';
import { CanonicalArticleBody } from './CanonicalArticleBody';
import { AnnotationFilterPill } from './AnnotationFilterPill';
import { findInDocText, type CanonicalDocument } from './canonical-document';
import { findQuoteOccurrence } from './quote-anchor';
import { toast } from '@qoe/ui/toast';
import { Button } from '../primitives/button/button';
import { BevelButton } from '../primitives/bevel-button/bevel-button';
import { CopyButton } from '../primitives/copy-button/copy-button';
import { Textarea } from '../primitives/input/input';
import { ToggleButton, ToggleGroup } from '../primitives/toggle/toggle-button';
import { useTextToSpeech } from '../reader/TextToSpeechContext';
import {
  AnnotationFilterMode,
  AnnotationItem,
  HighlightItem,
  TextHighlighterProps,
  type AnnotationReader,
} from './types';
import { markSkin, markSkinFor } from './mark-skin';
import { appendAnnotation, dedupeAnnotations } from './annotation-list';
import { t } from '@lingui/core/macro';

export type { AnnotationFilterMode };

/**
 * Une action de la barre de sélection.
 *
 * ⚠️ Les deux libellés (repos / confirmation) occupent la MÊME cellule de
 * grille : « Citer » ne devient pas « Cité ! » en élargissant le bouton.
 * La barre est centrée sur la sélection ; chaque changement de largeur la
 * faisait glisser sous le curseur au moment même du clic.
 */
function CalloutAction({
  icon: Icon,
  label,
  done = false,
  doneLabel,
  busy = false,
  disabled = false,
  describedBy,
  onClick,
  title,
}: {
  icon: typeof Highlighter;
  label: string;
  done?: boolean;
  doneLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  /** Décrit pourquoi l'action est indisponible (lecteurs d'écran). */
  describedBy?: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="xs"
      onMouseDown={(e) => {
        // Empêche le focus change et l'effondrement de la sélection native avant le clic
        e.preventDefault();
      }}
      onClick={() => {
        if (!disabled) onClick();
      }}
      disabled={busy}
      aria-disabled={disabled || busy || undefined}
      aria-describedby={disabled ? describedBy : undefined}
      aria-busy={busy || undefined}
      title={title}
      className={cn(
        'px-3 font-semibold text-foreground/90 hover:text-foreground',
        disabled && 'text-muted-foreground'
      )}
    >
      <span className="relative size-3.5 shrink-0" aria-hidden>
        <span
          className={cn(
            'absolute inset-0 grid place-items-center transition-opacity duration-150',
            busy && 'opacity-0'
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.75} />
        </span>
        <span
          className={cn(
            'absolute inset-0 grid place-items-center transition-opacity duration-150',
            busy ? 'opacity-100' : 'opacity-0'
          )}
        >
          <Loader2 className="size-3.5 animate-spin" />
        </span>
      </span>

      <span className="grid">
        <span
          aria-hidden={done}
          className={cn('col-start-1 row-start-1 transition-opacity', done && 'opacity-0')}
        >
          {label}
        </span>
        <span
          aria-hidden={!done}
          className={cn(
            'col-start-1 row-start-1 font-semibold text-success-text transition-opacity',
            !done && 'opacity-0'
          )}
        >
          {doneLabel ?? label}
        </span>
      </span>
    </Button>
  );
}

export function TextHighlighter({
  articleId,
  creatorName,
  allowPublicAnnotations,
  isAuthenticated,
  initialHighlights,
  publicHighlights = [],
  currentUserId,
  currentUserProfile,
  articleAuthorId,
  mainAppUrl,
  containerId = 'article-content',
  canonicalDocument,
  spotlight,
  contentClassName,
  callbacks,
  onRequireAuth,
  filterMode: externalFilterMode,
  onFilterModeChange,
  hideFilterBar = false,
}: TextHighlighterProps) {
  // Mode document canonique : le corps est rendu par CanonicalArticleBody
  // (marques par offsets) ; le moteur impératif hérité ne s'exécute plus.
  const documentMode = !!canonicalDocument;
  const documentRef = canonicalDocument as CanonicalDocument | undefined;
  const defaultReader = {
    id: currentUserId || 'anon',
    name: currentUserProfile?.name || currentUserProfile?.username || t`Lecteur`,
    username: currentUserProfile?.username || 'lecteur',
    logoUrl: currentUserProfile?.logoUrl || null,
    subdomain: null,
    type: currentUserProfile?.type ?? 'PERSONAL',
  };

  const tts = useTextToSpeech();

  const [highlights, setHighlights] = useState<HighlightItem[]>(
    dedupeAnnotations(initialHighlights as HighlightItem[])
  );
  // Les deux listes viennent du parent et ne sont pas garanties uniques : un
  // id en double peindrait deux `<mark>` superposés, invisibles à l'œil mais
  // bien présents dans le DOM (et dans les tests de comptage).
  const [allPublic, setAllPublic] = useState<AnnotationItem[]>(dedupeAnnotations(publicHighlights));
  const [internalFilterMode, setInternalFilterMode] = useState<AnnotationFilterMode>('all');
  const filterMode = externalFilterMode ?? internalFilterMode;

  const changeFilterMode = (mode: AnnotationFilterMode) => {
    setInternalFilterMode(mode);
    onFilterModeChange?.(mode);
    try {
      localStorage.setItem('qoe_annotation_filter_mode', mode);
    } catch {
      // Ignore localStorage write restriction
    }
  };

  useEffect(() => {
    setHighlights((prev) => {
      if (
        prev.length === initialHighlights.length &&
        prev.every((h, i) => {
          const next = initialHighlights[i];
          return (
            h.id === next?.id &&
            h.note === next?.note &&
            h.isPublic === next?.isPublic &&
            // ⚠️ Les ancres font partie de l’identité : une ré-ancrage
            // serveur (article ré-édité, offsets recalculés) doit repeindre
            // la marque au bon endroit. Comparer la seule note laissait la
            // marque sur l’ancien passage.
            h.canonicalStart === next?.canonicalStart &&
            h.canonicalEnd === next?.canonicalEnd &&
            h.quoteOrdinal === next?.quoteOrdinal &&
            h.contentSha === next?.contentSha
          );
        })
      ) {
        return prev;
      }
      return dedupeAnnotations(initialHighlights as HighlightItem[]);
    });
  }, [initialHighlights]);

  useEffect(() => {
    setAllPublic((prev) => {
      if (
        prev.length === publicHighlights.length &&
        prev.every((p, i) => {
          const next = publicHighlights[i];
          return (
            p.id === next?.id &&
            p.note === next?.note &&
            p.isPublic === next?.isPublic &&
            p.isOfficial === next?.isOfficial &&
            p.canonicalStart === next?.canonicalStart &&
            p.canonicalEnd === next?.canonicalEnd &&
            p.quoteOrdinal === next?.quoteOrdinal &&
            p.contentSha === next?.contentSha
          );
        })
      ) {
        return prev;
      }
      return dedupeAnnotations(publicHighlights);
    });
  }, [publicHighlights]);

  // Note input form state
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [activeDraftText, setActiveDraftText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [isPublicChoice, setIsPublicChoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  // ⚠️ Deux succès distincts, deux boutons distincts : le « Cité ! » du
  // bouton Citer ne doit pas s'allumer parce qu'un surlignage vient d'être
  // créé ailleurs dans la barre (et inversement).
  const [quoteSuccess, setQuoteSuccess] = useState(false);
  // ⚠️ Un état par action. « Surligner » et « Citer » partageaient `saving` :
  // cliquer sur l'un faisait tourner la roue de l'autre, et la barre
  // changeait de largeur pendant le clic.
  const [highlighting, setHighlighting] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // L'affordance « Expliquer » reste dans la barre, mais la fonction n'est
  // pas branchée. Le bouton est désactivé et décrit, jamais simulé.
  const explainDisabledId = React.useId();

  // Drawer state for clicked highlight
  const [selectedAnnotationForDrawer, setSelectedAnnotationForDrawer] =
    useState<AnnotationItem | null>(null);
  const [articleAnnotations, setArticleAnnotations] = useState<AnnotationItem[]>([]);

  const tempMarkRef = useRef<HTMLSpanElement | null>(null);

  // Load persisted reader filter mode on mount
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem(
        'qoe_annotation_filter_mode'
      ) as AnnotationFilterMode | null;
      if (savedMode && ['all', 'official', 'none'].includes(savedMode)) {
        setInternalFilterMode(savedMode);
        onFilterModeChange?.(savedMode);
      }
    } catch {
      // Ignore localStorage access restrictions
    }
  }, [allowPublicAnnotations, onFilterModeChange]);

  /**
   * Rend une marque activable au clavier.
   *
   * ⚠️ Une `<mark>` cliquable n'est pas un bouton : sans `role`, sans
   * `tabindex` et sans réponse à Entrée/Espace, l'annotation n'existe que
   * pour la souris. On pose donc la sémantique sur l'élément lui-même — il
   * est déjà dans le flux du texte, un `<button>` autour casserait la
   * sélection et le copier-coller.
   */
  const makeMarkInteractive = (mark: HTMLElement, label: string, open: () => void) => {
    mark.setAttribute('role', 'button');
    mark.tabIndex = 0;
    mark.setAttribute('aria-label', label);
    mark.onclick = (event) => {
      event.stopPropagation();
      open();
    };
    mark.onkeydown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    };
  };

  // Attach interactivity to HTML-embedded <mark data-annotation-note="..."> author marks
  const setupHtmlMarksInDOM = () => {
    const articleEl = document.getElementById(containerId);
    if (!articleEl) return;

    const htmlMarks = articleEl.querySelectorAll('mark[data-annotation-note]');
    htmlMarks.forEach((mark, index) => {
      const note = mark.getAttribute('data-annotation-note') || '';
      const text = mark.textContent || '';
      const existingId = mark.getAttribute('data-highlight-id');
      const generatedId = existingId || `official-html-mark-${index}`;

      mark.setAttribute('data-highlight-id', generatedId);
      mark.className = markSkin('official');

      const officialAnnot: AnnotationItem = {
        id: generatedId,
        text,
        note,
        isPublic: true,
        isOfficial: true,
        upvotesCount: 0,
        createdAt: new Date().toISOString(),
        reader: {
          id: 'creator',
          name: creatorName,
          username: 'creator',
          logoUrl: null,
          subdomain: null,
        },
      };

      // Une marque officielle du HTML peut déjà avoir été servie avec ses
      // ancres : on ajoute par identité, et on ne double pas un officiel de
      // même texte (les marques du HTML n'ont pas d'id stable).
      setAllPublic((prev) =>
        prev.some((p) => p.isOfficial && p.text === text)
          ? prev
          : appendAnnotation(prev, officialAnnot)
      );

      makeMarkInteractive(
        mark as HTMLElement,
        `${t`Annotation officielle`} : ${text.slice(0, 80)}`,
        () => setSelectedAnnotationForDrawer(officialAnnot)
      );
    });
  };

  // Re-apply DOM highlights whenever highlights list, public list, or filterMode changes
  useEffect(() => {
    if (documentMode) return; // rendu déclaratif par CanonicalArticleBody
    // 🛡️ Do NOT strip and recreate DOM nodes if the user is currently composing a note or saving
    if (showNoteInput || saving || activeDraftText) return;
    removeAllMarksFromDOM();
    setupHtmlMarksInDOM();
    if (filterMode !== 'none') {
      highlightExisting();
    }
  }, [
    highlights,
    allPublic,
    filterMode,
    containerId,
    documentMode,
    showNoteInput,
    saving,
    activeDraftText,
  ]);

  // 🎙️ Click-to-Listen : double-clic sur un paragraphe pour démarrer l'écoute instantanément
  useEffect(() => {
    if (!tts || typeof document === 'undefined') return;
    const container = document.getElementById(containerId);
    if (!container) return;

    const handleDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const paragraphEl = target.closest<HTMLElement>(
        '[data-audio-paragraph-index], p, h2, h3, blockquote'
      );
      if (!paragraphEl) return;

      const idxAttr = paragraphEl.getAttribute('data-audio-paragraph-index');
      if (idxAttr !== null) {
        const idx = parseInt(idxAttr, 10);
        if (!isNaN(idx)) {
          tts.openAndPlay({ startParagraphIndex: idx });
        }
      }
    };

    container.addEventListener('dblclick', handleDblClick);
    return () => container.removeEventListener('dblclick', handleDblClick);
  }, [tts, containerId]);

  const clearForm = () => {
    removeTempDraftMark();
    setShowNoteInput(false);
    setActiveDraftText('');
    setNoteText('');
    setIsPublicChoice(false);
    setSavedSuccess(false);
    setQuoteSuccess(false);
    setErrorMessage(null);
  };

  // Create temporary active visual mark in DOM so text stays highlighted while typing note
  const applyTempDraftMark = (range: Range) => {
    // ⚠️ En mode document, le corps est rendu par React : y insérer une
    // marque à la main (`extractContents` + `insertNode`) découpe ses nœuds
    // texte derrière son dos. Au rendu suivant il recompose ce qu’il croit
    // être le texte et le passage se retrouve DUPLIQUÉ dans l’article —
    // vérifié en cliquant « Annoter » puis en refermant le formulaire.
    // La sélection native reste visible pendant la saisie : elle suffit.
    if (documentMode) return;
    removeTempDraftMark();
    try {
      const mark = document.createElement('mark');
      mark.id = 'temp-draft-annotation-mark';
      // Même peau que les marques persistées, en variante « sélection » :
      // la marque temporaire ne doit pas être la seule à ne pas avoir de
      // trait, sinon elle saute aux yeux comme un bug de rendu.
      mark.className = `${markSkin('selection')} animate-pulse motion-reduce:animate-none`;

      const contents = range.extractContents();
      mark.appendChild(contents);
      range.insertNode(mark);
      tempMarkRef.current = mark;
    } catch (e) {
      console.warn('Could not insert temporary draft mark:', e);
    }
  };

  // Remove temporary active mark from DOM
  const removeTempDraftMark = () => {
    // Symétrique du garde d’`applyTempDraftMark` : en mode document, on n’a
    // jamais inséré cette marque, et la retirer reviendrait à démonter un
    // nœud que React possède.
    if (documentMode) return;
    const el = document.getElementById('temp-draft-annotation-mark');
    if (el && el.parentNode) {
      const fragment = document.createDocumentFragment();
      while (el.firstChild) {
        fragment.appendChild(el.firstChild);
      }
      el.parentNode.replaceChild(fragment, el);
    }
    tempMarkRef.current = null;
  };

  // Strip all rendered highlights from DOM cleanly
  const removeAllMarksFromDOM = () => {
    const articleEl = document.getElementById(containerId);
    if (!articleEl) return;

    const marks = articleEl.querySelectorAll('mark[data-highlight-id]');
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        if (parent.contains(mark)) {
          parent.removeChild(mark);
        }
      }
    });
    // 🌟 Merge adjacent text nodes after unwrapping marks so indexOf string matching stays 100% reliable
    articleEl.normalize();
  };

  // Highlight stored text passages in DOM based on active reader filterMode
  const highlightExisting = () => {
    const articleEl = document.getElementById(containerId);
    if (!articleEl) return;

    // Ensure DOM text nodes are normalized before scanning
    articleEl.normalize();

    // 🛡️ Un identifiant n'est peint qu'une fois : deux listes (privée,
    // publique) peuvent porter la même annotation après une mise à jour,
    // et deux marques imbriquées se lisent comme un surlignage qui bave.
    const painted = new Set<string>();

    if (filterMode === 'official') {
      // Render ONLY official creator highlights
      allPublic
        .filter((pub) => pub.isOfficial && !painted.has(pub.id))
        .forEach((pub) => {
          painted.add(pub.id);
          applyHighlightToDOM(
            articleEl,
            pub.text,
            pub.note || undefined,
            pub.isPublic,
            pub.isOfficial,
            pub.id,
            pub,
            pub.quoteOrdinal
          );
        });
      return;
    }

    // Render all (private + public + official)
    // 1. Reader highlights — sauf ceux déjà présents dans `allPublic`,
    //    sinon la même annotation se peignait deux fois (une fois privée).
    const publicIds = new Set(allPublic.map((p) => p.id));
    highlights
      .filter((hl) => !painted.has(hl.id) && !publicIds.has(hl.id))
      .forEach((hl) => {
        painted.add(hl.id);
        applyHighlightToDOM(
          articleEl,
          hl.text,
          hl.note || undefined,
          Boolean(hl.isPublic),
          false,
          hl.id,
          undefined,
          hl.quoteOrdinal
        );
      });

    // 2. Public & official creator highlights
    allPublic
      .filter((pub) => !painted.has(pub.id))
      .forEach((pub) => {
        painted.add(pub.id);
        applyHighlightToDOM(
          articleEl,
          pub.text,
          pub.note || undefined,
          pub.isPublic,
          pub.isOfficial,
          pub.id,
          pub,
          // ⚠️ L'ordinal compte aussi pour les marques publiques : un passage
          // qui se répète (une formule reprise, un titre cité) se peignait
          // toujours sur sa PREMIÈRE occurrence, en désaccord avec la note
          // affichée dans le tiroir.
          pub.quoteOrdinal ?? 0
        );
      });
  };

  const applyHighlightToDOM = (
    root: HTMLElement,
    textToHighlight: string,
    note?: string,
    isPublic: boolean = false,
    isOfficial: boolean = false,
    id?: string,
    fullAnnotation?: AnnotationItem,
    quoteOrdinal: number = 0
  ) => {
    if (!textToHighlight || !textToHighlight.trim()) return;

    root.normalize();

    const targetText = textToHighlight.trim();
    const nodesToReplace: {
      textNode: Text;
      parent: HTMLElement;
      matches: { index: number; text: string }[];
    }[] = [];

    // Ancrage par citation via le helper partagé (réutilisé par les fronts
    // tiers) : vise l'occurrence n° quoteOrdinal, repli sur la première.
    const match = findQuoteOccurrence(root, targetText, quoteOrdinal);
    if (!match) return;

    nodesToReplace.push({
      textNode: match.textNode,
      parent: match.textNode.parentElement!,
      matches: [{ index: match.index, text: targetText }],
    });

    nodesToReplace.forEach(({ textNode, parent, matches }) => {
      const textContent = textNode.textContent || '';
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;

      matches.forEach(({ index, text }) => {
        if (index > lastIndex) {
          fragment.appendChild(document.createTextNode(textContent.substring(lastIndex, index)));
        }

        const mark = document.createElement('mark');

        // ⚠️ La peau se décide sur la NATURE, pas sur la liste d'où vient
        // la marque : un surlignage public sans texte reste un surlignage,
        // et un surlignage privé avec une note est une annotation privée.
        const hasNote = Boolean((note ?? fullAnnotation?.note ?? '').trim());
        mark.className = markSkinFor({ isOfficial, isPublic, hasNote });

        mark.textContent = text;
        mark.setAttribute('data-highlight-text', text);
        if (id) mark.setAttribute('data-highlight-id', id);

        const targetAnnot = fullAnnotation || {
          id: id || Math.random().toString(),
          text,
          note: note || null,
          isPublic,
          isOfficial,
          upvotesCount: 0,
          createdAt: new Date(),
          reader: defaultReader,
        };
        // Le nom annoncé dit la NATURE : un trait sans texte n’est pas une
        // annotation, et un lecteur d’écran ne doit pas l’apprendre de travers.
        const natureLabel = isOfficial
          ? t`Annotation officielle`
          : isPublic
            ? note
              ? t`Annotation publique`
              : t`Surlignage public`
            : note
              ? t`Annotation privée`
              : t`Surlignage privé`;

        makeMarkInteractive(mark, `${natureLabel} : ${text.slice(0, 80)}`, () =>
          openDrawerForAnnotation(targetAnnot)
        );

        if (note) {
          mark.title = `${isOfficial ? t`Annotation officielle` : isPublic ? t`Annotation publique` : t`Note privée`} : ${note}`;
        }

        fragment.appendChild(mark);
        lastIndex = index + text.length;
      });

      if (lastIndex < textContent.length) {
        fragment.appendChild(document.createTextNode(textContent.substring(lastIndex)));
      }

      parent.replaceChild(fragment, textNode);
    });
  };

  /**
   * Ouvre le drawer sur une annotation : rassemble toutes les marques du
   * conteneur (impératives OU React), tri déterministe, puis sélection.
   * Partagé entre le moteur hérité (onclick impératif) et le mode document
   * canonique (onMarkClick de CanonicalArticleBody).
   */
  const openDrawerForAnnotation = (targetAnnot: AnnotationItem) => {
    // Un clic sur une marque ne laisse pas derrière lui la sélection qui a
    // servi à la créer : la barre restait ouverte au-dessus du voile, sur un
    // passage que le tiroir était en train de reprendre.
    window.getSelection()?.removeAllRanges();
    // Un formulaire de note resté ouvert réapparaîtrait après la fermeture
    // du tiroir, sur une sélection qui n'existe plus.
    if (showNoteInput) clearForm();

    // Gather all annotations in the article
    const rawList: AnnotationItem[] = [];
    const allMarks = document.querySelectorAll(`#${containerId} mark[data-highlight-id]`);
    allMarks.forEach((m) => {
      const hId = m.getAttribute('data-highlight-id');
      if (!hId) return;

      const pubMatch = allPublic.find((p) => p.id === hId);
      if (pubMatch && !rawList.some((a) => a.id === pubMatch.id)) {
        rawList.push(pubMatch);
        return;
      }

      const prvMatch = highlights.find((h) => h.id === hId);
      if (prvMatch && !rawList.some((a) => a.id === prvMatch.id)) {
        rawList.push({
          id: prvMatch.id,
          text: prvMatch.text,
          note: prvMatch.note,
          // ⚠️ La visibilité se lit sur l'objet. Elle était figée à `false` :
          // un surlignage passé public se rouvrait aussitôt comme privé, sans
          // discussion ni vote, alors que sa marque était déjà peinte en
          // public.
          isPublic: Boolean(prvMatch.isPublic),
          isOfficial: Boolean(prvMatch.isOfficial),
          upvotesCount: prvMatch.upvotesCount ?? 0,
          createdAt: prvMatch.createdAt || new Date(),
          // Le profil réel prime : sinon l'avatar et le nom de l'auteur
          // étaient remplacés par ceux du lecteur courant.
          reader: prvMatch.reader || defaultReader,
        });
      }
    });

    if (!rawList.some((a) => a.id === targetAnnot.id)) {
      rawList.push(targetAnnot);
    }

    const articleElText = document.getElementById(containerId)?.textContent || '';

    // 🎯 LOGIQUE DE TRI DÉTERMINISTE :
    // 1. Commence le plus tôt dans le texte CANONIQUE quand l’ancre existe
    //    (sinon DOM offset — mode hérité)
    // 2. Finit le plus tôt
    // 3. La plus courte
    // 4. La plus ancienne puis la plus récente (createdAt ascendant)
    //
    // ⚠️ `indexOf` sur le texte du DOM retombe toujours sur la PREMIÈRE
    // occurrence : deux annotations du même passage répété pouvaient donc
    // permuter dans le paginateur. L’offset canonique, lui, distingue les
    // deux occurrences.
    const sortedList = rawList.sort((a, b) => {
      const cleanA = a.text.trim();
      const cleanB = b.text.trim();

      const startA = a.canonicalStart ?? articleElText.indexOf(cleanA);
      const startB = b.canonicalStart ?? articleElText.indexOf(cleanB);
      const validStartA = startA !== -1 ? startA : 999999;
      const validStartB = startB !== -1 ? startB : 999999;

      if (validStartA !== validStartB) return validStartA - validStartB;

      const endA = a.canonicalEnd ?? validStartA + cleanA.length;
      const endB = b.canonicalEnd ?? validStartB + cleanB.length;
      if (endA !== endB) return endA - endB;

      if (cleanA.length !== cleanB.length) return cleanA.length - cleanB.length;

      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateA - dateB;
    });

    setArticleAnnotations(sortedList);
    setSelectedAnnotationForDrawer(targetAnnot);
  };

  const handleLoginRedirect = () => {
    if (onRequireAuth) {
      onRequireAuth();
    } else if (callbacks?.onLoginRedirect) {
      callbacks.onLoginRedirect();
    } else if (mainAppUrl) {
      window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`;
    } else {
      toast.info(t`Connectez-vous pour surligner ou annoter.`);
    }
  };

  /**
   * 🧮 Ordinal d'ancrage : nombre d'occurrences IDENTIQUES du texte
   * sélectionné qui précèdent la sélection dans le conteneur. Permet de
   * ré-ancrer au bon endroit quand le même passage apparaît plusieurs fois.
   */
  const computeQuoteOrdinal = (selectedText: string): number => {
    const container = document.getElementById(containerId);
    const selection = window.getSelection();
    if (!container || !selection || selection.rangeCount === 0) return 0;

    const range = selection.getRangeAt(0);
    if (!container.contains(range.startContainer)) return 0;

    // Texte du conteneur avant le début de la sélection.
    const preRange = document.createRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);
    const beforeText = preRange.toString();

    let count = 0;
    let from = 0;
    for (;;) {
      const idx = beforeText.indexOf(selectedText, from);
      if (idx === -1) break;
      count++;
      from = idx + selectedText.length;
    }
    return count;
  };

  const handleInstantHighlight = async (selectedText: string, clearSelection: () => void) => {
    if (!isAuthenticated) {
      handleLoginRedirect();
      return;
    }

    setHighlighting(true);
    try {
      const quoteOrdinal = computeQuoteOrdinal(selectedText);
      const res = callbacks?.onHighlightCreate
        ? await callbacks.onHighlightCreate({
            articleId,
            text: selectedText,
            note: null,
            isPublic: false,
            quoteOrdinal,
          })
        : { ok: true, data: { id: `hl-${Date.now()}`, text: selectedText, note: null } };

      if (res?.ok && res.data) {
        const createdData = res.data as { id: string; reader?: AnnotationReader | null };
        const rawHl = res.data as HighlightItem;
        let canonicalStart = rawHl.canonicalStart;
        let canonicalEnd = rawHl.canonicalEnd;
        let contentSha = rawHl.contentSha;
        if (typeof canonicalStart !== 'number' && documentRef?.text) {
          const match = findInDocText(documentRef.text, selectedText, quoteOrdinal);
          if (match) {
            canonicalStart = match.start;
            canonicalEnd = match.end;
            contentSha = documentRef.sha;
          }
        }

        // Le parent peut avoir déjà ajouté le surlignage (mode document
        // canonique) : on ajoute par identité, jamais en double. Le profil
        // par défaut complète la réponse serveur (elle ne porte pas le type
        // de compte, donc un média perdait son carré arrondi à la création).
        setHighlights((prev) =>
          appendAnnotation(prev, {
            ...rawHl,
            canonicalStart,
            canonicalEnd,
            contentSha,
            quoteOrdinal,
            reader: { ...defaultReader, ...(createdData.reader ?? {}) },
          })
        );
        // Mode document : le corps React se repeint via les ancres renvoyées
        // par le serveur (canonicalStart/End) — pas de mutation DOM.
        if (!documentMode) {
          const articleEl = document.getElementById(containerId);
          if (articleEl) {
            applyHighlightToDOM(
              articleEl,
              selectedText,
              undefined,
              false,
              false,
              createdData.id,
              undefined,
              quoteOrdinal
            );
          }
        }
        // ⚠️ Pas de `setSavedSuccess` ici : ce drapeau appartient au
        // FORMULAIRE. L’allumer depuis le surlignage instantané laissait le
        // bouton « Enregistrer l’annotation » en vert « Enregistré ! » si
        // l’on ouvrait le formulaire dans la foulée.
        setTimeout(() => {
          clearSelection();
          clearForm();
          window.getSelection()?.removeAllRanges();
        }, 600);
      } else {
        const errorMsg =
          (res as { error?: string })?.error || t`Impossible d'enregistrer le surlignage.`;
        toast.error(errorMsg);
      }
    } catch (e) {
      console.error(e);
      toast.error(t`Une erreur est survenue lors du surlignage.`);
    } finally {
      setHighlighting(false);
    }
  };

  const handleHighlightSubmit = async (
    e: React.FormEvent,
    selectedText: string,
    clearSelection: () => void
  ) => {
    e.preventDefault();
    if (!isAuthenticated) {
      handleLoginRedirect();
      return;
    }

    const targetText = activeDraftText || selectedText;
    const quoteOrdinal = computeQuoteOrdinal(targetText);

    setErrorMessage(null);
    setSaving(true);
    try {
      const res = callbacks?.onHighlightCreate
        ? await callbacks.onHighlightCreate({
            articleId,
            text: targetText,
            note: noteText || null,
            isPublic: isPublicChoice,
            quoteOrdinal,
          })
        : {
            ok: true,
            data: {
              id: `hl-${Date.now()}`,
              text: targetText,
              note: noteText || null,
              reader: defaultReader,
            },
          };

      if (res?.ok && res.data) {
        removeTempDraftMark();

        // 🌟 Ensure public highlight is in BOTH allPublic and highlights state so it NEVER disappears for author or readers!
        const createdData = res.data as { id: string; reader?: AnnotationReader };
        const createdItem: AnnotationItem = {
          id: createdData.id,
          text: targetText,
          quoteOrdinal,
          note: noteText || null,
          isPublic: isPublicChoice,
          isOfficial: false,
          upvotesCount: 0,
          createdAt: new Date().toISOString(),
          // Même raison : la réponse serveur peut omettre `type` alors que
          // le profil courant le connaît. On complète, on ne remplace pas.
          reader: { ...defaultReader, ...(createdData.reader ?? {}) },
        };

        // ⚠️ Une annotation publique vit dans `allPublic` UNIQUEMENT. La
        // mettre aussi dans `highlights` la faisait peindre en privé par le
        // corps canonique (première marque de même id gagnante).
        if (isPublicChoice) {
          setAllPublic((prev) => appendAnnotation(prev, createdItem));
        } else {
          setHighlights((prev) => appendAnnotation(prev, res.data as HighlightItem));
        }

        setSavedSuccess(true);
        setTimeout(() => {
          clearSelection();
          clearForm();
          window.getSelection()?.removeAllRanges();
        }, 800);
      } else if (res && !res.ok) {
        const errObj = res as { error?: { code?: string; message?: string } | string };
        const errCode = typeof errObj.error === 'object' ? errObj.error?.code : undefined;
        if (errCode === 'PUBLIC_ANNOTATIONS_DISABLED') {
          setErrorMessage(t`Le créateur a désactivé les annotations publiques sur cet écrit.`);
        } else {
          const msg =
            typeof errObj.error === 'object'
              ? errObj.error?.message
              : typeof errObj.error === 'string'
                ? errObj.error
                : t`Impossible d'enregistrer l'annotation.`;
          setErrorMessage(msg || t`Impossible d'enregistrer l'annotation.`);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDirectCrosspostToFeed = async (selectedText: string, clearSelection: () => void) => {
    if (!isAuthenticated) {
      handleLoginRedirect();
      return;
    }

    setQuoting(true);
    try {
      const res = callbacks?.onCrosspost
        ? await callbacks.onCrosspost({ articleId, text: selectedText })
        : { ok: true };

      if (res?.ok) {
        setQuoteSuccess(true);
        toast.success(t`Passage cité avec succès sur le Feed !`);
        setTimeout(() => {
          clearSelection();
          clearForm();
          window.getSelection()?.removeAllRanges();
        }, 1000);
      } else {
        toast.error(t`Impossible de citer ce passage`);
      }
    } catch (e) {
      console.error(e);
      toast.error(t`Une erreur est survenue`);
    } finally {
      setQuoting(false);
    }
  };

  return (
    <>
      {/* 🌍 UNIVERSAL TENANT ANNOTATION READER FILTER BAR */}
      {!hideFilterBar && (
        <div className="my-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/40 bg-muted/20 px-4 py-2.5 backdrop-blur-xs transition-colors hover:border-border/60">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <div className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Eye className="size-3.5" />
            </div>
            <span className="font-semibold tracking-tight">{t`Annotations`}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {t`— densité des marques affichées`}
            </span>
          </div>

          <AnnotationFilterPill
            filterMode={filterMode}
            onChangeFilterMode={changeFilterMode}
            allowPublicAnnotations={allowPublicAnnotations}
            size="sm"
          />
        </div>
      )}

      {/* 📄 Mode document canonique : corps rendu par blocs, marques par
          offsets (CanonicalArticleBody) — remplace le HTML brut + mutation
          DOM du moteur hérité. */}
      {documentMode && documentRef && (
        <CanonicalArticleBody
          document={documentRef}
          highlights={highlights}
          allPublic={allPublic}
          filterMode={filterMode}
          containerId={containerId}
          className={contentClassName}
          creatorName={creatorName}
          onMarkClick={openDrawerForAnnotation}
          spotlight={spotlight}
        />
      )}

      <TextSelectionPopover
        containerId={containerId}
        minSelectionLength={1}
        isLocked={showNoteInput || saving}
        // Le tiroir ouvert est une autre surface : la barre de sélection ne
        // doit pas rester posée sur l'article derrière le voile.
        isDismissed={Boolean(selectedAnnotationForDrawer)}
      >
        {({ text: selectedText, range, placement, clearSelection }) => {
          return (
            /* 🍏 APPLE CALLOUT MENU (Inspiré du callout menu natif d'Apple) */
            <div className="relative flex flex-col items-center">
              {/* Directional Caret (flèche vers le haut si le menu est sous la sélection) */}
              {!showNoteInput && placement.startsWith('bottom') && (
                <div className="w-0 h-0 border-x-[6px] border-x-transparent border-b-[6px] border-b-popover/95 drop-shadow-[0_-1px_1px_rgba(0,0,0,0.08)] mb-[-1px] z-10 pointer-events-none" />
              )}

              <div
                className={cn(
                  // Une surface pleine et une ombre franche : à 95 % sur une
                  // page blanche, la barre n'avait ni bord ni fond visibles et
                  // les libellés semblaient posés sur l'article.
                  'bg-card text-card-foreground border border-border/70 ring-1 ring-foreground/5 font-sans transition-all duration-150 ease-out',
                  'shadow-[0_18px_45px_-12px_rgba(0,0,0,0.30)] dark:shadow-[0_18px_45px_-12px_rgba(0,0,0,0.65)]',
                  showNoteInput ? 'rounded-2xl w-80 sm:w-84 p-4 space-y-3' : 'rounded-xl py-1 px-1'
                )}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {!showNoteInput ? (
                    /* STATE A: Apple Callout Menu Toolbar */
                    <motion.div
                      key="toolbar-state"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      className="flex items-center text-xs font-semibold select-none"
                    >
                      {/* Surligner : pose un TRAIT, pas une annotation.
                       * Le tiroir le dira (« Surlignage ») et proposera d'y
                       * ajouter une note pour en faire une annotation. */}
                      <CalloutAction
                        icon={Highlighter}
                        label={t`Surligner`}
                        busy={highlighting}
                        onClick={() => handleInstantHighlight(selectedText, clearSelection)}
                        title={t`Surligner ce passage`}
                      />

                      <span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-border/40" />

                      <CalloutAction
                        icon={Quote}
                        label={t`Citer`}
                        done={quoteSuccess}
                        doneLabel={t`Cité !`}
                        busy={quoting}
                        onClick={() => handleDirectCrosspostToFeed(selectedText, clearSelection)}
                        title={t`Citer ce passage sur le Feed`}
                      />

                      <span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-border/40" />

                      <CalloutAction
                        icon={PenLine}
                        label={t`Annoter`}
                        onClick={() => {
                          if (!isAuthenticated) {
                            handleLoginRedirect();
                          } else {
                            setActiveDraftText(selectedText);
                            applyTempDraftMark(range);
                            setShowNoteInput(true);
                          }
                        }}
                        title={t`Ajouter une note ou annotation publique`}
                      />

                      <span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-border/40" />

                      {tts && (
                        <>
                          <CalloutAction
                            icon={Volume2}
                            label={t`Écouter`}
                            onClick={() => {
                              clearSelection();
                              tts.openAndPlay({ customText: selectedText });
                            }}
                            title={t`Écouter ce passage`}
                          />
                          <span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-border/40" />
                        </>
                      )}

                      {/* Copier : la primitive confirme dans la MÊME largeur
                       * et annonce le résultat en `aria-live`. */}
                      <CopyButton
                        value={selectedText}
                        label={t`Copier`}
                        copiedLabel={t`Copié`}
                        variant="ghost"
                        size="xs"
                        onMouseDown={(e) => e.preventDefault()}
                        title={t`Copier l'extrait`}
                        className="px-3 font-semibold text-foreground/90 hover:text-foreground"
                      />

                      {/* Expliquer (IA) : l'affordance reste visible, la
                       * fonction n'est pas branchée. Le bouton est annoncé
                       * désactivé et décrit ; aucune réponse n'est fabriquée. */}
                      <span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-border/40" />
                      <CalloutAction
                        icon={Sparkles}
                        label={t`Expliquer`}
                        disabled
                        describedBy={explainDisabledId}
                        onClick={() => undefined}
                        title={t`Bientôt disponible — l’explication par IA n’est pas encore branchée`}
                      />
                      <span id={explainDisabledId} className="sr-only">
                        {t`L’explication par IA n’est pas encore disponible.`}
                      </span>
                    </motion.div>
                  ) : (
                    /* STATE B: Expanded Card with Unified Quoted Block & Separator */
                    <motion.form
                      key="form-state"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      onSubmit={(e) => handleHighlightSubmit(e, selectedText, clearSelection)}
                      className="flex flex-col gap-3 text-left"
                    >
                      {/* Header: Centered Title + Pencil SVG with Gomme Separation Line */}
                      <div className="flex items-center justify-between">
                        <div className="w-6 h-6" /> {/* Left spacer */}
                        <span className="text-sm font-semibold text-foreground flex items-center justify-center gap-2">
                          <svg
                            className="w-4 h-4 text-foreground shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            {/* Pencil body filled */}
                            <path
                              d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"
                              fill="currentColor"
                              fillOpacity="0.25"
                            />
                            {/* Distinct Eraser / Gomme separation line */}
                            <line
                              x1="15"
                              y1="5"
                              x2="19"
                              y2="9"
                              stroke="currentColor"
                              strokeWidth="2"
                            />
                          </svg>
                          <span>{t`Nouvelle annotation`}</span>
                        </span>
                        <Button
                          size="xs"
                          shape="icon"
                          variant="ghost"
                          onClick={() => {
                            clearForm();
                            clearSelection();
                          }}
                          aria-label={t`Fermer`}
                          title={t`Fermer (Échap)`}
                        >
                          <X />
                        </Button>
                      </div>

                      {/* Single Unified Card: Quoted Block + Capillary Line + Textarea */}
                      <div className="rounded-2xl border border-border/30 bg-gradient-to-b from-muted/60 via-muted/20 to-transparent overflow-hidden shadow-xs">
                        {/* Top Quoted Passage */}
                        <div className="p-3 text-xs text-foreground/90 flex items-center gap-2.5">
                          <Quote
                            className="size-4 shrink-0 fill-muted-foreground/30 text-muted-foreground"
                            aria-hidden
                          />
                          <p className="min-w-0 font-sans text-xs font-medium italic leading-relaxed text-foreground/90 line-clamp-2">
                            « {activeDraftText || selectedText} »
                          </p>
                        </div>

                        {/* Ultra-subtle Capillary Line Separator */}
                        <div className="w-full h-px bg-border/25" />

                        {/* Bottom Textarea Input */}
                        <Textarea
                          autoFocus
                          rows={4}
                          size="sm"
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder={t`Écrivez votre réflexion sur ce passage...`}
                          aria-label={t`Votre note`}
                          className="rounded-none border-0 bg-transparent focus-visible:ring-0"
                        />
                      </div>

                      {/* Visibilité : deux bascules du groupe, `aria-pressed`
                       * sur chacune. L’ancienne pastille glissante n’était
                       * qu’un bouton peint — un lecteur d’écran n’apprenait
                       * jamais laquelle était active. */}
                      <ToggleGroup
                        aria-label={t`Visibilité de l’annotation`}
                        selectionMode="single"
                        disallowEmptySelection
                        selectedKeys={[isPublicChoice ? 'public' : 'private']}
                        onSelectionChange={(keys) =>
                          setIsPublicChoice(Array.from(keys).includes('public'))
                        }
                        className="grid w-full grid-cols-2"
                      >
                        <ToggleButton id="private" size="xs" className="justify-center">
                          <Lock aria-hidden />
                          {t`Privée`}
                        </ToggleButton>
                        <ToggleButton
                          id="public"
                          size="xs"
                          isDisabled={!allowPublicAnnotations}
                          className="justify-center"
                          aria-label={
                            allowPublicAnnotations
                              ? t`Annotation publique`
                              : t`Les annotations publiques sont désactivées par l'auteur`
                          }
                        >
                          <Globe aria-hidden />
                          {t`Publique`}
                        </ToggleButton>
                      </ToggleGroup>

                      {!allowPublicAnnotations && (
                        <p className="text-[10px] text-muted-foreground italic text-center">
                          {t`Les annotations publiques sont désactivées par l'auteur.`}
                        </p>
                      )}

                      {errorMessage && (
                        // `role="alert"` : l'erreur doit être annoncée, pas
                        // seulement peinte — elle apparaît après un envoi, donc
                        // hors du parcours de tabulation.
                        <p
                          role="alert"
                          className="text-[11px] text-destructive-text font-medium text-center"
                        >
                          {errorMessage}
                        </p>
                      )}

                      {/* Action principale : le biseau rend l’épaisseur du
                       * contrôle, et l’état pressé se voit. */}
                      <BevelButton
                        type="submit"
                        variant="solid"
                        tone={savedSuccess ? 'success' : 'brand'}
                        size="sm"
                        disabled={saving || savedSuccess}
                        className="w-full"
                      >
                        {saving ? (
                          <Loader2 className="animate-spin" aria-hidden />
                        ) : savedSuccess ? (
                          <Check aria-hidden />
                        ) : (
                          <Plus aria-hidden />
                        )}
                        {saving
                          ? t`Enregistrement…`
                          : savedSuccess
                            ? t`Enregistré !`
                            : t`Enregistrer l'annotation`}
                      </BevelButton>
                    </motion.form>
                  )}
                </AnimatePresence>

                {/* Une erreur d'action n'avait aucun endroit où s'afficher
                    dans la barre : elle n'existait que dans le formulaire. */}
                {errorMessage && !showNoteInput && (
                  <p
                    role="alert"
                    className="w-80 max-w-full px-3.5 pt-1 pb-2 text-[11px] font-medium text-destructive-text"
                  >
                    {errorMessage}
                  </p>
                )}
              </div>

              {/* Directional Caret (flèche vers le bas si le menu est au-dessus de la sélection) */}
              {!showNoteInput && placement.startsWith('top') && (
                <div className="w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-popover/95 drop-shadow-[0_1px_1px_rgba(0,0,0,0.08)] mt-[-1px] z-10 pointer-events-none" />
              )}
            </div>
          );
        }}
      </TextSelectionPopover>

      {/* Side Drawer when clicking any mark */}
      <AnnotationSideDrawer
        articleId={articleId}
        annotation={selectedAnnotationForDrawer}
        allArticleAnnotations={articleAnnotations}
        creatorName={creatorName}
        allowPublicAnnotations={allowPublicAnnotations}
        isAuthenticated={isAuthenticated}
        currentUserId={currentUserId}
        articleAuthorId={articleAuthorId}
        mainAppUrl={mainAppUrl}
        containerId={containerId}
        callbacks={callbacks}
        onRequireAuth={onRequireAuth}
        onClose={() => {
          setSelectedAnnotationForDrawer(null);
          setArticleAnnotations([]);
        }}
        onUpdateAnnotation={(updated) => {
          setAllPublic((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
          setHighlights((prev) =>
            prev.map((h) =>
              h.id === updated.id
                ? { ...h, note: updated.note ?? null, isPublic: updated.isPublic }
                : h
            )
          );
          // ⚠️ Le tiroir resynchronise sa liste sur `articleAnnotations` :
          // sans cette mise à jour, il reprenait l'ancienne version à chaque
          // rendu (visibilité qui revient en arrière, note qui disparaît).
          setArticleAnnotations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
          setSelectedAnnotationForDrawer(updated);
        }}
        onDeleteAnnotation={(deletedId) => {
          // 1. Les deux listes qui peignent le corps.
          setAllPublic((prev) => prev.filter((a) => a.id !== deletedId));
          setHighlights((prev) => prev.filter((h) => h.id !== deletedId));

          // 2. Le tiroir se ferme : son annotation n'existe plus.
          //    `articleAnnotations` est la liste qu'il resynchronise à chaque
          //    rendu ; la laisser en place le rouvrait sur la suivante avec
          //    un compteur faux (« 1 / 4 » pour trois annotations restantes).
          setArticleAnnotations([]);
          setSelectedAnnotationForDrawer(null);

          // 3. Moteur hérité seulement : ses marques sont du DOM écrit à la
          //    main, personne ne les retirera pour nous. En mode document,
          //    c'est React qui possède le corps : démancher la marque ici
          //    (insérer ses enfants dans le parent, puis la retirer) laisse
          //    React avec un nœud dont il croit encore être le propriétaire.
          //    Au commit suivant il tente de le retirer et lève « Failed to
          //    execute 'removeChild' on 'Node' » — la page entière tombe.
          //    Les deux retraits d'état ci-dessus suffisent : le corps est
          //    repeint sans cette marque.
          if (!documentMode) {
            const marks = document.querySelectorAll(`mark[data-highlight-id="${deletedId}"]`);
            marks.forEach((mark) => {
              const parent = mark.parentNode;
              if (parent) {
                while (mark.firstChild) {
                  parent.insertBefore(mark.firstChild, mark);
                }
                if (parent.contains(mark)) {
                  parent.removeChild(mark);
                }
              }
            });
          }
        }}
      />
    </>
  );
}
