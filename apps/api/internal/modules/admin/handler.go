package admin

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/abuse"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/modules/imports"
	"github.com/qoefi/api/internal/modules/users"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/support"
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
}

// SetUsersService branche le service des comptes (même pattern que
// SetSubscriberImports) pour les opérations staff sur les sessions.
func (h *Handler) SetUsersService(svc *users.Service) { h.usersSvc = svc }

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Register enregistre les routes admin (groupe protégé JWT).
func (h *Handler) Register(r chi.Router) {
	r.Get("/v1/admin/dashboard", h.dashboard)
	r.Get("/v1/admin/users", h.users)
	r.Get("/v1/admin/users/{userID}", h.userDetail)
	r.Patch("/v1/admin/users/{userID}", h.updateModeration)
	// Révocation de toutes les sessions d'un compte (compromission suspectée,
	// récupération après perte de facteurs). Superadmin uniquement, journalisé.
	r.Post("/v1/admin/users/{userID}/revoke-sessions", h.revokeUserSessions)

	// File de modération (signalements)
	r.Get("/v1/admin/reports", h.reports)
	r.Patch("/v1/admin/reports/{id}", h.resolveReport)

	// File de revue anti-abus (verdicts automatiques non triviaux → clôture
	// humaine tracée). Superadmin, lecture puis PATCH par sujet.
	r.Get("/v1/admin/abuse/decisions", h.abuseDecisions)
	r.Patch("/v1/admin/abuse/decisions", h.resolveAbuseDecision)
	// Métriques anti-abus (les deux erreurs : abus manqué vs légitimes
	// bloqués). Query : ?days=30 (1-90).
	r.Get("/v1/admin/abuse/metrics", h.abuseMetrics)
	// Palier email Pro (freemium, intérim Stripe) : bascule superadmin.
	r.Patch("/v1/admin/publications/{id}", h.setPublicationEmailPro)
	// Registre d'incidents (attaques confirmées, dossier tenu par le staff).
	r.Get("/v1/admin/abuse/incidents", h.abuseIncidents)
	r.Post("/v1/admin/abuse/incidents", h.openAbuseIncident)
	r.Patch("/v1/admin/abuse/incidents/{id}", h.updateAbuseIncident)
	// Recours (tranche 6) : file + détail + décisions. Seule overturned lève.
	r.Get("/v1/admin/abuse/appeals", h.abuseAppeals)
	r.Get("/v1/admin/abuse/appeals/{id}", h.abuseAppealDetail)
	r.Patch("/v1/admin/abuse/appeals/{id}", h.decideAbuseAppeal)
	// Support général (tranche 6) : file + détail + assignation + avancement
	// + charge. La clôture ne lève ni suspension ni permission.
	r.Get("/v1/admin/support/tickets", h.supportTickets)
	r.Get("/v1/admin/support/tickets/{id}", h.supportTicketDetail)
	r.Post("/v1/admin/support/tickets/{id}/assign", h.assignSupportTicket)
	r.Patch("/v1/admin/support/tickets/{id}", h.updateSupportTicket)
	r.Get("/v1/admin/support/metrics", h.supportMetrics)
	// Articles d'aide (centre d'aide sans redéploiement) : liste (brouillons
	// inclus), création (brouillon), détail, modification (dont publication).
	r.Get("/v1/admin/support/articles", h.supportArticles)
	r.Post("/v1/admin/support/articles", h.createSupportArticle)
	r.Get("/v1/admin/support/articles/{id}", h.supportArticleDetail)
	r.Patch("/v1/admin/support/articles/{id}", h.updateSupportArticle)

	// Widgets & tendances
	r.Get("/v1/admin/widgets", h.widgets)
	r.Post("/v1/admin/widgets/featured", h.setFeatured)
	r.Post("/v1/admin/widgets/trends", h.addTrend)
	r.Delete("/v1/admin/widgets/trends/{id}", h.deleteTrend)
	r.Patch("/v1/admin/widgets/trends/{id}", h.updateTrend)
	r.Post("/v1/admin/widgets/promos", h.savePromo)
	r.Delete("/v1/admin/widgets/promos/{id}", h.deletePromo)
	r.Patch("/v1/admin/widgets/promos/{id}", h.togglePromo)

	// Stockage médias (supervision saturation du bucket images)
	r.Get("/v1/admin/storage/usage", h.storageUsage)

	// Allowlist d'inscription (accès privé : inscriptions sur invitation)
	r.Get("/v1/admin/registrations/allowlist", h.listAllowlist)
	r.Post("/v1/admin/registrations/allowlist", h.addAllowlist)
	r.Delete("/v1/admin/registrations/allowlist/{email}", h.deleteAllowlist)

	// Feature flags / config / frontend / traductions
	r.Get("/v1/admin/config", h.configs)
	r.Put("/v1/admin/config", h.upsertConfigs)
	r.Delete("/v1/admin/config/{key}", h.deleteConfig)
	r.Put("/v1/admin/reserved-identifiers/{kind}", h.updateReservedIdentifiers)

	// OAuth
	r.Get("/v1/admin/oauth/clients", h.oauthClients)
	r.Patch("/v1/admin/oauth/clients/{id}", h.updateOAuthStatus)

	// Demandes d'accès API (permissions modulables)
	r.Get("/v1/admin/api-applicants", h.apiApplicants)
	r.Patch("/v1/admin/api-applicants/{userID}", h.updateApiAccess)
	r.Patch("/v1/admin/api-applicants/{userID}/grants", h.updateApiGrants)
	r.Get("/v1/admin/api-access/modules", h.apiAccessModules)
	r.Patch("/v1/admin/api-access/modules", h.updateApiAccessModules)

	// Journal d'audit superadmin (flag admin-audit-log)
	r.Get("/v1/admin/audit-log", h.auditLog)

	// Notifications & livraisons
	r.Get("/v1/admin/deliveries", h.deliveries)
	r.Post("/v1/admin/deliveries/{id}/retry", h.retryDelivery)

	h.registerSubscriberImports(r)
	h.registerStaffCampaigns(r)
}

func (h *Handler) requireSuperadmin(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return "", false
	}
	return userID, true
}

func (h *Handler) handleErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errForbidden):
		response.Forbidden(w, "Accès réservé au superadmin.")
	case errors.Is(err, pgx.ErrNoRows):
		response.NotFound(w, "Utilisateur introuvable.")
	case errors.Is(err, errInvalidAction):
		response.BadRequest(w, err.Error())
	default:
		log.Printf("[admin] %v", err)
		response.Internal(w)
	}
}

// GET /v1/admin/dashboard — compteurs globaux (réservé superadmin).
func (h *Handler) dashboard(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	data, err := h.svc.GetDashboard(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// GET /v1/admin/storage/usage — supervision du bucket images (superadmin).
// Query : ?limit=20 (top consommateurs, max 100).
func (h *Handler) storageUsage(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	data, err := h.svc.GetStorageUsage(r.Context(), userID, limit)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// GET /v1/admin/registrations/allowlist — invitations d'inscription.
func (h *Handler) listAllowlist(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	data, err := h.svc.ListAllowlist(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// POST /v1/admin/registrations/allowlist — invite un email.
// Body : { email, note? }.
func (h *Handler) addAllowlist(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var body struct {
		Email string `json:"email"`
		Note  string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	entry, err := h.svc.AddAllowlist(r.Context(), userID, body.Email, body.Note)
	if err != nil {
		if err.Error() == "email invalide" {
			response.BadRequest(w, err.Error())
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, entry)
}

// DELETE /v1/admin/registrations/allowlist/{email} — retire une invitation.
// Le {email} d'URL est URL-encodé (encodeURIComponent côté front).
func (h *Handler) deleteAllowlist(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	email, err := url.PathUnescape(chi.URLParam(r, "email"))
	if err != nil {
		response.BadRequest(w, "email invalide")
		return
	}
	if err := h.svc.DeleteAllowlist(r.Context(), userID, email); err != nil {
		if err.Error() == "email invalide" {
			response.BadRequest(w, err.Error())
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// GET /v1/admin/users — liste des utilisateurs (réservé superadmin).
func (h *Handler) users(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	data, err := h.svc.ListUsers(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// GET /v1/admin/users/{userID} — détail d'un utilisateur (réservé superadmin).
func (h *Handler) userDetail(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	data, err := h.svc.GetUser(r.Context(), userID, chi.URLParam(r, "userID"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// GET /v1/admin/reports — file de modération (pending en premier).
// Query : ?status=pending|resolved|dismissed&limit=50&offset=0
func (h *Handler) reports(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, err := h.svc.ListReports(r.Context(), userID, r.URL.Query().Get("status"), limit, offset)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	pending, err := h.svc.CountPendingReports(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "pending": pending})
}

// PATCH /v1/admin/reports/{id} — clôture + action de modération.
// Body : { "action": "dismiss|resolve|hide_post|hide_article|unhide_post|unhide_article|suspend_author", "note": "..." }
func (h *Handler) resolveReport(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Action string `json:"action"`
		Note   string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Action == "" {
		response.BadRequest(w, "JSON invalide (action requise)")
		return
	}
	data, err := h.svc.ResolveReport(r.Context(), userID, chi.URLParam(r, "id"), in.Action, in.Note)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// GET /v1/admin/abuse/decisions — dossiers ouverts du noyau anti-abus.
// Query : ?limit=50&offset=0. Chaque dossier = dernier verdict non trivial
// d'un sujet (non expiré), avec le nombre de faits récents en contexte.
func (h *Handler) abuseDecisions(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total, err := h.svc.ListAbuseDecisions(r.Context(), userID, limit, offset)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": total})
}

// PATCH /v1/admin/abuse/decisions — clôture humaine d'un dossier.
// Body : { "subjectType": "report_target", "subjectId": "article:xxx",
// "result": "allow|limit_distribution|pause_sending|suspend", "note": "..." }.
// `allow` = classé sans suite (faux positif mesuré) ; le reste = escalade
// dont l'acte passe par les chemins de modération existants.
func (h *Handler) resolveAbuseDecision(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		SubjectType string `json:"subjectType"`
		SubjectID   string `json:"subjectId"`
		Result      string `json:"result"`
		Note        string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil ||
		in.SubjectType == "" || in.SubjectID == "" || in.Result == "" {
		response.BadRequest(w, "JSON invalide (subjectType, subjectId et result requis)")
		return
	}
	id, err := h.svc.ResolveAbuseDecision(r.Context(), userID, in.SubjectType, in.SubjectID, in.Result, in.Note)
	if err != nil {
		// abuse ne dépend d'aucun module : correspondance directe, sans
		// couche d'erreurs intermédiaire qui masquerait les cas.
		switch {
		case errors.Is(err, errForbidden):
			response.Forbidden(w, "Accès réservé au superadmin.")
		case errors.Is(err, abuse.ErrNoOpenDecision):
			response.NotFound(w, "Aucune décision ouverte pour ce sujet.")
		case errors.Is(err, abuse.ErrInvalidHumanResult):
			response.BadRequest(w, err.Error())
		default:
			h.handleErr(w, err)
		}
		return
	}
	response.OK(w, map[string]any{"id": id})
}

// GET /v1/admin/abuse/metrics — santé anti-abus (fiche 06 §11).
func (h *Handler) abuseMetrics(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	m, err := h.svc.AbuseMetrics(r.Context(), userID, days)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, m)
}

// GET /v1/admin/abuse/incidents — dossiers d'attaques (ouverts d'abord).
// Query : ?status=open|contained|resolved|reopened&limit=50&offset=0
func (h *Handler) abuseIncidents(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total, err := h.svc.ListAbuseIncidents(r.Context(), userID, r.URL.Query().Get("status"), limit, offset)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": total})
}

// POST /v1/admin/abuse/incidents — ouvre un dossier.
// Body : { "title": "Ferme de comptes contre ...", "kind": "account_farm",
// "scope": "...", "impact": "..." }
func (h *Handler) openAbuseIncident(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Title  string `json:"title"`
		Kind   string `json:"kind"`
		Scope  string `json:"scope"`
		Impact string `json:"impact"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Title == "" || in.Kind == "" {
		response.BadRequest(w, "JSON invalide (title et kind requis)")
		return
	}
	d, err := h.svc.OpenAbuseIncident(r.Context(), userID, in.Title, in.Kind, in.Scope, in.Impact)
	if err != nil {
		if errors.Is(err, abuse.ErrInvalidIncident) {
			response.BadRequest(w, err.Error())
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, d)
}

// PATCH /v1/admin/abuse/incidents/{id} — fait avancer un dossier.
// Body : { "status": "contained|resolved|reopened|open", "scope": "...",
// "impact": "...", "measure": "coupe-feu inscriptions engagé" } — la mesure
// s'ajoute horodatée avec l'auteur, jamais écrasée.
func (h *Handler) updateAbuseIncident(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Status  string `json:"status"`
		Scope   string `json:"scope"`
		Impact  string `json:"impact"`
		Measure string `json:"measure"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	d, err := h.svc.UpdateAbuseIncident(r.Context(), userID, chi.URLParam(r, "id"), in.Status, in.Scope, in.Impact, in.Measure)
	if err != nil {
		switch {
		case errors.Is(err, abuse.ErrNoIncident):
			response.NotFound(w, "Incident introuvable.")
		case errors.Is(err, abuse.ErrInvalidIncident):
			response.BadRequest(w, err.Error())
		default:
			h.handleErr(w, err)
		}
		return
	}
	response.OK(w, d)
}

// GET /v1/admin/abuse/appeals — file des recours (ouverts d'abord).
// Query : ?status=open|under_review|decided&limit=50&offset=0
func (h *Handler) abuseAppeals(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total, err := h.svc.ListAbuseAppeals(r.Context(), userID, r.URL.Query().Get("status"), limit, offset)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": total})
}

// GET /v1/admin/abuse/appeals/{id} — un recours avec ses messages.
func (h *Handler) abuseAppealDetail(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	a, err := h.svc.GetAbuseAppeal(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, abuse.ErrAppealNotFound) {
			response.NotFound(w, "Recours introuvable.")
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, a)
}

// PATCH /v1/admin/abuse/appeals/{id} — tranche un recours.
// Body : { "status": "under_review|decided", "outcome": "upheld|overturned"
// (exigé si decided), "staffNote": "...", "reply": "réponse à l'utilisateur" }.
// overturned = faux positif avéré (verdict allow, la mesure tombe + appealRef) ;
// upheld = mesure confirmée (verdict humain + appealRef). L'ouverture n'a
// jamais rien levé — seule cette décision tranche.
func (h *Handler) decideAbuseAppeal(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Status    string `json:"status"`
		Outcome   string `json:"outcome"`
		StaffNote string `json:"staffNote"`
		Reply     string `json:"reply"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	a, err := h.svc.DecideAbuseAppeal(r.Context(), userID, chi.URLParam(r, "id"), in.Status, in.Outcome, in.StaffNote, in.Reply)
	if err != nil {
		switch {
		case errors.Is(err, abuse.ErrAppealNotFound):
			response.NotFound(w, "Recours introuvable.")
		case errors.Is(err, abuse.ErrAppealClosed):
			response.Error(w, http.StatusGone, err.Error())
		case errors.Is(err, abuse.ErrInvalidAppeal),
			errors.Is(err, abuse.ErrNothingToAppeal):
			response.BadRequest(w, err.Error())
		default:
			h.handleErr(w, err)
		}
		return
	}
	response.OK(w, a)
}

// GET /v1/admin/support/tickets — file (ouverts d'abord).
// Query : ?status=open|under_review|closed&limit=50&offset=0
func (h *Handler) supportTickets(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total, err := h.svc.ListSupportTickets(r.Context(), userID, r.URL.Query().Get("status"), limit, offset)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": total})
}

// GET /v1/admin/support/tickets/{id} — un dossier avec ses messages.
func (h *Handler) supportTicketDetail(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	t, err := h.svc.GetSupportTicket(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, support.ErrTicketNotFound) {
			response.NotFound(w, "Dossier introuvable.")
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, t)
}

// POST /v1/admin/support/tickets/{id}/assign — prise en main (passe en
// under_review). L'assignation à soi-même est tracée, pas refusée.
func (h *Handler) assignSupportTicket(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	t, err := h.svc.AssignSupportTicket(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, support.ErrTicketNotFound) {
			response.NotFound(w, "Dossier introuvable.")
			return
		}
		if errors.Is(err, support.ErrTicketClosed) {
			response.Error(w, http.StatusGone, err.Error())
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, t)
}

// PATCH /v1/admin/support/tickets/{id} — avancement / clôture.
// Body : { "status": "under_review|closed", "staffNote": "...", "reply": "..." }.
// Clore son propre dossier = 400 (conflit d'intérêts) ; clore ne lève ni
// suspension ni permission (les actes passent par les chemins existants).
func (h *Handler) updateSupportTicket(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Status    string `json:"status"`
		StaffNote string `json:"staffNote"`
		Reply     string `json:"reply"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	t, err := h.svc.UpdateSupportTicket(r.Context(), userID, chi.URLParam(r, "id"), in.Status, in.StaffNote, in.Reply)
	if err != nil {
		switch {
		case errors.Is(err, support.ErrTicketNotFound):
			response.NotFound(w, "Dossier introuvable.")
		case errors.Is(err, support.ErrTicketClosed):
			response.Error(w, http.StatusGone, err.Error())
		case errors.Is(err, support.ErrInvalidTicket):
			response.BadRequest(w, err.Error())
		default:
			h.handleErr(w, err)
		}
		return
	}
	response.OK(w, t)
}

// GET /v1/admin/support/metrics — charge (compteurs, ancienneté, délais).
func (h *Handler) supportMetrics(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	m, err := h.svc.SupportMetrics(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, m)
}

// GET /v1/admin/support/articles — tout (brouillons inclus pour la revue).
func (h *Handler) supportArticles(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total, err := h.svc.ListSupportArticles(r.Context(), userID, limit, offset)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": total})
}

// POST /v1/admin/support/articles — crée un BROUILLON (publier = acte séparé).
// Body : { slug, titleFr, titleEn, bodyFr, bodyEn, position? }.
func (h *Handler) createSupportArticle(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Slug     string `json:"slug"`
		TitleFr  string `json:"titleFr"`
		TitleEn  string `json:"titleEn"`
		BodyFr   string `json:"bodyFr"`
		BodyEn   string `json:"bodyEn"`
		Position int    `json:"position"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Slug == "" {
		response.BadRequest(w, "JSON invalide (slug, titres et textes requis)")
		return
	}
	a, err := h.svc.CreateSupportArticle(r.Context(), userID, in.Slug, in.TitleFr, in.TitleEn, in.BodyFr, in.BodyEn, in.Position)
	if err != nil {
		if errors.Is(err, support.ErrInvalidArticle) {
			response.BadRequest(w, err.Error())
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, a)
}

// GET /v1/admin/support/articles/{id} — détail (brouillon inclus).
func (h *Handler) supportArticleDetail(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	a, err := h.svc.GetSupportArticle(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, support.ErrArticleNotFound) {
			response.NotFound(w, "Article introuvable.")
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, a)
}

// PATCH /v1/admin/support/articles/{id} — modifie (contenu, position,
// published). Champs texte vides = inchangés ; published/position : pointeurs
// (absent = inchangé — publier/dépublier est explicite).
func (h *Handler) updateSupportArticle(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		TitleFr   string `json:"titleFr"`
		TitleEn   string `json:"titleEn"`
		BodyFr    string `json:"bodyFr"`
		BodyEn    string `json:"bodyEn"`
		Position  *int   `json:"position"`
		Published *bool  `json:"published"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	a, err := h.svc.UpdateSupportArticle(r.Context(), userID, chi.URLParam(r, "id"), in.TitleFr, in.TitleEn, in.BodyFr, in.BodyEn, in.Position, in.Published)
	if err != nil {
		switch {
		case errors.Is(err, support.ErrArticleNotFound):
			response.NotFound(w, "Article introuvable.")
		case errors.Is(err, support.ErrInvalidArticle):
			response.BadRequest(w, err.Error())
		default:
			h.handleErr(w, err)
		}
		return
	}
	response.OK(w, a)
}

// PATCH /v1/admin/publications/{id} — palier email Pro (réservé superadmin).
// Body : { "emailPro": true|false }. Effet immédiat (lu en base à chaque
// rendu, sans cache). Retourne { emailPro }.
func (h *Handler) setPublicationEmailPro(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		EmailPro *bool `json:"emailPro"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.EmailPro == nil {
		response.BadRequest(w, "JSON invalide (emailPro requis)")
		return
	}
	pro, err := h.svc.SetPublicationEmailPro(r.Context(), userID, chi.URLParam(r, "id"), *in.EmailPro)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Publication introuvable.")
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"emailPro": pro})
}

// PATCH /v1/admin/users/{userID} — modération (réservé superadmin).
func (h *Handler) updateModeration(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in ModerationInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	data, err := h.svc.UpdateModeration(r.Context(), userID, chi.URLParam(r, "userID"), in)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// revokeUserSessions révoque toutes les sessions d'un compte côté fournisseur
// (y compris élevées et step-up) : compromission suspectée ou récupération
// après perte de facteurs (fiche 05 §8). Pas de révocation partielle côté
// GoTrue — le périmètre large est assumé, journalisé, et communiqué à
// l'utilisateur concerné (voir docs/ACCOUNT_RECOVERY.md).
func (h *Handler) revokeUserSessions(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	// Le rôle est vérifié dans le service (comme toutes les routes admin) :
	// sans cela, n'importe quel compte authentifié révoquerait n'importe qui.
	if err := h.svc.checkSuperadmin(r.Context(), staffID); err != nil {
		h.handleErr(w, err)
		return
	}
	if h.usersSvc == nil {
		response.Error(w, http.StatusServiceUnavailable, "Service des comptes non branché")
		return
	}
	targetID := chi.URLParam(r, "userID")
	if targetID == "" {
		response.BadRequest(w, "userID requis")
		return
	}
	if err := h.usersSvc.RevokeUserSessions(r.Context(), targetID); err != nil {
		log.Printf("[admin] revoke-sessions %s: %v", targetID, err)
		response.Error(w, http.StatusBadGateway, "Révocation impossible pour le moment")
		return
	}
	h.svc.logAudit(r.Context(), staffID, "account.sessions_revoked", "user", targetID, map[string]any{
		"scope": "all",
	})
	response.OK(w, map[string]bool{"success": true})
}

// ── Widgets & tendances ───────────────────────────────────────────────────────

// GET /v1/admin/widgets — articles + tendances + promos.
func (h *Handler) widgets(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	data, err := h.svc.GetWidgets(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// POST /v1/admin/widgets/featured — bascule l'article à la une.
func (h *Handler) setFeatured(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		ArticleID string `json:"articleId"`
		Featured  bool   `json:"featured"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.ArticleID == "" {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.SetArticleFeatured(r.Context(), userID, in.ArticleID, in.Featured); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/admin/widgets/trends — ajoute / met à jour une tendance.
func (h *Handler) addTrend(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Hashtag string `json:"hashtag"`
		Count   int32  `json:"count"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Hashtag == "" {
		response.BadRequest(w, "JSON invalide")
		return
	}
	data, err := h.svc.UpsertTrend(r.Context(), userID, in.Hashtag, in.Count)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// DELETE /v1/admin/widgets/trends/{id}
func (h *Handler) deleteTrend(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	if err := h.svc.DeleteTrend(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// PATCH /v1/admin/widgets/trends/{id} — met à jour le volume.
func (h *Handler) updateTrend(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Count int32 `json:"count"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.UpdateTrendCount(r.Context(), userID, chi.URLParam(r, "id"), in.Count); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/admin/widgets/promos — crée / met à jour une promo.
func (h *Handler) savePromo(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in PromoInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	data, err := h.svc.SavePromo(r.Context(), userID, in)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// DELETE /v1/admin/widgets/promos/{id}
func (h *Handler) deletePromo(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	if err := h.svc.DeletePromo(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// PATCH /v1/admin/widgets/promos/{id} — active / désactive.
func (h *Handler) togglePromo(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		IsActive bool `json:"isActive"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.TogglePromoActive(r.Context(), userID, chi.URLParam(r, "id"), in.IsActive); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// ── Feature flags / config / frontend / traductions ──────────────────────────

// GET /v1/admin/config?keys=a,b,c — liste des configs (toutes si keys absent).
func (h *Handler) configs(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var (
		data []SystemConfigItem
		err  error
	)
	if keysParam := r.URL.Query().Get("keys"); keysParam != "" {
		keys := splitKeys(keysParam)
		data, err = h.svc.GetSystemConfigsByKeys(r.Context(), userID, keys)
	} else {
		data, err = h.svc.ListSystemConfigs(r.Context(), userID)
	}
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// PUT /v1/admin/config — upsert d'une ou plusieurs configs.
func (h *Handler) upsertConfigs(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var items []SystemConfigItem
	if err := json.NewDecoder(r.Body).Decode(&items); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if len(items) == 0 {
		response.BadRequest(w, "Aucune config fournie")
		return
	}
	if err := h.svc.UpsertSystemConfigs(r.Context(), userID, items); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// PUT /v1/admin/reserved-identifiers/{kind} — replaces the admin-managed
// username/subdomain denylist. Values are normalized server-side.
func (h *Handler) updateReservedIdentifiers(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Values []string `json:"values"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.UpdateReservedIdentifiers(r.Context(), userID, chi.URLParam(r, "kind"), in.Values); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// DELETE /v1/admin/config/{key}
func (h *Handler) deleteConfig(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	if err := h.svc.DeleteSystemConfig(r.Context(), userID, chi.URLParam(r, "key")); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// ── OAuth ────────────────────────────────────────────────────────────────────

// GET /v1/admin/oauth/clients — applications OAuth + propriétaires.
func (h *Handler) oauthClients(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	data, err := h.svc.ListOAuthClients(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// PATCH /v1/admin/oauth/clients/{id} — approuve / rejette / révoque.
func (h *Handler) updateOAuthStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	switch in.Status {
	case "APPROVED", "REJECTED", "REVOKED", "PENDING":
	default:
		response.BadRequest(w, "Statut invalide")
		return
	}
	if err := h.svc.UpdateOAuthClientStatus(r.Context(), userID, chi.URLParam(r, "id"), in.Status); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// ── Demandes d'accès API ─────────────────────────────────────────────────────

// GET /v1/admin/api-applicants
func (h *Handler) apiApplicants(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	data, err := h.svc.ListApiApplicants(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// PATCH /v1/admin/api-applicants/{userID} — approuve / rejette / révoque,
// avec les permissions (grants) choisies par l'admin à l'approbation.
func (h *Handler) updateApiAccess(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Status string   `json:"status"`
		Grants []string `json:"grants"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	switch in.Status {
	case "approved", "rejected", "revoked", "none", "pending":
	default:
		response.BadRequest(w, "Statut invalide")
		return
	}
	if err := h.svc.UpdateApiAccessStatus(r.Context(), userID, chi.URLParam(r, "userID"), in.Status, in.Grants); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// PATCH /v1/admin/api-applicants/{userID}/grants — ajuste les permissions d'un
// créateur sans changer son statut (l'admin se réserve le droit).
func (h *Handler) updateApiGrants(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Grants []string `json:"grants"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.UpdateApiGrants(r.Context(), userID, chi.URLParam(r, "userID"), in.Grants); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// GET /v1/admin/api-access/modules — registre des permissions modulables.
func (h *Handler) apiAccessModules(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	modules, err := h.svc.GetApiAccessModules(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, modules)
}

// GET /v1/admin/audit-log — journal des actions sensibles (qui, quand, quoi).
// Query : ?limit=50 (défaut 50, max 200).
func (h *Handler) auditLog(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	entries, err := h.svc.ListAuditLogs(r.Context(), userID, int32(limit))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": entries})
}

// PATCH /v1/admin/api-access/modules — active / désactive les modules
// accordables à l'échelle de la plateforme.
func (h *Handler) updateApiAccessModules(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Enabled []string `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.UpdateApiAccessModules(r.Context(), userID, in.Enabled); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// ── Notifications & livraisons ───────────────────────────────────────────────

// GET /v1/admin/deliveries — compteurs + 50 dernières livraisons.
func (h *Handler) deliveries(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	counts, err := h.svc.GetDeliveryCounts(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	rows, err := h.svc.ListDeliveries(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"counts": counts.Counts, "total": counts.Total, "deliveries": rows})
}

// POST /v1/admin/deliveries/{id}/retry — relance une livraison en échec.
func (h *Handler) retryDelivery(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	if err := h.svc.RetryDelivery(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// splitKeys découpe une liste de clés séparées par des virgules.
func splitKeys(s string) []string {
	out := []string{}
	for _, k := range strings.Split(s, ",") {
		if k = strings.TrimSpace(k); k != "" {
			out = append(out, k)
		}
	}
	return out
}
