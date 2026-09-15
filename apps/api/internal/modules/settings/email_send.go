package settings

// =====================================================================
// ✉️ Envoi d'un email de test au créateur (POST /v1/settings/email/test)
// =====================================================================
// Le créateur vérifie dans SA boîte (Gmail, Mail.app, client texte…)
// exactement ce que ses abonnés recevront : rendu par le moteur de
// production (BuildSubscriberEmail = même code que les workers), envoi
// par le fournisseur email de la plateforme (SMTP/Resend). Le payload
// accepte les réglages en brouillon — on peut tester avant de sauvegarder.
//
// Garde-fous : authentification créateur + autorisation publication
// (authorizeSettings), fournisseur absent → 503 explicite (jamais un
// faux « envoyé »), destinataire = email du compte créateur (jamais
// arbitraire : pas de relais ouvert).

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/workers"
)

// emailTester est la surface minimale du fournisseur email utilisée ici
// (mirroir de workers.EmailProvider.Send) — testable, nil = désactivé.
type emailTester interface {
	Send(ctx context.Context, msg workers.EmailMessage) error
}

// SetEmailProvider branche le fournisseur email partagé (celui du
// serveur) et l'adresse d'expéditeur plateforme. Provider nil → l'envoi
// de test répond 503 (fonctionnalité éteinte).
func (s *Service) SetEmailTestSender(p emailTester, fromAddress string) {
	s.emailProvider = p
	s.emailFrom = fromAddress
}

// SendTestEmail rend l'email (template, locale, réglages brouillon ou
// stockés) et l'envoie à l'adresse du créateur connecté.
func (s *Service) SendTestEmail(ctx context.Context, userID, publicationID, locale, template string, draft json.RawMessage) (map[string]any, error) {
	if err := s.authorizeSettings(ctx, userID, publicationID); err != nil {
		return nil, errForbidden
	}
	if s.emailProvider == nil {
		return nil, errEmailProviderUnavailable
	}
	row, err := s.q.GetPublicationForEmailTest(ctx, publicationID)
	if err != nil {
		if errors.Is(err, pgxNoRows) {
			return nil, errNotFound
		}
		return nil, err
	}
	user, err := s.q.GetUserForSettings(ctx, userID)
	if err != nil {
		if errors.Is(err, pgxNoRows) {
			return nil, errNotFound
		}
		return nil, err
	}

	prefs := workers.ParseEmailPrefs(row.EmailSettings)
	if len(draft) > 0 {
		prefs = workers.ParseEmailPrefs(draft)
	}
	loc := workers.NormalizeEmailLocale(locale)
	tpl := template
	if tpl != workers.EmailTemplateWelcome {
		tpl = workers.EmailTemplateConfirm
	}

	mailer := workers.NewSubscriberMailer(s.emailFrom)
	msg := workers.BuildSubscriberEmail(mailer, workers.SubscriberEmailSpec{
		Template: tpl,
		Locale:   loc,
		Email:    user.Email,
		PubID:    publicationID,
		PubName:  row.PublicationName,
		PubURL:   workers.PublicationPublicURL(row.Subdomain, row.CustomDomain),
		Accent:   workers.PubAccentColor(row.AccentColor),
		LogoURL:  workers.PubLogoURL(row.LogoUrl),
	}, prefs)
	// Marquage honnête : un test reste identifiable dans la boîte.
	msg.Subject = "[TEST] " + msg.Subject
	if msg.RefID != "" {
		msg.RefID = "test-" + msg.RefID
	}

	sendCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	if err := s.emailProvider.Send(sendCtx, msg); err != nil {
		return nil, err
	}
	return map[string]any{
		"sent":     true,
		"to":       user.Email,
		"locale":   loc,
		"template": tpl,
		"subject":  msg.Subject,
	}, nil
}

// sendTestEmail est le handler HTTP (POST /v1/settings/email/test).
func (h *Handler) sendTestEmail(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var d struct {
		PublicationID string          `json:"publicationId"`
		Locale        string          `json:"locale"`
		Template      string          `json:"template"`
		Settings      json.RawMessage `json:"settings"`
	}
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		response.BadRequest(w, "Corps JSON invalide")
		return
	}
	if d.PublicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	out, err := h.svc.SendTestEmail(r.Context(), userID, d.PublicationID, d.Locale, d.Template, d.Settings)
	if err != nil {
		switch {
		case errors.Is(err, errForbidden):
			response.Forbidden(w, "Accès refusé à cette publication.")
		case errors.Is(err, errNotFound):
			response.NotFound(w, "Publication introuvable.")
		case errors.Is(err, errEmailProviderUnavailable):
			response.Error(w, http.StatusServiceUnavailable, "Aucun fournisseur email n'est configuré sur cette instance.")
		default:
			response.Error(w, http.StatusInternalServerError, "Échec de l'envoi du test : "+err.Error())
		}
		return
	}
	response.JSON(w, http.StatusOK, out)
}

// pgxNoRows évite d'importer pgx dans plusieurs fichiers : alias local.
var pgxNoRows = pgx.ErrNoRows

// errEmailProviderUnavailable : EMAIL_PROVIDER non configuré sur l'instance.
var errEmailProviderUnavailable = errors.New("email provider unavailable")
