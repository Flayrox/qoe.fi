// =====================================================================
// 💬 /community — modération des commentaires
// =====================================================================
// Le backend Go expose déjà la liste et la suppression ; il manquait un
// écran créateur. On part de la liste d'articles (qui porte commentsCount)
// et on charge la discussion à la demande : aucune nouvelle route Go.
// =====================================================================

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { getArticlesAction } from '@qoe/sdk/actions/articles';
import { StudioHeader, StudioPage } from '@/components/studio-page';

import { CommunityClient } from './community-client';

export const metadata = {
  title: 'Communauté | qoefi Studio',
  description: 'Modérer les commentaires de vos articles.',
};

export default async function CommunityPage() {
  const user = await requireUser();
  if (!user) {
    redirect('/login');
  }

  const res = await getArticlesAction();
  const articles = (res.ok ? res.data : []).map((article) => ({
    id: article.id,
    title: article.title,
    commentsCount: article.commentsCount ?? 0,
  }));

  return (
    <StudioPage>
      <StudioHeader
        title="Communauté"
        description="Les discussions sous vos articles. La suppression est immédiate pour les commentaires de votre publication."
      />
      <CommunityClient articles={articles} />
    </StudioPage>
  );
}
