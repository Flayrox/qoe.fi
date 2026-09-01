package newsletters

import (
	"context"

	db "github.com/qoefi/api/internal/database"
)

// newsletterQuerier : surface sqlc du module newsletters (mockable en test).
type newsletterQuerier interface {
	CreateNewsletterIssue(ctx context.Context, arg db.CreateNewsletterIssueParams) (db.NewsletterIssue, error)
	DeleteNewsletterIssueDraft(ctx context.Context, id string) error
	FinishNewsletterIssue(ctx context.Context, arg db.FinishNewsletterIssueParams) (string, error)
	GetNewsletterIssue(ctx context.Context, id string) (db.NewsletterIssue, error)
	GetUserPublicationID(ctx context.Context, id string) (string, error)
	ListNewsletterIssuesByPublication(ctx context.Context, publicationid string) ([]db.NewsletterIssue, error)
	SetNewsletterIssueSending(ctx context.Context, id string) (string, error)
	UnsubscribeNewsletterSubscriber(ctx context.Context, arg db.UnsubscribeNewsletterSubscriberParams) error
	UpdateNewsletterIssueDraft(ctx context.Context, arg db.UpdateNewsletterIssueDraftParams) (db.NewsletterIssue, error)
	UserOwnsPublication(ctx context.Context, arg db.UserOwnsPublicationParams) (bool, error)
}

var _ newsletterQuerier = (*db.Queries)(nil)
