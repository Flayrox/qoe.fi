export const ARTICLE_ATTRIBUTION_ROLES = [
  'PRIMARY_AUTHOR',
  'CO_AUTHOR',
  'EDITOR',
  'CONTRIBUTOR',
  'TRANSLATOR',
  'PHOTOGRAPHER',
] as const;

export type ArticleAttributionRole = (typeof ARTICLE_ATTRIBUTION_ROLES)[number];

export const ARTICLE_ATTRIBUTION_CONSENT_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'WITHDRAWN',
  'REVOKED',
] as const;

export type ArticleAttributionConsentStatus = (typeof ARTICLE_ATTRIBUTION_CONSENT_STATUSES)[number];

export interface ArticleAttributionInput {
  userId: string;
  role?: string;
  order?: number;
  isVisible?: boolean;
  consentStatus?: ArticleAttributionConsentStatus | string;
}

export interface NormalizedArticleAttribution {
  userId: string;
  role: ArticleAttributionRole | string;
  order: number;
  isVisible: boolean;
  consentStatus: ArticleAttributionConsentStatus | string;
}

/**
 * Makes an article byline deterministic while preserving explicit editorial choices.
 * The primary author is always first and visible; duplicate users collapse to one entry.
 */
export function normalizeArticleAttributions(
  input: ArticleAttributionInput[] | undefined,
  primaryAuthorId: string
): NormalizedArticleAttribution[] {
  const entries = input?.length
    ? input
    : [{ userId: primaryAuthorId, role: 'PRIMARY_AUTHOR', order: 0, isVisible: true }];

  return Array.from(
    new Map(
      entries.map((entry, index) => [
        entry.userId,
        {
          userId: entry.userId,
          role: entry.userId === primaryAuthorId ? 'PRIMARY_AUTHOR' : entry.role || 'CO_AUTHOR',
          order:
            entry.userId === primaryAuthorId ? 0 : (entry.order ?? Number.MAX_SAFE_INTEGER + index),
          isVisible: entry.userId === primaryAuthorId || entry.isVisible !== false,
          consentStatus:
            entry.userId === primaryAuthorId ? 'ACCEPTED' : entry.consentStatus || 'PENDING',
        },
      ])
    ).values()
  ).sort((left, right) => left.order - right.order);
}

export function visibleArticleAttributions(
  attributions: NormalizedArticleAttribution[]
): NormalizedArticleAttribution[] {
  return attributions.filter(
    (attribution) => attribution.isVisible && attribution.consentStatus === 'ACCEPTED'
  );
}
