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

import { ArticlesClient } from './articles-client';

export default async function ArticlesPage() {
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
        canReview={capabilities?.canReview ?? false}
      />
    </div>
  );
}
