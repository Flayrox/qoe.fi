package legal

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// Handler expose les routes légales publiques, lecteur et superadmin.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// RegisterPublic monte les routes publiques (aucune authentification).
// Le contenu publié est public par nature : CGU, confidentialité, cookies…
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/legal", h.list)
	r.Get("/v1/legal/{slug}", h.get)
	r.Get("/v1/legal/{slug}/versions", h.versions)
	// 🍪 Le choix traceurs d'un visiteur anonyme doit être journalisé même sans
	// compte : c'est la preuve légale opposable, pas un service réservé.
	r.Post("/v1/legal/cookie-consent", h.recordCookieConsent)
}

// RegisterProtected monte les routes du lecteur authentifié (JWT) :
// consentement versionné + état des consentements manquants.
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Post("/v1/legal/{slug}/accept", h.accept)
	// Acceptation par lot : fin d'onboarding, portail multi-documents.
	r.Post("/v1/legal/accept-batch", h.acceptBatch)
	r.Get("/v1/me/legal-acceptances", h.myAcceptances)
	r.Get("/v1/me/legal-pending", h.myPending)
}

// RegisterAdmin monte la console superadmin (le service revérifie le rôle :
// 403 si l'appelant n'est pas superadmin, indépendamment du groupe de routes).
func (h *Handler) RegisterAdmin(r chi.Router) {
	r.Get("/v1/admin/legal", h.adminList)
	r.Post("/v1/admin/legal", h.adminCreate)
	r.Post("/v1/admin/legal/seed", h.adminSeed)
	r.Get("/v1/admin/legal/acceptances", h.adminAcceptances)
	r.Get("/v1/admin/legal/stats", h.adminStats)
	r.Get("/v1/admin/legal/compliance", h.adminCompliance)
	r.Get("/v1/admin/legal/notices", h.adminNotices)
	r.Get("/v1/admin/legal/cookie-consents", h.adminCookieConsents)
	// 🧾 Exports signés du registre de consentement (contrôle, réquisition).
	r.Post("/v1/admin/legal/consent-exports", h.adminCreateConsentExport)
	r.Get("/v1/admin/legal/consent-exports", h.adminListConsentExports)
	r.Get("/v1/admin/legal/consent-exports/verify", h.adminVerifyConsentExports)
	// 🔄 Cycle de vie : revues périodiques et publication planifiée.
	r.Get("/v1/admin/legal/reviews", h.adminReviews)
	r.Post("/v1/admin/legal/reviews", h.adminOpenReview)
	r.Post("/v1/admin/legal/reviews/{reviewID}/dismiss", h.adminDismissReview)
	r.Post("/v1/admin/legal/versions/{versionID}/schedule", h.adminScheduleVersion)
	r.Post("/v1/admin/legal/lifecycle/run", h.adminRunLifecycle)
	r.Get("/v1/admin/legal/{id}/versions", h.adminVersions)
	r.Post("/v1/admin/legal/{id}/versions", h.adminCreateVersion)
	r.Patch("/v1/admin/legal/{id}", h.adminUpdate)
	r.Delete("/v1/admin/legal/{id}", h.adminDelete)
	r.Patch("/v1/admin/legal/versions/{versionID}", h.adminUpdateVersion)
	r.Post("/v1/admin/legal/versions/{versionID}/publish", h.adminPublish)
	r.Post("/v1/admin/legal/versions/{versionID}/archive", h.adminArchive)
	r.Delete("/v1/admin/legal/versions/{versionID}", h.adminDeleteDraft)
}

// ─── Public ──────────────────────────────────────────────────────────

// GET /v1/legal?locale=fr — sommaire public.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	docs, err := h.svc.ListPublished(r.Context(), localeOf(r))
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, map[string]any{"items": docs, "count": len(docs)})
}

// GET /v1/legal/{slug}?locale=fr — contenu publié complet (markdown).
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	doc, err := h.svc.GetPublished(r.Context(), chi.URLParam(r, "slug"), localeOf(r))
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, doc)
}

// GET /v1/legal/{slug}/versions?locale=fr — historique public (transparence).
func (h *Handler) versions(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.ListVersions(r.Context(), chi.URLParam(r, "slug"), localeOf(r))
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items})
}

// ─── Lecteur authentifié ─────────────────────────────────────────────

// POST /v1/legal/{slug}/accept — preuve de consentement (idempotent).
func (h *Handler) accept(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var body struct {
		Locale string `json:"locale"`
		Source string `json:"source"`
		Method string `json:"method"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	locale := body.Locale
	if strings.TrimSpace(locale) == "" {
		locale = localeOf(r)
	}
	acc, err := h.svc.Accept(r.Context(), userID, chi.URLParam(r, "slug"), AcceptInput{
		Locale:    locale,
		Source:    body.Source,
		Method:    body.Method,
		IP:        clientIP(r),
		UserAgent: r.UserAgent(),
	})
	if err != nil {
		h.fail(w, err)
		return
	}
	response.Created(w, acc)
}

// GET /v1/me/legal-acceptances — historique de consentement du lecteur.
func (h *Handler) myAcceptances(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	items, err := h.svc.UserAcceptances(r.Context(), userID)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items})
}

// GET /v1/me/legal-pending — documents à (re)consentir.
func (h *Handler) myPending(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	items, err := h.svc.PendingAcceptances(r.Context(), userID, localeOf(r))
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "count": len(items)})
}

// POST /v1/legal/accept-batch — accepte d'un coup plusieurs documents
// (onboarding créateur, portail). Authentification requise.
func (h *Handler) acceptBatch(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var body struct {
		Locale string   `json:"locale"`
		Source string   `json:"source"`
		Method string   `json:"method"`
		Slugs  []string `json:"slugs"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	if strings.TrimSpace(body.Locale) == "" {
		body.Locale = localeOf(r)
	}
	items, err := h.svc.AcceptBatch(r.Context(), userID, AcceptBatchInput{
		Locale: body.Locale, Source: body.Source, Method: body.Method, Slugs: body.Slugs,
		IP: clientIP(r), UserAgent: r.UserAgent(),
	})
	if err != nil {
		h.fail(w, err)
		return
	}
	response.Created(w, map[string]any{"items": items, "count": len(items)})
}

// POST /v1/legal/cookie-consent — journalise un choix de traceurs. Accessible
// sans compte : la preuve existe pour un visiteur anonyme. Si la requête porte
// un JWT valide, la ligne est rattachée au compte.
func (h *Handler) recordCookieConsent(w http.ResponseWriter, r *http.Request) {
	var body CookieConsentInput
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.BadRequest(w, "JSON invalide")
			return
		}
	}
	body.IP = clientIP(r)
	body.UserAgent = r.UserAgent()
	body.Country = countryFromRequest(r)
	if userID, ok := middleware.UserID(r.Context()); ok {
		body.UserID = userID
	}
	receipt, err := h.svc.RecordCookieConsent(r.Context(), body)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.Created(w, receipt)
}

// ─── Superadmin ──────────────────────────────────────────────────────

func (h *Handler) adminList(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	items, err := h.svc.AdminList(r.Context(), actor)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "count": len(items)})
}

func (h *Handler) adminCreate(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	var in SaveDocumentInput
	if !decode(w, r, &in) {
		return
	}
	doc, err := h.svc.CreateDocument(r.Context(), actor, in)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.Created(w, doc)
}

func (h *Handler) adminUpdate(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	var in SaveDocumentInput
	if !decode(w, r, &in) {
		return
	}
	doc, err := h.svc.UpdateDocument(r.Context(), actor, chi.URLParam(r, "id"), in)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, doc)
}

func (h *Handler) adminDelete(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	if err := h.svc.DeleteDocument(r.Context(), actor, chi.URLParam(r, "id")); err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, map[string]any{"success": true})
}

func (h *Handler) adminVersions(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	items, err := h.svc.AdminVersions(r.Context(), actor, chi.URLParam(r, "id"))
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items})
}

func (h *Handler) adminCreateVersion(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	var in SaveVersionInput
	if !decode(w, r, &in) {
		return
	}
	v, err := h.svc.CreateVersion(r.Context(), actor, chi.URLParam(r, "id"), in)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.Created(w, v)
}

func (h *Handler) adminUpdateVersion(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	var in SaveVersionInput
	if !decode(w, r, &in) {
		return
	}
	v, err := h.svc.UpdateVersion(r.Context(), actor, chi.URLParam(r, "versionID"), in)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, v)
}

func (h *Handler) adminPublish(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	v, err := h.svc.PublishVersion(r.Context(), actor, chi.URLParam(r, "versionID"))
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, v)
}

func (h *Handler) adminArchive(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	v, err := h.svc.ArchiveVersion(r.Context(), actor, chi.URLParam(r, "versionID"))
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, v)
}

func (h *Handler) adminDeleteDraft(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	if err := h.svc.DeleteDraft(r.Context(), actor, chi.URLParam(r, "versionID")); err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, map[string]any{"success": true})
}

func (h *Handler) adminAcceptances(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	limit := int32(100)
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = int32(n)
		}
	}
	items, err := h.svc.AdminAcceptances(r.Context(), actor, r.URL.Query().Get("slug"), limit)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "count": len(items)})
}

func (h *Handler) adminStats(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	items, err := h.svc.AdminStats(r.Context(), actor)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items})
}

// GET /v1/admin/legal/compliance — photographie de conformité (couverture,
// documents sans version publiée, échéances réglementaires).
func (h *Handler) adminCompliance(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	snapshot, err := h.svc.Compliance(r.Context(), actor)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, snapshot)
}

// GET /v1/admin/legal/notices — campagnes d'information déclenchées par les
// publications (avec l'état d'envoi de chaque destinataire).
func (h *Handler) adminNotices(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	limit := int32(50)
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = int32(n)
		}
	}
	items, err := h.svc.AdminNotices(r.Context(), actor, limit)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "count": len(items)})
}

// GET /v1/admin/legal/cookie-consents — journal des choix de traceurs.
func (h *Handler) adminCookieConsents(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	limit := int32(100)
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = int32(n)
		}
	}
	items, err := h.svc.ListCookieConsentRecords(r.Context(), actor, r.URL.Query().Get("consentId"), limit)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "count": len(items)})
}

// POST /v1/admin/legal/consent-exports — produit un export signé du registre
// (acceptations, versions, journal des traceurs).
//
// La réponse est écrite telle quelle, octet pour octet : l'empreinte du
// contenu est calculée sur ces octets, et laisser le framework re-sérialiser
// le document casserait la preuve.
func (h *Handler) adminCreateConsentExport(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	var in ConsentExportInput
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&in)
	}
	result, err := h.svc.ExportConsentRegister(r.Context(), actor, in)
	if err != nil {
		h.fail(w, err)
		return
	}
	stamp := time.Now().UTC().Format("20060102-150405")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"qoe-consentements-%s.json\"", stamp))
	w.Header().Set("X-Qoe-Export-Id", result.Record.ID)
	w.Header().Set("X-Qoe-Export-Chain", result.Record.ChainSha256)
	w.WriteHeader(http.StatusCreated)
	_, _ = w.Write(result.Document)
}

// GET /v1/admin/legal/consent-exports — registre des exports produits.
func (h *Handler) adminListConsentExports(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	limit := int32(50)
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = int32(n)
		}
	}
	items, err := h.svc.ListConsentExports(r.Context(), actor, limit)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "count": len(items)})
}

// GET /v1/admin/legal/consent-exports/verify — recompte la chaîne des exports.
func (h *Handler) adminVerifyConsentExports(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	verdict, err := h.svc.VerifyConsentExports(r.Context(), actor)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, verdict)
}

// GET /v1/admin/legal/reviews — revues périodiques suivies.
func (h *Handler) adminReviews(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	limit := int32(100)
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = int32(n)
		}
	}
	items, err := h.svc.AdminReviews(r.Context(), actor, limit)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "count": len(items)})
}

// POST /v1/admin/legal/reviews — programme une revue à la demande.
func (h *Handler) adminOpenReview(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	var body struct {
		Slug  string `json:"slug"`
		DueAt string `json:"dueAt"`
		Notes string `json:"notes"`
	}
	if !decode(w, r, &body) {
		return
	}
	review, err := h.svc.OpenReview(r.Context(), actor, body.Slug, body.DueAt, body.Notes)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.Created(w, review)
}

// POST /v1/admin/legal/reviews/{reviewID}/dismiss — clôt une revue sans
// publication (un motif est exigé : c'est une décision, pas une disparition).
func (h *Handler) adminDismissReview(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	var body struct {
		Notes string `json:"notes"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	review, err := h.svc.DismissReview(r.Context(), actor, chi.URLParam(r, "reviewID"), body.Notes)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, review)
}

// POST /v1/admin/legal/versions/{versionID}/schedule — programme (ou annule)
// la publication automatique d'un brouillon.
func (h *Handler) adminScheduleVersion(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	var body struct {
		ScheduledAt string `json:"scheduledAt"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	version, err := h.svc.ScheduleVersion(r.Context(), actor, chi.URLParam(r, "versionID"), body.ScheduledAt)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, version)
}

// POST /v1/admin/legal/lifecycle/run — déclenche un passage du cycle sans
// attendre le worker (audit, mise à jour volontaire, rattrapage).
func (h *Handler) adminRunLifecycle(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	if _, err := h.svc.RequireSuperadmin(r.Context(), actor); err != nil {
		h.fail(w, err)
		return
	}
	run, err := h.svc.RunLifecycle(r.Context(), time.Now())
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, run)
}

// POST /v1/admin/legal/seed — installe les documents manquants depuis le
// contenu embarqué (idempotent : ne touche jamais à une version existante).
func (h *Handler) adminSeed(w http.ResponseWriter, r *http.Request) {
	actor := h.actor(w, r)
	if actor == "" {
		return
	}
	res, err := h.svc.SeedDefaults(r.Context(), actor)
	if err != nil {
		h.fail(w, err)
		return
	}
	response.OK(w, res)
}

// ─── Helpers ─────────────────────────────────────────────────────────

// actor extrait l'utilisateur authentifié ou écrit un 401.
func (h *Handler) actor(w http.ResponseWriter, r *http.Request) string {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return ""
	}
	return userID
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		response.BadRequest(w, "JSON invalide")
		return false
	}
	return true
}

// localeOf résout la locale : ?locale= puis Accept-Language, défaut fr.
func localeOf(r *http.Request) string {
	if raw := strings.TrimSpace(r.URL.Query().Get("locale")); raw != "" {
		return NormalizeLocale(raw)
	}
	if raw := r.Header.Get("Accept-Language"); raw != "" {
		return NormalizeLocale(strings.Split(raw, ",")[0])
	}
	return "fr"
}

// countryFromRequest lit le pays propagé par le proxy (Cloudflare / Caddy)
// quand il existe. Jamais déduit d'une base GeoIP locale : absent = absent.
func countryFromRequest(r *http.Request) string {
	for _, header := range []string{"CF-IPCountry", "X-Country-Code"} {
		if v := strings.TrimSpace(r.Header.Get(header)); v != "" && len(v) <= 2 {
			return strings.ToUpper(v)
		}
	}
	return ""
}

// clientIP privilégie l'IP réelle (middleware.RealIP) puis X-Forwarded-For.
func clientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		return strings.TrimSpace(strings.Split(fwd, ",")[0])
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i > 0 {
		host = host[:i]
	}
	return host
}

// fail mappe les erreurs du service vers les codes HTTP du contrat API.
func (h *Handler) fail(w http.ResponseWriter, err error) {
	switch {
	case err == nil:
		return
	case IsForbidden(err):
		response.Forbidden(w, "Accès réservé au superadmin.")
	case IsNotFound(err), errors.Is(err, errNotFound):
		response.NotFound(w, "Document juridique introuvable.")
	case IsConflict(err):
		response.Error(w, http.StatusConflict, err.Error())
	case IsInvalid(err):
		response.BadRequest(w, err.Error())
	default:
		log.Printf("[legal] %v", err)
		response.Error(w, http.StatusInternalServerError, "Erreur interne")
	}
}
