// =====================================================================
// 🗺️ admin-coverage — aucune route orpheline, aucun écran fantôme
// =====================================================================
// Chaque route `/v1/admin/*` est classée ici : soit un écran la porte, soit
// elle est « API-only » AVEC une justification écrite (jamais un silence).
//
// Le manifeste n'est pas décoratif : `coverage_manifest_test.go` (côté Go) relit
// ce fichier, exige que TOUTES les routes montées y figurent, refuse toute entrée
// périmée, et vérifie qu'un écran déclaré appelle RÉELLEMENT le chemin dans ses
// sources. Ajouter une route côté API sans la classer ici casse la CI.
//
// Convention de clé : `METHOD /chemin` — exactement la clé du registre Go.
// =====================================================================

export interface AdminRouteCoverage {
  /** Écran de la console qui porte la route (`/admin/...`), ou null. */
  screen: string | null;
  /** Justification obligatoire quand aucun écran ne porte la route. */
  reason: string;
}

/** Route portée par un écran de la console. */
const via = (screen: string): AdminRouteCoverage => ({ screen, reason: '' });

/** Route sans écran, avec sa raison d'être — jamais un oubli silencieux. */
const apiOnly = (reason: string): AdminRouteCoverage => ({ screen: null, reason });

export const ADMIN_ROUTE_COVERAGE: Record<string, AdminRouteCoverage> = {
  // ── Pilotage ──────────────────────────────────────────────────────────
  // L'identité n'est pas un écran : le layout la résout à chaque requête pour
  // filtrer la navigation et masquer ce qui répondrait 403.
  'GET /v1/admin/me': apiOnly(
    'L’identité est résolue par le layout de la console à chaque requête ; elle n’a pas d’écran propre.'
  ),
  'GET /v1/admin/dashboard': via('/admin'),
  'GET /v1/admin/storage/usage': via('/admin/storage'),
  'GET /v1/admin/health': via('/admin/health'),
  'GET /v1/admin/audit-log': via('/admin/audit'),
  'GET /v1/admin/access/decisions': via('/admin/access/decisions'),

  // ── Modération ────────────────────────────────────────────────────────
  'GET /v1/admin/users': via('/admin/users'),
  'GET /v1/admin/users/{userID}': via('/admin/users'),
  'PATCH /v1/admin/users/{userID}': via('/admin/users'),
  'POST /v1/admin/users/{userID}/revoke-sessions': via('/admin/users'),
  'GET /v1/admin/reports': via('/admin/reports'),
  'PATCH /v1/admin/reports/{id}': via('/admin/reports'),
  'GET /v1/admin/abuse/decisions': via('/admin/abuse'),
  'PATCH /v1/admin/abuse/decisions': via('/admin/abuse'),
  'GET /v1/admin/abuse/metrics': via('/admin/abuse'),
  'GET /v1/admin/abuse/incidents': via('/admin/incidents'),
  'POST /v1/admin/abuse/incidents': via('/admin/incidents'),
  'PATCH /v1/admin/abuse/incidents/{id}': via('/admin/incidents'),
  'GET /v1/admin/abuse/appeals': via('/admin/appeals'),
  'GET /v1/admin/abuse/appeals/{id}': via('/admin/appeals'),
  'PATCH /v1/admin/abuse/appeals/{id}': via('/admin/appeals'),

  // ── Communauté ────────────────────────────────────────────────────────
  'GET /v1/admin/support/tickets': via('/admin/support'),
  'GET /v1/admin/support/tickets/{id}': via('/admin/support'),
  'POST /v1/admin/support/tickets/{id}/assign': via('/admin/support'),
  'PATCH /v1/admin/support/tickets/{id}': via('/admin/support'),
  'GET /v1/admin/support/metrics': via('/admin/support'),
  'GET /v1/admin/support/articles': via('/admin/support/articles'),
  'POST /v1/admin/support/articles': via('/admin/support/articles'),
  'GET /v1/admin/support/articles/{id}': via('/admin/support/articles'),
  'PATCH /v1/admin/support/articles/{id}': via('/admin/support/articles'),
  'GET /v1/admin/subscriptions/grants': via('/admin/subscriptions'),
  'POST /v1/admin/subscriptions/grants': via('/admin/subscriptions'),
  'POST /v1/admin/subscriptions/grants/{id}/revoke': via('/admin/subscriptions'),
  // Le palier email Pro vise UNE publication connue par son identifiant. L'API
  // n'expose aucune route de liste des publications et la fiche d'un compte ne
  // porte pas l'état courant : afficher une bascule sans son état serait un
  // mensonge. L'écran viendra avec la liste des publications (freemium).
  'PATCH /v1/admin/publications/{id}': apiOnly(
    'Bascule email Pro d’une publication : sans route de liste ni état courant lisible, la console ne peut pas l’afficher honnêtement.'
  ),
  'GET /v1/admin/import/subscribers': via('/admin/imports'),
  'GET /v1/admin/import/subscribers/{id}': via('/admin/imports/[id]'),
  'GET /v1/admin/import/subscribers/{id}/reconfirm': via('/admin/imports/[id]'),
  'GET /v1/admin/import/subscribers/{id}/send-waves': via('/admin/imports/[id]'),
  'POST /v1/admin/import/subscribers/{id}/claim': via('/admin/imports/[id]'),
  'POST /v1/admin/import/subscribers/{id}/decide': via('/admin/imports/[id]'),
  'POST /v1/admin/import/subscribers/{id}/reconfirm': via('/admin/imports/[id]'),
  'POST /v1/admin/import/subscribers/{id}/reconfirm/purge': via('/admin/imports/[id]'),
  'POST /v1/admin/import/subscribers/{id}/send-wave': via('/admin/imports/[id]'),
  'POST /v1/admin/import/subscribers/{id}/send-waves/{waveId}/cancel': via('/admin/imports/[id]'),

  // ── Produit ───────────────────────────────────────────────────────────
  'GET /v1/admin/widgets': via('/admin/widgets'),
  'POST /v1/admin/widgets/featured': via('/admin/widgets'),
  'POST /v1/admin/widgets/trends': via('/admin/widgets'),
  'DELETE /v1/admin/widgets/trends/{id}': via('/admin/widgets'),
  'PATCH /v1/admin/widgets/trends/{id}': via('/admin/widgets'),
  'POST /v1/admin/widgets/promos': via('/admin/widgets'),
  'DELETE /v1/admin/widgets/promos/{id}': via('/admin/widgets'),
  'PATCH /v1/admin/widgets/promos/{id}': via('/admin/widgets'),
  // Les placements vivent dans l'écran Notifications (gestion des bandeaux
  // in-app, au même endroit que les livraisons qu'ils déclenchent).
  'GET /v1/admin/placements': via('/admin/notifications'),
  'POST /v1/admin/placements': via('/admin/notifications'),
  'PUT /v1/admin/placements/{id}': via('/admin/notifications'),
  'DELETE /v1/admin/placements/{id}': via('/admin/notifications'),
  'GET /v1/admin/deliveries': via('/admin/notifications'),
  'POST /v1/admin/deliveries/{id}/retry': via('/admin/notifications'),
  'GET /v1/admin/campaigns': via('/admin/campaigns'),
  'POST /v1/admin/campaigns': via('/admin/campaigns'),
  'GET /v1/admin/campaigns/{id}': via('/admin/campaigns'),
  'PATCH /v1/admin/campaigns/{id}': via('/admin/campaigns'),
  'POST /v1/admin/campaigns/{id}/submit': via('/admin/campaigns'),
  'POST /v1/admin/campaigns/{id}/approve': via('/admin/campaigns'),
  'POST /v1/admin/campaigns/{id}/start': via('/admin/campaigns'),
  'POST /v1/admin/campaigns/{id}/pause': via('/admin/campaigns'),
  'POST /v1/admin/campaigns/{id}/cancel': via('/admin/campaigns'),

  // ── Plateforme ────────────────────────────────────────────────────────
  'GET /v1/admin/config': via('/admin/config'),
  'PUT /v1/admin/config': via('/admin/config'),
  'DELETE /v1/admin/config/{key}': via('/admin/config'),
  'PUT /v1/admin/reserved-identifiers/{kind}': via('/admin/config'),
  'GET /v1/admin/registrations/allowlist': via('/admin/config'),
  'POST /v1/admin/registrations/allowlist': via('/admin/config'),
  'DELETE /v1/admin/registrations/allowlist/{email}': via('/admin/config'),
  'GET /v1/admin/oauth/clients': via('/admin/oauth'),
  'PATCH /v1/admin/oauth/clients/{id}': via('/admin/oauth'),
  'GET /v1/admin/api-applicants': via('/admin/api'),
  'PATCH /v1/admin/api-applicants/{userID}': via('/admin/api'),
  'PATCH /v1/admin/api-applicants/{userID}/grants': via('/admin/api'),
  'GET /v1/admin/api-access/modules': via('/admin/api'),
  'PATCH /v1/admin/api-access/modules': via('/admin/api'),

  // Contenu juridique : rédaction, versions, cycle de vie, revues.
  'GET /v1/admin/legal': via('/admin/legal'),
  'POST /v1/admin/legal': via('/admin/legal'),
  'PATCH /v1/admin/legal/{id}': via('/admin/legal'),
  'DELETE /v1/admin/legal/{id}': via('/admin/legal'),
  'GET /v1/admin/legal/{id}/versions': via('/admin/legal'),
  'POST /v1/admin/legal/{id}/versions': via('/admin/legal'),
  'PATCH /v1/admin/legal/versions/{versionID}': via('/admin/legal'),
  'DELETE /v1/admin/legal/versions/{versionID}': via('/admin/legal'),
  'POST /v1/admin/legal/versions/{versionID}/publish': via('/admin/legal'),
  'POST /v1/admin/legal/versions/{versionID}/archive': via('/admin/legal'),
  'POST /v1/admin/legal/versions/{versionID}/schedule': via('/admin/legal'),
  'POST /v1/admin/legal/seed': via('/admin/legal'),
  'POST /v1/admin/legal/lifecycle/run': via('/admin/legal'),
  'GET /v1/admin/legal/stats': via('/admin/legal'),
  'GET /v1/admin/legal/reviews': via('/admin/legal'),
  'POST /v1/admin/legal/reviews': via('/admin/legal'),
  'POST /v1/admin/legal/reviews/{reviewID}/dismiss': via('/admin/legal'),
  // Conformité : preuves de consentement, cookies, avis, exports.
  'GET /v1/admin/legal/compliance': via('/admin/compliance'),
  'GET /v1/admin/legal/acceptances': via('/admin/compliance'),
  'GET /v1/admin/legal/consent-exports': via('/admin/compliance'),
  'GET /v1/admin/legal/consent-exports/verify': via('/admin/compliance'),
  'POST /v1/admin/legal/consent-exports': via('/admin/compliance'),
  'GET /v1/admin/legal/cookie-consents': via('/admin/compliance'),
  'GET /v1/admin/legal/notices': via('/admin/compliance'),
  // Accès staff : attributions, explication, matrice, vocabulaire.
  'GET /v1/admin/access/grants': via('/admin/access'),
  'POST /v1/admin/access/grants': via('/admin/access'),
  'POST /v1/admin/access/grants/{userID}/{roleKey}/revoke': via('/admin/access'),
  'GET /v1/admin/access/people': via('/admin/access'),
  'GET /v1/admin/access/people/{userID}': via('/admin/access'),
  'GET /v1/admin/access/roles': via('/admin/access/roles'),
  'GET /v1/admin/access/capabilities': via('/admin/access/roles'),
};

/** Nombre de routes classées (le test Go vérifie qu'il n'en manque aucune). */
export const ADMIN_ROUTE_COUNT = Object.keys(ADMIN_ROUTE_COVERAGE).length;

/** Routes portées par un écran. */
export function routesWithScreen(): string[] {
  return Object.entries(ADMIN_ROUTE_COVERAGE)
    .filter(([, coverage]) => coverage.screen !== null)
    .map(([key]) => key);
}

/** Routes API-only, avec leur justification (les orphelines assumées). */
export function apiOnlyRoutes(): { key: string; reason: string }[] {
  return Object.entries(ADMIN_ROUTE_COVERAGE)
    .filter(([, coverage]) => coverage.screen === null)
    .map(([key, coverage]) => ({ key, reason: coverage.reason }));
}

/** Part des routes portées par un écran (affichée sur le tableau de bord). */
export function coverageRatio(): { covered: number; total: number; percent: number } {
  const total = ADMIN_ROUTE_COUNT;
  const covered = routesWithScreen().length;
  return { covered, total, percent: total === 0 ? 0 : Math.round((covered / total) * 100) };
}
