package admin

import (
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/adminauthz"
	"github.com/qoefi/api/internal/authz"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/modules/imports"
	"github.com/qoefi/api/internal/modules/users"
	"github.com/qoefi/api/internal/response"
)

// Handler expose la console superadmin.
type Handler struct {
	svc *Service
	// subscriberImports est branché par SetSubscriberImports : sans lui, les
	// routes de revue des imports d'abonnés ne sont pas enregistrées.
	subscriberImports *imports.Service
	// usersSvc est branché par SetUsersService : sans lui, la révocation de
	// sessions est indisponible (refus explicite, pas de contournement).
	usersSvc *users.Service
	// decisionStats : compteurs de l'enregistreur de décisions (Phase 7). Nil
	// = compteurs à zéro, jamais un panic : la santé ne dépend pas d'un
	// câblage optionnel.
	decisionStats DecisionStatsSource
	// console déclare et monte les routes de la console sous le garde de
	// capacité (internal/adminauthz). Elle porte aussi le service de capacités
	// lu par GET /v1/admin/me. Sans console partagée (tests unitaires),
	// Register en crée une autonome : une route /v1/admin/* passe TOUJOURS par
	// une déclaration de capacité, jamais par un enregistrement direct.
	console *adminauthz.Console
}

// SetUsersService branche le service des comptes (même pattern que
// SetSubscriberImports) pour les opérations staff sur les sessions.
func (h *Handler) SetUsersService(svc *users.Service) { h.usersSvc = svc }

// SetConsole branche la console partagée de la plateforme : le même registre
// route → capacité est alors alimenté par tous les modules qui publient des
// routes /v1/admin/* (admin, légal, placements), et le garde lit le service de
// capacités branché dessus. C'est ce que fait cmd/server au démarrage.
func (h *Handler) SetConsole(c *adminauthz.Console) { h.console = c }

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// adminRoute associe une route de la console à la capacité qu'elle exige.
type adminRoute struct {
	method     string
	pattern    string
	capability adminauthz.Capability
	handler    http.HandlerFunc
}

// Register enregistre les routes de la console (groupe protégé JWT). Chaque
// route passe par la console (internal/adminauthz) : elle y DÉCLARE la capacité
// qu'elle exige puis est montée sous le garde. Il n'existe pas d'autre chemin
// d'enregistrement — une route qui échapperait au registre échapperait aussi au
// garde, ce que le test des routes refuse.
func (h *Handler) Register(r chi.Router) {
	if h.console == nil {
		h.console = adminauthz.NewStandaloneConsole(r)
	}
	for _, rt := range h.routeTable() {
		h.console.Mount(rt.method, rt.pattern, rt.capability, rt.handler,
			adminauthz.WithProofLevel(stepUpRoutes[adminauthz.RouteKey(rt.method, rt.pattern)]))
	}
	h.registerSubscriberImports()
	h.registerStaffCampaigns()
	h.registerPlatformFeatures()
	h.registerQueueTriage()
}

// stepUpRoutes : les routes de cette table qui exigent, EN PLUS de leur
// capacité, une preuve forte récente (N2 — facteur TOTP/passkey utilisé il y a
// moins de dix minutes). Le reste de la console est N0 : l'authentification de
// base suffit, et c'est un choix explicite, pas un oubli.
var stepUpRoutes = map[string]authz.Level{
	"PATCH /v1/admin/users/{userID}":                   authz.Level2,
	"POST /v1/admin/users/{userID}/revoke-sessions":    authz.Level2,
	"POST /v1/admin/subscriptions/grants":              authz.Level2,
	"POST /v1/admin/subscriptions/grants/{id}/revoke":  authz.Level2,
	"PATCH /v1/admin/publishers/{id}":                authz.Level2,
	"PUT /v1/admin/config":                             authz.Level2,
	"DELETE /v1/admin/config/{key}":                    authz.Level2,
	"PUT /v1/admin/reserved-identifiers/{kind}":        authz.Level2,
	"POST /v1/admin/registrations/allowlist":           authz.Level2,
	"DELETE /v1/admin/registrations/allowlist/{email}": authz.Level2,
	"PATCH /v1/admin/oauth/clients/{id}":               authz.Level2,
	// Modération qui mesure un compte : un verdict humain confirmé ou levé, et
	// un recours dont le prononcé peut lever la mesure.
	"PATCH /v1/admin/abuse/decisions":                  authz.Level2,
	"PATCH /v1/admin/abuse/appeals/{id}":               authz.Level2,
	"POST /v1/admin/security/trust/{userId}/recompute": authz.Level2,
	// Valider la double validation d'un acte N3 est un acte lourd : on ne
	// s'auto-valide pas, et une seconde personne doit prouver sa présence.
	"POST /v1/admin/approvals/{id}/decide": authz.Level2,
	// Trier une file qui porte un pouvoir de décision suit la capacité du
	// domaine : le triage d’un recours ou d’un import reste un acte lourd.
	"PUT /v1/admin/abuse/appeals/{id}/triage":        authz.Level2,
	"PUT /v1/admin/abuse/decisions/{id}/triage":      authz.Level2,
	"PUT /v1/admin/import/subscribers/{id}/triage":   authz.Level2,
	"PUT /v1/admin/approvals/{id}/triage":            authz.Level2,
	"PATCH /v1/admin/api-applicants/{userID}":        authz.Level2,
	"PATCH /v1/admin/api-applicants/{userID}/grants": authz.Level2,
	"PATCH /v1/admin/api-access/modules":             authz.Level2,
	"PUT /v1/admin/feature-flags/{key}":              authz.Level2,
	"PATCH /v1/admin/features/{key}":                 authz.Level2,
	"PUT /v1/admin/announcement":                     authz.Level2,
	"POST /v1/admin/users/{userID}/dsar-export":     authz.Level2,
	"POST /v1/admin/users/{userID}/erase":           authz.Level2,
	"POST /v1/admin/compliance/retention/purge":      authz.Level2,
	"POST /v1/admin/audit/signed-export":             authz.Level2,
	"POST /v1/admin/subscribers/signed-export":       authz.Level2,
	"POST /v1/admin/sandbox/seed":                    authz.Level2,
	"POST /v1/admin/sandbox/impersonate":             authz.Level2,
	// Distribuer les droits de la console est l'acte le plus lourd : une
	// session détournée ne doit pas pouvoir nommer un complice.
	"POST /v1/admin/access/grants":                           authz.Level2,
	"POST /v1/admin/access/grants/{userID}/{roleKey}/revoke": authz.Level2,
	"POST /v1/admin/access/reviews/snapshot":                 authz.Level2,
}

// routeTable est la déclaration unique des routes de la console. Chaque entrée
// nomme la capacité qu'elle exige : c'est cette table, et le registre qu'elle
// alimente, que parcourt le test des routes.
func (h *Handler) routeTable() []adminRoute {
	return []adminRoute{
		// ── Identité & pilotage ──────────────────────────────────────────
		// /me sert sa propre identité : toute personne de la console y a droit,
		// sinon l'interface ne pourrait pas savoir quoi afficher.
		{http.MethodGet, "/v1/admin/me", adminauthz.SelfRead, h.me},
		{http.MethodGet, "/v1/admin/dashboard", adminauthz.DashboardRead, h.dashboard},
		{http.MethodGet, "/v1/admin/work-queue", adminauthz.DashboardRead, h.workQueue},
		// Stockage médias (supervision de la saturation du bucket images).
		{http.MethodGet, "/v1/admin/storage/usage", adminauthz.DashboardRead, h.storageUsage},
		// Santé de la plateforme : base, migration appliquée, mode d'autorisation
		// et décisions récentes — la preuve chiffrée avant d'armer le refus.
		{http.MethodGet, "/v1/admin/health", adminauthz.DashboardRead, h.health},
		// SLO et alertes par surface (latence API, erreurs, outbox, migration).
		{http.MethodGet, "/v1/admin/slo", adminauthz.DashboardRead, h.sloReport},

		// ── Comptes & modération ─────────────────────────────────────────
		{http.MethodGet, "/v1/admin/users", adminauthz.UsersRead, h.users},
		{http.MethodGet, "/v1/admin/users/{userID}", adminauthz.UsersRead, h.userDetail},
		{http.MethodPatch, "/v1/admin/users/{userID}", adminauthz.UsersModerate, h.updateModeration},
		// Révocation de toutes les sessions d'un compte (compromission
		// suspectée, récupération après perte de facteurs).
		{http.MethodPost, "/v1/admin/users/{userID}/revoke-sessions", adminauthz.UsersSessionsRevoke, h.revokeUserSessions},
		// Exercice des droits RGPD : export nominatif scellé (Art. 15) et effacement (Art. 17).
		{http.MethodPost, "/v1/admin/users/{userID}/dsar-export", adminauthz.ComplianceExport, h.exportUserDSAR},
		{http.MethodPost, "/v1/admin/users/{userID}/erase", adminauthz.ComplianceExport, h.eraseUser},

		// File de modération (signalements).
		{http.MethodGet, "/v1/admin/reports", adminauthz.ReportsRead, h.reports},
		{http.MethodPatch, "/v1/admin/reports/{id}", adminauthz.ReportsWrite, h.resolveReport},

		// File de revue anti-abus (verdicts automatiques non triviaux → clôture
		// humaine tracée).
		{http.MethodGet, "/v1/admin/abuse/decisions", adminauthz.AbuseRead, h.abuseDecisions},
		{http.MethodPatch, "/v1/admin/abuse/decisions", adminauthz.AbuseDecide, h.resolveAbuseDecision},
		// Métriques anti-abus (les deux erreurs : abus manqué vs légitimes
		// bloqués). Query : ?days=30 (1-90).
		{http.MethodGet, "/v1/admin/abuse/metrics", adminauthz.AbuseRead, h.abuseMetrics},

		// Cockpit Sécurité & Trust (Lot 5).
		{http.MethodGet, "/v1/admin/security/overview", adminauthz.AbuseRead, h.securityOverview},
		{http.MethodPost, "/v1/admin/security/trust/{userId}/recompute", adminauthz.AbuseDecide, h.recomputeUserTrust},

		// Registre d'incidents (attaques confirmées, dossier tenu par le staff).
		{http.MethodGet, "/v1/admin/abuse/incidents", adminauthz.IncidentsRead, h.abuseIncidents},
		{http.MethodPost, "/v1/admin/abuse/incidents", adminauthz.IncidentsWrite, h.openAbuseIncident},
		{http.MethodPatch, "/v1/admin/abuse/incidents/{id}", adminauthz.IncidentsWrite, h.updateAbuseIncident},

		// Recours : file, détail, décisions. Seul overturned lève la mesure.
		{http.MethodGet, "/v1/admin/abuse/appeals", adminauthz.AppealsRead, h.abuseAppeals},
		{http.MethodGet, "/v1/admin/abuse/appeals/{id}", adminauthz.AppealsRead, h.abuseAppealDetail},
		{http.MethodPatch, "/v1/admin/abuse/appeals/{id}", adminauthz.AppealsDecide, h.decideAbuseAppeal},

		// Journal des décisions du garde (accords, refus appliqués, refus
		// observés) : lire le refus est un acte d'audit, d'où la capacité.
		{http.MethodGet, "/v1/admin/access/decisions", adminauthz.AuditRead, h.accessDecisions},

		// ── Support, contenu d'aide & abonnements ────────────────────────
		// Dossiers support : la clôture ne lève ni suspension ni permission.
		{http.MethodGet, "/v1/admin/support/tickets", adminauthz.SupportRead, h.supportTickets},
		{http.MethodGet, "/v1/admin/support/tickets/{id}", adminauthz.SupportRead, h.supportTicketDetail},
		{http.MethodPost, "/v1/admin/support/tickets/{id}/assign", adminauthz.SupportWrite, h.assignSupportTicket},
		{http.MethodPatch, "/v1/admin/support/tickets/{id}", adminauthz.SupportWrite, h.updateSupportTicket},
		{http.MethodGet, "/v1/admin/support/metrics", adminauthz.SupportRead, h.supportMetrics},
		// Articles d'aide (centre d'aide sans redéploiement) : liste (brouillons
		// inclus), création (brouillon), détail, modification (dont publication).
		{http.MethodGet, "/v1/admin/support/articles", adminauthz.ContentRead, h.supportArticles},
		{http.MethodPost, "/v1/admin/support/articles", adminauthz.ContentWrite, h.createSupportArticle},
		{http.MethodGet, "/v1/admin/support/articles/{id}", adminauthz.ContentRead, h.supportArticleDetail},
		{http.MethodPatch, "/v1/admin/support/articles/{id}", adminauthz.ContentWrite, h.updateSupportArticle},
		// Palier email Pro (freemium, intérim Stripe) : c'est un droit
		// d'abonnement, donc la capacité des octrois, pas celle du contenu.
		{http.MethodPatch, "/v1/admin/publishers/{id}", adminauthz.SubscriptionsWrite, h.setPublisherEmailPro},
		// Abonnements manuels : octroyer (daté, programmé), révoquer, historique.
		{http.MethodGet, "/v1/admin/subscriptions/grants", adminauthz.SubscriptionsRead, h.subscriptionGrants},
		{http.MethodPost, "/v1/admin/subscriptions/grants", adminauthz.SubscriptionsWrite, h.grantSubscription},
		{http.MethodPost, "/v1/admin/subscriptions/grants/{id}/revoke", adminauthz.SubscriptionsWrite, h.revokeSubscriptionGrant},

		// ── Contenu éditorial & widgets ──────────────────────────────────
		{http.MethodGet, "/v1/admin/widgets", adminauthz.WidgetsRead, h.widgets},
		{http.MethodPost, "/v1/admin/widgets/featured", adminauthz.WidgetsWrite, h.setFeatured},
		{http.MethodPost, "/v1/admin/widgets/trends", adminauthz.WidgetsWrite, h.addTrend},
		{http.MethodDelete, "/v1/admin/widgets/trends/{id}", adminauthz.WidgetsWrite, h.deleteTrend},
		{http.MethodPatch, "/v1/admin/widgets/trends/{id}", adminauthz.WidgetsWrite, h.updateTrend},
		{http.MethodPost, "/v1/admin/widgets/promos", adminauthz.WidgetsWrite, h.savePromo},
		{http.MethodDelete, "/v1/admin/widgets/promos/{id}", adminauthz.WidgetsWrite, h.deletePromo},
		{http.MethodPatch, "/v1/admin/widgets/promos/{id}", adminauthz.WidgetsWrite, h.togglePromo},

		// ── Notifications & livraisons ───────────────────────────────────
		{http.MethodGet, "/v1/admin/deliveries", adminauthz.DeliveriesRead, h.deliveries},
		{http.MethodPost, "/v1/admin/deliveries/{id}/retry", adminauthz.DeliveriesRetry, h.retryDelivery},
		{http.MethodGet, "/v1/admin/outbox/metrics", adminauthz.DeliveriesRead, h.outboxMetrics},
		{http.MethodPost, "/v1/admin/outbox/retry-all", adminauthz.DeliveriesRetry, h.retryAllFailed},
		{http.MethodPost, "/v1/admin/outbox/unlock-stuck", adminauthz.DeliveriesRetry, h.unlockStuck},
		{http.MethodPost, "/v1/admin/outbox/batch-retry", adminauthz.DeliveriesRetry, h.batchRetry},

		// ── Communication & Annonce globale ──────────────────────────────
		{http.MethodGet, "/v1/admin/announcement", adminauthz.CampaignsRead, h.getAnnouncement},
		{http.MethodPut, "/v1/admin/announcement", adminauthz.CampaignsWrite, h.setAnnouncement},

		// ── Bac à sable, seeds & impersonation (Lot D6) ───────────────────
		{http.MethodGet, "/v1/admin/sandbox/scenarios", adminauthz.DashboardRead, h.listSandboxScenarios},
		{http.MethodPost, "/v1/admin/sandbox/seed", adminauthz.ConfigWrite, h.runSandboxSeed},
		{http.MethodPost, "/v1/admin/sandbox/impersonate", adminauthz.ConfigWrite, h.runImpersonate},

		// ── Vues sauvegardées d'équipe (Lot B3) ───────────────────────────
		{http.MethodGet, "/v1/admin/views/{resource}", adminauthz.DashboardRead, h.listSavedViews},
		{http.MethodPost, "/v1/admin/views/{resource}", adminauthz.DashboardRead, h.saveView},
		{http.MethodDelete, "/v1/admin/views/{resource}/{id}", adminauthz.DashboardRead, h.deleteSavedView},

		// ── Plateforme : configuration, inscriptions, OAuth, accès API ────
		{http.MethodGet, "/v1/admin/config", adminauthz.ConfigRead, h.configs},
		{http.MethodPut, "/v1/admin/config", adminauthz.ConfigWrite, h.upsertConfigs},
		{http.MethodDelete, "/v1/admin/config/{key}", adminauthz.ConfigWrite, h.deleteConfig},
		{http.MethodPut, "/v1/admin/reserved-identifiers/{kind}", adminauthz.ConfigWrite, h.updateReservedIdentifiers},
		// Allowlist d'inscription (accès privé : inscriptions sur invitation).
		{http.MethodGet, "/v1/admin/registrations/allowlist", adminauthz.ConfigRead, h.listAllowlist},
		{http.MethodPost, "/v1/admin/registrations/allowlist", adminauthz.ConfigWrite, h.addAllowlist},
		{http.MethodDelete, "/v1/admin/registrations/allowlist/{email}", adminauthz.ConfigWrite, h.deleteAllowlist},
		{http.MethodGet, "/v1/admin/oauth/clients", adminauthz.OAuthRead, h.oauthClients},
		{http.MethodPatch, "/v1/admin/oauth/clients/{id}", adminauthz.OAuthApprove, h.updateOAuthStatus},
		// Demandes d'accès API (permissions modulables).
		{http.MethodGet, "/v1/admin/api-applicants", adminauthz.APIRead, h.apiApplicants},
		{http.MethodPatch, "/v1/admin/api-applicants/{userID}", adminauthz.APIGrantsWrite, h.updateApiAccess},
		{http.MethodPatch, "/v1/admin/api-applicants/{userID}/grants", adminauthz.APIGrantsWrite, h.updateApiGrants},
		{http.MethodGet, "/v1/admin/api-access/modules", adminauthz.APIRead, h.apiAccessModules},
		{http.MethodPatch, "/v1/admin/api-access/modules", adminauthz.APIGrantsWrite, h.updateApiAccessModules},

		// Journal d'audit de la console & export signé.
		{http.MethodGet, "/v1/admin/audit-log", adminauthz.AuditRead, h.auditLog},
		{http.MethodPost, "/v1/admin/audit/signed-export", adminauthz.AuditRead, h.exportSignedAudit},

		// Abonnés : export signé du registre.
		{http.MethodPost, "/v1/admin/subscribers/signed-export", adminauthz.SubscriptionsRead, h.exportSignedSubscribers},

		// ── Conformité, Rétention & DSAR (RGPD) ────────────────────────
		{http.MethodGet, "/v1/admin/compliance/deletion-requests", adminauthz.ComplianceRead, h.listDeletionRequests},
		{http.MethodGet, "/v1/admin/compliance/retention", adminauthz.ComplianceRead, h.listRetentionPolicies},
		{http.MethodPost, "/v1/admin/compliance/retention/purge", adminauthz.ComplianceExport, h.purgeRetentionData},
		{http.MethodGet, "/v1/admin/compliance/retention/journal", adminauthz.ComplianceRead, h.getRetentionJournal},
		{http.MethodPost, "/v1/admin/compliance/exports/verify", adminauthz.ComplianceRead, h.verifySignedExport},

		// ── Double validation des actes N3 (quorum, Phase 8) ─────────────
		{http.MethodGet, "/v1/admin/approvals", adminauthz.LegalRead, h.approvals},
		{http.MethodPost, "/v1/admin/approvals/{id}/decide", adminauthz.LegalWrite, h.decideApproval},

		// ── Accès staff : nommer un rôle sans SQL (plan, Phase 2) ────────
		{http.MethodGet, "/v1/admin/access/grants", adminauthz.AccessRead, h.accessGrants},
		{http.MethodGet, "/v1/admin/access/people", adminauthz.AccessRead, h.accessPeople},
		{http.MethodGet, "/v1/admin/access/people/{userID}", adminauthz.AccessRead, h.accessPerson},
		{http.MethodGet, "/v1/admin/access/roles", adminauthz.AccessRead, h.accessRoles},
		{http.MethodGet, "/v1/admin/access/capabilities", adminauthz.AccessRead, h.accessCapabilities},
		{http.MethodPost, "/v1/admin/access/grants", adminauthz.AccessGrant, h.grantAccess},
		{http.MethodPost, "/v1/admin/access/grants/{userID}/{roleKey}/revoke", adminauthz.AccessGrant, h.revokeAccess},
		// ── Revue périodique et cycle de vie des accès (plan, Phase 8) ───
		{http.MethodGet, "/v1/admin/access/reviews", adminauthz.AccessRead, h.accessReviews},
		{http.MethodGet, "/v1/admin/access/reviews/{period}", adminauthz.AccessRead, h.accessReviewPeriod},
		{http.MethodPost, "/v1/admin/access/reviews/snapshot", adminauthz.AccessGrant, h.triggerAccessReviewSnapshot},
	}
}

// requireAuthenticated n'est qu'un contrôle d'AUTHENTIFICATION.
func (h *Handler) requireAuthenticated(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return "", false
	}
	return userID, true
}

// AdminIdentity est l'accès résolu de la personne connectée (page /admin/me).
type AdminIdentity struct {
	UserID       string   `json:"userId"`
	Roles        []string `json:"roles"`
	Capabilities []string `json:"capabilities"`
}

// GET /v1/admin/me — rôles et capacités de l'appelant.
func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var lookup adminauthz.Lookup
	if h.console != nil {
		lookup = h.console.Lookup()
	}
	if lookup == nil {
		response.Error(w, http.StatusServiceUnavailable, "Registre de capacités non branché")
		return
	}
	access, err := lookup.Access(r.Context(), userID)
	if err != nil {
		log.Printf("[admin] me: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, AdminIdentity{
		UserID:       userID,
		Roles:        access.RoleKeys(),
		Capabilities: access.CapabilityKeys(),
	})
}

func (h *Handler) handleErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errForbidden):
		response.Forbidden(w, "Accès réservé au superadmin.")
	case errors.Is(err, pgx.ErrNoRows):
		response.NotFound(w, "Utilisateur introuvable.")
	case errors.Is(err, errInvalidAction):
		response.BadRequest(w, err.Error())
	case errors.Is(err, errInvalidModeration):
		response.BadRequest(w, err.Error())
	case errors.Is(err, errInvalidAccess):
		response.BadRequest(w, err.Error())
	default:
		log.Printf("[admin] %v", err)
		response.Internal(w)
	}
}
