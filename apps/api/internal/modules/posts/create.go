package posts

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// AttachmentInput est une pièce jointe envoyée par le client.
type AttachmentInput struct {
	URL     string `json:"url"`
	Type    string `json:"type"`
	AltText string `json:"altText,omitempty"`
	Width   *int   `json:"width,omitempty"`
	Height  *int   `json:"height,omitempty"`
}

// PollInput est le sondage optionnel d'une pensée.
type PollInput struct {
	Options       []string `json:"options"`
	DurationHours int      `json:"durationHours"`
}

// CreateFullInput est l'entrée complète de création d'une pensée.
type CreateFullInput struct {
	Content          string
	Tags             []string
	ImageURL         *string
	ParentID         *string
	RepostID         *string
	ReplyRestriction string
	Attachments      []AttachmentInput
	Poll             *PollInput
	IsDraft          bool
	ScheduledAt      *time.Time
	TriggerWarning   *string
	QuotedArticleID  *string
	QuotedExcerpt    *string
}

var urlRe = regexp.MustCompile(`https?://[^\s]+`)

// validateContentLen reproduit la règle TS : 500 caractères, URLs externes
// comptées pour 20, URLs internes (post/article/thought) pour 0.
func validateContentLen(content string) error {
	weight := len(content)
	for _, u := range urlRe.FindAllString(content, -1) {
		weight -= len(u)
		if !strings.Contains(u, "/post/") &&
			!strings.Contains(u, "/article/") &&
			!strings.Contains(u, "/thought/") {
			weight += 20
		}
	}
	if weight > 500 {
		return errors.New("INVALID_CONTENT_LENGTH")
	}
	return nil
}

// CreateFull crée une pensée complète : validation, insert, pièces jointes,
// sondage éventuel et invalidation du cache feed.
func (s *Service) CreateFull(ctx context.Context, authorID string, in CreateFullInput) (FeedPost, error) {
	if err := validateContentLen(in.Content); err != nil {
		return FeedPost{}, err
	}

	tags := in.Tags
	if tags == nil {
		tags = []string{}
	}

	var parentText, rootText, repostText pgtype.Text
	if in.ParentID != nil {
		parentText = pgtype.Text{String: *in.ParentID, Valid: true}
		if root, err := s.q.GetCanonicalThoughtID(ctx, *in.ParentID); err == nil && root != "" {
			rootText = pgtype.Text{String: root, Valid: true}
		}
	}
	if in.RepostID != nil {
		repostText = pgtype.Text{String: *in.RepostID, Valid: true}
	}
	restriction := in.ReplyRestriction
	if restriction == "" {
		restriction = "everyone"
	}
	imageUrl := pgtype.Text{}
	if in.ImageURL != nil && *in.ImageURL != "" {
		imageUrl = pgtype.Text{String: *in.ImageURL, Valid: true}
	}

	scheduledAt := pgtype.Timestamp{}
	if in.ScheduledAt != nil {
		scheduledAt = pgtype.Timestamp{Time: *in.ScheduledAt, Valid: true}
	}
	triggerWarning := pgtype.Text{}
	if in.TriggerWarning != nil && *in.TriggerWarning != "" {
		triggerWarning = pgtype.Text{String: *in.TriggerWarning, Valid: true}
	}
	quotedArticleID := pgtype.Text{}
	if in.QuotedArticleID != nil && *in.QuotedArticleID != "" {
		quotedArticleID = pgtype.Text{String: *in.QuotedArticleID, Valid: true}
	}
	quotedExcerpt := pgtype.Text{}
	if in.QuotedExcerpt != nil && *in.QuotedExcerpt != "" {
		quotedExcerpt = pgtype.Text{String: *in.QuotedExcerpt, Valid: true}
	}

	created, err := s.q.CreateThought(ctx, db.CreateThoughtParams{
		Content:           in.Content,
		AuthorId:          authorID,
		Tags:              tags,
		ImageUrl:          imageUrl,
		Visibility:        "public",
		ContentVisibility: db.ContentVisibilityPUBLIC,
		IsDraft:           in.IsDraft,
		ScheduledAt:       scheduledAt,
		TriggerWarning:    triggerWarning,
		ParentId:          parentText,
		RootId:            rootText,
		RepostId:          repostText,
		QuotedArticleId:   quotedArticleID,
		QuotedExcerpt:     quotedExcerpt,
		ReplyRestriction:  restriction,
	})
	if err != nil {
		return FeedPost{}, err
	}

	// Pièces jointes
	for i, att := range in.Attachments {
		attType := att.Type
		if attType == "" {
			attType = "IMAGE"
		}
		_, err := s.q.CreateAttachment(ctx, db.CreateAttachmentParams{
			ThoughtId: created.ID,
			Type:      attType,
			Url:       att.URL,
			AltText:   pgtype.Text{String: att.AltText, Valid: att.AltText != ""},
			Width:     int4Ptr(att.Width),
			Height:    int4Ptr(att.Height),
			Order:     int32(i),
		})
		if err != nil {
			return FeedPost{}, err
		}
	}

	// Sondage
	if in.Poll != nil && len(in.Poll.Options) >= 2 {
		duration := in.Poll.DurationHours
		if duration <= 0 {
			duration = 24
		}
		poll, err := s.q.CreatePoll(ctx, db.CreatePollParams{
			ThoughtId: created.ID,
			ExpiresAt: pgtype.Timestamp{Time: time.Now().Add(time.Duration(duration) * time.Hour), Valid: true},
		})
		if err == nil {
			for i, opt := range in.Poll.Options {
				opt = strings.TrimSpace(opt)
				if opt == "" {
					continue
				}
				if _, err := s.q.CreatePollOption(ctx, db.CreatePollOptionParams{
					PollId: poll.ID, Text: opt, Order: int32(i),
				}); err != nil {
					break
				}
			}
		}
	}

	if in.ParentID != nil {
		if err := s.q.IncrementReplyCount(ctx, *in.ParentID); err != nil {
			return FeedPost{}, err
		}
	}

	// @mentions d'un post standalone → notif MENTION (best-effort).
	// (Les réponses gèrent déjà les mentions via replyNotifications.)
	if in.ParentID == nil {
		notifyMentionsInContent(ctx, s.q, in.Content, created.ID, authorID)
	}

	s.invalidateFeedCaches(ctx, authorID)
	return s.Get(ctx, created.ID, authorID)
}

func int4Ptr(v *int) pgtype.Int4 {
	if v == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(*v), Valid: true}
}
