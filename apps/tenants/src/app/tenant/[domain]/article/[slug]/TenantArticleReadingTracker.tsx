'use client';

import { useArticleReadingTracker, type ReadingSource } from '@qoe/analytics';

interface TenantArticleReadingTrackerProps {
  articleId: string;
  slug: string;
  readingTimeMinutes?: number;
  initialSource?: ReadingSource;
}

export function TenantArticleReadingTracker({
  articleId,
  slug,
  readingTimeMinutes,
  initialSource = 'subdomain',
}: TenantArticleReadingTrackerProps) {
  useArticleReadingTracker({
    articleId,
    slug,
    readingTimeMinutes,
    initialSource,
  });

  return null;
}
