package articles

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/permissions"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/subscriptions"
)

var (
	ErrCooldownActive     = errors.New("un email a déjà été envoyé pour cette publication il y a moins de 2 heures")
	ErrArticleAlreadySent = errors.New("cet article a déjà été envoyé par email ou un envoi est déjà en cours")
	ErrArticleNotEligible = errors.New("l'article doit être publié pour être envoyé par email")
)

type EmailSender func(ctx context.Context, to, subject, html, unsubURL, fromName string) error

func (s *Service) SetEmailSender(sender EmailSender) {
	s.emailSender = sender
}

// SendArticleEmail déclenche l'envoi manuel par email d'un article déjà publié (Branch D ou Branch B).
func (s *Service) SendArticleEmail(ctx context.Context, articleID, userID, subject, previewText string, isMajorUpdate bool) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	mc, err := s.resolveMember(ctx, userID, row.PublisherId)
	if err != nil {
		return errForbidden
	}
	if !mc.can(permissions.PermPublishAny) && mc.role != "owner" {
		return errForbidden
	}
	if !row.Published || row.Status != "PUBLISHED" {
		return ErrArticleNotEligible
	}

	// Cooldown 2h par publication
	cooldownAt, err := s.q.CheckPublisherEmailCooldown(ctx, row.PublisherId)
	if err == nil && cooldownAt.Valid {
		return ErrCooldownActive
	}

	if subject == "" {
		subject = row.Title
	}

	if isMajorUpdate {
		if s.pool != nil {
			if !subscriptions.HasPro(ctx, s.pool, row.PublisherId, time.Now()) {
				return errors.New("l'envoi d'une mise à jour majeure par email est réservé aux publishers PRO")
			}
		}
		if !strings.HasPrefix(subject, "[Mise à jour]") && !strings.HasPrefix(subject, "[Update]") {
			subject = "[Mise à jour] " + subject
		}
		if _, err := s.q.TryLockArticleForMajorUpdate(ctx, db.TryLockArticleForMajorUpdateParams{
			Subject:     subject,
			PreviewText: previewText,
			ID:          articleID,
		}); err != nil {
			return ErrArticleAlreadySent
		}
		_ = s.q.InsertArticleReleaseMajorUpdateDeliveries(ctx, db.InsertArticleReleaseMajorUpdateDeliveriesParams{
			ArticleId:   articleID,
			PublisherId: row.PublisherId,
		})
	} else {
		if _, err := s.q.TryLockArticleForEmailRelease(ctx, db.TryLockArticleForEmailReleaseParams{
			Subject:     subject,
			PreviewText: previewText,
			ID:          articleID,
		}); err != nil {
			return ErrArticleAlreadySent
		}
		_ = s.q.InsertArticleReleaseDeliveries(ctx, db.InsertArticleReleaseDeliveriesParams{
			ArticleId:   articleID,
			PublisherId: row.PublisherId,
		})
	}

	if s.ac != nil {
		_ = queue.PublishArticleRelease(s.ac, queue.ArticleReleasePayload{ArticleID: articleID}, 0)
	}
	return nil
}

// SendArticleTestEmail envoie un email d'aperçu de l'article à l'adresse de l'utilisateur connecté.
func (s *Service) SendArticleTestEmail(ctx context.Context, articleID, userID string) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	if _, err := s.resolveMember(ctx, userID, row.PublisherId); err != nil {
		return errForbidden
	}

	if s.pool == nil {
		return errors.New("base de données non disponible")
	}
	var userEmail string
	err = s.pool.QueryRow(ctx, `SELECT COALESCE(email, '') FROM "User" WHERE id = $1`, toUUID(userID)).Scan(&userEmail)
	if err != nil || strings.TrimSpace(userEmail) == "" {
		return errors.New("adresse email utilisateur introuvable")
	}

	if s.emailSender == nil {
		return errors.New("fournisseur d'email non configuré")
	}

	info := db.GetArticleReleaseInfoRow{
		ID:               row.ID,
		Title:            row.Title,
		Slug:             row.Slug,
		Visibility:       row.Visibility,
		IsPremium:        row.IsPremium,
		Content:          row.Content,
		PublisherId:      row.PublisherId,
		EmailSubject:     pgtype.Text{String: "[TEST] " + row.Title, Valid: true},
		EmailPreviewText: pgtype.Text{String: "Aperçu test — " + row.Title, Valid: true},
		PublisherName:    row.PublisherName,
		Subdomain:        row.PublisherSubdomain,
	}
	// Même résolution d'URL que le mail réel : domaine personnalisé, sous-domaine
	// ou repli produit — jamais un « /p/{slug} » en dur pour un média à domaine.
	var customDomain pgtype.Text
	_ = s.pool.QueryRow(ctx, `SELECT "customDomain" FROM "Publisher" WHERE id = $1`, row.PublisherId).Scan(&customDomain)
	link := ArticlePublicURL(row.PublisherSubdomain, customDomain, row.Slug)
	rendered := BuildArticleReleaseEmail(info, link, userEmail)
	testSubject := "[TEST] " + row.Title
	return s.emailSender(ctx, userEmail, testSubject, rendered.HTML, rendered.ListUnsubscribe, rendered.FromName)
}
