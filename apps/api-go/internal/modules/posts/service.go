// Package posts implémente le domaine social (pensées, likes, reposts, réponses).
package posts

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api-go/internal/cache"
	db "github.com/qoefi/api-go/internal/database"
	"github.com/redis/go-redis/v9"
)

// toUUID convertit un identifiant texte en pgtype.UUID.
func toUUID(id string) pgtype.UUID {
	uuid := pgtype.UUID{}
	_ = uuid.Scan(id)
	return uuid
}

var errThoughtNotFound = errors.New("post introuvable")

// Author est l'auteur dénormalisé d'une pensée.
type Author struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
}

// Thought est la forme API d'une pensée (avec l'état du viewer).
type Thought struct {
	ID               string   `json:"id"`
	Content          string   `json:"content"`
	AuthorID         string   `json:"authorId"`
	CreatedAt        string   `json:"createdAt"`
	Tags             []string `json:"tags"`
	ImageURL         *string  `json:"imageUrl,omitempty"`
	LikeCount        int      `json:"likeCount"`
	RepostCount      int      `json:"repostCount"`
	ReplyCount       int      `json:"replyCount"`
	ParentID         string   `json:"parentId,omitempty"`
	RootID           string   `json:"rootId,omitempty"`
	RepostID         string   `json:"repostId,omitempty"`
	ReplyRestriction string   `json:"replyRestriction"`
	IsPinned         bool     `json:"isPinned"`
	IsHiddenByAuthor bool     `json:"isHiddenByAuthor"`
	Author           Author   `json:"author"`
	ViewerLiked      bool     `json:"viewerLiked"`
	ViewerReposted   bool     `json:"viewerReposted"`
}

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
	rc   *redis.Client
}

func NewService(pool *pgxpool.Pool, rc *redis.Client) *Service {
	return &Service{pool: pool, q: db.New(pool), rc: rc}
}

// invalidateFeedCaches invalide les caches Redis du feed (miroir TS).
func (s *Service) invalidateFeedCaches(ctx context.Context, authorID string) {
	cache.InvalidateNamespaces(ctx, s.rc, "feed:trending:", "feed:following:"+authorID+":")
}

// Create crée une pensée (ou une réponse si parentID fourni).
func (s *Service) Create(ctx context.Context, authorID, content string, tags []string, parentID, repostID *string) (Thought, error) {
	if content == "" && repostID == nil {
		return Thought{}, errors.New("contenu requis")
	}

	var parentText, rootText, repostText pgtype.Text
	if parentID != nil {
		parentText = pgtype.Text{String: *parentID, Valid: true}
		root, _ := s.q.GetCanonicalThoughtID(ctx, *parentID)
		if root != "" {
			rootText = pgtype.Text{String: root, Valid: true}
		}
	}
	if repostID != nil {
		repostText = pgtype.Text{String: *repostID, Valid: true}
	}

	created, err := s.q.CreateThought(ctx, db.CreateThoughtParams{
		Content:           content,
		AuthorId:          authorID,
		Tags:              tags,
		ImageUrl:          pgtype.Text{},
		Visibility:        "public",
		ContentVisibility: db.ContentVisibilityPUBLIC,
		IsDraft:           false,
		ScheduledAt:       pgtype.Timestamp{},
		TriggerWarning:    pgtype.Text{},
		ParentId:          parentText,
		RootId:            rootText,
		RepostId:          repostText,
		ReplyRestriction:  "everyone",
	})
	if err != nil {
		return Thought{}, err
	}

	if parentID != nil {
		if err := s.q.IncrementReplyCount(ctx, *parentID); err != nil {
			return Thought{}, err
		}
	}

	s.invalidateFeedCaches(ctx, authorID)
	return s.Get(ctx, created.ID, authorID)
}

// Reply crée une réponse après contrôle du threadgate, avec notifications
// REPLY/MENTION et invalidation du cache feed.
func (s *Service) Reply(ctx context.Context, parentID, userID, content string) (Thought, error) {
	gate, err := s.CanReply(ctx, parentID, userID)
	if err != nil {
		return Thought{}, err
	}
	if !gate.CanReply {
		return Thought{}, errors.New(gate.Reason)
	}

	rootID, _ := s.q.GetCanonicalThoughtID(ctx, parentID)
	created, err := s.q.CreateThought(ctx, db.CreateThoughtParams{
		Content:           content,
		AuthorId:          userID,
		Tags:              []string{},
		ImageUrl:          pgtype.Text{},
		Visibility:        "public",
		ContentVisibility: db.ContentVisibilityPUBLIC,
		IsDraft:           false,
		ScheduledAt:       pgtype.Timestamp{},
		TriggerWarning:    pgtype.Text{},
		ParentId:          parentID,
		RootId:            rootID,
		RepostId:          "",
		ReplyRestriction:  "everyone",
	})
	if err != nil {
		return Thought{}, err
	}

	if err := s.q.IncrementReplyCount(ctx, parentID); err != nil {
		return Thought{}, err
	}

	// Notifications REPLY / MENTION (best-effort)
	_ = s.replyNotifications(ctx, s.q, created.ID, userID, parentID, rootID, content)

	// Invalidation cache feed des participants
	if parent, err := s.q.GetPostAuthor(ctx, parentID); err == nil {
		s.invalidateFeedCaches(ctx, parent)
	}
	s.invalidateFeedCaches(ctx, userID)

	return s.Get(ctx, created.ID, userID)
}

// Get retourne une pensée avec son auteur et l'état du viewer.
func (s *Service) Get(ctx context.Context, id, viewerID string) (Thought, error) {
	row, err := s.q.GetThoughtByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Thought{}, errThoughtNotFound
		}
		return Thought{}, err
	}
	return thoughtFromGetRow(row), nil
}

// ToggleLike ajoute ou retire un like, avec mise à jour atomique du compteur.
func (s *Service) ToggleLike(ctx context.Context, postID, userID string) (bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tq := s.q.WithTx(tx)

	_, err = tq.GetExistingLike(ctx, db.GetExistingLikeParams{PostId: postID, UserId: toUUID(userID)})
	if err == nil {
		if err := tq.DeleteLike(ctx, db.DeleteLikeParams{PostId: postID, UserId: toUUID(userID)}); err != nil {
			return false, err
		}
		if err := tq.DecrementLikeCount(ctx, postID); err != nil {
			return false, err
		}
		if err := deleteEngagementNotification(ctx, tq, "LIKE", postID, userID); err != nil {
			return false, err
		}
		return false, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}

	if _, err := tq.InsertLike(ctx, db.InsertLikeParams{PostId: postID, UserId: toUUID(userID)}); err != nil {
		// Idempotence : une race a déjà inséré le like.
		if isUniqueViolation(err) {
			return true, nil
		}
		return false, err
	}
	if err := tq.IncrementLikeCount(ctx, postID); err != nil {
		return false, err
	}
	if err := notifyLike(ctx, tq, postID, userID); err != nil {
		return false, err
	}
	return true, tx.Commit(ctx)
}

// ToggleRepost ajoute ou retire un repost pur, avec mise à jour du compteur.
func (s *Service) ToggleRepost(ctx context.Context, postID, userID string) (bool, error) {
	canonicalID, err := s.q.GetCanonicalThoughtID(ctx, postID)
	if err != nil {
		return false, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tq := s.q.WithTx(tx)

	count, err := tq.CountPureReposts(ctx, db.CountPureRepostsParams{AuthorId: userID, RepostId: pgtype.Text{String: canonicalID, Valid: true}})
	if err != nil {
		return false, err
	}

	if count > 0 {
		if err := tq.DeletePureReposts(ctx, db.DeletePureRepostsParams{AuthorId: userID, RepostId: pgtype.Text{String: canonicalID, Valid: true}}); err != nil {
			return false, err
		}
		if err := tq.DecrementRepostCount(ctx, canonicalID); err != nil {
			return false, err
		}
		if err := deleteEngagementNotification(ctx, tq, "REPOST", canonicalID, userID); err != nil {
			return false, err
		}
		return false, tx.Commit(ctx)
	}

	if _, err := tq.InsertPureRepost(ctx, db.InsertPureRepostParams{AuthorId: userID, RepostId: pgtype.Text{String: canonicalID, Valid: true}}); err != nil {
		return false, err
	}
	if err := tq.IncrementRepostCount(ctx, canonicalID); err != nil {
		return false, err
	}
	if err := notifyRepost(ctx, tq, canonicalID, userID); err != nil {
		return false, err
	}
	return true, tx.Commit(ctx)
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}

// ToggleBookmark ajoute ou retire un bookmark (miroir Hono : targetId = articleId).
func (s *Service) ToggleBookmark(ctx context.Context, targetID, userID string) (bool, error) {
	_, err := s.q.GetExistingBookmark(ctx, db.GetExistingBookmarkParams{ReaderId: toUUID(userID), ArticleId: targetID})
	if err == nil {
		if err := s.q.DeleteBookmark(ctx, db.DeleteBookmarkParams{ReaderId: toUUID(userID), ArticleId: targetID}); err != nil {
			return false, err
		}
		return false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}

	if err := s.q.InsertBookmark(ctx, db.InsertBookmarkParams{ReaderId: toUUID(userID), ArticleId: targetID}); err != nil {
		if isUniqueViolation(err) {
			return true, nil
		}
		return false, err
	}
	return true, nil
}

// VotePoll enregistre le vote d'un utilisateur sur une option de sondage
// (idempotent : changer d'option remplace le vote). Renvoie le sondage
// reformaté (avec les nouveaux scores) pour mise à jour du client.
func (s *Service) VotePoll(ctx context.Context, thoughtID, optionID, userID string) (*Poll, error) {
	// Le sondage doit exister pour cette pensée.
	poll, err := s.q.GetPollByThoughtID(ctx, thoughtID)
	if err != nil {
		return nil, errors.New("sondage introuvable")
	}
	// L'option doit appartenir au sondage.
	opt, err := s.q.GetPollOptionByID(ctx, optionID)
	if err != nil {
		return nil, errors.New("option introuvable")
	}
	if opt.PollId != poll.ID {
		return nil, errors.New("option ne correspond pas au sondage")
	}

	if _, err := s.q.InsertPollVote(ctx, db.InsertPollVoteParams{
		PollId:   poll.ID,
		OptionId: optionID,
		UserId:   toUUID(userID),
	}); err != nil {
		return nil, err
	}

	return s.formatPoll(ctx, poll.ID, thoughtID, userID)
}

// UnvotePoll retire le vote de l'utilisateur sur un sondage.
func (s *Service) UnvotePoll(ctx context.Context, thoughtID, userID string) (*Poll, error) {
	poll, err := s.q.GetPollByThoughtID(ctx, thoughtID)
	if err != nil {
		return nil, errors.New("sondage introuvable")
	}
	if err := s.q.DeletePollVote(ctx, db.DeletePollVoteParams{
		PollId: poll.ID,
		UserId: toUUID(userID),
	}); err != nil {
		return nil, err
	}
	return s.formatPoll(ctx, poll.ID, thoughtID, userID)
}

// formatPoll reformate un sondage avec les scores à jour (miroir du
// formatage fait dans le feed — cf. feed/assembly.go pollsFor).
func (s *Service) formatPoll(ctx context.Context, pollID, thoughtID, userID string) (*Poll, error) {
	rows, err := s.q.GetPollOptionsByIDs(ctx, []string{pollID})
	if err != nil {
		return nil, err
	}
	total, err := s.q.CountPollVotesByPollID(ctx, pollID)
	if err != nil {
		return nil, err
	}
	optionVotes, err := s.q.CountOptionVotesByIDs(ctx, []string{pollID})
	if err != nil {
		return nil, err
	}
	userVote, err := s.q.GetUserVoteForPoll(ctx, db.GetUserVoteForPollParams{
		PollId: pollID,
		UserId: toUUID(userID),
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	votesByOption := map[string]int{}
	for _, v := range optionVotes {
		votesByOption[v.OptionId] = int(v.Count)
	}

	var opts []PollOption
	for _, o := range rows {
		vc := votesByOption[o.ID]
		percentage := 0
		if total > 0 {
			percentage = int(float64(vc) / float64(total) * 100)
		}
		opts = append(opts, PollOption{
			ID: o.ID, Text: o.Text, Order: int(o.Order), VoteCount: vc, Percentage: percentage,
		})
	}

	var userVoteOptionID *string
	if userVote != "" {
		v := userVote
		userVoteOptionID = &v
	}

	poll, err := s.q.GetPollByThoughtID(ctx, thoughtID)
	if err != nil {
		return nil, err
	}
	return &Poll{
		ID:                poll.ID,
		ThoughtID:         poll.ThoughtId,
		ExpiresAt:         poll.ExpiresAt.Time.Format(time.RFC3339),
		IsExpired:         time.Now().After(poll.ExpiresAt.Time),
		TotalVotes:        int(total),
		UserVotedOptionID: userVoteOptionID,
		Options:           opts,
	}, nil
}

// Delete supprime (soft delete) une pensée de l'auteur.
func (s *Service) Delete(ctx context.Context, postID, userID string) error {
	_, err := s.q.SoftDeletePost(ctx, db.SoftDeletePostParams{
		ID:       postID,
		AuthorId: userID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return errThoughtNotFound
	}
	return err
}

// TogglePin épingle/désépingle une pensée sur le profil de l'auteur.
// Épingler efface les épingles précédentes (un seul épinglé à la fois).
func (s *Service) TogglePin(ctx context.Context, postID, userID string) (bool, error) {
	row, err := s.q.GetThoughtByID(ctx, postID)
	if err != nil {
		return false, errThoughtNotFound
	}
	if row.AuthorId != userID {
		return false, errors.New("seul l'auteur peut épingler")
	}
	if row.IsPinned {
		return s.q.UnpinPost(ctx, db.UnpinPostParams{ID: postID, AuthorId: userID})
	}
	// Un seul épinglé par profil : on désépingle tout puis on épingle.
	if err := s.q.ClearPinnedPosts(ctx, userID); err != nil {
		return false, err
	}
	return s.q.PinPost(ctx, db.PinPostParams{ID: postID, AuthorId: userID})
}
