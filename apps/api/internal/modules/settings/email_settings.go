package settings

// =====================================================================
// 📧 Réglages email transactionnels par publication
// =====================================================================
// Les créateurs personnalisent les emails automatiques envoyés à leurs
// abonnés (confirmation double opt-in, bienvenue) via
//   GET  /v1/settings/email?publicationId=…
//   PATCH /v1/settings/email  { publicationId, settings }
//
// Ce qui se règle : nom d'expéditeur, reply-to, couleur d'accent des
// boutons, logo d'en-tête, sujets et textes d'aperçu par email (fr/en),
// note de pied de page, corps du bienvenue (fr/en) et activation de
// l'email de bienvenue. La langue d'AFFICHAGE, elle, suit chaque abonné
// (Subscriber.locale, captée à l'inscription).
//
// La validation est faite par workers.ParseEmailPrefs (source de vérité
// unique, bornes strictes) : toute valeur invalide est ignorée, jamais
// bloquante. Ce qui est stocké est la version assainie.

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/workers"
)

// GetEmailSettings renvoie l'identité par défaut de la publication
// (pré-remplissage du formulaire) et les réglages email assainis.
func (s *Service) GetEmailSettings(ctx context.Context, userID, publicationID string) (map[string]any, error) {
	if err := s.authorizeSettings(ctx, userID, publicationID); err != nil {
		return nil, errForbidden
	}
	row, err := s.q.GetPublicationEmailDefaults(ctx, publicationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errNotFound
		}
		return nil, err
	}
	clean := workers.ParseEmailPrefs(row.EmailSettings)
	out := map[string]any{
		"publicationName": row.Name,
		"emailSettings":   clean,
	}
	if row.AccentColor.Valid && row.AccentColor.String != "" {
		out["accentColor"] = row.AccentColor.String
	}
	if row.LogoUrl.Valid && row.LogoUrl.String != "" {
		out["logoUrl"] = row.LogoUrl.String
	}
	return out, nil
}

// UpdateEmailSettings valide et enregistre les réglages email d'une
// publication (PATCH partiel : les champs absents retombent sur les
// défauts plateforme localisés).
func (s *Service) UpdateEmailSettings(ctx context.Context, userID, publicationID string, raw json.RawMessage) (map[string]any, error) {
	if err := s.authorizeSettings(ctx, userID, publicationID); err != nil {
		return nil, errForbidden
	}
	clean := workers.ParseEmailPrefs(raw)
	b, err := json.Marshal(clean)
	if err != nil {
		return nil, err
	}
	if err := s.q.UpdatePublicationEmailSettings(ctx, db.UpdatePublicationEmailSettingsParams{
		PublicationID: publicationID,
		EmailSettings: b,
	}); err != nil {
		return nil, err
	}
	return map[string]any{"emailSettings": clean}, nil
}

// ── Handlers HTTP ────────────────────────────────────────────────────

func (h *Handler) getEmailSettings(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	publicationID := r.URL.Query().Get("publicationId")
	if publicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	out, err := h.svc.GetEmailSettings(r.Context(), userID, publicationID)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès refusé à cette publication.")
			return
		}
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Publication introuvable")
			return
		}
		response.Internal(w)
		return
	}
	response.OK(w, out)
}

func (h *Handler) updateEmailSettings(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var body struct {
		PublicationID string          `json:"publicationId"`
		Settings      json.RawMessage `json:"settings"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if body.PublicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	out, err := h.svc.UpdateEmailSettings(r.Context(), userID, body.PublicationID, body.Settings)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès refusé à cette publication.")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, out)
}
