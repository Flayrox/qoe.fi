package features

import (
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterProtected monte la mesure d'intérêt et les préférences de promesse.
// Routes protégées : l'attribution (créateur / média) vient du jeton, jamais
// du corps de la requête.
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Route("/v1/features", func(r chi.Router) {
		r.Post("/signals", h.record)
		r.Get("/signals/summary", h.summary)
		r.Get("/signals/state", h.state)
		r.Get("/catalog", h.catalog)
		r.Post("/interests/unsubscribe", h.unsubscribeOwn)
	})
}

// RegisterPublic monte le retrait depuis un email : GET pour la page de
// confirmation, POST pour le one-click RFC 8058 et le formulaire. Aucun email
// dans l'URL, seulement un jeton signé.
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/features/unsubscribe", h.unsubscribePage)
	r.Post("/v1/features/unsubscribe", h.unsubscribePublic)
}

type signalRequest struct {
	Feature     string `json:"feature"`
	Kind        string `json:"kind"`
	Source      string `json:"source"`
	PublisherID string `json:"publisherId"`
}

// userID exige une identité exploitable : la route est montée derrière le
// middleware protégé, et un identifiant non-UUID écrivait des signaux
// inexploitables (colonne TEXT, aucun contrôle) au lieu d'être refusé.
func (h *Handler) userID(w http.ResponseWriter, r *http.Request) (string, bool) {
	uid, ok := middleware.UserID(r.Context())
	if !ok || uid == "" {
		response.Unauthorized(w, "Authentification requise")
		return "", false
	}
	if _, err := uuid.Parse(uid); err != nil {
		response.Unauthorized(w, "Session invalide")
		return "", false
	}
	return uid, true
}

func (h *Handler) record(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	var body signalRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	notified, err := h.svc.Record(r.Context(), userID, SignalInput{
		FeatureKey:  body.Feature,
		Kind:        body.Kind,
		Source:      body.Source,
		PublisherID: body.PublisherID,
	})
	switch {
	case errors.Is(err, ErrInvalidSignal):
		response.ErrorCode(w, http.StatusBadRequest, "invalid_signal", "signal de fonctionnalité invalide")
		return
	case errors.Is(err, ErrForbidden):
		response.Forbidden(w, "Publisher inaccessible")
		return
	case errors.Is(err, ErrFeatureUnavailable):
		response.ErrorCode(w, http.StatusConflict, "notify_closed", "les notifications sont fermées pour cette fonctionnalité")
		return
	case err != nil:
		log.Printf("[features] record: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"success": true, "notified": notified})
}

// state renvoie les fonctionnalités déjà demandées par l'appelant, pour que
// l'annonce n'affiche pas « me prévenir » après un rechargement de page.
func (h *Handler) state(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	features, err := h.svc.NotifiedFeatures(r.Context(), userID)
	if err != nil {
		log.Printf("[features] state: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"features": features})
}

// catalog expose l'état serveur : le client peut masquer une promesse que le
// serveur refuserait (paused, retired, notifyEnabled=false).
func (h *Handler) catalog(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	features, err := h.svc.States(r.Context(), userID)
	if err != nil {
		log.Printf("[features] catalog: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"features": features})
}

func (h *Handler) summary(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	publisherID := r.URL.Query().Get("publisherId")
	if publisherID == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	signals, err := h.svc.Summary(r.Context(), userID, publisherID)
	switch {
	case errors.Is(err, ErrInvalidSignal):
		response.BadRequest(w, "publisherId invalide")
		return
	case errors.Is(err, ErrForbidden):
		response.Forbidden(w, "Permission insuffisante")
		return
	case err != nil:
		log.Printf("[features] summary: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"signals": signals})
}

func (h *Handler) unsubscribeOwn(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	var body struct {
		Feature string `json:"feature"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide (feature requise)")
		return
	}
	// Une clé mal formée est une entrée invalide (400), pas « aucune promesse »
	// (404) : l'ancien chemin exécutait une requête pour n'importe quelle
	// chaîne, y compris de plusieurs kilo-octets.
	feature := strings.TrimSpace(body.Feature)
	if len(feature) == 0 || len(feature) > maxFeatureKeyLen || !featureKeyPattern.MatchString(feature) {
		response.BadRequest(w, "feature invalide")
		return
	}
	if err := h.svc.UnsubscribeForUser(r.Context(), userID, feature); err != nil {
		if errors.Is(err, ErrFeatureUnavailable) {
			response.NotFound(w, "Aucune promesse active pour cette fonctionnalité")
			return
		}
		log.Printf("[features] unsubscribe own: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// unsubscribePage rend la page de confirmation. Le GET ne modifie RIEN : les
// clients mail et les scanners de liens préchargent les URLs des emails, ce qui
// désabonnait l'utilisateur sans qu'il ait cliqué. Le retrait passe par le
// formulaire (POST) ou par le one-click RFC 8058 du client mail.
func (h *Handler) unsubscribePage(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		h.renderPage(w, http.StatusBadRequest, "Lien incomplet",
			"Ce lien de désabonnement est incomplet. Utilisez le lien fourni dans l'email.")
		return
	}
	h.renderPage(w, http.StatusOK, "Se désabonner ?",
		`<p>Confirmez le retrait des emails de lancement de cette fonctionnalité.</p>`+
			`<form method="post" action="/v1/features/unsubscribe?token=`+html.EscapeString(token)+`">`+
			`<button type="submit" style="font:inherit;padding:.7rem 1.2rem;border-radius:.5rem;border:0;background:#111;color:#fff;cursor:pointer">Confirmer le désabonnement</button>`+
			`</form><p><small>You can also confirm in English; this only stops launch emails for this feature.</small></p>`)
}

func (h *Handler) unsubscribePublic(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	featureKey, err := h.svc.Unsubscribe(r.Context(), token)
	if err != nil {
		if errors.Is(err, ErrUnsubscribeInvalid) {
			if wantsHTML(r) {
				h.renderPage(w, http.StatusBadRequest, "Lien invalide",
					"Ce lien de désabonnement est invalide ou expiré.")
				return
			}
			response.BadRequest(w, "Lien de désabonnement invalide ou expiré")
			return
		}
		log.Printf("[features] unsubscribe public: %v", err)
		response.Internal(w)
		return
	}
	if wantsHTML(r) {
		h.renderPage(w, http.StatusOK, "C'est noté.",
			fmt.Sprintf(`<p>Vous ne recevrez plus d'email de lancement pour <strong>%s</strong>.</p>`+
				`<p>You will no longer receive launch emails for this feature.</p>`, html.EscapeString(featureKey)))
		return
	}
	// One-click RFC 8058 : la réponse reste un petit JSON pour les clients mail.
	response.OK(w, map[string]any{"success": true, "feature": featureKey})
}

func wantsHTML(r *http.Request) bool {
	return strings.Contains(r.Header.Get("Accept"), "text/html")
}

// renderPage écrit une page autonome (aucune dépendance au design system : le
// lien peut être ouvert hors application). Aucune donnée personnelle, donc pas
// de cache intermédiaire.
func (h *Handler) renderPage(w http.ResponseWriter, status int, title, body string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = fmt.Fprintf(w, `<!doctype html><html lang="fr"><meta charset="utf-8">`+
		`<meta name="viewport" content="width=device-width,initial-scale=1">`+
		`<title>%s</title><body style="font-family:system-ui;max-width:42rem;margin:4rem auto;padding:0 1rem">`+
		`<h1>%s</h1>%s</body></html>`, html.EscapeString(title), html.EscapeString(title), body)
}
