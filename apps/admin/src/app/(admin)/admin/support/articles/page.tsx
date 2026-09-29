// =====================================================================
// 📝 Articles d'aide — centre d'aide sans redéploiement (tranche 6)
// =====================================================================
// Créer (brouillon), corriger, ordonner, publier. Même slug qu'une entrée
// statique de la vitrine = la version console la remplace (le statique
// reste le repli si l'API est injoignable). Pas de suppression :
// dépublier au lieu d'effacer.
///console reliée depuis la file support (lien « Articles d'aide »).
// =====================================================================

import React from 'react';
import { BookOpen } from 'lucide-react';
import { getAdminSupportArticles } from '@/lib/admin-data';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { ArticlesManager } from './components/articles-manager';

export default async function AdminSupportArticlesPage() {
  const data = await getAdminSupportArticles();
  const draftCount = data.items.filter((a) => !a.published).length;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <QueuePageHeader
        icon={<BookOpen className="w-4 h-4" />}
        title="Articles d'aide"
        badge={draftCount > 0 ? `${draftCount} brouillon${draftCount > 1 ? 's' : ''}` : null}
        description={
          <>
            Le contenu du centre d&apos;aide, sans redéploiement. Un article publié apparaît sur la
            vitrine ; un slug identique à une entrée par défaut la remplace.
          </>
        }
      />

      <ArticlesManager initialItems={data.items} />
    </div>
  );
}
