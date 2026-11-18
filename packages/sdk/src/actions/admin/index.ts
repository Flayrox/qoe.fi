'use server';

// =====================================================================
// 🛡️ actions/admin — Server Actions de la console superadmin
// =====================================================================
// 🔒 Autorisation : elle est **entièrement** portée par l'API Go (rôle
// superadmin + capacités, `apps/api/internal/adminauthz`). Aucune de ces
// actions ne décide d'un droit côté TypeScript : elles relaient la session.
// Seules les opérations qui touchent Supabase Auth (ban/unban) utilisent le
// client service-role, APRÈS le passage par le Go.
// ⚠️ Fichier serveur, app admin uniquement — jamais exposé au mobile.
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { goFetch } from '../utils/go-client';
import { safeAction } from '../utils/safe-action';

/** Durée de bannissement Auth d'un compte suspendu (100 ans = « jusqu'à levée »). */
const SUSPENSION_BAN_DURATION = '876000h';

/**
 * Client service-role, construit à l'appel.
 * Un env manquant doit produire une erreur explicite plutôt qu'un `undefined`
 * silencieux dans le constructeur Supabase (et jamais une clé cliente).
 */
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Console admin : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis pour les opérations Auth.'
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const setSystemConfigAction = safeAction<
  { key: string; value: string; description?: string },
  { success: boolean }
>(async ({ key, value, description }) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch('/v1/admin/config', {
    method: 'PUT',
    body: { key, value, description },
  });
  revalidatePath('/', 'layout');
  return { success: true };
});

export const deleteSystemConfigAction = safeAction<string, { success: boolean }>(async (key) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch(`/v1/admin/config/${encodeURIComponent(key)}`, { method: 'DELETE' });
  revalidatePath('/', 'layout');
  return { success: true };
});

export const suspendUserAction = safeAction<
  { userId: string; reason: string },
  { success: boolean }
>(async ({ userId, reason }) => {
  // 1) Le Go fait foi ET porte l'autorisation : rien n'est banni avant son 200.
  await goFetch(`/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { isSuspended: true, suspendReason: reason },
  });

  // 2) Bannissement Auth (défense en profondeur : coupe les sessions ouvertes).
  const adminClient = getAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: SUSPENSION_BAN_DURATION,
  });

  if (error) {
    // Compensation : un compte banni sans suspension en base (ou l'inverse)
    // est un état que personne ne sait interpréter ensuite.
    try {
      await goFetch(`/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: { isSuspended: false, suspendReason: null },
      });
    } catch (compensateError) {
      console.error('[admin] suspension : compensation impossible', compensateError);
      throw new Error(
        'Suspension partielle : le bannissement Auth a échoué et la base n’a pas pu être rétablie. Vérifiez le compte manuellement.'
      );
    }
    throw new Error(
      `Suspension annulée : bannissement Auth impossible (${error.message}). La base a été rétablie.`
    );
  }

  revalidatePath('/admin/users');
  return { success: true };
});

export const unsuspendUserAction = safeAction<string, { success: boolean }>(async (userId) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch(`/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { isSuspended: false, suspendReason: null },
  });

  // Lever le ban est la seule opération qui compte : une erreur ignorée
  // laissait l'utilisateur « rétabli » en base mais incapable de se connecter.
  const adminClient = getAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: 'none',
  });
  if (error) {
    throw new Error(
      `Compte rétabli en base, mais le bannissement Auth subsiste (${error.message}). Relancez l’action : elle est idempotente.`
    );
  }

  revalidatePath('/admin/users');
  return { success: true };
});

export const toggleUserCertificationAction = safeAction<
  { userId: string; isCertified: boolean },
  { success: boolean }
>(async ({ userId, isCertified }) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch(`/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { isCertified },
  });
  revalidatePath('/admin/users');
  return { success: true };
});

export const toggleUserShadowbanAction = safeAction<
  { userId: string; isShadowbanned: boolean },
  { success: boolean }
>(async ({ userId, isShadowbanned }) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch(`/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { isShadowbanned },
  });
  revalidatePath('/admin/users');
  return { success: true };
});

/** 🔐 Approuve / rejette / révoque une application OAuth (console superadmin). */
export const updateOAuthClientStatusAction = safeAction<
  { clientId: string; status: 'APPROVED' | 'REJECTED' | 'REVOKED' | 'PENDING' },
  { success: boolean }
>(async ({ clientId, status }) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch(`/v1/admin/oauth/clients/${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    body: { status },
  });
  revalidatePath('/admin/oauth');
  return { success: true };
});

/** 🛡️ Clôt un signalement (dismiss/resolve) et applique une action de modération. */
export const resolveModerationReportAction = safeAction<
  { reportId: string; action: string; note?: string },
  { success: boolean }
>(async ({ reportId, action, note }) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch(`/v1/admin/reports/${encodeURIComponent(reportId)}`, {
    method: 'PATCH',
    body: { action, note: note ?? '' },
  });
  revalidatePath('/admin/reports');
  return { success: true };
});

/** 🛡️ Clôt un dossier anti-abus par verdict humain tracé (fiche 06 §8).
 * result ∈ allow (classé sans suite) | limit_distribution | pause_sending
 * | suspend (escalades dont l'acte passe par la modération existante).
 * Le backend Go vérifie le rôle superadmin (403 sinon). */
export const resolveAbuseDecisionAction = safeAction<
  { subjectType: string; subjectId: string; result: string; note?: string },
  { success: boolean; id: string }
>(async ({ subjectType, subjectId, result, note }) => {
  const res = await goFetch<{ id: string }>('/v1/admin/abuse/decisions', {
    method: 'PATCH',
    body: { subjectType, subjectId, result, note: note ?? '' },
  });
  revalidatePath('/admin/abuse');
  return { success: true, id: res.id };
});

/** 🛡️ Ouvre un dossier d'incident (attaque confirmée, jugée par le staff). */
export const openAbuseIncidentAction = safeAction<
  { title: string; kind: string; scope?: string; impact?: string },
  { success: boolean }
>(async ({ title, kind, scope, impact }) => {
  await goFetch('/v1/admin/abuse/incidents', {
    method: 'POST',
    body: { title, kind, scope: scope ?? '', impact: impact ?? '' },
  });
  revalidatePath('/admin/incidents');
  return { success: true };
});

/** 🛡️ Fait avancer un dossier (statut validé, mesure ajoutée horodatée). */
export const updateAbuseIncidentAction = safeAction<
  { incidentId: string; status?: string; scope?: string; impact?: string; measure?: string },
  { success: boolean }
>(async ({ incidentId, status, scope, impact, measure }) => {
  await goFetch(`/v1/admin/abuse/incidents/${encodeURIComponent(incidentId)}`, {
    method: 'PATCH',
    body: {
      status: status ?? '',
      scope: scope ?? '',
      impact: impact ?? '',
      measure: measure ?? '',
    },
  });
  revalidatePath('/admin/incidents');
  return { success: true };
});

/** 🎫 File des dossiers support (ouverts d'abord). */
export const listSupportTicketsAction = safeAction<
  { status?: string },
  { items: unknown[]; total: number }
>(async ({ status }) => {
  const qs = status ? `?status=${encodeURIComponent(status)}&limit=50` : '?limit=50';
  return goFetch<{ items: unknown[]; total: number }>(`/v1/admin/support/tickets${qs}`);
});

/** 📝 Articles d'aide : liste (brouillons inclus). */
export const listSupportArticlesAction = safeAction<
  Record<string, never>,
  { items: unknown[]; total: number }
>(async () => {
  return goFetch<{ items: unknown[]; total: number }>('/v1/admin/support/articles?limit=100');
});

/** 📝 Création d'un article (brouillon — publier est un acte séparé). */
export const createSupportArticleAction = safeAction<
  {
    slug: string;
    titleFr: string;
    titleEn: string;
    bodyFr: string;
    bodyEn: string;
    position?: number;
  },
  { success: boolean }
>(async (input) => {
  await goFetch('/v1/admin/support/articles', {
    method: 'POST',
    body: { ...input, position: input.position ?? 0 },
  });
  revalidatePath('/admin/support/articles');
  return { success: true };
});

/** 📝 Modification (contenu, position, publisher). Champs absents = inchangés. */
export const updateSupportArticleAction = safeAction<
  {
    articleId: string;
    titleFr?: string;
    titleEn?: string;
    bodyFr?: string;
    bodyEn?: string;
    position?: number;
    published?: boolean;
  },
  { success: boolean }
>(async ({ articleId, ...rest }) => {
  await goFetch(`/v1/admin/support/articles/${encodeURIComponent(articleId)}`, {
    method: 'PATCH',
    body: rest,
  });
  revalidatePath('/admin/support/articles');
  return { success: true };
});

/** 💎 Octroie un palier (staff) : sujet + plan + début/fin RFC3339 + note.
 * Début vide = maintenant, fin vide = sans fin (début futur = programmé). */
export const grantSubscriptionAction = safeAction<
  {
    subjectType: string;
    subjectId: string;
    plan: string;
    startsAt?: string;
    endsAt?: string;
    note?: string;
  },
  { success: boolean }
>(async (input) => {
  await goFetch('/v1/admin/subscriptions/grants', {
    method: 'POST',
    body: {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      plan: input.plan,
      startsAt: input.startsAt ?? '',
      endsAt: input.endsAt ?? '',
      note: input.note ?? '',
    },
  });
  revalidatePath('/admin/subscriptions');
  return { success: true };
});

/** 💎 Révoque un octroi (fin immédiate, historique conservé). */
export const revokeSubscriptionGrantAction = safeAction<{ grantId: string }, { success: boolean }>(
  async ({ grantId }) => {
    await goFetch(`/v1/admin/subscriptions/grants/${encodeURIComponent(grantId)}/revoke`, {
      method: 'POST',
    });
    revalidatePath('/admin/subscriptions');
    return { success: true };
  }
);

/** 🎫 Détail d'un dossier support (avec messages). */
export const getSupportTicketAction = safeAction<{ ticketId: string }, { ticket: unknown }>(
  async ({ ticketId }) => {
    const ticket = await goFetch(`/v1/admin/support/tickets/${encodeURIComponent(ticketId)}`);
    return { ticket };
  }
);

/** 🎫 Prise en main (passe en under_review, assigné). */
export const assignSupportTicketAction = safeAction<{ ticketId: string }, { success: boolean }>(
  async ({ ticketId }) => {
    await goFetch(`/v1/admin/support/tickets/${encodeURIComponent(ticketId)}/assign`, {
      method: 'POST',
    });
    revalidatePath('/admin/support');
    return { success: true };
  }
);

/** 🎫 Avancement / clôture (note ajoutée, réponse éventuelle). Clore ne lève
 * ni suspension ni permission — les actes passent par les chemins existants. */
export const updateSupportTicketAction = safeAction<
  { ticketId: string; status?: string; staffNote?: string; reply?: string },
  { success: boolean }
>(async ({ ticketId, status, staffNote, reply }) => {
  await goFetch(`/v1/admin/support/tickets/${encodeURIComponent(ticketId)}`, {
    method: 'PATCH',
    body: {
      status: status ?? '',
      staffNote: staffNote ?? '',
      reply: reply ?? '',
    },
  });
  revalidatePath('/admin/support');
  return { success: true };
});

/** ⚖️ Détail d'un recours (dossier + messages). */
export const getAbuseAppealAction = safeAction<{ appealId: string }, { appeal: unknown }>(
  async ({ appealId }) => {
    const appeal = await goFetch(`/v1/admin/abuse/appeals/${encodeURIComponent(appealId)}`);
    return { appeal };
  }
);

/** ⚖️ Prise en main (under_review) ou clôture (decided + outcome) d'un
 * recours. Seule overturned lève la mesure — l'ouverture n'a jamais rien
 * levé. Le backend Go vérifie le rôle superadmin (403 sinon). */
export const decideAbuseAppealAction = safeAction<
  { appealId: string; status: string; outcome?: string; staffNote?: string; reply?: string },
  { success: boolean }
>(async ({ appealId, status, outcome, staffNote, reply }) => {
  await goFetch(`/v1/admin/abuse/appeals/${encodeURIComponent(appealId)}`, {
    method: 'PATCH',
    body: { status, outcome: outcome ?? '', staffNote: staffNote ?? '', reply: reply ?? '' },
  });
  revalidatePath('/admin/appeals');
  return { success: true };
});

export const updateCreatorApiAccessAction = safeAction<
  {
    userId: string;
    status: 'approved' | 'rejected' | 'revoked' | 'none';
    grants?: string[];
  },
  { success: boolean }
>(async ({ userId, status, grants }) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon). L'approbation est
  // modulable : l'admin choisit les permissions accordées (grants).
  await goFetch(`/v1/admin/api-applicants/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { status, grants },
  });
  revalidatePath('/admin/api');
  return { success: true };
});

/** 🎛️ Ajuste les permissions d'un créateur sans changer son statut (l'admin se réserve le droit). */
export const updateCreatorApiGrantsAction = safeAction<
  { userId: string; grants: string[] },
  { success: boolean }
>(async ({ userId, grants }) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch(`/v1/admin/api-applicants/${encodeURIComponent(userId)}/grants`, {
    method: 'PATCH',
    body: { grants },
  });
  revalidatePath('/admin/api');
  return { success: true };
});

/** 🧩 Active / désactive les modules d'accès API accordables (registre modulable). */
export const saveApiAccessModulesAction = safeAction<{ enabled: string[] }, { success: boolean }>(
  async ({ enabled }) => {
    // Le backend Go vérifie le rôle superadmin (403 sinon).
    await goFetch('/v1/admin/api-access/modules', {
      method: 'PATCH',
      body: { enabled },
    });
    revalidatePath('/admin/api');
    revalidatePath('/admin/config');
    return { success: true };
  }
);

/** 👥 Marque un lot d'import « en examen » (idempotent). */
export const claimImportAction = safeAction<string, { success: boolean }>(async (batchId) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch(`/v1/admin/import/subscribers/${encodeURIComponent(batchId)}/claim`, {
    method: 'POST',
    body: {},
  });
  revalidatePath(`/admin/imports/${encodeURIComponent(batchId)}`);
  revalidatePath('/admin/imports');
  return { success: true };
});

export interface DecideImportInput {
  batchId: string;
  decision:
    | 'needs_info'
    | 'rejected'
    | 'approved_reconfirm'
    | 'approved_direct'
    | 'suspended'
    | 'cancelled'
    | 'resumed';
  internalReason?: string;
  publicReason?: string;
  fileVersion?: number;
  fileFingerprint?: string;
  limits?: Record<string, unknown>;
  expiresAt?: string;
  excludeEmails?: string[];
}

/** 👥 Enregistre une décision staff sur un lot (immuable côté Go : un changement ajoute une décision). */
export const decideImportAction = safeAction<DecideImportInput, { success: boolean }>(
  async ({ batchId, ...body }) => {
    // Le backend Go vérifie le rôle superadmin, la transition d'état et la
    // fraîcheur du fichier (409 sinon).
    await goFetch(`/v1/admin/import/subscribers/${encodeURIComponent(batchId)}/decide`, {
      method: 'POST',
      body,
    });
    revalidatePath(`/admin/imports/${encodeURIComponent(batchId)}`);
    revalidatePath('/admin/imports');
    return { success: true };
  }
);

/** ✉️ Ouvre une vague de reconfirmation (idempotent : renvoie la vague active). */
export const startReconfirmWaveAction = safeAction<
  { batchId: string; waveSize?: number },
  { success: boolean }
>(async ({ batchId, waveSize }) => {
  await goFetch(`/v1/admin/import/subscribers/${encodeURIComponent(batchId)}/reconfirm`, {
    method: 'POST',
    body: { waveSize: waveSize ?? 0 },
  });
  revalidatePath(`/admin/imports/${encodeURIComponent(batchId)}`);
  return { success: true };
});

/** 🧹 Purge les demandes de reconfirmation échues (rejouable, efface les jetons morts). */
export const purgeReconfirmAction = safeAction<string, { success: boolean; expired: number }>(
  async (batchId) => {
    const res = await goFetch<{ expired: number }>(
      `/v1/admin/import/subscribers/${encodeURIComponent(batchId)}/reconfirm/purge`,
      { method: 'POST', body: {} }
    );
    revalidatePath(`/admin/imports/${encodeURIComponent(batchId)}`);
    return { success: true, expired: res.expired ?? 0 };
  }
);

/** 📨 Ouvre une vague d'envoi encadré (idempotent : renvoie la vague active). */
export const startSendWaveAction = safeAction<
  { batchId: string; cap?: number },
  { success: boolean }
>(async ({ batchId, cap }) => {
  await goFetch(`/v1/admin/import/subscribers/${encodeURIComponent(batchId)}/send-wave`, {
    method: 'POST',
    body: { cap: cap ?? 0 },
  });
  revalidatePath(`/admin/imports/${encodeURIComponent(batchId)}`);
  return { success: true };
});

/** 🛑 Annule une vague d'envoi (les queued sont écartés, jamais repris). */
export const cancelSendWaveAction = safeAction<
  { batchId: string; waveId: string },
  { success: boolean }
>(async ({ batchId, waveId }) => {
  await goFetch(
    `/v1/admin/import/subscribers/${encodeURIComponent(batchId)}/send-waves/${encodeURIComponent(waveId)}/cancel`,
    { method: 'POST', body: {} }
  );
  revalidatePath(`/admin/imports/${encodeURIComponent(batchId)}`);
  return { success: true };
});
