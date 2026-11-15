// =====================================================================
// 📚 /books — composer un livre à partir de ses articles
// =====================================================================
// Premier lot : compiler un EPUB propre (sommaire, chapitres, HTML
// d'origine). La publication en bibliothèque et la vente demandent une
// migration et viendront après.
// =====================================================================

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { getArticlesAction } from '@qoe/sdk/actions/articles';
import { StudioHeader, StudioPage } from '@/components/studio-page';

import { BooksClient } from './books-client';

export const metadata = {
  title: 'Livres | qoefi Studio',
  description: 'Composer un livre EPUB à partir de vos articles.',
};

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
        title="Livres"
        description="Rassemblez vos écrits en un EPUB lisible partout, sans passer par un autre outil."
      />
      <BooksClient articles={articles} />
    </StudioPage>
  );
}
