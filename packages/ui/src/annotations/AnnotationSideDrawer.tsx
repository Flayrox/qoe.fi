'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FocusScope } from 'react-aria';
import { AlertCircle } from 'lucide-react';
import { t } from '@lingui/core/macro';

import {
  SPOTLIGHT_PULSE_CLASSES,
  type AnnotationItem,
  type CommentItem,
  type AnnotationSideDrawerProps,
} from './types';
import { annotationKind } from './annotation-kind';
import { citationFromAnnotation } from './citation';
import { markKindFor, MARK_ACCENT_TOKENS } from './mark-skin';
import { AnnotationDrawerHeader } from './drawer/AnnotationDrawerHeader';
import { AnnotationDrawerIdentity } from './drawer/AnnotationDrawerIdentity';
import { AnnotationDrawerQuote } from './drawer/AnnotationDrawerQuote';
import { AnnotationDrawerNote } from './drawer/AnnotationDrawerNote';
import { AnnotationDrawerDiscussion } from './drawer/AnnotationDrawerDiscussion';
import {
  AnnotationDrawerCitation,
  AnnotationDrawerCitationHint,
  AnnotationDrawerDeleteConfirmation,
} from './drawer/AnnotationDrawerActions';
import { AnnotationDrawerFooter } from './drawer/AnnotationDrawerFooter';

/**
 * Liste vide partagée.
 *
 * ⚠️ Un `= []` en valeur par défaut crée un NOUVEAU tableau à chaque rendu,
 * si bien que l'effet qui dépend de cette prop se relance à chaque rendu,
 * remet l'état, provoque un rendu, et ainsi de suite : le tiroir ne
 * s'affichait plus du tout (boucle de rendu infinie, écran figé).
 * Une constante de module a une identité stable pour toute la vie du module.
 */
const NO_ANNOTATIONS: AnnotationItem[] = [];

/**
 * Libellés de la nature, dérivés de la note (jamais stockés).
 *
 * ⚠️ Ils sont calculés au RENDU, pas à l'import du module : ce fichier est
 * chargé par le layout racine de Core, parfois avant que Lingui n'active sa
 * locale. Un `t` au niveau module y levait « Attempted to call a translation
 * function without setting a locale » et faisait tomber la page entière.
 */
const kindLabel = (kind: 'highlight' | 'annotation') =>
  kind === 'highlight' ? t`Surlignage` : t`Annotation`;

/**
 * Extrait l’annotation de la réponse serveur.
 *
 * Les actions rendent `{ highlight }` ; un callback direct peut rendre
 * l’annotation elle-même. Les deux formes sont acceptées, mais une réponse
 * sans annotation identifiable est un échec — jamais un succès optimiste.
 */
function serverAnnotationFromResult(payload: unknown): AnnotationItem | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = (
    'highlight' in payload ? (payload as { highlight?: unknown }).highlight : payload
  ) as Partial<AnnotationItem> | null | undefined;
  if (!candidate || typeof candidate !== 'object') return null;
  if (typeof candidate.id !== 'string' || typeof candidate.text !== 'string') return null;
  return candidate as AnnotationItem;
}

/**
 * Tiroir d'annotation — une seule ossature, quatre accents.
 *
 * 📐 L'en-tête (nature, pagination, fermeture) ne défile pas et garde les
 *    mêmes contrôles occupés quelle que soit la nature du passage. En
 *    dessous : identité, citation, note, discussion. Changer d'annotation
 *    ne change ni la position des flèches, ni la colonne de lecture — la
 *    teinte et les libellés suffisent.
 *
 * 🎨 L'accent vient de `markKindFor`, la même décision que la marque
 *    peinte dans l'article. Aucune couleur n'est choisie ici.
 */
export function AnnotationSideDrawer({
  articleId,
  annotation,
  allArticleAnnotations = NO_ANNOTATIONS,
  allowPublicAnnotations = true,
  isAuthenticated = false,
  currentUserId,
  articleAuthorId,
  mainAppUrl = '',
  containerId,
  onClose,
  callbacks,
  onRequireAuth,
  onUpdateAnnotation,
  onDeleteAnnotation,
}: AnnotationSideDrawerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [annotationsList, setAnnotationsList] = useState<AnnotationItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeAnnotation = annotationsList[currentIndex] || annotation;

  const [upvotes, setUpvotes] = useState(activeAnnotation?.upvotesCount || 0);
  const [hasUpvoted, setHasUpvoted] = useState(false);
  const [isPublicState, setIsPublicState] = useState(activeAnnotation?.isPublic || false);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);

  // Suppression : confirmation posée DANS le tiroir. `window.confirm()`
  // bloque le fil principal, ignore le thème, et son bouton « OK » ne dit
  // pas ce qu'on supprime.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Inline note editing state
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editNoteContent, setEditNoteContent] = useState(activeAnnotation?.note || '');
  const [savingEdit, setSavingEdit] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // Comment thread state
  const [comments, setComments] = useState<CommentItem[]>(activeAnnotation?.comments || []);
  const [newCommentText, setNewCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Publication en citation sur Qoefi (une annotation, pas un commentaire).
  const [citationCommentary, setCitationCommentary] = useState('');
  const [isCiting, setIsCiting] = useState(false);
  const [citationPublished, setCitationPublished] = useState(false);
  const [citationError, setCitationError] = useState<string | null>(null);
  const [citationPostHref, setCitationPostHref] = useState<string | null>(null);
  const [showCitationForm, setShowCitationForm] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Synchronize annotations list and set initial index to clicked annotation
  useEffect(() => {
    const list =
      allArticleAnnotations.length > 0
        ? allArticleAnnotations
        : annotation
          ? [annotation]
          : NO_ANNOTATIONS;

    // On ne remplace l'état que si la COMPOSITION ou le CONTENU a changé :
    // renvoyer un tableau neuf à chaque passage relancerait un rendu pour
    // rien. Mais comparer les seuls identifiants laissait le tiroir périmé :
    // une note ajoutée par le parent (ou une visibilité changée) n'était
    // jamais reprise, et la discussion restait fermée sur une annotation
    // devenue publique.
    const sameContent = (a: AnnotationItem, b: AnnotationItem) =>
      a.id === b.id &&
      a.note === b.note &&
      a.isPublic === b.isPublic &&
      a.upvotesCount === b.upvotesCount &&
      Boolean(a.hasUpvoted) === Boolean(b.hasUpvoted) &&
      a.updatedAt === b.updatedAt &&
      (a.comments?.length ?? 0) === (b.comments?.length ?? 0);

    setAnnotationsList((prev) =>
      prev.length === list.length && prev.every((item, i) => list[i] && sameContent(item, list[i]))
        ? prev
        : list
    );

    if (annotation) {
      const idx = list.findIndex((a) => a.id === annotation.id);
      setCurrentIndex((prev) => (prev === (idx !== -1 ? idx : 0) ? prev : idx !== -1 ? idx : 0));
    } else {
      setCurrentIndex((prev) => (prev === 0 ? prev : 0));
    }
  }, [annotation, allArticleAnnotations]);

  // Échap ferme le tiroir, et l'arrière-plan ne défile plus pendant la
  // lecture : sinon la molette déplace l'article sous un panneau qu'on ne
  // voit pas, et on ferme en perdant sa place.
  useEffect(() => {
    if (!activeAnnotation) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [activeAnnotation, onClose]);

  // Spotlight glow animation & smooth scroll to active mark in DOM
  useEffect(() => {
    if (activeAnnotation) {
      setUpvotes(activeAnnotation.upvotesCount || 0);
      setIsPublicState(activeAnnotation.isPublic || false);
      setComments(activeAnnotation.comments || []);
      setEditNoteContent(activeAnnotation.note || '');
      setIsEditingNote(false);
      setNoteError(null);
      setHasUpvoted(Boolean(activeAnnotation.hasUpvoted));
      setPrivacyError(null);
      setShowCitationForm(false);
      setConfirmingDelete(false);
      // Ces états appartiennent à UNE annotation : sans ce reset, la
      // « Citation publiée » et le brouillon de réponse du précédent
      // passage s’affichaient sur le suivant.
      setCitationPublished(false);
      setCitationError(null);
      setCitationPostHref(null);
      setCitationCommentary('');
      setNewCommentText('');

      // Le spotlight reste DANS l'article concerné : `document` pouvait
      // désigner la marque d'un autre article monté ailleurs dans la page.
      const scope = containerId ? document.getElementById(containerId) : document;
      const mark = Array.from(
        scope?.querySelectorAll<HTMLElement>('mark[data-highlight-id]') ?? []
      ).find((candidate) => candidate.getAttribute('data-highlight-id') === activeAnnotation.id);
      if (mark) {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Apply spotlight light pulse effect on document mark
        // Une seule liste de classes (celle des types) : recopiée ici, elle
        // finissait par diverger de celle du deep-link, et le pulse du
        // tiroir n'était plus le même selon le chemin d'ouverture.
        mark.classList.add(...SPOTLIGHT_PULSE_CLASSES.split(' '));
        const timer = setTimeout(() => {
          mark.classList.remove(...SPOTLIGHT_PULSE_CLASSES.split(' '));
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [currentIndex, activeAnnotation?.id, containerId]);

  const totalAnnotations = annotationsList.length;

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < totalAnnotations - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, totalAnnotations]);

  // Keyboard Arrow navigation (< / >)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeAnnotation || isEditingNote) return;
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      )
        return;

      if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeAnnotation, isEditingNote, handlePrev, handleNext]);

  // Le formulaire de citation vit dans la zone qui défile : l'ouvrir depuis
  // la barre ancrée doit amener jusqu'à lui, pas le laisser hors écran.
  // ⚠️ Cet effet vit AVANT le retour anticipé : sinon le nombre de hooks
  // change entre « tiroir fermé » et « tiroir ouvert » (React interdit).
  useEffect(() => {
    if (!showCitationForm && !citationPublished) return;
    const el = contentRef.current;
    el?.scrollTo?.({ top: el.scrollHeight, behavior: 'smooth' });
  }, [showCitationForm, citationPublished]);

  // Le profil vit dans l'application principale : sur un domaine de blog,
  // `/<handle>` est une rubrique, pas une personne. La carte de survol
  // n'invente donc pas sa destination, le tiroir la fournit. Ce hook vit
  // avant le retour anticipé, sinon l'ordre des hooks change entre tiroir
  // fermé et tiroir ouvert.
  const openProfile = useCallback(
    (handle: string) => {
      const clean = handle.replace(/^@/, '').trim();
      if (!clean) return;
      const origin = mainAppUrl ? mainAppUrl.replace(/\/+$/, '') : '';
      window.location.href = `${origin}/${encodeURIComponent(clean)}`;
    },
    [mainAppUrl]
  );

  if (!activeAnnotation) return null;

  // ✍️ La nature se LIT sur l'objet, elle ne se stocke pas : une note ajoutée
  // promeut le surlignage, une note vidée le ramène à un trait. Aucun champ
  // `kind` à maintenir en cohérence avec `note`.
  const kind = annotationKind(activeAnnotation);
  const hasNote = kind === 'annotation';
  const isOfficial = activeAnnotation.isOfficial;
  const isOwner = Boolean(currentUserId && currentUserId === activeAnnotation.reader.id);
  const canDelete = isOwner || Boolean(articleAuthorId && currentUserId === articleAuthorId);
  // Un surlignage nu n'a rien à discuter ; et une annotation PRIVÉE non plus :
  // personne d'autre ne la voit, il n'y a pas de fil à tenir. La discussion
  // naît d'une annotation partagée (publique ou officielle).
  const hasDiscussion = isOfficial || (hasNote && (activeAnnotation.isPublic || isPublicState));

  // 🧾 La citation n'existe que pour une annotation partagée : le payload
  // porte la note, l'extrait et les ancres. `null` ⇒ pas de bouton, et le
  // corps explique pourquoi (voir AnnotationDrawerCitationHint).
  const citation = citationFromAnnotation(activeAnnotation, { isPublic: isPublicState });
  const canCite = citation !== null;

  const authorName = activeAnnotation.reader.name || activeAnnotation.reader.username || t`Lecteur`;

  const handleLoginRedirect = () => {
    if (onRequireAuth) {
      onRequireAuth();
    } else if (callbacks?.onLoginRedirect) {
      callbacks.onLoginRedirect();
    } else if (mainAppUrl) {
      window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`;
    }
  };

  // Handle Note Inline Edit Save
  const handleSaveNoteEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAnnotation) return;
    if (!isAuthenticated) {
      handleLoginRedirect();
      return;
    }

    // Le bouton est déjà désactivé sur un texte vide ; on garde la garde
    // ici aussi pour les envois au clavier (Entrée dans un textarea).
    const nextNote = editNoteContent.trim();
    if (!nextNote) return;

    setSavingEdit(true);
    setNoteError(null);
    try {
      const res = callbacks?.onUpdateNote
        ? await callbacks.onUpdateNote({
            highlightId: activeAnnotation.id,
            note: nextNote,
          })
        : null;

      const serverAnnotation = res?.ok ? serverAnnotationFromResult(res.data) : null;
      if (!serverAnnotation) {
        setNoteError(
          res && !res.ok
            ? res.error?.message || t`La note n’a pas pu être enregistrée.`
            : t`La note n’a pas pu être enregistrée.`
        );
        return;
      }

      // La réponse serveur est la seule vérité : elle peut avoir trimmé la
      // note, changé sa visibilité ou refusé silencieusement une valeur. On
      // n’invente ni date ni contenu, on rend l’annotation reçue.
      const updated: AnnotationItem = {
        ...activeAnnotation,
        ...serverAnnotation,
        reader: { ...activeAnnotation.reader, ...(serverAnnotation.reader ?? {}) },
        comments: serverAnnotation.comments ?? comments,
        hasUpvoted: serverAnnotation.hasUpvoted ?? activeAnnotation.hasUpvoted,
      };
      patchActiveAnnotation(updated);
      setEditNoteContent(updated.note ?? '');
      setIsEditingNote(false);
    } catch (err) {
      console.error(err);
      setNoteError(t`La note n’a pas pu être enregistrée.`);
    } finally {
      setSavingEdit(false);
    }
  };

  const startWritingNote = () => {
    setNoteError(null);
    setEditNoteContent(hasNote ? (activeAnnotation.note ?? '') : '');
    setIsEditingNote(true);
  };

  /**
   * Remplace l'annotation courante dans la liste ET prévient le parent.
   *
   * ⚠️ Sans cette propagation, une réponse ou un vote restait local :
   * passer au passage suivant puis revenir le faisait disparaître, et la
   * puce de vote se remettait à zéro (le parent ne le savait pas).
   */
  const patchActiveAnnotation = (next: AnnotationItem) => {
    setAnnotationsList((prev) => {
      const copy = [...prev];
      copy[currentIndex] = next;
      return copy;
    });
    onUpdateAnnotation?.(next);
  };

  // Handle privacy toggle (Private <-> Public)
  const handleTogglePrivacy = async () => {
    if (!activeAnnotation) return;
    if (!isAuthenticated) {
      handleLoginRedirect();
      return;
    }

    setPrivacyError(null);
    setTogglingPrivacy(true);
    const targetPublic = !isPublicState;

    try {
      const res = callbacks?.onTogglePrivacy
        ? await callbacks.onTogglePrivacy({
            highlightId: activeAnnotation.id,
            isPublic: targetPublic,
          })
        : { ok: true };

      if (res?.ok) {
        setIsPublicState(targetPublic);
        patchActiveAnnotation({ ...activeAnnotation, isPublic: targetPublic });
      } else if (res && !res.ok && res.error?.code === 'PUBLIC_ANNOTATIONS_DISABLED') {
        setPrivacyError(t`Le créateur a désactivé les annotations publiques sur cet écrit.`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingPrivacy(false);
    }
  };

  // Handle upvote (toggleable like)
  const handleUpvote = async () => {
    if (!activeAnnotation) return;
    if (!isAuthenticated) {
      handleLoginRedirect();
      return;
    }

    const nextState = !hasUpvoted;
    const nextCount = nextState ? upvotes + 1 : Math.max(0, upvotes - 1);
    setHasUpvoted(nextState);
    setUpvotes(nextCount);
    patchActiveAnnotation({
      ...activeAnnotation,
      upvotesCount: nextCount,
      hasUpvoted: nextState,
    });

    try {
      const res = callbacks?.onUpvote ? await callbacks.onUpvote(activeAnnotation.id) : null;
      if (res?.ok && res.data?.upvotesCount !== undefined) {
        const confirmed = {
          ...activeAnnotation,
          upvotesCount: res.data.upvotesCount,
          hasUpvoted: Boolean(res.data.hasUpvoted),
        };
        setUpvotes(confirmed.upvotesCount);
        setHasUpvoted(Boolean(confirmed.hasUpvoted));
        patchActiveAnnotation(confirmed);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Handle deletion of annotation — après confirmation DANS le tiroir
  // (`confirmingDelete`), jamais par un `window.confirm()` bloquant.
  const handleDeleteAnnotation = async () => {
    if (!activeAnnotation || deleting) return;
    if (!isAuthenticated) {
      handleLoginRedirect();
      return;
    }

    setDeleting(true);
    try {
      const res = callbacks?.onDelete
        ? await callbacks.onDelete(activeAnnotation.id)
        : { ok: true };
      if (res?.ok) {
        const deletedId = activeAnnotation.id;
        const newList = annotationsList.filter((a) => a.id !== deletedId);
        setAnnotationsList(newList);
        setConfirmingDelete(false);
        if (onDeleteAnnotation) onDeleteAnnotation(deletedId);

        if (newList.length === 0) {
          onClose();
        } else {
          setCurrentIndex((prev) => Math.min(prev, newList.length - 1));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  // Handle annotation comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAnnotation) return;
    if (!isAuthenticated) {
      handleLoginRedirect();
      return;
    }

    if (!newCommentText.trim()) return;

    setSubmittingComment(true);
    try {
      const res = callbacks?.onComment
        ? await callbacks.onComment({ highlightId: activeAnnotation.id, content: newCommentText })
        : null;

      if (res?.ok && res.data) {
        const comment = res.data as CommentItem;
        const nextComments = [...comments, comment];
        setComments(nextComments);
        setNewCommentText('');
        // La réponse fait partie de l'annotation : sans cette mise à jour,
        // elle s'affichait puis disparaissait dès qu'on changeait de passage.
        patchActiveAnnotation({ ...activeAnnotation, comments: nextComments });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingComment(false);
    }
  };

  /**
   * Publie l'annotation comme citation : la note est le texte cité, le
   * passage et son auteur l'accompagnent. La règle de publication est
   * recalculée ici avec l'état de visibilité VISIBLE (la bascule peut
   * n'être pas encore confirmée par le parent).
   */
  const handleCiteAnnotation = async () => {
    if (!activeAnnotation) return;
    if (!isAuthenticated) {
      handleLoginRedirect();
      return;
    }

    const citation = citationFromAnnotation(activeAnnotation, { isPublic: isPublicState });
    // Un surlignage nu n'a pas de texte à citer ; une annotation privée
    // n'est partagée avec personne. Aucune des deux ne part sur le feed.
    if (!citation) return;

    setIsCiting(true);
    setCitationPublished(false);
    setCitationError(null);
    try {
      const res = callbacks?.onCiteAnnotation
        ? await callbacks.onCiteAnnotation({
            articleId,
            citation,
            commentary: citationCommentary,
          })
        : { ok: false };

      if (!res?.ok) {
        // Le refus a une raison utile : le serveur revérifie la nature et
        // la visibilité, et peut refuser ce que l'écran croyait possible.
        setCitationError(
          res?.error?.code === 'ANNOTATION_NOT_CITABLE'
            ? t`Cette annotation ne peut pas être citée : elle est privée ou ne porte pas de note.`
            : res?.error?.message || t`La citation n’a pas pu être publiée.`
        );
      }

      if (res?.ok) {
        const path = res.data?.url ?? null;
        const origin = mainAppUrl ? mainAppUrl.replace(/\/+$/, '') : '';
        const href = path
          ? path.startsWith('http')
            ? path
            : `${origin}${path}`
          : `${origin}/home`;
        setCitationPostHref(href || '/home');
        setCitationPublished(true);
        setShowCitationForm(false);
        setCitationCommentary('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCiting(false);
    }
  };

  // La nature commande UN accent, pas trois badges différents. Une
  // annotation privée n'est pas une annotation publique « un peu
  // différente » : le tiroir lit la même décision que la marque
  // (`markKindFor`), et se contente de la poser sur le panneau.
  const markKind = markKindFor({
    isOfficial,
    isPublic: Boolean(activeAnnotation.isPublic || isPublicState),
    hasNote,
  });
  const natureLabel =
    markKind === 'official'
      ? t`Officielle`
      : kindLabel(markKind === 'highlight' ? 'highlight' : 'annotation');

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {activeAnnotation && (
        <div className="pointer-events-none fixed inset-y-0 right-0 z-50 flex font-sans select-text">
          {/* Voile : un panneau blanc sur une page blanche n'a pas de bord.
              Il rend le focus à l'article au clic, sans voler le focus
              clavier (tabIndex -1, aria-hidden). */}
          <motion.button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto fixed inset-0 z-0 cursor-default bg-foreground/[0.08]"
          />

          {/* Le tiroir était un panneau visuel sans sémantique : le focus
              restait derrière, dans l'article, et un lecteur d'écran ne
              savait pas qu'une surface s'était ouverte. `FocusScope`
              confine le focus (Tab ne sort plus) et le rend au déclencheur
              à la fermeture. */}
          <FocusScope contain restoreFocus autoFocus>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="annotation-drawer-title"
              initial={{ x: '100%', opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 240 }}
              className="pointer-events-auto relative z-10 flex h-full w-screen max-w-[420px] flex-col overflow-hidden border-border/60 bg-card text-card-foreground shadow-[-16px_0_40px_-24px_rgba(0,0,0,0.28)] sm:rounded-l-[var(--radius-card)] sm:border-l"
              style={
                {
                  '--qoe-annotation-accent': `var(${MARK_ACCENT_TOKENS[markKind]})`,
                } as React.CSSProperties
              }
            >
              <AnnotationDrawerHeader
                label={natureLabel}
                index={currentIndex}
                total={totalAnnotations}
                onPrev={handlePrev}
                onNext={handleNext}
                onClose={onClose}
              />

              <div ref={contentRef} className="flex-1 overflow-y-auto">
                <AnnotationDrawerIdentity
                  annotation={activeAnnotation}
                  authorName={authorName}
                  isOfficial={isOfficial}
                  isOwner={isOwner}
                  canDelete={canDelete}
                  hasNote={hasNote}
                  isPublicState={isPublicState}
                  togglingPrivacy={togglingPrivacy}
                  allowPublicAnnotations={allowPublicAnnotations}
                  confirmingDelete={confirmingDelete}
                  onStartWritingNote={startWritingNote}
                  onRequestDelete={() => setConfirmingDelete(true)}
                  onTogglePrivacy={handleTogglePrivacy}
                  onOpenProfile={openProfile}
                />

                <AnnotationDrawerQuote text={activeAnnotation.text} hasNote={hasNote} />

                <div className="space-y-5 px-4 pb-6 pt-4">
                  {privacyError && (
                    <div
                      role="alert"
                      className="flex gap-2 rounded-panel border border-destructive/25 bg-destructive/[0.04] p-3 type-control-md leading-5 text-destructive-text"
                    >
                      <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                      <span>{privacyError}</span>
                    </div>
                  )}

                  <AnnotationDrawerNote
                    note={activeAnnotation.note}
                    isEditing={isEditingNote}
                    draft={editNoteContent}
                    saving={savingEdit}
                    error={noteError}
                    onDraftChange={setEditNoteContent}
                    onStart={startWritingNote}
                    onCancel={() => {
                      setNoteError(null);
                      setIsEditingNote(false);
                    }}
                    onSave={handleSaveNoteEdit}
                  />

                  {confirmingDelete && (
                    <AnnotationDrawerDeleteConfirmation
                      hasNote={hasNote}
                      deleting={deleting}
                      onCancel={() => setConfirmingDelete(false)}
                      onConfirm={handleDeleteAnnotation}
                    />
                  )}

                  <AnnotationDrawerCitationHint
                    hasNote={hasNote}
                    isPublicState={isOfficial || activeAnnotation.isPublic || isPublicState}
                  />

                  <AnnotationDrawerCitation
                    showForm={showCitationForm}
                    success={citationPublished}
                    citation={citation}
                    commentary={citationCommentary}
                    publishing={isCiting}
                    error={citationError}
                    postHref={citationPostHref}
                    onCommentaryChange={setCitationCommentary}
                    onCancel={() => setShowCitationForm(false)}
                    onSubmit={handleCiteAnnotation}
                  />

                  {hasDiscussion && (
                    <AnnotationDrawerDiscussion
                      comments={comments}
                      draft={newCommentText}
                      submitting={submittingComment}
                      onDraftChange={setNewCommentText}
                      onSubmit={handleAddComment}
                      onOpenProfile={openProfile}
                    />
                  )}
                </div>
              </div>

              <AnnotationDrawerFooter
                hasNote={hasNote}
                canCite={canCite}
                hasUpvoted={hasUpvoted}
                upvotes={upvotes}
                showCitationForm={showCitationForm}
                onUpvote={handleUpvote}
                onToggleCitation={() => {
                  setCitationError(null);
                  setShowCitationForm((open) => !open);
                }}
              />
            </motion.div>
          </FocusScope>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
