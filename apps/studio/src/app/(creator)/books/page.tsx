// =====================================================================
// 📚 /books — composer un livre à partir de ses articles
// =====================================================================
// Premier lot : compiler un EPUB propre (sommaire, chapitres, HTML
// d'origine). La publication en bibliothèque et la vente demandent une
// migration et viendront après.
// =====================================================================

import { redirect } from 'next/navigation';
import { getLanguage } from '@qoe/i18n/server';
import type { Metadata } from 'next';
import { requireUser } from '@qoe/auth/current-user';
import { getArticlesAction } from '@qoe/sdk/actions/articles';
import { StudioHeader, StudioPage } from '@/components/studio-page';

import { BooksClient } from './books-client';
import { t } from '@lingui/core/macro';

// Métadonnées rendues hors du provider i18n : la langue de la requête est lue
// sans activer le singleton (cf. packages/i18n/src/server.ts).
export async function generateMetadata(): Promise<Metadata> {
  const isFr = (await getLanguage()) === 'fr';
  return {
    title: isFr ? 'Livres | qoefi Studio' : 'Books | qoefi Studio',
    description: isFr
      ? t`Composer un livre EPUB à partir de vos articles.`
      : t`Build an EPUB book from your articles.`,
  };
}

export default async function BooksPage() {
  const user = await requireUser();
  if (!user) {
    redirect('/login');
  }

  const res = await getArticlesAction();
  const articles = (res.ok ? res.data : []).map((article) => ({
    id: article.id,
    title: article.title,
    createdAt: article.createdAt ?? null,
  }));

  return (
    <StudioPage>
      <StudioHeader
        title={t`Livres`}
        description={t`Rassemblez vos écrits en un EPUB lisible partout, sans passer par un autre outil.`}
      />
      <BooksClient articles={articles} />
    </StudioPage>
  );
}
