// =====================================================================
// 🏷️ @qoe/ui/annotations — Type Definitions & Callback Contracts
// =====================================================================

import React from 'react';
import type { AnnotationCitation } from './citation';

export type { AnnotationCitation, AnnotationCitationReader } from './citation';

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
  /**
   * Nature du compte. Un compte média garde une photo CARRÉE à petits
   * coins arrondis, jamais un cercle : c'est la règle de SafeAvatar, et le
   * tiroir la laissait perdre en dessinant l'avatar à la main.
   */
  type?: 'PERSONAL' | 'MEDIA' | string | null;
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
    type?: 'PERSONAL' | 'MEDIA' | string | null;
  };
}

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

/**
 * Publication d'une annotation comme citation sur Qoefi.
 *
 * `citation` porte le texte annoté, sa note et son auteur — pas seulement
 * un commentaire libre. Le serveur revérifie la nature et la visibilité de
 * l'annotation : ce que le tiroir peut proposer, lui seul peut publier.
 */
export interface CiteAnnotationParams {
  articleId?: string;
  citation: AnnotationCitation;
  /** Mots ajoutés par la personne qui cite (facultatif). */
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
  onCiteAnnotation?: (
    params: CiteAnnotationParams
  ) => Promise<AnnotationActionResult<{ url?: string | null }>>;
  onLoginRedirect?: () => void;
}

// ---------------------------------------------------------------------
// 🎨 Highlight Visual Styling Constants & Types
// ---------------------------------------------------------------------

// La peau vit dans `mark-skin.ts` (une seule source, testée) ; on la
// ré-exporte ici pour ne pas casser les imports historiques du module.
export {
  MARK_STYLE_CLASSES,
  markSkin,
  markSkinFor,
  markKindFor,
  MARK_ACCENT_TOKENS,
  MARK_KINDS,
  type MarkKind,
  type MarkIdentity,
} from './mark-skin';

export const SPOTLIGHT_PULSE_CLASSES =
  'ring-2 ring-primary/80 bg-highlight/40 shadow-lg shadow-highlight/30 transition-all duration-500';

// ---------------------------------------------------------------------
// 🔦 Spotlight — passage mis en avant (deep-link citation → article)
// ---------------------------------------------------------------------

/**
 * Passage d'un article à mettre en avant à l'ouverture (tranche 6-b) :
 * offsets en code points dans le texte canonique + empreinte du contenu.
 * Le rendu ne peint la marque que si `sha` correspond au document chargé
 * (le passage a été ré-édité → pas de faux surlignage).
 */
export interface SpotlightRange {
  start: number;
  end: number;
  sha: string;
}

// ---------------------------------------------------------------------
// 🧩 Component Props Interfaces
// ---------------------------------------------------------------------

export interface TextSelectionPopoverProps {
  containerId?: string;
  minSelectionLength?: number;
  /** Gèle les nouvelles sélections (formulaire de note ouvert). */
  isLocked?: boolean;
  /** Referme la barre au profit d'une autre surface (tiroir ouvert). */
  isDismissed?: boolean;
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
    type?: 'PERSONAL' | 'MEDIA' | string | null;
  } | null;
  articleAuthorId?: string | null;
  mainAppUrl: string;
  containerId?: string;
  /** Document canonique de l'article : rendu par blocs + marques par
   *  offsets (tranche 1-b). Absent → moteur hérité (recherche de texte). */
  canonicalDocument?: import('./canonical-document').CanonicalDocument;
  /** Passage à mettre en avant à l'ouverture (deep-link citation → article,
   *  tranche 6-b) : marque spotlight + scroll + pulse, si sha conforme. */
  spotlight?: SpotlightRange | null;
  /** Classes du conteneur du corps d'article (mode document uniquement). */
  contentClassName?: string;
  callbacks?: AnnotationActionCallbacks;
  onRequireAuth?: () => void;
  filterMode?: AnnotationFilterMode;
  onFilterModeChange?: (mode: AnnotationFilterMode) => void;
  hideFilterBar?: boolean;
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
  /** Conteneur du corps d'article : le spotlight ne cherche la marque que
   *  dedans (une même annotation peut être peinte dans un autre article). */
  containerId?: string;
  isOpen?: boolean;
  onClose: () => void;
  callbacks?: AnnotationActionCallbacks;
  onRequireAuth?: () => void;
  onUpdateAnnotation?: (updated: AnnotationItem) => void;
  onDeleteAnnotation?: (annotationId: string) => void;
}
