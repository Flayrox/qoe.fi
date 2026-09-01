// Package newsletters — envoi d'emails aux abonnés par les créateurs.
package newsletters

import (
	"context"
	"errors"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/queue"
)

var (
	errNotFound  = errors.New("newsletter introuvable")
	errForbidden = errors.New("vous ne gérez pas cette publication")
	errNotDraft  = errors.New("seuls les brouillons peuvent être modifiés ou envoyés")
)

// Service porte les opérations newsletters (côté créateur).
type Service struct {
	q  newsletterQuerier
	ac *asynq.Client
}

func NewService(q newsletterQuerier, ac *asynq.Client) *Service {
	return &Service{q: q, ac: ac}
}

// Issue est une newsletter (brouillon, en cours ou envoyée).
type Issue struct {
	ID              string  `json:"id"`
	PublicationID   string  `json:"publicationId"`
	Subject         string  `json:"subject"`
	PreviewText     *string `json:"previewText"`
	Html            string  `json:"html"`
	Status          string  `json:"status"`
	TotalRecipients int32   `json:"totalRecipients"`
	SentCount       int32   `json:"sentCount"`
	FailedCount     int32   `json:"failedCount"`
	CreatedAt       string  `json:"createdAt"`
	UpdatedAt       string  `json:"updatedAt"`
	SentAt          *string `json:"sentAt"`
}

// CreateInput est le contenu rédigeable d'une newsletter.
type CreateInput struct {
	PublicationID string `json:"publicationId"`
	Subject       string `json:"subject"`
	PreviewText   string `json:"previewText"`
	Html          string `json:"html"`
}

// resolvePublication vérifie que l'utilisateur gère la publication (perso ou
// owner d'un média) et renvoie son id.
func (s *Service) resolvePublication(ctx context.Context, userID, publicationID string) (string, error) {
	if publicationID == "" {
		pubID, err := s.q.GetUserPublicationID(ctx, userID)
		if err != nil || pubID == "" {
			return "", errForbidden
		}
		return pubID, nil
	}
	owns, err := s.q.UserOwnsPublication(ctx, db.UserOwnsPublicationParams{
		ID:            userID,
		PublicationId: pgtype.Text{String: publicationID, Valid: true},
	})
	if err != nil {
		return "", err
	}
	if !owns {
		return "", errForbidden
	}
	return publicationID, nil
}

func fromModel(r db.NewsletterIssue) Issue {
	issue := Issue{
		ID:              r.ID,
		PublicationID:   r.PublicationId,
		Subject:         r.Subject,
		Html:            r.Html,
		Status:          r.Status,
		TotalRecipients: r.TotalRecipients,
		SentCount:       r.SentCount,
		FailedCount:     r.FailedCount,
		CreatedAt:       r.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:       r.UpdatedAt.Time.Format(time.RFC3339),
	}
	if r.PreviewText.Valid {
		v := r.PreviewText.String
		issue.PreviewText = &v
	}
	if r.SentAt.Valid {
		v := r.SentAt.Time.Format(time.RFC3339)
		issue.SentAt = &v
	}
	return issue
}

// ListIssues renvoie les newsletters de la publication du créateur (DESC).
func (s *Service) ListIssues(ctx context.Context, userID, publicationID string) ([]Issue, error) {
	pubID, err := s.resolvePublication(ctx, userID, publicationID)
	if err != nil {
		return nil, err
	}
	rows, err := s.q.ListNewsletterIssuesByPublication(ctx, pubID)
	if err != nil {
		return nil, err
	}
	out := make([]Issue, 0, len(rows))
	for _, r := range rows {
		out = append(out, fromModel(r))
	}
	return out, nil
}

// CreateDraft crée un brouillon de newsletter pour la publication du créateur.
func (s *Service) CreateDraft(ctx context.Context, userID string, in CreateInput) (*Issue, error) {
	if in.Subject == "" || in.Html == "" {
		return nil, errors.New("subject et html requis")
	}
	pubID, err := s.resolvePublication(ctx, userID, in.PublicationID)
	if err != nil {
		return nil, err
	}
	preview := pgtype.Text{}
	if in.PreviewText != "" {
		preview = pgtype.Text{String: in.PreviewText, Valid: true}
	}
	row, err := s.q.CreateNewsletterIssue(ctx, db.CreateNewsletterIssueParams{
		PublicationId: pubID,
		Subject:       in.Subject,
		PreviewText:   preview,
		Html:          in.Html,
	})
	if err != nil {
		return nil, err
	}
	issue := fromModel(row)
	return &issue, nil
}

// UpdateDraft met à jour un brouillon (DRAFT uniquement).
func (s *Service) UpdateDraft(ctx context.Context, userID, issueID string, in CreateInput) (*Issue, error) {
	if in.Subject == "" || in.Html == "" {
		return nil, errors.New("subject et html requis")
	}
	if err := s.checkOwnership(ctx, userID, issueID); err != nil {
		return nil, err
	}
	preview := pgtype.Text{}
	if in.PreviewText != "" {
		preview = pgtype.Text{String: in.PreviewText, Valid: true}
	}
	row, err := s.q.UpdateNewsletterIssueDraft(ctx, db.UpdateNewsletterIssueDraftParams{
		ID:          issueID,
		Subject:     in.Subject,
		PreviewText: preview,
		Html:        in.Html,
	})
	if err != nil {
		return nil, err
	}
	if row.ID == "" {
		return nil, errNotDraft
	}
	issue := fromModel(row)
	return &issue, nil
}

// DeleteDraft supprime un brouillon (DRAFT uniquement).
func (s *Service) DeleteDraft(ctx context.Context, userID, issueID string) error {
	if err := s.checkOwnership(ctx, userID, issueID); err != nil {
		return err
	}
	return s.q.DeleteNewsletterIssueDraft(ctx, issueID)
}

// Send passe un brouillon en SENDING et enqueue la tâche de distribution.
func (s *Service) Send(ctx context.Context, userID, issueID string) error {
	if err := s.checkOwnership(ctx, userID, issueID); err != nil {
		return err
	}
	if _, err := s.q.SetNewsletterIssueSending(ctx, issueID); err != nil {
		return err
	}
	return queue.PublishNewsletterSend(s.ac, queue.NewsletterSendPayload{IssueID: issueID})
}

// checkOwnership vérifie que l'issue appartient à une publication du créateur.
func (s *Service) checkOwnership(ctx context.Context, userID, issueID string) error {
	issue, err := s.q.GetNewsletterIssue(ctx, issueID)
	if err != nil {
		return errNotFound
	}
	owns, err := s.q.UserOwnsPublication(ctx, db.UserOwnsPublicationParams{
		ID:            userID,
		PublicationId: pgtype.Text{String: issue.PublicationId, Valid: true},
	})
	if err != nil {
		return err
	}
	if !owns {
		return errForbidden
	}
	return nil
}

// Unsubscribe désactive receiveArticles pour un abonné (lien public, sans auth).
func (s *Service) Unsubscribe(ctx context.Context, publicationID, email string) error {
	if publicationID == "" || email == "" {
		return errors.New("publicationId et email requis")
	}
	return s.q.UnsubscribeNewsletterSubscriber(ctx, db.UnsubscribeNewsletterSubscriberParams{
		PublicationId: publicationID,
		Email:         email,
	})
}
