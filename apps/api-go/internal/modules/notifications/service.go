// Package notifications — liste groupée, lecture, préférences.
package notifications

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api-go/internal/database"
)

// Sender est l'auteur d'une notification.
type Sender struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
}

type ThoughtRef struct {
	ID        string `json:"id"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}

type ArticleRef struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Slug  string `json:"slug"`
}

type PublicationRef struct {
	ID   string  `json:"id"`
	Name *string `json:"name"`
	Slug *string `json:"slug"`
}

// Notification est la forme groupée d'une notification (miroir TS).
type Notification struct {
	ID          string          `json:"id"`
	Type        string          `json:"type"`
	IsRead      bool            `json:"isRead"`
	CreatedAt   string          `json:"createdAt"`
	ThoughtID   *string         `json:"thoughtId"`
	ArticleID   *string         `json:"articleId"`
	CommentID   *string         `json:"commentId"`
	Thought     *ThoughtRef     `json:"thought"`
	Article     *ArticleRef     `json:"article"`
	Publication *PublicationRef `json:"publication"`
	Senders     []Sender        `json:"senders"`
	TotalCount  int             `json:"totalCount"`
}

// Preferences est l'ensemble des toggles.
type Preferences struct {
	EmailLikes    bool `json:"emailLikes"`
	PushLikes     bool `json:"pushLikes"`
	EmailReplies  bool `json:"emailReplies"`
	PushReplies   bool `json:"pushReplies"`
	EmailComments bool `json:"emailComments"`
	PushComments  bool `json:"pushComments"`
	EmailMentions bool `json:"emailMentions"`
	PushMentions  bool `json:"pushMentions"`
	EmailFollows  bool `json:"emailFollows"`
	PushFollows   bool `json:"pushFollows"`
	EmailReposts  bool `json:"emailReposts"`
	PushReposts   bool `json:"pushReposts"`
	EmailMedia    bool `json:"emailMedia"`
	PushMedia     bool `json:"pushMedia"`
}

// NotificationResult est la réponse paginée.
type NotificationResult struct {
	Notifications []Notification `json:"notifications"`
	NextCursor    string         `json:"nextCursor"`
}

const ms48h = 48 * time.Hour

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

// typeFilter mappe les filtres UI vers les types (miroir TS).
func typeFilter(filter string) []string {
	switch filter {
	case "mentions":
		return []string{"MENTION"}
	case "replies":
		return []string{"REPLY", "COMMENT"}
	case "likes":
		return []string{"LIKE"}
	}
	return nil
}

// List retourne les notifications groupées intelligemment (48h).
func (s *Service) List(ctx context.Context, recipientID, filter string, limit, offset int) (NotificationResult, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	// take+1 pour détecter hasMore.
	rows, err := s.q.GetNotifications(ctx, db.GetNotificationsParams{
		RecipientId: toUUID(recipientID),
		Column2:     typeFilter(filter),
		Limit:       int32(limit + 1),
		Offset:      int32(offset),
	})
	if err != nil {
		return NotificationResult{}, err
	}

	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}

	grouped := []Notification{}
	for i := range rows {
		item := notificationFromRow(&rows[i])
		added := false
		for gi := range grouped {
			g := &grouped[gi]
			sameTarget := (g.ThoughtID != nil && item.ThoughtID != nil && *g.ThoughtID == *item.ThoughtID) ||
				(g.ArticleID != nil && item.ArticleID != nil && *g.ArticleID == *item.ArticleID)
			closeInTime := within48h(g.CreatedAt, item.CreatedAt)
			if g.Type == item.Type && sameTarget && closeInTime {
				if !senderExists(g.Senders, item.Senders[0].ID) {
					g.Senders = append(g.Senders, item.Senders[0])
					g.TotalCount++
				}
				if !item.IsRead {
					g.IsRead = false
				}
				added = true
				break
			}
		}
		if !added {
			grouped = append(grouped, item)
		}
	}

	result := NotificationResult{Notifications: grouped}
	if hasMore {
		result.NextCursor = itoa(offset + len(rows))
	}
	return result, nil
}

// UnreadCount retourne le nombre de notifications non lues.
func (s *Service) UnreadCount(ctx context.Context, recipientID string) (int, error) {
	n, err := s.q.GetUnreadCount(ctx, toUUID(recipientID))
	return int(n), err
}

// MarkRead marque comme lues (toutes si ids vide).
func (s *Service) MarkRead(ctx context.Context, recipientID string, ids []string) error {
	return s.q.MarkNotificationsRead(ctx, db.MarkNotificationsReadParams{
		RecipientId: toUUID(recipientID), Column2: markReadIDs(ids),
	})
}

// markReadIDs normalise la liste d'ids passée à la requête SQL :
// un tableau vide `{}` ne matcherait aucun id (`id = ANY('{}')`), on renvoie
// donc nil pour que pgx encode NULL et que la requête marque tout.
func markReadIDs(ids []string) []string {
	if len(ids) == 0 {
		return nil
	}
	return ids
}

// InsertMediaInvite crée une notification MEDIA_INVITE (dédup + prefs en SQL).
func (s *Service) InsertMediaInvite(ctx context.Context, recipientID, senderID, publicationID string) error {
	return s.q.InsertMediaInviteNotification(ctx, db.InsertMediaInviteNotificationParams{
		RecipientId:   toUUID(recipientID),
		SenderId:      toUUID(senderID),
		PublicationId: pgtype.Text{String: publicationID, Valid: publicationID != ""},
	})
}

// InsertMediaMemberJoined crée une notification MEDIA_MEMBER_JOINED.
func (s *Service) InsertMediaMemberJoined(ctx context.Context, recipientID, senderID, publicationID string) error {
	return s.q.InsertMediaMemberJoinedNotification(ctx, db.InsertMediaMemberJoinedNotificationParams{
		RecipientId:   toUUID(recipientID),
		SenderId:      toUUID(senderID),
		PublicationId: pgtype.Text{String: publicationID, Valid: publicationID != ""},
	})
}

// GetPreferences retourne les préférences (défauts si aucune ligne).
func (s *Service) GetPreferences(ctx context.Context, userID string) (Preferences, error) {
	row, err := s.q.GetNotificationPreferences(ctx, toUUID(userID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Preferences{
				EmailLikes: true, PushLikes: true, EmailReplies: true, PushReplies: true,
				EmailComments: true, PushComments: true, EmailMentions: true, PushMentions: true,
				EmailFollows: true, PushFollows: true, EmailReposts: true, PushReposts: true,
				EmailMedia: true, PushMedia: true,
			}, nil
		}
		return Preferences{}, err
	}
	return Preferences{
		EmailLikes: row.EmailLikes, PushLikes: row.PushLikes,
		EmailReplies: row.EmailReplies, PushReplies: row.PushReplies,
		EmailComments: row.EmailComments, PushComments: row.PushComments,
		EmailMentions: row.EmailMentions, PushMentions: row.PushMentions,
		EmailFollows: row.EmailFollows, PushFollows: row.PushFollows,
		EmailReposts: row.EmailReposts, PushReposts: row.PushReposts,
		EmailMedia: row.EmailMedia, PushMedia: row.PushMedia,
	}, nil
}

// UpdatePreferences met à jour les préférences (merge partiel).
func (s *Service) UpdatePreferences(ctx context.Context, userID string, patch map[string]bool) (Preferences, error) {
	cur, err := s.GetPreferences(ctx, userID)
	if err != nil {
		return cur, err
	}
	apply := func(key string, target *bool) {
		if v, ok := patch[key]; ok {
			*target = v
		}
	}
	apply("emailLikes", &cur.EmailLikes)
	apply("pushLikes", &cur.PushLikes)
	apply("emailReplies", &cur.EmailReplies)
	apply("pushReplies", &cur.PushReplies)
	apply("emailComments", &cur.EmailComments)
	apply("pushComments", &cur.PushComments)
	apply("emailMentions", &cur.EmailMentions)
	apply("pushMentions", &cur.PushMentions)
	apply("emailFollows", &cur.EmailFollows)
	apply("pushFollows", &cur.PushFollows)
	apply("emailReposts", &cur.EmailReposts)
	apply("pushReposts", &cur.PushReposts)
	apply("emailMedia", &cur.EmailMedia)
	apply("pushMedia", &cur.PushMedia)

	err = s.q.UpsertNotificationPreferences(ctx, db.UpsertNotificationPreferencesParams{
		UserId:        toUUID(userID),
		EmailLikes:    cur.EmailLikes,
		PushLikes:     cur.PushLikes,
		EmailReplies:  cur.EmailReplies,
		PushReplies:   cur.PushReplies,
		EmailComments: cur.EmailComments,
		PushComments:  cur.PushComments,
		EmailMentions: cur.EmailMentions,
		PushMentions:  cur.PushMentions,
		EmailFollows:  cur.EmailFollows,
		PushFollows:   cur.PushFollows,
		EmailReposts:  cur.EmailReposts,
		PushReposts:   cur.PushReposts,
		EmailMedia:    cur.EmailMedia,
		PushMedia:     cur.PushMedia,
	})
	if err != nil {
		return cur, err
	}
	return cur, nil
}

func notificationFromRow(r *db.GetNotificationsRow) Notification {
	n := Notification{
		ID:        r.ID,
		Type:      string(r.Type),
		IsRead:    r.IsRead,
		CreatedAt: r.CreatedAt.Time.Format(time.RFC3339),
		Senders: []Sender{{
			ID:          r.SenderID,
			Name:        textPtr(r.SenderName),
			Username:    textPtr(r.SenderUsername),
			LogoURL:     textPtr(r.SenderLogo),
			IsCertified: r.SenderCertified,
		}},
		TotalCount: 1,
	}
	if r.ThoughtId.Valid {
		v := r.ThoughtId.String
		n.ThoughtID = &v
	}
	if r.ArticleId.Valid {
		v := r.ArticleId.String
		n.ArticleID = &v
	}
	if r.CommentId.Valid {
		v := r.CommentId.String
		n.CommentID = &v
	}
	if r.ThoughtId.Valid && r.ThoughtContent.Valid {
		n.Thought = &ThoughtRef{
			ID:        r.ThoughtId.String,
			Content:   r.ThoughtContent.String,
			CreatedAt: r.ThoughtCreatedAt.Time.Format(time.RFC3339),
		}
	}
	if r.ArticleId.Valid && r.ArticleTitle.Valid {
		n.Article = &ArticleRef{
			ID:    r.ArticleId.String,
			Title: r.ArticleTitle.String,
			Slug:  r.ArticleSlug.String,
		}
	}
	if r.PublicationId.Valid {
		n.Publication = &PublicationRef{ID: r.PublicationId.String, Name: textPtr(r.PublicationName), Slug: textPtr(r.PublicationSlug)}
	}
	return n
}

func within48h(a, b string) bool {
	ta, err1 := time.Parse(time.RFC3339, a)
	tb, err2 := time.Parse(time.RFC3339, b)
	if err1 != nil || err2 != nil {
		return false
	}
	diff := ta.Sub(tb)
	if diff < 0 {
		diff = -diff
	}
	return diff < ms48h
}

func senderExists(senders []Sender, id string) bool {
	for _, s := range senders {
		if s.ID == id {
			return true
		}
	}
	return false
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
