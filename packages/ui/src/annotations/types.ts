// =====================================================================
// 🏷️ @qoe/ui/annotations — Type Definitions & Callback Contracts
// =====================================================================

import React from 'react';

/**
 * Filter mode for article annotations in reader view.
 * - `all`: Renders author (official), public, and private annotations.
 * - `official`: Renders ONLY official author annotations.
 * - `none`: Hides all annotations for an uninterrupted reading experience.
 */
export type AnnotationFilterMode = 'all' | 'official' | 'none';

/**
 * Reader / Author user profile associated with an annotation or comment.
 */
export interface AnnotationReader {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  subdomain?: string | null;
}

/**
 * Single comment item within an annotation discussion thread.
 */
export interface CommentItem {
  id: string;
  content: string;
  createdAt: Date | string;
  author: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
  };
}

/** Alias for backward compatibility with existing legacy code */
export type AnnotationCommentItem = CommentItem;

/**
 * Core Annotation model representing a highlighted text passage.
 */
export interface AnnotationItem {
  id: string;
  text: string;
  /** Occurrence du passage cité (0-based) quand le texte se répète. */
  quoteOrdinal?: number;
  /** Ancres canoniques : offsets (code points) dans le document canonique
   *  de l'article (GET /v1/articles/{id}/document). Additifs — absents pour
   *  les données héritées non résolues. */
  canonicalStart?: number;
  canonicalEnd?: number;
  contentSha?: string;
  note?: string | null;
  isPublic: boolean;
  isOfficial: boolean;
  upvotesCount: number;
  hasUpvoted?: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
  reader: AnnotationReader;
  comments?: CommentItem[];
}

/** Legacy HighlightItem interface alias for smooth transition */
export interface HighlightItem {
  id: string;
  text: string;
  /** Occurrence du passage cité (0-based) quand le texte se répète. */
  quoteOrdinal?: number;
  /** Ancres canoniques (voir AnnotationItem). */
  canonicalStart?: number;
  canonicalEnd?: number;
  contentSha?: string;
  note: string | null;
  isPublic?: boolean;
  isOfficial?: boolean;
  upvotesCount?: number;
  createdAt?: Date | string;
  reader?: AnnotationReader;
}

/**
 * Selection state passed to popover render children.
 */
export interface SelectionState {
  text: string;
  range: Range;
  placement: string;
  clearSelection: () => void;
}

// ---------------------------------------------------------------------
// ⚡ Decoupled Action Callback Parameters & Return Types
// ---------------------------------------------------------------------

export interface CreateHighlightParams {
  articleId?: string;
  text: string;
  note?: string | null;
  isPublic: boolean;
  /** Occurrence du passage cité (0-based) si le texte se répète. */
  quoteOrdinal?: number;
}

export interface CommentHighlightParams {
  highlightId: string;
  content: string;
}

export interface TogglePrivacyParams {
  highlightId: string;
  isPublic: boolean;
}

export interface UpdateNoteParams {
  highlightId: string;
  note: string | null;
}

export interface CrosspostPassageParams {
  articleId?: string;
  text: string;
  commentary?: string;
}

export interface AnnotationActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    [key: string]: unknown;
  } | null;
}

/**
 * Decoupled action callbacks injected into `@qoe/ui/annotations` components.
 * Enables zero-dependency integration across apps/web and apps/feed.
 */
export interface AnnotationActionCallbacks {
  onHighlightCreate?: (params: CreateHighlightParams) => Promise<AnnotationActionResult>;
  onUpvote?: (
    highlightId: string
  ) => Promise<AnnotationActionResult<{ upvotesCount: number; hasUpvoted: boolean }>>;
  onComment?: (params: CommentHighlightParams) => Promise<AnnotationActionResult<CommentItem>>;
  onTogglePrivacy?: (params: TogglePrivacyParams) => Promise<AnnotationActionResult>;
  onUpdateNote?: (params: UpdateNoteParams) => Promise<AnnotationActionResult>;
  onDelete?: (highlightId: string) => Promise<AnnotationActionResult<void>>;
  onCrosspost?: (params: CrosspostPassageParams) => Promise<AnnotationActionResult>;
  onLoginRedirect?: () => void;
}

// ---------------------------------------------------------------------
// 🎨 Highlight Visual Styling Constants & Types
// ---------------------------------------------------------------------

export type HighlightType = 'official' | 'public' | 'private';

export const MARK_STYLE_CLASSES: Record<HighlightType, string> = {
  official:
    'bg-highlight/20 text-foreground cursor-pointer border-b border-highlight hover:bg-highlight/30 transition-all relative group rounded-xs font-medium',
  public:
    'bg-primary/20 text-foreground cursor-pointer border-b border-primary/50 hover:bg-primary/30 transition-all relative group rounded-xs',
  private:
    'bg-highlight/15 text-foreground cursor-pointer border-b border-dashed border-highlight/60 hover:bg-highlight/25 transition-all relative group rounded-xs',
};

export const SPOTLIGHT_PULSE_CLASSES =
  'ring-2 ring-primary/80 bg-highlight/40 shadow-lg shadow-highlight/30 transition-all duration-500';

// ---------------------------------------------------------------------
// 🧩 Component Props Interfaces
// ---------------------------------------------------------------------

export interface TextSelectionPopoverProps {
  containerId?: string;
  minSelectionLength?: number;
  isLocked?: boolean;
  onSelectionChange?: (selection: SelectionState | null) => void;
  children: (selection: SelectionState) => React.ReactNode;
  className?: string;
}

export interface TextHighlighterProps {
  articleId: string;
  creatorName: string;
  allowPublicAnnotations: boolean;
  isAuthenticated: boolean;
  initialHighlights: HighlightItem[] | AnnotationItem[];
  publicHighlights?: AnnotationItem[];
  currentUserId?: string | null;
  currentUserProfile?: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
  } | null;
  articleAuthorId?: string | null;
  mainAppUrl: string;
  containerId?: string;
  /** Document canonique de l'article : rendu par blocs + marques par
   *  offsets (tranche 1-b). Absent → moteur hérité (recherche de texte). */
  canonicalDocument?: import('./canonical-document').CanonicalDocument;
  /** Classes du conteneur du corps d'article (mode document uniquement). */
  contentClassName?: string;
  callbacks?: AnnotationActionCallbacks;
  onRequireAuth?: () => void;
}

export interface AnnotationSideDrawerProps {
  articleId?: string;
  annotation: AnnotationItem | null;
  allArticleAnnotations?: AnnotationItem[];
  creatorName?: string;
  allowPublicAnnotations?: boolean;
  isAuthenticated?: boolean;
  currentUserId?: string | null;
  articleAuthorId?: string | null;
  mainAppUrl?: string;
  isOpen?: boolean;
  onClose: () => void;
  callbacks?: AnnotationActionCallbacks;
  onRequireAuth?: () => void;
  onUpdateAnnotation?: (updated: AnnotationItem) => void;
  onDeleteAnnotation?: (annotationId: string) => void;
}
