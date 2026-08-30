package users

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Register — routes authentifiées (profil lecteur). À monter dans le groupe
// protégé de main.go. Les routes /v1/me* n'entrent pas en conflit avec le
// module creator (qui expose /v1/users/me et /v1/users/{username}).
func (h *Handler) Register(r chi.Router) {
	r.Get("/v1/me", h.me)
	r.Get("/v1/me/identity", h.identity)
	r.Get("/v1/me/mfa", h.mfa)
	r.Post("/v1/me/mfa/totp/enroll", h.mfaEnroll)
	r.Post("/v1/me/mfa/totp/verify", h.mfaVerify)
	r.Delete("/v1/me/mfa/totp/{factorId}", h.mfaUnenroll)
	r.Post("/v1/me/email-change", h.changeEmail)
	r.Post("/v1/me/password-change", h.changePassword)
	r.Get("/v1/me/sessions", h.sessions)
	r.Delete("/v1/me/sessions/{id}", h.revokeSession)
	r.Post("/v1/me/sessions/revoke-others", h.revokeOtherSessions)
	r.Post("/v1/me/sessions/revoke-all", h.revokeAllSessions)
	r.Patch("/v1/me/profile", h.updateProfile)
	r.Get("/v1/me/media/{mediaId}", h.mediaPublication)
	r.Get("/v1/me/billing", h.billing)
	r.Post("/v1/me/onboarding-complete", h.onboardingComplete)
	r.Get("/v1/me/data-export", h.dataExport)
	r.Get("/v1/me/publication", h.myPublication)
	r.Get("/v1/me/muted-words", h.listMutedWords)
	r.Post("/v1/me/muted-words", h.toggleMuteWord)
	r.Post("/v1/me/wallet/unlock", h.walletUnlock)
	r.Post("/v1/me/sync", h.syncUser)
}

// RegisterPublic — GET /v1/users/search (autocomplétion mentions @, auth
// optionnelle). À monter DIRECTEMENT sur le routeur racine : monté via un
// groupe protégé (sous-mux), le wildcard public du module creator
// (/v1/users/{username}) le masquerait (priorité basse des sous-mux chi).
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/users/search", h.search)
}

// GET /v1/me — profil lecteur complet (remplace getRequestDbUser Prisma).
func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	profile, err := h.svc.Profile(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Utilisateur introuvable")
			return
		}
		response.Internal(w)
		return
	}
	response.OK(w, profile)
}

type profilePatch struct {
	Name           *string `json:"name"`
	Username       *string `json:"username"`
	OnboardingText *string `json:"onboardingText"`
	LogoURL        *string `json:"logoUrl"`
	Pronouns       *string `json:"pronouns"`
}

// PATCH /v1/me/profile — mise à jour du profil lecteur (profil réglages).
func (h *Handler) updateProfile(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var patch profilePatch
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	profile, err := h.svc.UpdateProfile(r.Context(), userID,
		deref(patch.Name), deref(patch.Username), deref(patch.OnboardingText),
		deref(patch.LogoURL), deref(patch.Pronouns))
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(w, profile)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

type sensitiveAuthInput struct {
	CurrentPassword string `json:"currentPassword"`
}

func (h *Handler) identity(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	identity, err := h.svc.Identity(r.Context(), userID)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, identity)
}

func (h *Handler) mfa(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	data, err := h.svc.MFA(r.Context(), userID, r.Header.Get("Authorization"))
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, data)
}
func (h *Handler) mfaEnroll(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	data, err := h.svc.MFARequest(r.Context(), userID, r.Header.Get("Authorization"), "POST", "/auth/v1/factors", map[string]any{"factor_type": "totp", "friendly_name": "qoe.fi"})
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(w, data)
}
func (h *Handler) mfaVerify(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var in map[string]any
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	path, _ := in["path"].(string)
	if path == "" {
		response.BadRequest(w, "path requis")
		return
	}
	delete(in, "path")
	data, err := h.svc.MFARequest(r.Context(), userID, r.Header.Get("Authorization"), "POST", path, in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(w, data)
}
func (h *Handler) mfaUnenroll(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	path := "/auth/v1/factors/" + chi.URLParam(r, "factorId")
	if err := h.svc.MFADelete(r.Context(), userID, r.Header.Get("Authorization"), path); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

func (h *Handler) sessions(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	token := r.Header.Get("Authorization")
	token = strings.TrimPrefix(token, "Bearer ")
	data, err := h.svc.Sessions(r.Context(), userID, token)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"sessions": data})
}
func (h *Handler) revokeSession(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	if err := h.svc.RevokeSession(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		response.NotFound(w, err.Error())
		return
	}
	response.OK(w, map[string]bool{"success": true})
}
func (h *Handler) revokeAllSessions(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	if err := h.svc.RevokeAllSessions(r.Context(), userID); err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}
func (h *Handler) revokeOtherSessions(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if err := h.svc.RevokeOtherSessions(r.Context(), userID, token); err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

func (h *Handler) changeEmail(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var in struct {
		sensitiveAuthInput
		NewEmail string `json:"newEmail"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.ChangeEmail(r.Context(), userID, in.CurrentPassword, in.NewEmail); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(w, map[string]bool{"success": true, "verificationRequired": true})
}

func (h *Handler) changePassword(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var in struct {
		sensitiveAuthInput
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.ChangePassword(r.Context(), userID, in.CurrentPassword, in.NewPassword); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	_, _ = middleware.UserID(r.Context())
	query := r.URL.Query().Get("q")
	if len(query) < 2 {
		response.OK(w, []Contributor{})
		return
	}
	// excludeIds: comma-separated ?excludeIds=id1,id2 ou répété ?excludeIds=id1&excludeIds=id2
	var excludeIds []string
	for _, v := range r.URL.Query()["excludeIds"] {
		if v == "" {
			continue
		}
		// support JSON array string
		var arr []string
		if err := json.Unmarshal([]byte(v), &arr); err == nil && len(arr) > 0 {
			excludeIds = append(excludeIds, arr...)
			continue
		}
		// comma-separated
		for _, part := range splitComma(v) {
			if part != "" {
				excludeIds = append(excludeIds, part)
			}
		}
	}
	for _, v := range r.URL.Query()["excludeId"] {
		if v != "" {
			excludeIds = append(excludeIds, v)
		}
	}
	results, err := h.svc.SearchForContributors(r.Context(), query, excludeIds)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, results)
}

func splitComma(s string) []string {
	var out []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			out = append(out, s[start:i])
			start = i + 1
		}
	}
	return out
}

// GET /v1/me/billing — portefeuille + transactions + abonnements premium
// actifs du lecteur (page billing de core).
func (h *Handler) billing(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	data, err := h.svc.Billing(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Utilisateur introuvable")
			return
		}
		response.Internal(w)
		return
	}
	response.OK(w, data)
}

// POST /v1/me/onboarding-complete — finalise l'onboarding lecteur
// (profil + embedding + mots masqués + suivis) — parité completeOnboardingInDb.
func (h *Handler) onboardingComplete(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var in struct {
		Interests        []string `json:"interests"`
		Subtopics        []string `json:"subtopics"`
		OnboardingText   string   `json:"onboardingText"`
		MutedWords       []string `json:"mutedWords"`
		CreatorsToFollow []string `json:"creatorsToFollow"`
		Gender           string   `json:"gender"`
		AgeRange         string   `json:"ageRange"`
		Pronouns         string   `json:"pronouns"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.OnboardingComplete(r.Context(), userID, OnboardingCompleteInput{
		Interests: in.Interests, Subtopics: in.Subtopics, OnboardingText: in.OnboardingText,
		MutedWords: in.MutedWords, CreatorsToFollow: in.CreatorsToFollow,
		Gender: in.Gender, AgeRange: in.AgeRange, Pronouns: in.Pronouns,
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Utilisateur introuvable")
			return
		}
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// GET /v1/me/data-export — export complet du compte (GDPR), JSON brut.
func (h *Handler) dataExport(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	data, err := h.svc.DataExport(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Utilisateur introuvable")
			return
		}
		response.Internal(w)
		return
	}
	response.OK(w, data)
}

// GET /v1/me/media/{mediaId} — publication d'un média pour lequel l'utilisateur
// est membre actif (résolution du workspace MEDIA du dashboard créateur).
func (h *Handler) mediaPublication(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	mediaID := chi.URLParam(r, "mediaId")
	pubID, err := h.svc.MediaPublicationForUser(r.Context(), userID, mediaID)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]string{"publicationId": pubID})
}

// GET /v1/me/publication — publication personnelle (créée si absente).
// Remplace publications.getOrCreatePersonalPublication (web).
func (h *Handler) myPublication(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	pubID, err := h.svc.GetOrCreatePersonalPublication(r.Context(), userID)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]string{"publicationId": pubID})
}

// GET /v1/me/muted-words — liste tous les mots masqués de l'utilisateur.
func (h *Handler) listMutedWords(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	words, err := h.svc.ListMutedWords(r.Context(), userID)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string][]string{"words": words})
}

// POST /v1/me/muted-words — bascule un mot masqué. Body : { word }.
func (h *Handler) toggleMuteWord(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var body struct {
		Word string `json:"word"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	muted, word, err := h.svc.ToggleMuteWord(r.Context(), userID, body.Word)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]any{"muted": muted, "word": word})
}

// POST /v1/me/sync — crée/met à jour la ligne User depuis les claims JWT
// (parité syncUserFromAuth Prisma, utilisé par les routes /auth/callback).
func (h *Handler) syncUser(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	claims := middleware.Claims(r.Context())
	created, needsOnboarding, err := h.svc.SyncUserFromAuth(r.Context(), userID, claims)
	if err != nil {
		log.Printf("[users] syncUser error (user=%s): %v", userID, err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"created": created, "needsOnboarding": needsOnboarding})
}

// POST /v1/me/wallet/unlock — débloque un article via le wallet.
// Body : { creatorId (publicationId), costCents? }.
func (h *Handler) walletUnlock(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var body struct {
		CreatorID string `json:"creatorId"`
		CostCents *int   `json:"costCents,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if body.CreatorID == "" {
		response.BadRequest(w, "creatorId requis")
		return
	}
	cost := 200
	if body.CostCents != nil {
		cost = *body.CostCents
	}
	code, err := h.svc.UnlockArticleWithWallet(r.Context(), userID, body.CreatorID, cost)
	if err != nil {
		response.Internal(w)
		return
	}
	if code != "" {
		response.BadRequest(w, code)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}
