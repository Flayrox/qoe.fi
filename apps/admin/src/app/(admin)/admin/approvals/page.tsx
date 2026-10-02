// =====================================================================
// 🤝 /admin/approvals — la file des doubles validations (Phase 8)
// =====================================================================
// Un acte N3 n'est exécuté que si une SECONDE personne autorisée l'a approuvé
// pour CETTE cible. Cet écran est l'endroit où cette seconde personne dit oui
// (ou non), avec un motif écrit.
//
// Ce qu'on y perd volontairement : aucun bouton « tout approuver ». Chaque
// décision est individuelle, nominative et tracée — une validation à deux qui
// se donne en bloc ne vaut pas mieux qu'une signature unique.
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { Handshake } from 'lucide-react';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { getApprovals, isApprovalOpen } from '@/lib/admin-approval-data';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { ApprovalsQueue } from './components/approvals-queue';

export const dynamic = 'force-dynamic';

export default async function AdminApprovalsPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.legal.read');

  const items = await getApprovals();
  const open = items.filter((item) => isApprovalOpen(item)).length;

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <QueuePageHeader
        icon={<Handshake className="w-4 h-4" />}
        title="Doubles validations"
        badge={open > 0 ? `${open} en attente` : 'à jour'}
        description={
          <>
            Les actes irréversibles — publier un texte juridique, par exemple — demandent l’accord
            d’une <strong>seconde personne autorisée</strong>, lié à une cible précise et valable 72
            h. La personne qui demande ne peut jamais valider elle-même. Les écritures juridiques se
            font dans{' '}
            <Link href="/admin/legal" className="underline">
              Contenu juridique
            </Link>
            .
          </>
        }
      />

      <ApprovalsQueue initialItems={items} currentUserId={identity?.userId ?? ''} />
    </div>
  );
}
