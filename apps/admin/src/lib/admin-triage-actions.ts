'use server';

// =====================================================================
// 🧭 admin-triage-actions — le triage des six files depuis « Ma file »
// =====================================================================
// Une seule action pour les six files : mêmes champs (assignation, priorité,
// échéance), même vocabulaire. La capacité vérifiée est celle du DOMAINE de la
// file — trier un signalement n'est pas décider d'un recours — et le garde Go
// reste le seul juge. L'audit est écrit côté Go, à chaque écriture.
//
// Les chemins sont littéraux (pas de concaténation calculée) : le test de
// couverture Go vérifie que chaque route classée est réellement appelée par une
// source de la console.
// =====================================================================

import { revalidatePath } from 'next/cache';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getAdminIdentity, hasCapability } from '@/lib/admin-identity';
import type { AdminCapability } from '@/lib/admin-console';
import { authzTrailers } from '@/lib/action-result';

interface QueueRoute {
  capability: AdminCapability;
  screen: string;
}

const QUEUE_ROUTES: Record<string, QueueRoute> = {
  reports: { capability: 'admin.reports.write', screen: '/admin/reports' },
  appeals: { capability: 'admin.appeals.decide', screen: '/admin/appeals' },
  abuse: { capability: 'admin.abuse.decide', screen: '/admin/abuse' },
  support: { capability: 'admin.support.write', screen: '/admin/support' },
  imports: { capability: 'admin.imports.review', screen: '/admin/imports' },
  approvals: { capability: 'admin.legal.write', screen: '/admin/approvals' },
};

/** Chemin de triage d'un élément, par file. */
function triagePath(queue: string, id: string): string | null {
  const key = encodeURIComponent(id);
  switch (queue) {
    case 'reports':
      return `/v1/admin/reports/${key}/triage`;
    case 'appeals':
      return `/v1/admin/abuse/appeals/${key}/triage`;
    case 'abuse':
      return `/v1/admin/abuse/decisions/${key}/triage`;
    case 'support':
      return `/v1/admin/support/tickets/${key}/triage`;
    case 'imports':
      return `/v1/admin/import/subscribers/${key}/triage`;
    case 'approvals':
      return `/v1/admin/approvals/${key}/triage`;
    default:
      return null;
  }
}

export interface TriageActionInput {
  queue: string;
  id: string;
  /** low | normal | high | urgent — omis = inchangé. */
  priority?: string;
  /** RFC3339 ; chaîne vide = effacer l'échéance explicite. */
  dueAt?: string;
  /** Assigner à la personne connectée. */
  assignToMe?: boolean;
  /** Libérer l'assignation. */
  clearAssignee?: boolean;
}

export interface TriageActionResult {
  ok: boolean;
  error?: string;
  /** Code du garde (`needs_step_up`, `deny_missing_capability`…) : l'écran
   *  propose la vérification puis rejoue l'action. */
  code?: string;
  level?: string;
}

/**
 * Persiste le triage d'un élément. Une échéance vide EFFACE l'échéance
 * explicite (l'échéance SLA par défaut de la file reprend) ; une priorité omise
 * reste inchangée.
 */
export async function triageQueueItemAction(input: TriageActionInput): Promise<TriageActionResult> {
  try {
    const route = QUEUE_ROUTES[input.queue];
    const path = route ? triagePath(input.queue, input.id) : null;
    if (!route || !path) {
      return { ok: false, error: 'File inconnue.' };
    }

    // Défense en profondeur : une server-action est un point d'entrée HTTP.
    // L'interface ne fait pas foi ; le garde Go non plus n'est pas contourné.
    const identity = await getAdminIdentity();
    if (!identity || !hasCapability(identity, route.capability)) {
      return {
        ok: false,
        error: `Accès refusé : la capacité ${route.capability} est requise.`,
      };
    }

    const body: Record<string, string> = {};
    if (input.assignToMe) body.assignedTo = identity.userId;
    if (input.clearAssignee) body.assignedTo = '';
    if (typeof input.priority === 'string' && input.priority) body.priority = input.priority;
    if (input.dueAt !== undefined) body.dueAt = input.dueAt;

    await goFetch(path, { method: 'PUT', body });

    revalidatePath('/admin/work');
    revalidatePath(route.screen);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Triage impossible',
      ...authzTrailers(err),
    };
  }
}
