package articles

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/permissions"
)

type ArticleReviewFeedbackResponse struct {
	ID               string  `json:"id"`
	ArticleID        string  `json:"articleId"`
	Action           string  `json:"action"`
	Comment          *string `json:"comment,omitempty"`
	CreatedAt        string  `json:"createdAt"`
	ReviewerName     *string `json:"reviewerName,omitempty"`
	ReviewerUsername *string `json:"reviewerUsername,omitempty"`
	ReviewerLogo     *string `json:"reviewerLogo,omitempty"`
}

// notifyReviewers notifie les approbateurs (media:review) d'une soumission — best-effort.
func (s *Service) notifyReviewers(ctx context.Context, publisherID, articleID, senderID string) {
	_ = s.q.InsertMediaArticleSubmittedFanout(ctx, db.InsertMediaArticleSubmittedFanoutParams{
		PublisherID: publisherID,
		ArticleID:   pgtype.Text{String: articleID, Valid: true},
		SenderID:    toUUID(senderID),
	})
}

// Review approuve ou rejette un article soumis (RBAC media:review).
func (s *Service) Review(ctx context.Context, articleID, userID string, approve bool, comment string) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	if row.Status != "SUBMITTED" {
		return errors.New("Cet article n'est pas en attente de revue.")
	}
	mc, err := s.resolveMember(ctx, userID, row.PublisherId)
	if err != nil {
		return err
	}
	if !mc.isMedia || !mc.can(permissions.PermReview) {
		return errors.New("Vous n'avez pas la permission de revoir cet article.")
	}

	status := "DRAFT"
	published := false
	if approve {
		status = "PUBLISHED"
		published = true
		if row.DraftContent.Valid && row.DraftContent.String != "" {
			if _, err := s.q.PublishArticleDraft(ctx, articleID); err != nil {
				return err
			}
		}
	} else if row.Published {
		// Rejet des modifications sur un article déjà en ligne : l'article reste publié
		// pour les lecteurs, le brouillon est maintenu pour retouches par l'auteur.
		published = true
		status = "DRAFT"
	}

	if _, err := s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
		ID: articleID, Status: status, Published: published,
	}); err != nil {
		return err
	}

	action := "REJECTED"
	notifType := db.NotificationTypeMEDIAARTICLEREJECTED
	if approve {
		action = "APPROVED"
		notifType = db.NotificationTypeMEDIAARTICLEAPPROVED
	}

	_ = s.q.InsertArticleReviewLog(ctx, db.InsertArticleReviewLogParams{
		ArticleId:   articleID,
		PublisherId: row.PublisherId,
		ReviewerId:  toUUID(userID),
		Action:      action,
		Comment:     pgtype.Text{String: comment, Valid: comment != ""},
	})

	meta := map[string]any{
		"articleId":    articleID,
		"articleTitle": row.Title,
	}
	if comment != "" {
		meta["comment"] = comment
	}
	metaBytes, _ := json.Marshal(meta)
	_ = s.q.InsertArticleReviewNotification(ctx, db.InsertArticleReviewNotificationParams{
		RecipientID: toUUID(row.AuthorID),
		SenderID:    toUUID(userID),
		Type:        notifType,
		ArticleID:   pgtype.Text{String: articleID, Valid: true},
		PublisherID: pgtype.Text{String: row.PublisherId, Valid: true},
		Metadata:    metaBytes,
	})

	// Journal média : l'approbation et le rejet sont des actes éditoriaux que
	// l'équipe doit pouvoir relire, avec le commentaire éventuel.
	auditAction := "media.article_rejected"
	if approve {
		auditAction = "media.article_approved"
	}
	auditMeta := map[string]any{"articleId": articleID, "title": row.Title}
	if comment != "" {
		auditMeta["comment"] = comment
	}
	s.auditMedia(ctx, row.PublisherId, userID, auditAction, auditMeta)

	s.queueSearchSync(articleID, "upsert")
	if approve && !row.Published {
		s.emitPublished(ctx, row, true, "", "")
	}
	eventType := EventRejected
	if approve {
		eventType = EventApproved
	}
	s.recordEvent(ctx, EventInput{
		ArticleID: articleID, PublisherID: row.PublisherId, ActorID: userID,
		Type: eventType, FromStatus: "SUBMITTED", ToStatus: statusOrDraft(status),
	})
	return nil
}

// DiscardDraft abandonne le brouillon en cours pour revenir à la version publiée en ligne.
func (s *Service) DiscardDraft(ctx context.Context, articleID, userID string) error {
	row, _, err := s.authorizeEdit(ctx, articleID, userID, "")
	if err != nil {
		return err
	}
	if !row.DraftContent.Valid || row.DraftContent.String == "" {
		return nil
	}
	if _, err := s.q.DiscardArticleDraft(ctx, articleID); err != nil {
		return err
	}
	s.auditMedia(ctx, row.PublisherId, userID, "media.article_draft_discarded", map[string]any{
		"articleId": articleID, "title": row.Title,
	})
	if row.Published && row.Status == "SUBMITTED" {
		_, _ = s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
			ID: articleID, Status: "PUBLISHED", Published: true,
		})
	}
	_ = s.q.InsertArticleReviewLog(ctx, db.InsertArticleReviewLogParams{
		ArticleId:   articleID,
		PublisherId: row.PublisherId,
		ReviewerId:  toUUID(userID),
		Action:      "WITHDRAWN",
		Comment:     pgtype.Text{String: "Brouillon abandonné", Valid: true},
	})
	return nil
}

// GetLatestReviewFeedback retourne le dernier feedback éditorial d'un article.
func (s *Service) GetLatestReviewFeedback(ctx context.Context, articleID, userID string) (*ArticleReviewFeedbackResponse, error) {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return nil, errNotFound
	}
	if row.AuthorID != userID {
		if _, err := s.resolveMember(ctx, userID, row.PublisherId); err != nil {
			return nil, errForbidden
		}
	}
	fb, err := s.q.GetLatestArticleReviewFeedback(ctx, articleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &ArticleReviewFeedbackResponse{
		ID:               fb.ID,
		ArticleID:        fb.ArticleId,
		Action:           fb.Action,
		Comment:          textPtr(fb.Comment),
		CreatedAt:        fb.CreatedAt.Time.Format(time.RFC3339),
		ReviewerName:     textPtr(fb.ReviewerName),
		ReviewerUsername: textPtr(fb.ReviewerUsername),
		ReviewerLogo:     textPtr(fb.ReviewerLogo),
	}, nil
}
