// =====================================================================
// 📣 /admin/campaigns — les campagnes staff, du brouillon à l'envoi
// =====================================================================
// Un envoi de masse sans surface, c'est un envoi sans contrôle. Cet écran rend
// le cycle de vie VISIBLE : brouillon → soumis → approuvé → lancé (ou suspendu,
// annulé), avec les compteurs d'envoi et d'échec de chaque campagne.
//
// Rien n'est sauté : approuver est une transition distincte de rédiger, et
// lancer une campagne non approuvée est refusé par le serveur — l'écran ne
// propose donc que les transitions légitimes pour le statut courant.
// =====================================================================

import React from 'react';
import { Megaphone } from 'lucide-react';
import Link from 'next/link';
import { getAdminIdentity, hasCapability, requireCapability } from '@/lib/admin-identity';
import { getStaffCampaigns } from '@/lib/admin-infra-data';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { CampaignManager } from './components/campaign-manager';

export const dynamic = 'force-dynamic';

export default async function AdminCampaignsPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.campaigns.read');
  const canWrite = hasCapability(identity, 'admin.campaigns.write');

  const campaigns = await getStaffCampaigns();
  const sending = campaigns.filter((campaign) => campaign.status === 'SENDING').length;

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <QueuePageHeader
        icon={<Megaphone className="w-4 h-4" />}
        title="Campagnes staff"
        badge={sending > 0 ? `${sending} en envoi` : null}
        description={
          <>
            Catégories fermées (notification légale, message de l’équipe, nouveauté produit),
            audience chiffrée et cycle de vie tracé. Chaque transition est journalisée.{' '}
            <Link href="/admin/notifications" className="underline">
              Voir les livraisons
            </Link>
            .
          </>
        }
      />

      <CampaignManager initialCampaigns={campaigns} canWrite={canWrite} />
    </div>
  );
}
