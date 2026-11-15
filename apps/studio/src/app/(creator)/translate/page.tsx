// =====================================================================
// 🌍 /translate — traduire un article (aperçu éditable)
// =====================================================================
// Premier lot : on génère une traduction relue par le créateur. Publier des
// versions localisées (stockage + hreflang) demande une migration — lot 2.
// =====================================================================

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { getArticlesAction } from '@qoe/sdk/actions/articles';
import { StudioHeader, StudioPage } from '@/components/studio-page';

import { TranslateClient } from './translate-client';

export const metadata = {
  title: 'Traduction | qoefi Studio',
  description: 'Traduire un article avant publication.',
};

export default async function TranslatePage() {
  const user = await requireUser();
  if (!user) {
    redirect('/login');
  }

  const res = await getArticlesAction();
  const articles = (res.ok ? res.data : []).slice(0, 40).map((article) => ({
    id: article.id,
    title: article.title,
    content: article.content ?? '',
  }));

  return (
    <StudioPage>
      <StudioHeader
        title="Traduction"
        description="Obtenir une traduction fidèle d’un article, à relire avant toute publication."
      />
      <TranslateClient articles={articles} />
    </StudioPage>
  );
}
