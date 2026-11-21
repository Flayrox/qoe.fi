import type { ImageEditorPreset } from '@qoe/ui/ui/ImageEditorDialog';
import type { QuotedArticleData } from '@qoe/ui/social';
import type { ThoughtData } from '@/components/social/ThoughtCard';
import type { FeedArticleDTO } from '@/lib/feed-types';

export interface ComposerImage {
  id: string;
  url: string;
  file?: File;
  isUploading?: boolean;
  altText?: string;
}

export type DbUser = {
  id?: string;
  name?: string | null;
  email?: string;
  walletBalanceCents?: number;
  onboardingText?: string | null;
  role?: string;
  logoUrl?: string | null;
  username?: string | null;
  isCertified?: boolean;
  /** Nature du compte : un média garde un carré à coins arrondis. */
  type?: 'PERSONAL' | 'MEDIA' | string | null;
};

export interface ComposedPostAuthor {
  id?: string;
  name?: string | null;
  username?: string | null;
  subdomain?: string | null;
  isCertified?: boolean;
}

export interface ComposedPost extends FeedArticleDTO {
  repost?: {
    id?: string;
    content?: string | null;
    createdAt?: Date | string;
    author?: ComposedPostAuthor | null;
  } | null;
  parent?: {
    id?: string;
    content?: string | null;
    createdAt?: Date | string;
    author?: ComposedPostAuthor | null;
  } | null;
  quotedExcerpt?: string | null;
  articleQuote?: unknown;
}

export interface ThoughtDraft {
  id: string;
  content?: string | null;
  imageUrl?: string | null;
  visibility?: string;
  scheduledAt?: Date | string | null;
  triggerWarning?: string | null;
  updatedAt?: Date | string;
}

export interface CreatedPostAuthor {
  id?: string;
  name?: string | null;
  username?: string | null;
  subdomain?: string | null;
  customDomain?: string | null;
  logoUrl?: string | null;
  heroText?: string | null;
  isCertified?: boolean;
}

export interface CreatedPostRecord {
  id: string;
  content: string;
  imageUrl?: string | null;
  createdAt?: Date | string;
  author?: CreatedPostAuthor | null;
  repost?: CreatedPostRecord | null;
  parent?: CreatedPostRecord | null;
  tags?: string[] | null;
  quotedExcerpt?: string | null;
  quotedArticle?: QuotedArticleData | null;
}

export interface MentionSuggestion {
  id: string;
  name?: string | null;
  _type: 'profile' | 'tag' | 'emoji';
  username?: string | null;
  subdomain?: string | null;
  logoUrl?: string | null;
  isCertified?: boolean;
  value?: string;
  char?: string;
}

export interface ThreadNode {
  id: string;
  text: string;
  images: ComposerImage[];
  isTriggerWarning: boolean;
  triggerWarning: string;
  showPollEditor: boolean;
  pollOptions: string[];
  pollDurationHours: number;
}

export interface PendingImageImport {
  files: File[];
  index: number;
  results: File[];
  replaceId?: string;
  src: string;
}

export interface ThoughtComposerProps {
  dbUser: DbUser | null;
  tagsList: string[];
  quotedThought?: ThoughtData | null;
  replyToThought?: ThoughtData | null;
  quotedArticle?: QuotedArticleData | null;
  quotedExcerpt?: string | null;
  parentId?: string | null;
  initialText?: string;
  placeholder?: string;
  onPostCreated?: (post: ComposedPost) => void;
  onLoginRequired?: () => void;
}

export const generateComposerUuid = (): string => {
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const createEmptyThreadNode = (initialText = ''): ThreadNode => ({
  id: generateComposerUuid(),
  text: initialText,
  images: [],
  isTriggerWarning: false,
  triggerWarning: '',
  showPollEditor: false,
  pollOptions: ['', ''],
  pollDurationHours: 24,
});

export const THOUGHT_IMAGE_PRESETS: ImageEditorPreset[] = [
  {
    id: 'thought-4-3',
    label: 'Paysage',
    aspect: 4 / 3,
    width: 1600,
    height: 1200,
    shape: 'rect',
    hint: 'Format de la grille',
  },
  {
    id: 'thought-1-1',
    label: 'Carré',
    aspect: 1,
    width: 1600,
    height: 1600,
    shape: 'rect',
    hint: 'Format compact',
  },
  {
    id: 'thought-16-9',
    label: 'Large',
    aspect: 16 / 9,
    width: 1600,
    height: 900,
    shape: 'rect',
    hint: 'Format panoramique',
  },
];
