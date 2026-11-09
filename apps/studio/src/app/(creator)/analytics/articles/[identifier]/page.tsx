// =====================================================================
// 📄 Article Analytics Page — analytics/articles/[identifier]/page.tsx
// Page dédiée à un article : même série temporelle et sources que le drawer,
// mais dans une URL partageable et avec de la place pour lire les métriques.
// =====================================================================

import { redirect } from 'next/navigation';
import { getArticleAnalyticsDetailById } from '../../actions';
import { ArticleAnalyticsPageClient } from './ArticleAnalyticsPageClient';

interface PageProps {
  params: Promise<{ identifier: string }>;
}

export default async function ArticleAnalyticsPage({ params }: PageProps) {
  const { identifier } = await params;
  const result = await getArticleAnalyticsDetailById(identifier, '30d');

  if (result.error === 'Non autorisé') {
    redirect('/login');
  }

  return (
    <ArticleAnalyticsPageClient
      identifier={identifier}
      initialDetail={result.data ?? null}
      initialError={result.error ?? null}
    />
  );
}
