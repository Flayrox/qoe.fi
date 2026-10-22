import type { ArticleEditorPayload } from '@qoe/sdk/actions/articles';
import { ContentVisibility } from '@qoe/config';
import { buildPublicExcerpt } from '@qoe/utils';
import type { ArticleAttributionDraft } from '../components/ArticleAttributionEditor';
import { parseDateTimeLocalValue, toDateTimeLocalValue } from './datetime';

export interface ArticleCategoryOption {
  id: string;
  name: string;
  parentId?: string | null;
  slug?: string;
}

export interface ArticleSettingsDraft {
  id: string;
  title: string;
  content: string;
  imageUrl: string | null;
  slug: string;
  published: boolean;
  status: string;
  scheduledAt: string | null;
  scheduleDraft: string;
  isPremium: boolean;
  categoryId: string | null;
  seoTitle: string;
  seoDescription: string;
  allowPublicAnnotations: boolean;
  allowComments: boolean;
  allowDownload: boolean;
  attributions: ArticleAttributionDraft[];
  subdomain?: string;
}

export interface ArticleSettingsSavePayload {
  id: string;
  title: string;
  content: string;
  imageUrl: string | null;
  slug: string;
  published: boolean;
  status: string;
  scheduledAt: string | null;
  isPremium: boolean;
  categoryId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  allowPublicAnnotations: boolean;
  allowComments: boolean;
  allowDownload: boolean;
  attributions: ArticleAttributionDraft[];
}

type AttributionSource = Pick<ArticleEditorPayload, 'author' | 'coAuthors' | 'attributions'>;

export function buildAttributionDrafts(article: AttributionSource): ArticleAttributionDraft[] {
  const existing = (article.attributions ?? []).map((entry) => ({
    userId: entry.user.id,
    name: entry.user.name,
    username: entry.user.username,
    logoUrl: entry.user.logoUrl,
    isCertified: entry.user.isCertified,
    role: entry.role,
    order: entry.order,
    isVisible: entry.isVisible,
    consentStatus: entry.consentStatus,
  }));
  if (existing.length > 0) return existing;

  const base: ArticleAttributionDraft = {
    userId: article.author.id,
    name: article.author.name,
    username: article.author.username,
    logoUrl: article.author.logoUrl,
    isCertified: article.author.isCertified,
    role: 'PRIMARY_AUTHOR',
    order: 0,
    isVisible: true,
  };

  const coAuthors = (article.coAuthors ?? [])
    .filter((coAuthor) => coAuthor.id !== article.author.id)
    .map((coAuthor, index) => ({
      userId: coAuthor.id,
      name: coAuthor.name,
      username: coAuthor.username,
      logoUrl: coAuthor.logoUrl,
      isCertified: coAuthor.isCertified,
      role: 'CO_AUTHOR',
      order: 1 + index,
      isVisible: true,
      consentStatus: 'ACCEPTED',
    }));

  return [base, ...coAuthors];
}

export function buildArticleSettingsDraft(article: ArticleEditorPayload): ArticleSettingsDraft {
  return {
    id: article.id,
    title: article.title,
    content: article.content,
    imageUrl: article.imageUrl ?? null,
    slug: article.slug,
    published: article.published,
    status: article.status || (article.published ? 'PUBLISHED' : 'DRAFT'),
    scheduledAt: article.scheduledAt ?? null,
    scheduleDraft: toDateTimeLocalValue(article.scheduledAt),
    isPremium: article.isPremium,
    categoryId: article.categoryId,
    seoTitle: article.seoTitle ?? '',
    seoDescription: article.seoDescription ?? '',
    allowPublicAnnotations: article.allowPublicAnnotations ?? true,
    allowComments: article.allowComments ?? true,
    allowDownload: article.allowDownload ?? true,
    attributions: buildAttributionDrafts(article),
    subdomain: article.publication?.subdomain ?? undefined,
  };
}

export function buildArticleSettingsSavePayload(
  draft: ArticleSettingsDraft
): ArticleSettingsSavePayload {
  return {
    id: draft.id,
    title: draft.title,
    content: draft.content,
    imageUrl: draft.imageUrl,
    slug: draft.slug,
    published: draft.published,
    status: draft.status,
    scheduledAt: draft.scheduledAt,
    isPremium: draft.isPremium,
    categoryId: draft.categoryId,
    seoTitle: draft.seoTitle.trim() || null,
    seoDescription: draft.seoDescription.trim() || null,
    allowPublicAnnotations: draft.allowPublicAnnotations,
    allowComments: draft.allowComments,
    allowDownload: draft.allowDownload,
    attributions: draft.attributions,
  };
}

export function parseFutureScheduleDraft(value: string): {
  date: Date | null;
  reason: 'missing' | 'past' | null;
} {
  const date = parseDateTimeLocalValue(value);
  if (!date) return { date: null, reason: 'missing' };
  if (date.getTime() <= Date.now()) return { date: null, reason: 'past' };
  return { date, reason: null };
}

export function resolveArticleCategoryPath(
  categories: ArticleCategoryOption[],
  categoryId: string | null
): string {
  const selected = categories.find((category) => category.id === categoryId);
  if (!selected?.slug) return '/uncategorized';
  const parent = selected.parentId
    ? categories.find((category) => category.id === selected.parentId)
    : undefined;
  return `/${parent?.slug ? `${parent.slug}/` : ''}${selected.slug}`;
}

export function computeAutoSeoDescription(content: string, isPremium: boolean): string {
  return (
    buildPublicExcerpt(
      content || '',
      isPremium ? ContentVisibility.PAID_SUBSCRIBERS : ContentVisibility.PUBLIC,
      null,
      160
    ) ?? ''
  );
}

export function articleSettingsFingerprint(draft: ArticleSettingsDraft): string {
  return JSON.stringify({
    id: draft.id,
    title: draft.title,
    content: draft.content,
    imageUrl: draft.imageUrl,
    slug: draft.slug,
    published: draft.published,
    status: draft.status,
    scheduledAt: draft.scheduledAt,
    isPremium: draft.isPremium,
    categoryId: draft.categoryId,
    seoTitle: draft.seoTitle,
    seoDescription: draft.seoDescription,
    allowPublicAnnotations: draft.allowPublicAnnotations,
    allowComments: draft.allowComments,
    allowDownload: draft.allowDownload,
    attributions: draft.attributions,
    subdomain: draft.subdomain,
  });
}
