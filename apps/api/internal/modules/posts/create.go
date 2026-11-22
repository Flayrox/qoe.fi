package posts

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/identity"
	"github.com/qoefi/api/internal/queue"
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
	// QuotedAnnotationID cite une annotation : le serveur recharge son
	// texte, sa note, son auteur et ses ancres, et les fige dans le post.
	QuotedAnnotationID *string
}

var urlRe = regexp.MustCompile(`https?://[^\s]+`)

// validateContentLen reproduit la règle TS : 500 runes, URLs externes
// comptées pour 20, URLs internes (post/article/thought) pour 0.
func validateContentLen(content string) error {
	trimmed := strings.TrimSpace(content)
	weight := utf8.RuneCountInString(trimmed)
	for _, u := range urlRe.FindAllString(trimmed, -1) {
		weight -= utf8.RuneCountInString(u)
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

// replyRestrictions est le vocabulaire fermé des threadgates. Un client qui
// envoie autre chose obtenait un threadgate « everyone » silencieux : on
// refuse plutôt que d'ouvrir la conversation par accident.
var replyRestrictions = map[string]bool{
	"everyone": true, "subscribers": true, "following": true, "mentioned": true,
}

func normalizeReplyRestriction(v string) (string, error) {
	if v == "" {
		return "everyone", nil
	}
	if !replyRestrictions[v] {
		return "", errors.New("replyRestriction invalide (everyone, subscribers, following, mentioned)")
	}
	return v, nil
}

// CreateFull crée une pensée complète : validation, insert, pièces jointes,
// sondage éventuel et invalidation du cache feed. Tout ce qui constitue la
// pensée est écrit dans UNE transaction : un échec de pièce jointe ou de
// sondage ne laisse jamais une pensée partielle derrière lui.
func (s *Service) CreateFull(ctx context.Context, authorID string, in CreateFullInput) (FeedPost, error) {
	if strings.TrimSpace(in.Content) == "" && (in.RepostID == nil || strings.TrimSpace(*in.RepostID) == "") {
		return FeedPost{}, errors.New("Le contenu est requis.")
	}
	if err := validateContentLen(in.Content); err != nil {
		return FeedPost{}, err
	}
	restriction, err := normalizeReplyRestriction(in.ReplyRestriction)
	if err != nil {
		return FeedPost{}, err
	}

	// Sondage validé AVANT toute écriture : un sondage à moins de deux options
	// réelles n'existe pas (sinon on persistait un scrutin vide).
	var pollOptions []string
	pollDuration := 24
	if in.Poll != nil {
		if len(in.Poll.Options) > 6 {
			return FeedPost{}, errors.New("Un sondage ne peut pas dépasser 6 options.")
		}
		for _, o := range in.Poll.Options {
			opt := strings.TrimSpace(o)
			if opt == "" {
				continue
			}
			if utf8.RuneCountInString(opt) > 100 {
				return FeedPost{}, errors.New("Une option de sondage ne peut pas dépasser 100 caractères.")
			}
			pollOptions = append(pollOptions, opt)
		}
		if len(pollOptions) < 2 {
			return FeedPost{}, errors.New("Un sondage doit proposer au moins deux options.")
		}
		if in.Poll.DurationHours > 0 {
			pollDuration = in.Poll.DurationHours
		}
		if pollDuration > 24*30 {
			return FeedPost{}, errors.New("La durée d'un sondage ne peut pas dépasser 30 jours.")
		}
	}

	tags := in.Tags
	if tags == nil {
		tags = []string{}
	}

	var parentText, rootText, repostText pgtype.Text
	if in.ParentID != nil {
		// On ne répond jamais au contenu d'un compte bloqué (dans un sens ou
		// l'autre) : le parent doit exister et rester visible.
		parentAuthor, err := s.q.GetPostAuthor(ctx, *in.ParentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return FeedPost{}, errors.New("POST_NOT_FOUND")
			}
			return FeedPost{}, err
		}
		blocked, err := isBlockedBetween(ctx, s.q, authorID, parentAuthor)
		if err != nil {
			return FeedPost{}, err
		}
		if blocked {
			return FeedPost{}, ErrBlockedContent
		}
		parentText = pgtype.Text{String: *in.ParentID, Valid: true}
		// rootId = pensée de base du fil (racine de la chaîne parent), pas le
		// parent direct : les réponses restent rattachées au fil d'origine.
		root, err := s.q.GetThreadRootID(ctx, *in.ParentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return FeedPost{}, errors.New("POST_NOT_FOUND")
			}
			return FeedPost{}, err
		}
		if root != "" {
			rootText = pgtype.Text{String: root, Valid: true}
		}
	}
	if in.RepostID != nil {
		repostAuthor, err := s.q.GetPostAuthor(ctx, *in.RepostID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return FeedPost{}, errors.New("POST_NOT_FOUND")
			}
			return FeedPost{}, err
		}
		blocked, err := isBlockedBetween(ctx, s.q, authorID, repostAuthor)
		if err != nil {
			return FeedPost{}, err
		}
		if blocked {
			return FeedPost{}, ErrBlockedContent
		}
		repostText = pgtype.Text{String: *in.RepostID, Valid: true}
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

	// 🧾 Citation d'annotation : le client ne fournit qu'un identifiant. Le
	// serveur lit l'annotation, vérifie qu'elle est réellement publiable
	// (note non vide, publique ou officielle) et fige le snapshot. Le texte
	// et l'article ne viennent donc jamais du client.
	var quotedAnnotationJSON []byte
	if in.QuotedAnnotationID != nil && *in.QuotedAnnotationID != "" {
		highlight, err := s.q.GetHighlightByID(ctx, *in.QuotedAnnotationID)
		if err != nil {
			return FeedPost{}, errors.New("ANNOTATION_NOT_FOUND")
		}
		// Une annotation d'un compte bloqué n'est pas citable, même publique.
		if highlight.ReaderId.String() != authorID {
			blocked, err := isBlockedBetween(ctx, s.q, authorID, highlight.ReaderId.String())
			if err != nil {
				return FeedPost{}, err
			}
			if blocked {
				return FeedPost{}, errors.New("ANNOTATION_NOT_FOUND")
			}
		}
		snapshot, err := citationSnapshot(highlight)
		if err != nil {
			return FeedPost{}, err
		}
		encoded, err := json.Marshal(snapshot)
		if err != nil {
			return FeedPost{}, err
		}
		quotedAnnotationJSON = encoded
		// L'article et le passage cités sont ceux de l'annotation, pas ceux
		// qu'un client aurait pu glisser dans la requête.
		if highlight.ArticleId != "" {
			quotedArticleID = pgtype.Text{String: highlight.ArticleId, Valid: true}
		}
		quotedExcerpt = pgtype.Text{String: highlight.Text, Valid: highlight.Text != ""}
	}

	var created db.CreateThoughtRow
	err = s.withTx(ctx, func(tq ServiceQuerier) error {
		row, err := tq.CreateThought(ctx, db.CreateThoughtParams{
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
			QuotedAnnotation:  quotedAnnotationJSON,
			ReplyRestriction:  restriction,
		})
		if err != nil {
			return err
		}
		created = row

		// Pièces jointes
		for i, att := range in.Attachments {
			attType := att.Type
			if attType == "" {
				attType = "IMAGE"
			}
			if _, err := tq.CreateAttachment(ctx, db.CreateAttachmentParams{
				ThoughtId: created.ID,
				Type:      attType,
				Url:       att.URL,
				AltText:   pgtype.Text{String: att.AltText, Valid: att.AltText != ""},
				Width:     int4Ptr(att.Width),
				Height:    int4Ptr(att.Height),
				Order:     int32(i),
			}); err != nil {
				return err
			}
		}

		// Sondage (options réelles, ordre compact, erreurs remontées).
		if len(pollOptions) > 0 {
			poll, err := tq.CreatePoll(ctx, db.CreatePollParams{
				ThoughtId: created.ID,
				ExpiresAt: pgtype.Timestamp{Time: time.Now().Add(time.Duration(pollDuration) * time.Hour), Valid: true},
			})
			if err != nil {
				return err
			}
			for i, opt := range pollOptions {
				if _, err := tq.CreatePollOption(ctx, db.CreatePollOptionParams{
					PollId: poll.ID, Text: opt, Order: int32(i),
				}); err != nil {
					return err
				}
			}
		}

		if in.ParentID != nil {
			if err := tq.IncrementReplyCount(ctx, *in.ParentID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return FeedPost{}, err
	}

	// @mentions d'un post standalone → notif MENTION (best-effort).
	// (Les réponses gèrent déjà les mentions via replyNotifications.)
	if in.ParentID == nil {
		notifyMentionsInContent(ctx, s.q, in.Content, created.ID, authorID)
	}

	s.invalidateFeedCaches(ctx, authorID)

	// Embedding sémantique de la pensée (feed « Pour vous » vectoriel).
	// Seules les pensées réellement publiées sont indexées (pas les brouillons
	// ni les programmées) ; le job est idempotent côté worker.
	if !in.IsDraft && in.ScheduledAt == nil {
		if s.ac != nil {
			if err := queue.PublishPostEmbedding(s.ac, queue.EmbeddingPayload{PostID: created.ID}); err != nil {
				// La pensée existe : on trace l'indexation manquée sans annuler.
				log.Printf("[posts] embedding enqueue: %v", err)
			}
		}
	}

	return s.Get(ctx, created.ID, authorID)
}

// citationSnapshot construit le snapshot publiable d'une annotation, ou
// refuse. C'est LA règle, partagée par l'API : un surlignage nu (pas de
// note) et une annotation privée ne se publient pas.
func citationSnapshot(h db.GetHighlightByIDRow) (QuotedAnnotation, error) {
	note := strings.TrimSpace(textVal(h.Note))
	if note == "" || (!h.IsPublic && !h.IsOfficial) {
		return QuotedAnnotation{}, errors.New("ANNOTATION_NOT_CITABLE")
	}

	snapshot := QuotedAnnotation{
		ID:           h.ID,
		Note:         note,
		Excerpt:      h.Text,
		QuoteOrdinal: int(h.QuoteOrdinal),
		Reader: QuotedAnnotationReader{
			ID:       h.ReaderID,
			Name:     textPtr(h.ReaderName),
			Username: textPtr(h.ReaderUsername),
			LogoURL:  textPtr(h.ReaderLogo),
			Type:     identity.Personal,
		},
	}
	if h.CanonicalStart.Valid {
		v := int(h.CanonicalStart.Int32)
		snapshot.CanonicalStart = &v
	}
	if h.CanonicalEnd.Valid {
		v := int(h.CanonicalEnd.Int32)
		snapshot.CanonicalEnd = &v
	}
	if h.ContentSha.Valid {
		v := h.ContentSha.String
		snapshot.ContentSha = &v
	}
	return snapshot, nil
}

func int4Ptr(v *int) pgtype.Int4 {
	if v == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(*v), Valid: true}
}
