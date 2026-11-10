package newsletters

import (
	"context"

	db "github.com/qoefi/api/internal/database"
)

// newsletterQuerier : surface sqlc du module newsletters (mockable en test).
type newsletterQuerier interface {
	ActivateVerifiedSubscriber(ctx context.Context, arg db.ActivateVerifiedSubscriberParams) error
	AttachSubscriberToAccount(ctx context.Context, arg db.AttachSubscriberToAccountParams) error
	ConfirmSubscriberByToken(ctx context.Context, arg db.ConfirmSubscriberByTokenParams) (string, error)
	GetSubscriberLocale(ctx context.Context, arg db.GetSubscriberLocaleParams) (string, error)
	SubscribePending(ctx context.Context, arg db.SubscribePendingParams) error
	CreateNewsletterIssue(ctx context.Context, arg db.CreateNewsletterIssueParams) (db.NewsletterIssue, error)
	DeleteNewsletterIssueDraft(ctx context.Context, id string) error
	FinishNewsletterIssue(ctx context.Context, arg db.FinishNewsletterIssueParams) (string, error)
	GetNewsletterIssue(ctx context.Context, id string) (db.NewsletterIssue, error)
	GetUserPublisherID(ctx context.Context, id string) (string, error)
	ListNewsletterIssuesByPublisher(ctx context.Context, publicationid string) ([]db.NewsletterIssue, error)
	ResetFailedNewsletterDeliveries(ctx context.Context, issueid string) error
	SetNewsletterIssueSending(ctx context.Context, id string) (string, error)
	UnsubscribeNewsletterSubscriber(ctx context.Context, arg db.UnsubscribeNewsletterSubscriberParams) error
	UpdateNewsletterIssueDraft(ctx context.Context, arg db.UpdateNewsletterIssueDraftParams) (db.NewsletterIssue, error)
	UserOwnsPublisher(ctx context.Context, arg db.UserOwnsPublisherParams) (bool, error)
}

var _ newsletterQuerier = (*db.Queries)(nil)
