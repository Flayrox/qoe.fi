// =====================================================================
// 🖥️ New Article Page — apps/studio/src/app/(creator)/articles/new/page.tsx
// =====================================================================

import { getCategoriesAction, getEditorCapabilitiesAction } from '@qoe/sdk/actions/articles';
import { getActiveWorkspaceContext } from '@qoe/sdk/actions/workspace';

import { NewArticleClient } from './new-article-client';

export default async function NewArticlePage() {
  const [categoriesRes, capsRes, workspace] = await Promise.all([
    getCategoriesAction(),
    getEditorCapabilitiesAction(),
    getActiveWorkspaceContext(),
  ]);
  const categoriesList = categoriesRes.ok ? categoriesRes.data : [];
  const capabilities = capsRes.ok ? capsRes.data : undefined;

  return (
    <NewArticleClient
      categories={categoriesList.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId,
      }))}
      capabilities={capabilities}
      target={{
        type: workspace.type,
        name: workspace.name,
        fallbackFromMediaId: workspace.fallbackFromMediaId,
      }}
    />
  );
}
