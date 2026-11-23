// =====================================================================
// 💬 /community — modération des commentaires
// =====================================================================
// Le backend Go expose déjà la liste et la suppression ; il manquait un
// écran créateur. On part de la liste d'articles (qui porte commentsCount)
// et on charge la discussion à la demande : aucune nouvelle route Go.
// =====================================================================

import { redirect } from 'next/navigation';
import { getLanguage } from '@qoe/i18n/server';
import type { Metadata } from 'next';
import { requireUser } from '@qoe/auth/current-user';
import { getArticlesAction } from '@qoe/sdk/actions/articles';
import { StudioHeader, StudioPage } from '@/components/studio-page';

import { CommunityClient } from './community-client';
import { t } from '@lingui/core/macro';

// Métadonnées rendues hors du provider i18n : la langue de la requête est lue
// sans activer le singleton (cf. packages/i18n/src/server.ts).
export async function generateMetadata(): Promise<Metadata> {
  const isFr = (await getLanguage()) === 'fr';
  return {
    title: isFr ? t`Communauté | qoefi Studio` : 'Community | qoefi Studio',
    description: isFr
      ? t`Modérer les commentaires de vos articles.`
      : t`Moderate the comments on your articles.`,
  };
}

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
        title={t`Communauté`}
        description={t`Les discussions sous vos articles. La suppression est immédiate pour les commentaires de votre publication.`}
      />
      <CommunityClient articles={articles} />
    </StudioPage>
  );
}
