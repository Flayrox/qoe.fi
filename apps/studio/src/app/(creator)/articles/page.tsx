// =====================================================================
// 🖥️ Articles Index Page — apps/studio/src/app/(creator)/dashboard/articles/page.tsx
// =====================================================================
// 📖 Page principale de gestion des articles et catégories.
//    Server-side data fetching et passage au client interactif.
// =====================================================================

import {
  getArticlesAction,
  getCategoriesAction,
  getEditorCapabilitiesAction,
} from '@qoe/sdk/actions/articles';
import { createClient } from '@qoe/supabase/server';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

import { ArticlesClient } from './articles-client';

interface ArticlesPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function ArticlesPage({ searchParams }: ArticlesPageProps) {
  const { tab } = await searchParams;
  const initialTab = tab === 'categories' ? 'categories' : 'articles';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let pinnedArticleId: string | null = null;
  let aboutArticleId: string | null = null;
  if (user) {
    try {
      const workspace = await getActiveWorkspace(user.id);
      const pub = await goFetch<{ siteOptions?: Record<string, unknown> }>(
        `/v1/settings/publication?publicationId=${encodeURIComponent(workspace.publicationId)}`
      );
      pinnedArticleId = (pub.siteOptions?.pinnedArticleId as string) || null;
      aboutArticleId = (pub.siteOptions?.aboutArticleId as string) || null;
    } catch {
      // Ignorer si indisponible
    }
  }

  // Récupération initiale des données sur le serveur (Server Action ou Prisma direct)
  const [articlesRes, categoriesRes, capsRes] = await Promise.all([
    getArticlesAction(),
    getCategoriesAction(),
    getEditorCapabilitiesAction(),
  ]);

  const articles = articlesRes.ok ? articlesRes.data : [];
  const categories = categoriesRes.ok ? categoriesRes.data : [];
  const capabilities = capsRes.ok ? capsRes.data : undefined;

  return (
    <div className="py-4">
      <ArticlesClient
        initialArticles={articles}
        initialCategories={categories}
        initialPinnedArticleId={pinnedArticleId}
        initialAboutArticleId={aboutArticleId}
        initialTab={initialTab}
        canReview={capabilities?.canReview ?? false}
      />
    </div>
  );
}
