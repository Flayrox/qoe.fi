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
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#EE4B2B] mb-2">
          <Flame className="w-4 h-4" />
          Administration Console
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Incidents</h1>
          {activeCount > 0 && (
            <span className="bg-highlight/15 text-highlight border border-highlight/40 px-2.5 py-1 rounded-full text-xs font-bold">
              {activeCount} actif{activeCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-2 text-sm max-w-2xl leading-relaxed">
          Les attaques confirmées (fermes de comptes, raids, vagues) : portée, mesures temporaires,
          suivi. Qualifier une attaque est un jugement humain — jamais un verdict automate.
        </p>
      </div>

      <IncidentsQueue initialItems={incidents.items} metrics={metrics} />
    </div>
  );
}
