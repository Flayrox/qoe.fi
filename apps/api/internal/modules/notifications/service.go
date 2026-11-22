// Package notifications — liste groupée, lecture, préférences.
package notifications

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/antispam"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/deeplink"
	"github.com/qoefi/api/internal/identity"
)

// codeInvalidPreference : clé de préférence inconnue dans un PATCH.
const codeInvalidPreference = "INVALID_PREFERENCE"

// preferenceKeys est l'allowlist des toggles acceptés par PATCH. Une clé
// inconnue était silencieusement ignorée (le client croyait avoir enregistré
// son réglage).
var preferenceKeys = map[string]bool{
	"emailLikes": true, "pushLikes": true, "emailReplies": true, "pushReplies": true,
	"emailComments": true, "pushComments": true, "emailMentions": true, "pushMentions": true,
	"emailFollows": true, "pushFollows": true, "emailReposts": true, "pushReposts": true,
	"emailMedia": true, "pushMedia": true,
	"emailCollaborations": true, "pushCollaborations": true,
}

// Sender est l'auteur d'une notification.
type Sender struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
	// Type (PERSONAL | MEDIA) est la nature publique du compte : la carte de
	// survol et l'avatar carré d'un média en dépendent.
	Type string `json:"type"`
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

type PublisherRef struct {
	ID   string  `json:"id"`
	Name *string `json:"name"`
	Slug *string `json:"slug"`
}

// Notification est la forme groupée d'une notification (miroir TS).
type Notification struct {
	ID              string          `json:"id"`
	NotificationIDs []string        `json:"notificationIds"`
	Type            string          `json:"type"`
	IsRead          bool            `json:"isRead"`
	CreatedAt       string          `json:"createdAt"`
	ThoughtID       *string         `json:"thoughtId"`
	ArticleID       *string         `json:"articleId"`
	CommentID       *string         `json:"commentId"`
	Thought         *ThoughtRef     `json:"thought"`
	Article         *ArticleRef     `json:"article"`
	Publisher       *PublisherRef   `json:"publisher"`
	Metadata        json.RawMessage `json:"metadata,omitempty"`
	// URL est le lien interne prêt à suivre, avec `?ws=<mediaId>` quand la
	// cible appartient à un média. Le client ne reconstruit plus le chemin.
	URL           string   `json:"url"`
	Senders       []Sender `json:"senders"`
	TotalCount    int      `json:"totalCount"`
	createdAtTime time.Time
}

// Preferences est l'ensemble des toggles.
type Preferences struct {
	EmailLikes          bool `json:"emailLikes"`
	PushLikes           bool `json:"pushLikes"`
	EmailReplies        bool `json:"emailReplies"`
	PushReplies         bool `json:"pushReplies"`
	EmailComments       bool `json:"emailComments"`
	PushComments        bool `json:"pushComments"`
	EmailMentions       bool `json:"emailMentions"`
	PushMentions        bool `json:"pushMentions"`
	EmailFollows        bool `json:"emailFollows"`
	PushFollows         bool `json:"pushFollows"`
	EmailReposts        bool `json:"emailReposts"`
	PushReposts         bool `json:"pushReposts"`
	EmailMedia          bool `json:"emailMedia"`
	PushMedia           bool `json:"pushMedia"`
	EmailCollaborations bool `json:"emailCollaborations"`
	PushCollaborations  bool `json:"pushCollaborations"`
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
	case "collaborations":
		return []string{
			"ARTICLE_CONTRIBUTOR_INVITED",
			"ARTICLE_CONTRIBUTOR_ACCEPTED",
			"ARTICLE_CONTRIBUTOR_DECLINED",
			"ARTICLE_CONTRIBUTOR_REMOVED",
			"MEDIA_INVITE",
			"MEDIA_MEMBER_JOINED",
			"MEDIA_ARTICLE_SUBMITTED",
			"MEDIA_ARTICLE_APPROVED",
			"MEDIA_ARTICLE_REJECTED",
			"MEDIA_ARTICLE_PUBLISHED",
		}
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
			sameTarget := false
			if g.ThoughtID != nil && item.ThoughtID != nil && *g.ThoughtID == *item.ThoughtID {
				sameTarget = true
			} else if g.ArticleID != nil && item.ArticleID != nil && *g.ArticleID == *item.ArticleID {
				sameTarget = true
			} else if g.CommentID != nil && item.CommentID != nil && *g.CommentID == *item.CommentID {
				sameTarget = true
			} else if g.Publisher != nil && item.Publisher != nil && g.Publisher.ID == item.Publisher.ID {
				sameTarget = true
			}
			closeInTime := within48hFast(g.createdAtTime, item.createdAtTime)
			// Deux demandes de follow de personnes différentes ne se groupent
			// jamais : la carte ne porte qu'un requestId, et l'accepter ne doit
			// pas accepter silencieusement la mauvaise demande.
			itemKind := notificationKind(item.Metadata)
			sameRequester := itemKind != "FOLLOW_REQUEST" ||
				(len(g.Senders) > 0 && len(item.Senders) > 0 && g.Senders[0].ID == item.Senders[0].ID)
			if g.Type == item.Type && sameTarget && closeInTime && sameNotificationKind(g.Metadata, item.Metadata) && sameRequester {
				if !senderExists(g.Senders, item.Senders[0].ID) {
					g.Senders = append(g.Senders, item.Senders[0])
					g.TotalCount++
				}
				g.NotificationIDs = append(g.NotificationIDs, item.ID)
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

// sameNotificationKind empêche de fusionner une demande d'abonnement avec
// un follow classique : les deux partagent le type FOLLOW mais pas le sens.
func sameNotificationKind(a, b json.RawMessage) bool {
	return notificationKind(a) == notificationKind(b)
}

func notificationKind(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var meta struct {
		Kind string `json:"kind"`
	}
	if json.Unmarshal(raw, &meta) != nil {
		return ""
	}
	return meta.Kind
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
				EmailCollaborations: true, PushCollaborations: true,
			}, nil
		}
		return Preferences{}, err
	}
	return prefsFromValues(
		row.EmailLikes, row.PushLikes, row.EmailReplies, row.PushReplies,
		row.EmailComments, row.PushComments, row.EmailMentions, row.PushMentions,
		row.EmailFollows, row.PushFollows, row.EmailReposts, row.PushReposts,
		row.EmailMedia, row.PushMedia, row.EmailCollaborations, row.PushCollaborations,
	), nil
}

// prefsFromValues : une seule projection des 16 colonnes, partagée par la
// lecture et le patch (sinon les deux chemins divergent à la première colonne
// ajoutée).
func prefsFromValues(eLikes, pLikes, eReplies, pReplies, eComments, pComments,
	eMentions, pMentions, eFollows, pFollows, eReposts, pReposts,
	eMedia, pMedia, eCollabs, pCollabs bool,
) Preferences {
	return Preferences{
		EmailLikes: eLikes, PushLikes: pLikes,
		EmailReplies: eReplies, PushReplies: pReplies,
		EmailComments: eComments, PushComments: pComments,
		EmailMentions: eMentions, PushMentions: pMentions,
		EmailFollows: eFollows, PushFollows: pFollows,
		EmailReposts: eReposts, PushReposts: pReposts,
		EmailMedia: eMedia, PushMedia: pMedia,
		EmailCollaborations: eCollabs, PushCollaborations: pCollabs,
	}
}

// optBool traduit la présence d'une clé en paramètre nullable : nil = « ne pas
// toucher ».
func optBool(patch map[string]bool, key string) pgtype.Bool {
	v, ok := patch[key]
	return pgtype.Bool{Bool: v, Valid: ok}
}

// UpdatePreferences applique un patch partiel en une seule instruction SQL :
// les clés absentes gardent leur valeur (défaut `true` à la création), et deux
// onglets qui sauvent deux réglages différents ne s'écrasent plus (l'ancien
// lecture-puis-upsert complet perdait la mise à jour concurrente).
func (s *Service) UpdatePreferences(ctx context.Context, userID string, patch map[string]bool) (Preferences, error) {
	for key := range patch {
		if !preferenceKeys[key] {
			return Preferences{}, &antispam.RejectionError{HTTPStatus: 400, Code: codeInvalidPreference,
				Message: "Préférence de notification inconnue : " + key}
		}
	}
	row, err := s.q.PatchNotificationPreferences(ctx, db.PatchNotificationPreferencesParams{
		UserID:              toUUID(userID),
		EmailLikes:          optBool(patch, "emailLikes"),
		PushLikes:           optBool(patch, "pushLikes"),
		EmailReplies:        optBool(patch, "emailReplies"),
		PushReplies:         optBool(patch, "pushReplies"),
		EmailComments:       optBool(patch, "emailComments"),
		PushComments:        optBool(patch, "pushComments"),
		EmailMentions:       optBool(patch, "emailMentions"),
		PushMentions:        optBool(patch, "pushMentions"),
		EmailFollows:        optBool(patch, "emailFollows"),
		PushFollows:         optBool(patch, "pushFollows"),
		EmailReposts:        optBool(patch, "emailReposts"),
		PushReposts:         optBool(patch, "pushReposts"),
		EmailMedia:          optBool(patch, "emailMedia"),
		PushMedia:           optBool(patch, "pushMedia"),
		EmailCollaborations: optBool(patch, "emailCollaborations"),
		PushCollaborations:  optBool(patch, "pushCollaborations"),
	})
	if err != nil {
		return Preferences{}, err
	}
	return prefsFromValues(
		row.EmailLikes, row.PushLikes, row.EmailReplies, row.PushReplies,
		row.EmailComments, row.PushComments, row.EmailMentions, row.PushMentions,
		row.EmailFollows, row.PushFollows, row.EmailReposts, row.PushReposts,
		row.EmailMedia, row.PushMedia, row.EmailCollaborations, row.PushCollaborations,
	), nil
}

func notificationFromRow(r *db.GetNotificationsRow) Notification {
	n := Notification{
		ID:              r.ID,
		NotificationIDs: []string{r.ID},
		Type:            string(r.Type),
		IsRead:          r.IsRead,
		CreatedAt:       r.CreatedAt.Time.Format(time.RFC3339),
		createdAtTime:   r.CreatedAt.Time,
		Senders: []Sender{{
			ID:          r.SenderID,
			Name:        textPtr(r.SenderName),
			Username:    textPtr(r.SenderUsername),
			LogoURL:     textPtr(r.SenderLogo),
			IsCertified: r.SenderCertified,
			// Nature réelle de l'expéditeur, dérivée de sa publication : un
			// compte média s'affichait comme une personne (mauvais avatar).
			Type: identity.FromPublisherType(r.SenderType),
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
	if r.PublisherId.Valid {
		n.Publisher = &PublisherRef{ID: r.PublisherId.String, Name: textPtr(r.PublisherName), Slug: textPtr(r.PublisherSlug)}
	}
	if len(r.Metadata) > 0 && string(r.Metadata) != "null" {
		n.Metadata = json.RawMessage(r.Metadata)
	}

	target := deeplink.Target{
		Type:          n.Type,
		ThoughtID:     derefString(n.ThoughtID),
		ArticleID:     derefString(n.ArticleID),
		PublisherType: r.PublisherType,
		MediaID:       r.MediaID,
	}
	if n.Article != nil {
		target.ArticleSlug = n.Article.Slug
	}
	if n.Publisher != nil {
		target.PublisherID = n.Publisher.ID
		if n.Publisher.Slug != nil {
			target.PublisherSlug = *n.Publisher.Slug
		}
	}
	if len(n.Senders) > 0 && n.Senders[0].Username != nil {
		target.SenderUsername = *n.Senders[0].Username
	}
	n.URL = deeplink.Notification(target)
	return n
}

func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func within48hFast(t1, t2 time.Time) bool {
	diff := t1.Sub(t2)
	if diff < 0 {
		diff = -diff
	}
	return diff < ms48h
}

func within48h(a, b string) bool {
	ta, err1 := time.Parse(time.RFC3339, a)
	tb, err2 := time.Parse(time.RFC3339, b)
	if err1 != nil || err2 != nil {
		return false
	}
	return within48hFast(ta, tb)
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
