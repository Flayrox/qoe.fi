package workers

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"os"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/qoefi/api/internal/queue"
)

// SecurityAlertWorker envoie les alertes de sécurité critiques par email
// (nouvelle connexion, changement d'email/mot de passe/MFA, gestion de clé API,
// mise en quarantaine lecture seule).
type SecurityAlertWorker struct {
	pool     *pgxpool.Pool
	provider EmailProvider
	from     string
}

// NewSecurityAlertWorker crée le worker d'alertes de sécurité.
func NewSecurityAlertWorker(pool *pgxpool.Pool) *SecurityAlertWorker {
	return &SecurityAlertWorker{pool: pool}
}

// SetEmailProvider branche le fournisseur email partagé (nil → inactif).
func (w *SecurityAlertWorker) SetEmailProvider(p EmailProvider, from string) {
	w.provider = p
	w.from = from
}

func (w *SecurityAlertWorker) fromAddress() string {
	if w.from != "" {
		return w.from
	}
	return "noreply@qoe.fi"
}

// HandleSecurityAlert traite une tâche asynq security.alert_email.
func (w *SecurityAlertWorker) HandleSecurityAlert(ctx context.Context, t *asynq.Task) error {
	var p queue.SecurityAlertEmailPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("security alert payload invalide: %w", err)
	}
	if w.provider == nil {
		log.Printf("[security-alert] EMAIL_PROVIDER non configuré, alerte ignorée (%s)", p.EventType)
		return nil
	}

	to := strings.TrimSpace(p.Email)
	if to == "" && w.pool != nil && p.UserID != "" {
		_ = w.pool.QueryRow(ctx, `SELECT COALESCE(email, '') FROM "User" WHERE id = $1::uuid`, p.UserID).Scan(&to)
	}
	if to == "" {
		return nil
	}

	subject, headline, detail := formatSecurityAlertCopy(p)
	studioURL := strings.TrimRight(os.Getenv("STUDIO_URL"), "/")
	if studioURL == "" {
		studioURL = "https://studio.qoe.fi"
	}
	auditURL := studioURL + "/settings#security-audit"

	occurred := p.Occurred
	if occurred == "" {
		occurred = time.Now().UTC().Format(time.RFC3339)
	}

	var metaRows strings.Builder
	metaRows.WriteString(fmt.Sprintf("<li><strong>Date (UTC) :</strong> %s</li>", html.EscapeString(occurred)))
	if p.IPSubnet != "" {
		metaRows.WriteString(fmt.Sprintf("<li><strong>Sous-réseau IP :</strong> %s</li>", html.EscapeString(p.IPSubnet)))
	}
	if p.UserAgent != "" {
		metaRows.WriteString(fmt.Sprintf("<li><strong>Appareil / client :</strong> %s</li>", html.EscapeString(p.UserAgent)))
	}
	if p.Reason != "" {
		metaRows.WriteString(fmt.Sprintf("<li><strong>Motif :</strong> %s</li>", html.EscapeString(p.Reason)))
	}

	htmlBody := fmt.Sprintf(`<!doctype html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.5; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="margin: 0 0 12px; font-size: 18px;">%s</h2>
  <p style="margin: 0 0 16px;">%s</p>
  <ul style="margin: 0 0 20px; padding-left: 18px; color: #374151; font-size: 14px;">%s</ul>
  <p style="margin: 0 0 20px;">
    <a href="%s" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-size: 14px; font-weight: 500;">Vérifier mon activité de sécurité</a>
  </p>
  <p style="margin: 0; font-size: 12px; color: #6b7280;">Si vous n'êtes pas à l'origine de cette action, révoquez vos sessions et vos clés API immédiatement depuis vos paramètres.</p>
</body>
</html>`,
		html.EscapeString(headline),
		html.EscapeString(detail),
		metaRows.String(),
		html.EscapeString(auditURL),
	)

	var textLines []string
	textLines = append(textLines, headline, "", detail, "", "Date (UTC) : "+occurred)
	if p.IPSubnet != "" {
		textLines = append(textLines, "Sous-réseau IP : "+p.IPSubnet)
	}
	if p.UserAgent != "" {
		textLines = append(textLines, "Appareil / client : "+p.UserAgent)
	}
	if p.Reason != "" {
		textLines = append(textLines, "Motif : "+p.Reason)
	}
	textLines = append(textLines, "", "Vérifier votre activité : "+auditURL)

	refID := fmt.Sprintf("sec-%s-%d@qoe.fi", p.EventType, time.Now().UnixNano())
	return w.provider.Send(ctx, EmailMessage{
		From:        w.fromAddress(),
		To:          to,
		Subject:     subject,
		HTML:        htmlBody,
		Text:        strings.Join(textLines, "\n"),
		RefID:       refID,
		IsBulk:      false,
		MessageType: "security.alert",
	})
}

func formatSecurityAlertCopy(p queue.SecurityAlertEmailPayload) (subject, headline, detail string) {
	switch p.EventType {
	case "login_new_device":
		return "[qoe.fi] Nouvelle connexion détectée sur votre compte",
			"Nouvelle connexion détectée",
			"Une connexion depuis un nouvel appareil ou un nouveau sous-réseau IP vient d'accéder à votre compte qoe.fi."
	case "password_changed":
		return "[qoe.fi] Votre mot de passe a été modifié",
			"Mot de passe modifié",
			"Le mot de passe associé à votre compte qoe.fi vient d'être mis à jour."
	case "email_changed":
		return "[qoe.fi] Demande de changement d'adresse email",
			"Changement d'adresse email initié",
			"Une modification de l'adresse email de votre compte qoe.fi vient d'être demandée."
	case "mfa_enrolled":
		return "[qoe.fi] Double authentification (2FA) activée",
			"Nouveau facteur 2FA enregistré",
			"Un facteur d'authentification à deux facteurs vient d'être ajouté à votre compte."
	case "mfa_removed":
		return "[qoe.fi] Double authentification (2FA) supprimée",
			"Facteur 2FA supprimé",
			"Un facteur d'authentification à deux facteurs vient d'être retiré de votre compte."
	case "api_key_created":
		return "[qoe.fi] Nouvelle clé API créée",
			"Nouvelle clé API créée",
			"Une nouvelle clé API vient d'être générée sur votre espace."
	case "api_key_rotated":
		return "[qoe.fi] Clé API régénérée",
			"Clé API régénérée",
			"Une clé API vient d'être renouvelée sur votre espace. L'ancienne clé a été révoquée."
	case "api_key_revoked":
		return "[qoe.fi] Clé API révoquée",
			"Clé API révoquée",
			"Une clé API vient d'être révoquée sur votre espace."
	case "api_key_quarantined":
		return "[qoe.fi] Clé API placée en quarantaine lecture seule",
			"Clé API restreinte en lecture seule",
			"Par mesure de sécurité, votre clé API a été placée en mode lecture seule. Les lectures GET existantes restent actives mais toute écriture est bloquée."
	case "publisher_api_quarantined":
		return "[qoe.fi] API de publication placée en mode lecture seule",
			"API de publication en mode lecture seule",
			"Par mesure de sécurité, l'API de votre publication a été restreinte en lecture seule sur les contenus publiés avant l'incident."
	default:
		return "[qoe.fi] Alerte de sécurité sur votre compte",
			"Événement de sécurité",
			"Une action sensible vient d'être enregistrée sur votre compte qoe.fi."
	}
}
