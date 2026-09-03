'use client';

// =====================================================================
// 📄 CanonicalArticleBody — Corps d'article rendu depuis le document
// canonique, marques peintes PAR OFFSETS (plus aucune recherche de texte,
// plus aucune mutation DOM) — tranche 1-b.
// =====================================================================

import React, { Fragment, ReactNode } from 'react';
import { AnnotationFilterMode, AnnotationItem, HighlightItem, MARK_STYLE_CLASSES } from './types';
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
  onMarkClick: (annotation: AnnotationItem) => void;
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
      name: 'Lecteur',
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
  creatorName: string
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

  if (filterMode === 'all') {
    for (const hl of highlights) {
      if (!anchored(hl.canonicalStart, hl.canonicalEnd, hl.contentSha)) continue;
      push(
        hl.canonicalStart as number,
        hl.canonicalEnd as number,
        hl.id,
        MARK_STYLE_CLASSES.private,
        hl.note ? `Note privée : ${hl.note}` : undefined,
        toAnnotation(hl)
      );
    }
  }

  if (filterMode !== 'none') {
    for (const pub of allPublic) {
      // Mode « officielles » : seules les marques de l'auteur sont peintes.
      if (filterMode === 'official' && !pub.isOfficial) continue;
      if (!anchored(pub.canonicalStart, pub.canonicalEnd, pub.contentSha)) continue;
      push(
        pub.canonicalStart as number,
        pub.canonicalEnd as number,
        pub.id,
        pub.isOfficial ? MARK_STYLE_CLASSES.official : MARK_STYLE_CLASSES.public,
        pub.note
          ? `${pub.isOfficial ? 'Annotation officielle' : 'Annotation publique'} : ${pub.note}`
          : undefined,
        pub
      );
    }
    // Spans officiels du document (mark data-annotation-note du studio) :
    // réutilisés quand un allPublic officiel correspond (même texte), sinon
    // synthétisés pour le drawer.
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
          MARK_STYLE_CLASSES.official,
          matched.note ? `Annotation officielle : ${matched.note}` : undefined,
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
        MARK_STYLE_CLASSES.official,
        sp.note ? `Annotation officielle : ${sp.note}` : undefined,
        synth
      );
    }
  }
  return marks;
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
      node = (
        <mark
          key={m.id}
          className={m.className}
          data-highlight-id={m.id}
          data-highlight-text={segText}
          title={m.title}
          onClick={(e) => {
            e.stopPropagation();
            onMarkClick(m.annotation);
          }}
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
}

function BlockView({
  doc,
  blockIdx,
  highlights,
  allPublic,
  filterMode,
  creatorName,
  onMarkClick,
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
                  creatorName
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
              creatorName
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
  onMarkClick,
}: CanonicalArticleBodyProps) {
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
          onMarkClick={onMarkClick}
        />
      ))}
    </div>
  );
}
