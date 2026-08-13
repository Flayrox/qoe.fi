// =====================================================================
// 🖥️ New Article Page — apps/dashboard/src/app/(creator)/dashboard/articles/new/page.tsx
// =====================================================================
// 📖 Page de création d'un nouvel article avec l'éditeur riche.
// =====================================================================

import { getCategoriesAction } from '@qoe/api-client/actions/articles';

import { NewArticleClient } from './new-article-client';

export default async function NewArticlePage() {
  const categoriesRes = await getCategoriesAction();
  const categoriesList = categoriesRes.ok ? categoriesRes.data : [];

  return <NewArticleClient categories={categoriesList.map((c) => ({ id: c.id, name: c.name }))} />;
}
