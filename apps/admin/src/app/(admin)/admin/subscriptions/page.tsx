// =====================================================================
// 💎 Abonnements manuels — octrois staff pré-Stripe (intérim assumé)
// =====================================================================
// Pro offert à un média (sans qu'il soit « abonné »), Plus offert à un
// lecteur, accès programmé (début futur), fin datée. Source unique des
// droits (pas de colonne miroir) ; révoquer = finir maintenant (jamais
// de suppression). Stripe, plus tard : le webhook appellera les mêmes
// fonctions — ni la console ni les gardes ne changeront.
// =====================================================================

import React from 'react';
import { Crown } from 'lucide-react';
import { getAdminSubscriptionGrants } from '@/lib/admin-data';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { GrantsManager } from './components/grants-manager';
import { SubscribersSignedExportPanel } from './components/SubscribersSignedExportPanel';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { UnavailableNotice } from '@/components/shell/UnavailableNotice';

export default async function AdminSubscriptionsPage() {
  requireCapability(await getAdminIdentity(), 'admin.subscriptions.read');
  const grants = await getAdminSubscriptionGrants();
  // Une lecture échouée n'est pas « aucun octroi » : l'écran le dit au lieu
  // d'affirmer qu'aucun droit n'a jamais été accordé.
  const items = grants.ok ? grants.data.items : [];
  const activeCount = items.filter((g) => g.effective).length;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <QueuePageHeader
        icon={<Crown className="w-4 h-4" />}
        title="Abonnements"
        badge={activeCount > 0 ? `${activeCount} actif${activeCount > 1 ? 's' : ''}` : null}
        description={
          <>
            Octroyer un palier sans abonnement (offert, presse, test), programmé ou daté. Seuls les
            droits effectifs ouvrent les fonctionnalités — l&apos;historique reste dans tous les
            cas.
          </>
        }
      />

      {grants.ok ? null : <UnavailableNotice what="Les octrois d'abonnement" />}

      <GrantsManager initialItems={items} />

      <SubscribersSignedExportPanel />
    </div>
  );
}
