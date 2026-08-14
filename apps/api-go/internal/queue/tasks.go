// Package queue définit les tâches asynq et leurs payloads (domaine d'événements).
package queue

// Types de tâches (miroir des événements de domaine TS).
const (
	TaskArticlePublished  = "article.published"
	TaskSubscriberCreated = "subscriber.created"
	TaskPostLiked         = "post.liked"
	TaskStripeEvent       = "stripe.event"
)

// StripeEventPayload est le payload d'un événement Stripe à traiter.
type StripeEventPayload struct {
	EventID   string         `json:"eventId"`
	EventType string         `json:"eventType"`
	Data      map[string]any `json:"data"`
}

// ArticlePublishedPayload est le payload de TaskArticlePublished.
type ArticlePublishedPayload struct {
	EventID       string `json:"eventId"`
	PublicationID string `json:"publicationId"`
	ArticleID     string `json:"articleId"`
	AuthorID      string `json:"authorId"`
	Title         string `json:"title"`
	Slug          string `json:"slug"`
	Visibility    string `json:"visibility"`
	PublishedAt   string `json:"publishedAt"`
}

// SubscriberCreatedPayload est le payload de TaskSubscriberCreated.
type SubscriberCreatedPayload struct {
	EventID       string `json:"eventId"`
	SubscriberID  string `json:"subscriberId"`
	PublicationID string `json:"publicationId"`
	CreatorID     string `json:"creatorId"`
	Email         string `json:"email"`
	IsPremium     bool   `json:"isPremium"`
	CreatedAt     string `json:"createdAt"`
}

// PostLikedPayload est le payload de TaskPostLiked.
type PostLikedPayload struct {
	EventID       string `json:"eventId"`
	PostID        string `json:"postId"`
	UserID        string `json:"userId"`
	AuthorID      string `json:"authorId"`
	PublicationID string `json:"publicationId"`
	CreatedAt     string `json:"createdAt"`
}
