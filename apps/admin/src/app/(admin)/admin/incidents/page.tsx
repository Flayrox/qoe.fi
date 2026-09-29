// =====================================================================
// 🛡️ Registre d'incidents — attaques confirmées, dossier tenu par le staff
// =====================================================================
// Marge brute : portée, mesures temporaires, suivi. Le statut avance sans
// se réécrire (open → contained → resolved, reopened sans effacer) —
// matière du bilan et de la communication publique (fiche 06 §10).
// =====================================================================

import React from 'react';
import { Flame } from 'lucide-react';
import { getAdminAbuseIncidents, getAdminAbuseMetrics } from '@/lib/admin-data';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { IncidentsQueue } from './components/incidents-queue';

export default async function AdminIncidentsPage() {
  const [incidents, metrics] = await Promise.all([
    getAdminAbuseIncidents(),
    getAdminAbuseMetrics(),
  ]);
  const activeCount = incidents.items.filter(
    (i) => i.status === 'open' || i.status === 'reopened' || i.status === 'contained'
  ).length;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <QueuePageHeader
        icon={<Flame className="w-4 h-4" />}
        title="Incidents"
        badge={activeCount > 0 ? `${activeCount} actif${activeCount > 1 ? 's' : ''}` : null}
        description={
          <>
            Les attaques confirmées (fermes de comptes, raids, vagues) : portée, mesures
            temporaires, suivi. Qualifier une attaque est un jugement humain — jamais un verdict
            automate.
          </>
        }
      />

      <IncidentsQueue initialItems={incidents.items} metrics={metrics} />
    </div>
  );
}
