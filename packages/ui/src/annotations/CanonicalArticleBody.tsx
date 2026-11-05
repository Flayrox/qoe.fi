'use client';

// =====================================================================
// 📄 CanonicalArticleBody — Corps d'article rendu depuis le document
// canonique, marques peintes PAR OFFSETS (plus aucune recherche de texte,
// plus aucune mutation DOM) — tranche 1-b.
// =====================================================================

import React, { Fragment, ReactNode, useEffect, useRef } from 'react';
import {
  AnnotationFilterMode,
  AnnotationItem,
  HighlightItem,
  markSkin,
  markSkinFor,
  SPOTLIGHT_PULSE_CLASSES,
  SpotlightRange,
} from './types';
import {
  CanonicalDocument,
  CanonicalInlineSpan,
  PaintMark,
  runBoundaries,
  marksCovering,
  segmentWindow,
  styleSegments,
  toLocalRange,
} from './canonical-document';
import { isAnnotation } from './annotation-kind';
import { t } from '@lingui/core/macro';

export interface CanonicalArticleBodyProps {
  document: CanonicalDocument;
  /** Surlignages privés du lecteur (ancrés). */
  highlights: HighlightItem[];
  /** Surlignages publics + officiels (ancrés). */
  allPublic: AnnotationItem[];
  filterMode: AnnotationFilterMode;
  containerId?: string;
  className?: string;
  creatorName: string;
  currentUserId?: string | null;
  onMarkClick: (annotation: AnnotationItem) => void;
  /** Passage à mettre en avant (deep-link citation → article) : marque
   *  spotlight + scroll + pulse au montage, si sha conforme. */
  spotlight?: SpotlightRange | null;
}

const TAG_BY_KIND: Record<string, 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'blockquote' | 'pre'> = {
  p: 'p',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  blockquote: 'blockquote',
  code: 'pre',
};

/** Convertit un surlignage privé en AnnotationItem (forme drawer). */
function toAnnotation(hl: HighlightItem): AnnotationItem {
  return {
    id: hl.id,
    text: hl.text,
    note: hl.note ?? null,
    isPublic: false,
    isOfficial: false,
    upvotesCount: hl.upvotesCount ?? 0,
    createdAt: hl.createdAt ?? new Date().toISOString(),
    reader: hl.reader ?? {
      id: 'reader',
      name: t`Lecteur`,
      username: 'lecteur',
      logoUrl: null,
    },
  };
}

/**
 * Marques à peindre sur le segment (bloc ou item) : surlignages ancrés
 * (privés selon filterMode, publics/officiels sinon) + spans officiels du
 * document (synthétisés s'ils ne correspondent à aucun allPublic).
 */
export function buildSegmentMarks(
  doc: CanonicalDocument,
  blockIdx: number,
  itemIdx: number,
  highlights: HighlightItem[],
  allPublic: AnnotationItem[],
  filterMode: AnnotationFilterMode,
  creatorName: string,
  spotlight?: SpotlightRange | null,
  currentUserId?: string | null
): PaintMark[] {
  const win = segmentWindow(doc, blockIdx, itemIdx);
  if (!win) return [];
  const marks: PaintMark[] = [];
  const push = (
    gs: number,
    ge: number,
    id: string,
    className: string,
    title: string | undefined,
    annotation: AnnotationItem
  ) => {
    const loc = toLocalRange(win.start, win.end, gs, ge);
    if (!loc) return;
    marks.push({ start: loc.start, end: loc.end, id, className, title, annotation });
  };

  const anchored = (cs: unknown, ce: unknown, sha: string | undefined) =>
    typeof cs === 'number' && typeof ce === 'number' && (!sha || sha === doc.sha);

  if (filterMode === 'all' || filterMode === 'mine') {
    // ⚠️ Une annotation présente dans les DEUX listes (le lecteur voit sa
    // propre annotation publique) ne se peint qu'une fois, avec la peau
    // publique : sinon la première marque gagnait et elle était privée.
    const publicIds = new Set(allPublic.map((p) => p.id));
    for (const hl of highlights) {
      if (filterMode === 'all' && publicIds.has(hl.id)) continue;
      if (!anchored(hl.canonicalStart, hl.canonicalEnd, hl.contentSha)) continue;
      const isPublic = Boolean(hl.isPublic);
      push(
        hl.canonicalStart as number,
        hl.canonicalEnd as number,
        hl.id,
        markSkinFor({ isPublic, hasNote: Boolean(hl.note?.trim()) }),
        hl.note
          ? isPublic
            ? t`Note publique : ${hl.note}`
            : t`Note privée : ${hl.note}`
          : undefined,
        { ...toAnnotation(hl), isPublic }
      );
    }
  }

  if (filterMode !== 'none') {
    for (const pub of allPublic) {
      // Mode « officielles » : seules les marques de l'auteur sont peintes.
      if (filterMode === 'official' && !pub.isOfficial) continue;
      // Mode « mine » : seules les marques du lecteur courant sont peintes.
      if (filterMode === 'mine') {
        const isMine = currentUserId ? pub.reader?.id === currentUserId : false;
        if (!isMine) continue;
      }
      if (!anchored(pub.canonicalStart, pub.canonicalEnd, pub.contentSha)) continue;
      push(
        pub.canonicalStart as number,
        pub.canonicalEnd as number,
        pub.id,
        markSkinFor({
          isOfficial: pub.isOfficial,
          isPublic: true,
          hasNote: Boolean(pub.note?.trim()),
        }),
        pub.note
          ? pub.isOfficial
            ? t`Annotation officielle : ${pub.note}`
            : t`Annotation publique : ${pub.note}`
          : undefined,
        pub
      );
    }
    // Spans officiels du document (mark data-annotation-note du studio) :
    // réutilisés quand un allPublic officiel correspond (même texte), sinon
    // synthétisés pour le drawer (non affichés en mode « mine »).
    if (filterMode !== 'mine') {
      const block = doc.blocks[blockIdx];
      const used = new Set<string>();
      for (const sp of block?.spans ?? []) {
        const text = (block.text ?? '').slice(sp.start, sp.end);
        const matched = allPublic.find((p) => p.isOfficial && p.text === text && !used.has(p.id));
        if (matched) {
          used.add(matched.id);
          push(
            win.start + sp.start,
            win.start + sp.end,
            matched.id,
            markSkin('official'),
            matched.note ? t`Annotation officielle : ${matched.note}` : undefined,
            matched
          );
          continue;
        }
        const synth: AnnotationItem = {
          id: `official-html-mark-${blockIdx}-${sp.start}`,
          text,
          note: sp.note ?? null,
          isPublic: true,
          isOfficial: true,
          upvotesCount: 0,
          createdAt: new Date().toISOString(),
          reader: { id: 'creator', name: creatorName, username: 'creator', logoUrl: null },
        };
        push(
          win.start + sp.start,
          win.start + sp.end,
          synth.id,
          markSkin('official'),
          sp.note ? t`Annotation officielle : ${sp.note}` : undefined,
          synth
        );
      }
    }
  }

  // 🔦 Spotlight (deep-link citation → article) : peint dans tous les modes
  // de filtre (le passage demandé doit toujours être visible), uniquement si
  // l'empreinte du document chargé correspond — un contenu ré-édité ne
  // produit jamais de faux surlignage.
  if (spotlight && spotlight.sha === doc.sha) {
    push(
      spotlight.start,
      spotlight.end,
      'spotlight-passage',
      `${SPOTLIGHT_PULSE_CLASSES} cursor-default`,
      undefined,
      // Annotation synthétique non cliquable : aucun drawer à ouvrir.
      {
        id: 'spotlight-passage',
        text: '',
        note: null,
        isPublic: false,
        isOfficial: false,
        upvotesCount: 0,
        createdAt: new Date().toISOString(),
        reader: { id: 'spotlight', name: '', username: '', logoUrl: null },
      }
    );
  }

  // 🛡️ Une annotation ne se peint qu'une fois par segment. Si le même id
  // arrive deux fois — liste mise à jour par le parent ET par le moteur —
  // le texte recevrait deux `<mark>` imbriqués de mêmes classes : le trait
  // doublerait, sans rien signaler d'autre.
  const unique: PaintMark[] = [];
  const seen = new Set<string>();
  for (const mark of marks) {
    if (seen.has(mark.id)) continue;
    seen.add(mark.id);
    unique.push(mark);
  }
  return unique;
}

// ---------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------

interface RichProps {
  text: string;
  marks: PaintMark[];
  inline?: CanonicalInlineSpan[];
  onMarkClick: (annotation: AnnotationItem) => void;
}

const SPOTLIGHT_MARK_ID = 'spotlight-passage';

/** Texte d'un run découpé en styles inline puis enveloppé des marques. */
function RenderRich({ text, marks, inline, onMarkClick }: RichProps) {
  const boundaries = runBoundaries(text.length, marks);
  const runs: ReactNode[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const a = boundaries[i];
    const b = boundaries[i + 1];
    if (b <= a) continue;
    const segText = text.slice(a, b);
    const covering = marksCovering(marks, a, b);

    const styled: ReactNode[] = styleSegments(a, b, inline).map((ss, j) => {
      let node: ReactNode = text.slice(ss.start, ss.end);
      for (const st of ss.styles) {
        if (st === 'link') {
          node = (
            <a
              key={j}
              href={ss.href}
              className="underline decoration-current underline-offset-2 hover:opacity-80 transition-opacity"
            >
              {node}
            </a>
          );
        } else if (st === 'bold') {
          node = <strong key={j}>{node}</strong>;
        } else if (st === 'italic') {
          node = <em key={j}>{node}</em>;
        } else if (st === 'underline') {
          node = <u key={j}>{node}</u>;
        } else if (st === 'code') {
          node = <code key={j}>{node}</code>;
        }
      }
      return <Fragment key={`st-${j}`}>{node}</Fragment>;
    });

    let node: ReactNode = <>{styled}</>;
    for (const m of covering) {
      const isSpotlight = m.id === SPOTLIGHT_MARK_ID;
      const markLabel = isAnnotation(m.annotation) ? t`Annotation` : t`Surlignage`;
      node = (
        <mark
          key={m.id}
          className={m.className}
          data-highlight-id={m.id}
          data-spotlight={isSpotlight ? 'true' : undefined}
          data-highlight-text={segText}
          title={m.title}
          // Une marque cliquable doit être un contrôle : sans rôle ni
          // `tabindex`, l'annotation n'est atteignable qu'à la souris.
          // Le spotlight, lui, n'ouvre rien — il reste décoratif.
          role={isSpotlight ? undefined : 'button'}
          tabIndex={isSpotlight ? undefined : 0}
          aria-label={
            isSpotlight ? undefined : (m.title ?? `${markLabel} : ${segText.slice(0, 80)}`)
          }
          onClick={
            isSpotlight
              ? undefined
              : (e) => {
                  e.stopPropagation();
                  onMarkClick(m.annotation);
                }
          }
          onKeyDown={
            isSpotlight
              ? undefined
              : (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onMarkClick(m.annotation);
                  }
                }
          }
        >
          {node}
        </mark>
      );
    }
    runs.push(<Fragment key={`run-${i}`}>{node}</Fragment>);
  }
  return <>{runs}</>;
}

interface BlockViewProps {
  doc: CanonicalDocument;
  blockIdx: number;
  highlights: HighlightItem[];
  allPublic: AnnotationItem[];
  filterMode: AnnotationFilterMode;
  creatorName: string;
  onMarkClick: (annotation: AnnotationItem) => void;
  spotlight?: SpotlightRange | null;
  currentUserId?: string | null;
}

function BlockView({
  doc,
  blockIdx,
  highlights,
  allPublic,
  filterMode,
  creatorName,
  onMarkClick,
  spotlight,
  currentUserId,
}: BlockViewProps) {
  const block = doc.blocks[blockIdx];
  if (!block) return null;

  switch (block.kind) {
    case 'img':
      return <img src={block.src} alt={block.alt || ''} loading="lazy" />;
    case 'hr':
      return <hr />;
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag className={block.ordered ? 'list-decimal pl-6' : 'list-disc pl-6'}>
          {(block.items ?? []).map((item, j) => (
            <li key={j}>
              <RenderRich
                text={item.text}
                marks={buildSegmentMarks(
                  doc,
                  blockIdx,
                  j,
                  highlights,
                  allPublic,
                  filterMode,
                  creatorName,
                  spotlight,
                  currentUserId
                )}
                inline={item.inline}
                onMarkClick={onMarkClick}
              />
            </li>
          ))}
        </Tag>
      );
    }
    default: {
      const Tag = TAG_BY_KIND[block.kind] ?? 'p';
      return (
        <Tag>
          <RenderRich
            text={block.text ?? ''}
            marks={buildSegmentMarks(
              doc,
              blockIdx,
              0,
              highlights,
              allPublic,
              filterMode,
              creatorName,
              spotlight,
              currentUserId
            )}
            inline={block.inline}
            onMarkClick={onMarkClick}
          />
        </Tag>
      );
    }
  }
}

export function CanonicalArticleBody({
  document,
  highlights,
  allPublic,
  filterMode,
  containerId = 'article-content',
  className,
  creatorName,
  currentUserId,
  onMarkClick,
  spotlight,
}: CanonicalArticleBodyProps) {
  // 🔦 Spotlight : scroll + pulse une seule fois par passage demandé, après
  // le montage (le document est déjà rendu à ce stade).
  const spotlightKey =
    spotlight && spotlight.sha === document.sha
      ? `${spotlight.start}:${spotlight.end}:${spotlight.sha}`
      : null;
  const appliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!spotlightKey || appliedRef.current === spotlightKey) return;
    appliedRef.current = spotlightKey;
    // NB : le prop `document` (canonique) masque le global — on passe par
    // globalThis pour interroger le DOM réel.
    const mark = globalThis.document.querySelector<HTMLElement>('[data-spotlight="true"]');
    if (!mark) return;
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => {
      mark.classList.remove(
        'ring-2',
        'ring-primary/80',
        'bg-highlight/40',
        'shadow-lg',
        'shadow-highlight/30',
        'transition-all',
        'duration-500'
      );
    }, 1600);
    return () => clearTimeout(timer);
  }, [spotlightKey]);

  return (
    <div id={containerId} className={className}>
      {document.blocks.map((_, i) => (
        <BlockView
          key={i}
          doc={document}
          blockIdx={i}
          highlights={highlights}
          allPublic={allPublic}
          filterMode={filterMode}
          creatorName={creatorName}
          currentUserId={currentUserId}
          onMarkClick={onMarkClick}
          spotlight={spotlight}
        />
      ))}
    </div>
  );
}
