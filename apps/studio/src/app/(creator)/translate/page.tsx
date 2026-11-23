// =====================================================================
// 🌍 /translate — traduire un article (aperçu éditable)
// =====================================================================
// Premier lot : on génère une traduction relue par le créateur. Publier des
// versions localisées (stockage + hreflang) demande une migration — lot 2.
// =====================================================================

import { redirect } from 'next/navigation';
import { getLanguage } from '@qoe/i18n/server';
import type { Metadata } from 'next';
import { requireUser } from '@qoe/auth/current-user';
import { getArticlesAction } from '@qoe/sdk/actions/articles';
import { StudioHeader, StudioPage } from '@/components/studio-page';

import { TranslateClient } from './translate-client';
import { t } from '@lingui/core/macro';

// Métadonnées rendues hors du provider i18n : la langue de la requête est lue
// sans activer le singleton (cf. packages/i18n/src/server.ts).
export async function generateMetadata(): Promise<Metadata> {
  const isFr = (await getLanguage()) === 'fr';
  return {
    title: isFr ? 'Traduction | qoefi Studio' : 'Translation | qoefi Studio',
    description: isFr
      ? t`Traduire un article avant publication.`
      : t`Translate an article before publishing.`,
  };
}

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
        title={t`Traduction`}
        description={t`Obtenir une traduction fidèle d’un article, à relire avant toute publication.`}
      />
      <TranslateClient articles={articles} />
    </StudioPage>
  );
}
