// Package posts implémente le domaine social (pensées, likes, reposts, réponses).
package posts

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/cache"
	db "github.com/qoefi/api/internal/database"
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
	IsFollowing bool    `json:"isFollowing"`
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
func (s *Service) Create(ctx context.Context, authorID, content string, tags []string, parentID, repostID *string) (FeedPost, error) {
	if content == "" && repostID == nil {
		return FeedPost{}, errors.New("contenu requis")
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
		return FeedPost{}, err
	}

	if parentID != nil {
		if err := s.q.IncrementReplyCount(ctx, *parentID); err != nil {
			return FeedPost{}, err
		}
	}

	s.invalidateFeedCaches(ctx, authorID)
	return s.Get(ctx, created.ID, authorID)
}

// Reply crée une réponse après contrôle du threadgate, avec notifications
// REPLY/MENTION et invalidation du cache feed.
func (s *Service) Reply(ctx context.Context, parentID, userID, content string) (FeedPost, error) {
	gate, err := s.CanReply(ctx, parentID, userID)
	if err != nil {
		return FeedPost{}, err
	}
	if !gate.CanReply {
		return FeedPost{}, errors.New(gate.Reason)
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
		return FeedPost{}, err
	}

	if err := s.q.IncrementReplyCount(ctx, parentID); err != nil {
		return FeedPost{}, err
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

// Get retourne une pensée complète (shape FeedPost) avec l'état du viewer :
// liked/reposted, compteurs, pièces jointes, sondage, chaîne d'ancêtres et
// isFollowing de l'auteur. C'est LA même shape que /v1/feed et /thread.
func (s *Service) Get(ctx context.Context, id, viewerID string) (FeedPost, error) {
	rows, err := s.q.GetPostsByIDs(ctx, db.GetPostsByIDsParams{Ids: []string{id}, ViewerID: toUUID(viewerID)})
	if err != nil {
		return FeedPost{}, err
	}
	if len(rows) == 0 {
		return FeedPost{}, errThoughtNotFound
	}

	all := map[string]*db.GetPostsByIDsRow{}
	for i := range rows {
		all[rows[i].ID] = &rows[i]
	}

	// Chaîne d'ancêtres (root → … → parent direct), boucle bornée (100).
	want := map[string]bool{id: true}
	var extras []string
	add := func(pid *string) {
		if pid != nil && *pid != "" && !want[*pid] {
			want[*pid] = true
			extras = append(extras, *pid)
		}
	}
	for i := range rows {
		add(ParentIDOf(&rows[i]))
		add(RepostIDOf(&rows[i]))
	}
	for more := true; more && len(extras) < 100; {
		more = false
		var next []string
		for _, eid := range extras {
			if r, ok := all[eid]; ok {
				if pid := ParentIDOf(r); pid != nil && !want[*pid] {
					want[*pid] = true
					next = append(next, *pid)
					more = true
				}
				if rid := RepostIDOf(r); rid != nil && !want[*rid] {
					want[*rid] = true
					next = append(next, *rid)
					more = true
				}
			}
		}
		if len(next) > 0 {
			extraRows, err := s.q.GetPostsByIDs(ctx, db.GetPostsByIDsParams{Ids: next, ViewerID: toUUID(viewerID)})
			if err != nil {
				return FeedPost{}, err
			}
			for i := range extraRows {
				all[extraRows[i].ID] = &extraRows[i]
			}
			extras = append(extras, next...)
		}
	}

	allIDs := append([]string{id}, extras...)
	attachments, err := AttachmentsFor(ctx, s.q, allIDs)
	if err != nil {
		return FeedPost{}, err
	}
	polls, err := PollsFor(ctx, s.q, allIDs, viewerID)
	if err != nil {
		return FeedPost{}, err
	}
	authorIDs := make([]string, 0, len(allIDs))
	for _, aid := range allIDs {
		if r, ok := all[aid]; ok {
			authorIDs = append(authorIDs, r.AuthorID)
		}
	}
	following, err := FollowingFor(ctx, s.q, viewerID, authorIDs)
	if err != nil {
		return FeedPost{}, err
	}

	return BuildFeedPostWithAncestors(all[id], all, attachments, polls, following, map[string]bool{}), nil
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

// ─────────────────────────── Listes d'engagement ───────────────────────────

// Actor est un utilisateur (liker / reposteur) listé sur un post.
type Actor struct {
	ID          string `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool   `json:"isCertified"`
	FollowedAt  string `json:"followedAt"`
}

// ActorPage est une page d'acteurs (likes / reposts) paginée.
type ActorPage struct {
	Items      []Actor `json:"items"`
	NextCursor string  `json:"nextCursor"`
	HasMore    bool    `json:"hasMore"`
}

func actorFromLike(r db.ListLikesForPostRow) Actor {
	return Actor{
		ID:          r.UserID,
		Name:        textPtr(r.UserName),
		Username:    textPtr(r.UserUsername),
		LogoURL:     textPtr(r.UserLogo),
		IsCertified: r.UserCertified,
		FollowedAt:  r.LikedAt.Time.Format(time.RFC3339),
	}
}

func actorFromRepost(r db.ListRepostsForPostRow) Actor {
	return Actor{
		ID:          r.UserID,
		Name:        textPtr(r.UserName),
		Username:    textPtr(r.UserUsername),
		LogoURL:     textPtr(r.UserLogo),
		IsCertified: r.UserCertified,
		FollowedAt:  r.RepostedAt.Time.Format(time.RFC3339),
	}
}

// Likes retourne la liste paginée des utilisateurs qui ont liké une pensée.
func (s *Service) Likes(ctx context.Context, postID string, limit, offset int) (ActorPage, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.q.ListLikesForPost(ctx, db.ListLikesForPostParams{
		PostId: postID, Limit: int32(limit + 1), Offset: int32(offset),
	})
	if err != nil {
		return ActorPage{}, err
	}
	return actorPage(rows, limit, offset, actorFromLike), nil
}

// Reposts retourne la liste paginée des utilisateurs qui ont reposté (pur).
func (s *Service) Reposts(ctx context.Context, postID string, limit, offset int) (ActorPage, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.q.ListRepostsForPost(ctx, db.ListRepostsForPostParams{
		RepostId: pgtype.Text{String: postID, Valid: true}, Limit: int32(limit + 1), Offset: int32(offset),
	})
	if err != nil {
		return ActorPage{}, err
	}
	return actorPage(rows, limit, offset, actorFromRepost), nil
}

func actorPage[T any](rows []T, limit, offset int, conv func(T) Actor) ActorPage {
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	items := make([]Actor, 0, len(rows))
	for _, r := range rows {
		items = append(items, conv(r))
	}
	page := ActorPage{Items: items, HasMore: hasMore}
	if hasMore {
		page.NextCursor = fmt.Sprintf("%d", offset+len(rows))
	}
	return page
}

// Quotes retourne les citations d'une pensée (posts avec repostId + texte), paginées.
func (s *Service) Quotes(ctx context.Context, postID, viewerID string, limit, offset int) (FeedResultPage, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	ids, err := s.q.ListQuotePostIDs(ctx, db.ListQuotePostIDsParams{
		RepostId: pgtype.Text{String: postID, Valid: true}, Limit: int32(limit + 1), Offset: int32(offset),
	})
	if err != nil {
		return FeedResultPage{}, err
	}
	hasMore := len(ids) > limit
	if hasMore {
		ids = ids[:limit]
	}

	var postsList []FeedPost
	if len(ids) > 0 {
		rows, err := s.q.GetPostsByIDs(ctx, db.GetPostsByIDsParams{Ids: ids, ViewerID: toUUID(viewerID)})
		if err != nil {
			return FeedResultPage{}, err
		}
		all := map[string]*db.GetPostsByIDsRow{}
		for i := range rows {
			all[rows[i].ID] = &rows[i]
		}
		attachments, err := AttachmentsFor(ctx, s.q, ids)
		if err != nil {
			return FeedResultPage{}, err
		}
		polls, err := PollsFor(ctx, s.q, ids, viewerID)
		if err != nil {
			return FeedResultPage{}, err
		}
		authorIDs := make([]string, 0, len(all))
		for _, r := range all {
			authorIDs = append(authorIDs, r.AuthorID)
		}
		following, err := FollowingFor(ctx, s.q, viewerID, authorIDs)
		if err != nil {
			return FeedResultPage{}, err
		}
		for _, id := range ids {
			if r, ok := all[id]; ok {
				postsList = append(postsList, BuildFeedPost(r, all, attachments, polls, following))
			}
		}
	}

	page := FeedResultPage{Items: postsList, HasMore: hasMore}
	if hasMore {
		page.NextCursor = fmt.Sprintf("%d", offset+len(ids))
	}
	return page, nil
}

// FeedResultPage est une page de FeedPost (citations).
type FeedResultPage struct {
	Items      []FeedPost `json:"items"`
	NextCursor string     `json:"nextCursor"`
	HasMore    bool       `json:"hasMore"`
}

// ─────────────────────────── Block / Mute / Report ───────────────────────────

// ToggleBlock bloque/débloque un utilisateur (BlockedUser : creator = la
// cible, reader = l'auteur de l'action). Idempotent.
func (s *Service) ToggleBlock(ctx context.Context, targetID, userID string) (bool, error) {
	if targetID == userID {
		return false, errors.New("impossible de se bloquer soi-même")
	}
	_, err := s.q.GetExistingBlock(ctx, db.GetExistingBlockParams{
		CreatorId: toUUID(targetID), ReaderId: toUUID(userID),
	})
	if err == nil {
		if err := s.q.DeleteBlock(ctx, db.DeleteBlockParams{
			CreatorId: toUUID(targetID), ReaderId: toUUID(userID),
		}); err != nil {
			return false, err
		}
		return false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}
	if err := s.q.InsertBlock(ctx, db.InsertBlockParams{
		CreatorId: toUUID(targetID), ReaderId: toUUID(userID),
	}); err != nil {
		return false, err
	}
	return true, nil
}

// ToggleMute masque/démasque un utilisateur (MutedUser : muter = l'auteur de
// l'action, muted = la cible). Idempotent.
func (s *Service) ToggleMute(ctx context.Context, targetID, userID string) (bool, error) {
	if targetID == userID {
		return false, errors.New("impossible de se masquer soi-même")
	}
	_, err := s.q.GetExistingMute(ctx, db.GetExistingMuteParams{
		MuterId: toUUID(userID), MutedId: toUUID(targetID),
	})
	if err == nil {
		if err := s.q.DeleteMute(ctx, db.DeleteMuteParams{
			MuterId: toUUID(userID), MutedId: toUUID(targetID),
		}); err != nil {
			return false, err
		}
		return false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}
	if err := s.q.InsertMute(ctx, db.InsertMuteParams{
		MuterId: toUUID(userID), MutedId: toUUID(targetID),
	}); err != nil {
		return false, err
	}
	return true, nil
}

// Report crée un signalement de modération (ModerationReport).
func (s *Service) Report(ctx context.Context, userID, targetID, targetType, reason, details string) error {
	if targetID == "" || targetType == "" || reason == "" {
		return errors.New("targetId, targetType et reason requis")
	}
	detailsVal := pgtype.Text{}
	if details != "" {
		detailsVal = pgtype.Text{String: details, Valid: true}
	}
	_, err := s.q.CreateModerationReport(ctx, db.CreateModerationReportParams{
		ReporterId: toUUID(userID),
		TargetId:   targetID,
		TargetType: targetType,
		Reason:     reason,
		Details:    detailsVal,
	})
	return err
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
