// Package posts implémente le domaine social (pensées, likes, reposts, réponses).
package posts

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/abuse"
	"github.com/qoefi/api/internal/cache"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/domainevents"
	"github.com/qoefi/api/internal/identity"
	"github.com/qoefi/api/internal/moderation"
	"github.com/qoefi/api/internal/notifications"
	"github.com/qoefi/api/internal/vectorfeed"
	"github.com/redis/go-redis/v9"
)

// toUUID convertit un identifiant texte en pgtype.UUID.
func toUUID(id string) pgtype.UUID {
	uuid := pgtype.UUID{}
	_ = uuid.Scan(id)
	return uuid
}

var errThoughtNotFound = errors.New("post introuvable")

// ErrBlockedContent signale une interaction refusée parce que l'un des deux
// comptes a bloqué l'autre. Les handlers la traduisent en 403.
var ErrBlockedContent = errors.New("contenu bloqué")

// ErrTargetNotFound signale une cible d'engagement introuvable (pensée ou
// article inexistant, ou article non publié). Les handlers la traduisent en
// 404 : un identifiant inconnu n'est pas une panne serveur.
var ErrTargetNotFound = errors.New("cible introuvable")

// Author est l'auteur dénormalisé d'une pensée.
type Author struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
	IsFollowing bool    `json:"isFollowing"`
	// IsMuted / IsBlocked : état relationnel calculé par le serveur pour le
	// viewer courant (omis quand faux pour ne pas alourdir le feed).
	IsMuted   bool `json:"isMuted,omitempty"`
	IsBlocked bool `json:"isBlocked,omitempty"`
	// Type (PERSONAL | MEDIA) décide de la forme de l'avatar côté UI.
	Type string `json:"type"`
}

type Service struct {
	pool *pgxpool.Pool
	q    ServiceQuerier
	rc   *redis.Client
	ac   *asynq.Client
	mod  *moderation.Service
}

func NewService(pool *pgxpool.Pool, rc *redis.Client, ac *asynq.Client) *Service {
	return &Service{pool: pool, q: &realQueryer{Queries: db.New(pool)}, rc: rc, ac: ac}
}

// SetModeration branche l'entonnoir de modération sur le service posts (signalements).
func (s *Service) SetModeration(m *moderation.Service) {
	if s != nil {
		s.mod = m
	}
}

// withTx exécute fn dans une transaction et commite seulement si fn réussit.
// Un Service monté sans pool (uniquement les doubles de test HTTP qui
// remplacent entièrement le queryer et ne touchent aucune base) exécute fn
// sur le queryer direct.
func (s *Service) withTx(ctx context.Context, fn func(q ServiceQuerier) error) error {
	if s.pool == nil {
		return fn(s.q)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(s.q.WithTx(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// withReadTx exécute fn dans une transaction en lecture seule et en
// REPEATABLE READ : toutes les lectures voient le même instantané.
func (s *Service) withReadTx(ctx context.Context, fn func(q ServiceQuerier) error) error {
	if s.pool == nil {
		return fn(s.q)
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(s.q.WithTx(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// invalidateFeedCaches invalide les caches Redis du feed (miroir TS).
func (s *Service) invalidateFeedCaches(ctx context.Context, authorID string) {
	if err := cache.InvalidateNamespaces(ctx, s.rc, "feed:trending:", "feed:following:"+authorID+":"); err != nil {
		log.Printf("[posts] invalidation cache feed: %v", err)
	}
}

// Create crée une pensée (ou une réponse si parentID fourni). Chemin de
// compatibilité : il délègue à CreateFull pour qu'il n'existe qu'UNE règle de
// création (contrôle de blocage, transaction, validation) — l'ancien chemin
// écrivait sans garde de blocage ni transaction.
func (s *Service) Create(ctx context.Context, authorID, content string, tags []string, parentID, repostID *string) (FeedPost, error) {
	if strings.TrimSpace(content) == "" && (repostID == nil || strings.TrimSpace(*repostID) == "") {
		return FeedPost{}, errors.New("contenu requis")
	}
	return s.CreateFull(ctx, authorID, CreateFullInput{
		Content:  content,
		Tags:     tags,
		ParentID: parentID,
		RepostID: repostID,
	})
}

// Reply crée une réponse après contrôle du threadgate, avec notifications
// REPLY/MENTION et invalidation du cache feed.
func (s *Service) Reply(ctx context.Context, parentID, userID, content string) (FeedPost, error) {
	gate, err := s.CanReply(ctx, parentID, userID)
	if err != nil {
		return FeedPost{}, err
	}
	if !gate.CanReply {
		// Parent bloqué : refus explicite (403), pas une simple validation.
		if gate.Blocked {
			return FeedPost{}, ErrBlockedContent
		}
		return FeedPost{}, errors.New(gate.Reason)
	}

	// rootId = pensée de base du fil, pas le parent direct : une réponse à une
	// réponse reste rattachée à la pensée racine.
	rootID, _ := s.q.GetThreadRootID(ctx, parentID)
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
	_ = s.replyNotifications(ctx, s.q, s.pool, created.ID, userID, parentID, rootID, content)

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
	rows, err := s.q.GetPostsByIDs(ctx, db.GetPostsByIDsParams{Ids: []string{id}, ViewerID: toUUID(viewerID), IncludeOwnDrafts: true})
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
	// Charge les ancêtres (root → parent) par batch : à chaque tour on récupère
	// les ids pas encore chargés et on découvre leurs propres ancêtres. L'ancien
	// code ne relançait que depuis les lignes déjà en mémoire : le premier lot de
	// parents n'était jamais requêté → Parent toujours nil.
	for pending := extras; len(pending) > 0 && len(extras) < 100; {
		var toFetch []string
		for _, eid := range pending {
			if _, ok := all[eid]; !ok {
				toFetch = append(toFetch, eid)
			}
		}
		if len(toFetch) == 0 {
			break
		}
		extraRows, err := s.q.GetPostsByIDs(ctx, db.GetPostsByIDsParams{Ids: toFetch, ViewerID: toUUID(viewerID), IncludeOwnDrafts: true})
		if err != nil {
			return FeedPost{}, err
		}
		pending = nil
		for i := range extraRows {
			all[extraRows[i].ID] = &extraRows[i]
			if pid := ParentIDOf(&extraRows[i]); pid != nil && !want[*pid] {
				want[*pid] = true
				extras = append(extras, *pid)
				pending = append(pending, *pid)
			}
			if rid := RepostIDOf(&extraRows[i]); rid != nil && !want[*rid] {
				want[*rid] = true
				extras = append(extras, *rid)
				pending = append(pending, *rid)
			}
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
	quoted, err := QuotedArticlesFor(ctx, s.q, QuoteRefsFrom(all), viewerID)
	if err != nil {
		return FeedPost{}, err
	}

	graph := LoadViewerGraph(ctx, s.pool, viewerID, authorIDs, following)
	return BuildFeedPostWithAncestors(all[id], all, attachments, polls, map[string]bool{}, quoted, graph), nil
}

// ToggleLike ajoute ou retire un like, avec mise à jour atomique du compteur.
// Supporte à la fois les pensées (table "Post") et les articles (table "Article").
func (s *Service) ToggleLike(ctx context.Context, postID, userID string) (bool, error) {
	if strings.HasPrefix(postID, "artc_") {
		return s.toggleArticleLike(ctx, postID, userID)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tq := s.q.WithTx(tx)

	_, err = tq.GetExistingLike(ctx, db.GetExistingLikeParams{Postid: postID, Userid: toUUID(userID)})
	if err == nil {
		if err := tq.DeleteLike(ctx, db.DeleteLikeParams{Postid: postID, Userid: toUUID(userID)}); err != nil {
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

	// Un like ne s'ajoute jamais sur le contenu d'un compte bloqué (dans un
	// sens ou l'autre). Le retrait d'un like existant reste possible.
	if authorID, err := tq.GetPostAuthor(ctx, postID); err == nil {
		blocked, err := isBlockedBetween(ctx, tq, userID, authorID)
		if err != nil {
			return false, err
		}
		if blocked {
			return false, ErrBlockedContent
		}
	} else if errors.Is(err, pgx.ErrNoRows) {
		_ = tx.Rollback(ctx)
		return s.toggleArticleLike(ctx, postID, userID)
	} else {
		return false, err
	}

	if _, err := tq.InsertLike(ctx, db.InsertLikeParams{Postid: postID, Userid: toUUID(userID)}); err != nil {
		// Idempotence : une race a déjà inséré le like.
		if isUniqueViolation(err) {
			return true, nil
		}
		_ = tx.Rollback(ctx)
		return s.toggleArticleLike(ctx, postID, userID)
	}
	if err := tq.IncrementLikeCount(ctx, postID); err != nil {
		return false, err
	}
	if err := notifyLike(ctx, tq, tx, postID, userID); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}

	// Observation anti-abus (tranche 5 : engagement inauthentique, politique
	// v2) : seuls les AJOUTS comptent (retirer n'amplifie rien). Deux
	// compteurs indépendants, en UN appel Observe : essaim sur la pensée
	// (50/10min) et volume du liker (100/h) → revue priorisée, jamais de
	// sanction.
	abuse.Observe(ctx, s.pool, time.Now(),
		abuse.Signal{
			Type: abuse.SignalLikeCast, SubjectType: abuse.SubjectLikeTarget, SubjectID: "post:" + postID,
			Source: abuse.SourcePostsLike, Confidence: abuse.ConfidenceObserved, Retention: abuse.LikeSignalRetention,
		},
		abuse.Signal{
			Type: abuse.SignalLikeVolume, SubjectType: abuse.SubjectUser, SubjectID: userID,
			Source: abuse.SourcePostsLike, Confidence: abuse.ConfidenceObserved, Retention: abuse.LikeSignalRetention,
		},
	)

	// 🧠 EMA vectorielle : aimer une pensée rapproche le profil de son thème
	// (fire-and-forget — ne bloque jamais le like).
	s.applyPostVector(ctx, postID, userID, vectorfeed.InteractionLike)
	return true, nil
}

// applyPostVector récupère l'embedding d'un post et déplace le vecteur de
// l'utilisateur vers lui (EMA). No-op si le post n'est pas encore embeddé.
func (s *Service) applyPostVector(ctx context.Context, postID, userID string, it vectorfeed.InteractionType) {
	var txt string
	if err := s.pool.QueryRow(ctx, `SELECT COALESCE("embedding"::text,'') FROM "Post" WHERE id=$1`, postID).Scan(&txt); err != nil || strings.TrimSpace(txt) == "" {
		return
	}
	vec, ok := vectorfeed.ParseLit(txt)
	if !ok {
		return
	}
	_ = vectorfeed.ApplyInteraction(ctx, s.pool, userID, vec, it)
}

// SitemapThought est une entrée slim du catalogue SEO (sitemap index) :
// id + auteur + date de MAJ, sans contenu.
type SitemapThought struct {
	ID             string `json:"id"`
	AuthorUsername string `json:"authorUsername"`
	UpdatedAt      string `json:"updatedAt"`
}

// SitemapThoughtsResult pagine le catalogue (total stable pendant la page).
type SitemapThoughtsResult struct {
	Items  []SitemapThought `json:"items"`
	Total  int64            `json:"total"`
	Limit  int              `json:"limit"`
	Offset int              `json:"offset"`
}

// maxSitemapLimit borne une page du catalogue SEO (shard de sitemap).
const maxSitemapLimit = 1000

// SitemapThoughts retourne les pensées indexables paginées (endpoint SEO
// public : originaux + réponses + citations, reposts purs exclus).
func (s *Service) SitemapThoughts(ctx context.Context, limit, offset int) (SitemapThoughtsResult, error) {
	if limit <= 0 || limit > maxSitemapLimit {
		limit = maxSitemapLimit
	}
	if offset < 0 {
		offset = 0
	}
	// Total et page dans le MÊME instantané : sinon un sitemap pouvait
	// annoncer N entrées et n'en livrer N±k.
	var (
		total int64
		rows  []db.ListSitemapPostsRow
	)
	err := s.withReadTx(ctx, func(q ServiceQuerier) error {
		t, err := q.CountSitemapPosts(ctx)
		if err != nil {
			return err
		}
		r, err := q.ListSitemapPosts(ctx, db.ListSitemapPostsParams{
			Limit:  int32(limit),
			Offset: int32(offset),
		})
		if err != nil {
			return err
		}
		total, rows = t, r
		return nil
	})
	if err != nil {
		return SitemapThoughtsResult{}, err
	}
	items := make([]SitemapThought, 0, len(rows))
	for _, r := range rows {
		updated := ""
		if r.UpdatedAt.Valid {
			updated = r.UpdatedAt.Time.Format("2006-01-02T15:04:05Z07:00")
		}
		items = append(items, SitemapThought{
			ID:             r.ID,
			AuthorUsername: r.AuthorUsername.String,
			UpdatedAt:      updated,
		})
	}
	return SitemapThoughtsResult{Items: items, Total: total, Limit: limit, Offset: offset}, nil
}

// ToggleRepost ajoute ou retire un repost pur, avec mise à jour du compteur.
// Supporte à la fois les pensées (table "Post") et les articles (table "Article").
func (s *Service) ToggleRepost(ctx context.Context, postID, userID string) (bool, error) {
	if strings.HasPrefix(postID, "artc_") {
		return s.toggleArticleRepost(ctx, postID, userID)
	}

	canonicalID, err := s.q.GetCanonicalThoughtID(ctx, postID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return s.toggleArticleRepost(ctx, postID, userID)
		}
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
		// Le registre Interaction est le même pour toutes les réactions : un
		// repost retiré disparaît aussi de la liste des acteurs.
		if err := tq.DeleteInteraction(ctx, db.DeleteInteractionParams{
			UserId: toUUID(userID), Kind: "REPOST", TargetType: "POST", TargetId: canonicalID,
		}); err != nil {
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

	if err := s.ensurePostNotBlocked(ctx, tq, canonicalID, userID); err != nil {
		return false, err
	}

	repostID, err := tq.InsertPureRepost(ctx, db.InsertPureRepostParams{AuthorId: userID, RepostId: pgtype.Text{String: canonicalID, Valid: true}})
	if err != nil {
		return false, err
	}
	if _, err := tq.InsertInteraction(ctx, db.InsertInteractionParams{
		UserId: toUUID(userID), Kind: "REPOST", TargetType: "POST", TargetId: canonicalID,
	}); err != nil && !isUniqueViolation(err) {
		return false, err
	}
	_ = repostID
	if err := tq.IncrementRepostCount(ctx, canonicalID); err != nil {
		return false, err
	}
	if err := notifyRepost(ctx, tq, tx, canonicalID, userID); err != nil {
		return false, err
	}
	return true, tx.Commit(ctx)
}

// articleAuthorForEngagement résout l'auteur d'un article PUBLIÉ. Un article
// en brouillon ou programmé n'est pas une cible d'engagement publique : il ne
// doit ni recevoir de like/repost ni notifier son auteur (et son identifiant
// ne doit pas être confirmé à un tiers).
func (s *Service) articleAuthorForEngagement(ctx context.Context, articleID string) (string, error) {
	var authorID string
	err := s.pool.QueryRow(ctx,
		`SELECT "authorId"::text FROM "Article"
		 WHERE id = $1 AND published = true AND status = 'PUBLISHED'`, articleID).Scan(&authorID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrTargetNotFound
		}
		return "", err
	}
	return authorID, nil
}

func (s *Service) toggleArticleRepost(ctx context.Context, articleID, userID string) (bool, error) {
	articleAuthorID, err := s.articleAuthorForEngagement(ctx, articleID)
	if err != nil {
		return false, err
	}

	var existingPostID string
	err = s.pool.QueryRow(ctx, `
		SELECT id FROM "Post" 
		WHERE "authorId" = $1 AND "quotedArticleId" = $2 AND ("content" IS NULL OR "content" = '')
		LIMIT 1
	`, userID, articleID).Scan(&existingPostID)

	if err == nil && existingPostID != "" {
		if _, delErr := s.pool.Exec(ctx, `DELETE FROM "Post" WHERE id = $1`, existingPostID); delErr != nil {
			return false, delErr
		}
		if delErr := s.deleteArticleEngagementNotification(ctx, "REPOST", articleID, userID); delErr != nil {
			log.Printf("[posts] article repost notification: %v", delErr)
		}
		return false, nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}

	if articleAuthorID != "" {
		blocked, err := isBlockedBetween(ctx, s.q, userID, articleAuthorID)
		if err != nil {
			return false, err
		}
		if blocked {
			return false, ErrBlockedContent
		}
	}

	newPostID := "post_" + strings.ReplaceAll(uuid.New().String(), "-", "")
	_, insErr := s.pool.Exec(ctx, `
		INSERT INTO "Post" (
			id, "content", "authorId", "updatedAt", tags, "visibility", "contentVisibility",
			"isDraft", "quotedArticleId", "replyRestriction", "isPinned",
			"likeCount", "repostCount", "replyCount"
		)
		VALUES (
			$1, '', $2, now(), '{}'::text[], 'public', 'PUBLIC',
			false, $3, 'everyone', false,
			0, 0, 0
		)
	`, newPostID, userID, articleID)
	if insErr != nil {
		return false, insErr
	}

	if articleAuthorID != "" && articleAuthorID != userID {
		_ = s.notifyArticleEngagement(ctx, "REPOST", articleID, articleAuthorID, userID)
	}

	return true, nil
}

func (s *Service) toggleArticleLike(ctx context.Context, articleID, userID string) (bool, error) {
	articleAuthorID, err := s.articleAuthorForEngagement(ctx, articleID)
	if err != nil {
		return false, err
	}

	userUUID := toUUID(userID)
	var feedbackID string
	err = s.pool.QueryRow(ctx, `
		SELECT id FROM "ContentFeedback" 
		WHERE "userId" = $1 AND "articleId" = $2 AND "type" = 'LIKE'
		LIMIT 1
	`, userUUID, articleID).Scan(&feedbackID)

	if err == nil && feedbackID != "" {
		if _, delErr := s.pool.Exec(ctx, `DELETE FROM "ContentFeedback" WHERE id = $1`, feedbackID); delErr != nil {
			// Ne jamais annoncer « unlike » quand la ligne est toujours là.
			return false, delErr
		}
		if delErr := s.deleteArticleEngagementNotification(ctx, "LIKE", articleID, userID); delErr != nil {
			log.Printf("[posts] article like notification: %v", delErr)
		}
		return false, nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}

	if articleAuthorID != "" {
		blocked, err := isBlockedBetween(ctx, s.q, userID, articleAuthorID)
		if err != nil {
			return false, err
		}
		if blocked {
			return false, ErrBlockedContent
		}
	}

	newID := "cf_" + strings.ReplaceAll(uuid.New().String(), "-", "")
	_, insErr := s.pool.Exec(ctx, `
		INSERT INTO "ContentFeedback" (id, "userId", "articleId", "type", "createdAt")
		VALUES ($1, $2, $3, 'LIKE', now())
	`, newID, userUUID, articleID)
	if insErr != nil {
		if isUniqueViolation(insErr) {
			return true, nil
		}
		return false, insErr
	}

	if articleAuthorID != "" && articleAuthorID != userID {
		_ = s.notifyArticleEngagement(ctx, "LIKE", articleID, articleAuthorID, userID)
	}

	return true, nil
}

func (s *Service) notifyArticleEngagement(ctx context.Context, kind, articleID, authorID, senderID string) error {
	return notifications.Dispatch(ctx, s.pool, notifications.DispatchInput{
		RecipientID: authorID,
		SenderID:    senderID,
		Type:        kind,
		ArticleID:   &articleID,
	})
}

func (s *Service) deleteArticleEngagementNotification(ctx context.Context, kind, articleID, senderID string) error {
	senderUUID := toUUID(senderID)
	_, err := s.pool.Exec(ctx, `
		DELETE FROM "Notification" 
		WHERE "senderId" = $1 AND "type"::text = $2 AND "articleId" = $3
	`, senderUUID, kind, articleID)
	return err
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
	// L'article doit exister : sans ce contrôle, l'INSERT violait la clé
	// étrangère et répondait 500 sur un identifiant inconnu.
	var exists int
	err := s.pool.QueryRow(ctx, `SELECT 1 FROM "Article" WHERE id = $1`, targetID).Scan(&exists)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, ErrTargetNotFound
		}
		return false, err
	}

	_, err = s.q.GetExistingBookmark(ctx, db.GetExistingBookmarkParams{ReaderId: toUUID(userID), ArticleId: targetID})
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

	// 🧠 EMA vectorielle : sauvegarder un article = intention forte (signe
	// « save » d'Instagram / playlist de Netflix) → rapproche le profil du thème.
	s.applyArticleVector(ctx, targetID, userID, vectorfeed.InteractionBookmark)
	return true, nil
}

// applyArticleVector récupère l'embedding d'un article et déplace le vecteur
// de l'utilisateur vers lui (EMA). No-op si l'article n'est pas encore embeddé.
func (s *Service) applyArticleVector(ctx context.Context, articleID, userID string, it vectorfeed.InteractionType) {
	var txt string
	if err := s.pool.QueryRow(ctx, `SELECT COALESCE("embedding"::text,'') FROM "Article" WHERE id=$1`, articleID).Scan(&txt); err != nil || strings.TrimSpace(txt) == "" {
		return
	}
	vec, ok := vectorfeed.ParseLit(txt)
	if !ok {
		return
	}
	_ = vectorfeed.ApplyInteraction(ctx, s.pool, userID, vec, it)
}

// VotePoll enregistre le vote d'un utilisateur sur une option de sondage
// (idempotent : changer d'option remplace le vote). Renvoie le sondage
// reformaté (avec les nouveaux scores) pour mise à jour du client.
func (s *Service) VotePoll(ctx context.Context, thoughtID, optionID, userID string) (*Poll, error) {
	// Le sondage doit exister pour cette pensée (une panne DB reste une panne,
	// elle n'est pas déguisée en « sondage introuvable »).
	poll, err := s.q.GetPollByThoughtID(ctx, thoughtID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("sondage introuvable")
		}
		return nil, err
	}
	// Un scrutin clos ne se joue plus : `isExpired` n'était qu'un affichage.
	if poll.ExpiresAt.Valid && time.Now().After(poll.ExpiresAt.Time) {
		return nil, errors.New("sondage terminé")
	}
	// L'option doit appartenir au sondage.
	opt, err := s.q.GetPollOptionByID(ctx, optionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("option introuvable")
		}
		return nil, err
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
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("sondage introuvable")
		}
		return nil, err
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
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
	Type        string  `json:"type"`
	FollowedAt  string  `json:"followedAt"`
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
		Type:        identity.Personal,
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
		Type:        identity.Personal,
		FollowedAt:  r.RepostedAt.Time.Format(time.RFC3339),
	}
}

// Likes retourne la liste paginée des utilisateurs qui ont liké une pensée.
func (s *Service) Likes(ctx context.Context, postID string, limit, offset int) (ActorPage, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.q.ListLikesForPost(ctx, db.ListLikesForPostParams{
		Postid: postID, Rowlimit: int32(limit + 1), Rowoffset: int32(offset),
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
		Postid: postID, Rowlimit: int32(limit + 1), Rowoffset: int32(offset),
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
		// Fermeture : les citations listées arrivent avec leur éventuel
		// article cité et leur propre maillon, comme dans le feed.
		all, err := LoadPostClosure(ctx, s.q, ids, viewerID)
		if err != nil {
			return FeedResultPage{}, err
		}
		allIDs := make([]string, 0, len(all))
		for id := range all {
			allIDs = append(allIDs, id)
		}
		attachments, err := AttachmentsFor(ctx, s.q, allIDs)
		if err != nil {
			return FeedResultPage{}, err
		}
		polls, err := PollsFor(ctx, s.q, allIDs, viewerID)
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
		quoted, err := QuotedArticlesFor(ctx, s.q, QuoteRefsFrom(all), viewerID)
		if err != nil {
			return FeedResultPage{}, err
		}
		graph := LoadViewerGraph(ctx, s.pool, viewerID, authorIDs, following)
		for _, id := range ids {
			if r, ok := all[id]; ok {
				postsList = append(postsList, BuildFeedPost(r, all, attachments, polls, quoted, graph))
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
// cible, reader = l'auteur de l'action). Atomique et idempotent.
func (s *Service) ToggleBlock(ctx context.Context, targetID, userID string) (bool, error) {
	return domainevents.ToggleBlock(ctx, s.pool, userID, targetID)
}

// ToggleMute masque/démasque un utilisateur (MutedUser : muter = l'auteur de
// l'action, muted = la cible). Idempotent.
func (s *Service) ToggleMute(ctx context.Context, targetID, userID string) (bool, error) {
	return domainevents.ToggleMute(ctx, s.pool, userID, targetID)
}

// Report crée un signalement de modération (ModerationReport).
// Idempotent : un même reporter ne peut signaler qu'une fois une cible tant
// que son signalement est pending (index unique partiel en base + garde ici).
// reportTargetExists valide le vocabulaire des signalements et l'existence
// de la cible. Sans cela, n'importe quelle chaîne entrait dans la file de
// modération (types inconnus, identifiants fantômes) et la triage staff
// héritait de dossiers invérifiables.
func (s *Service) reportTargetExists(ctx context.Context, targetType, targetID string) (bool, error) {
	var query string
	switch strings.ToLower(strings.TrimSpace(targetType)) {
	case "thought", "post":
		query = `SELECT 1 FROM "Post" WHERE id = $1 AND "deletedAt" IS NULL`
	case "article":
		query = `SELECT 1 FROM "Article" WHERE id = $1`
	case "user":
		query = `SELECT 1 FROM "User" WHERE id::text = $1`
	case "comment":
		// Un commentaire est un post (L41) : on exige la racine d'article
		// pour qu'une pensée ne se déguise pas en commentaire.
		query = `SELECT 1 FROM "Post" WHERE id = $1 AND "rootArticleId" IS NOT NULL AND "deletedAt" IS NULL`
	default:
		return false, errors.New("targetType invalide (thought, article, user, comment)")
	}
	var one int
	if err := s.pool.QueryRow(ctx, query, targetID).Scan(&one); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (s *Service) Report(ctx context.Context, userID, targetID, targetType, reason, details string) error {
	if targetID == "" || targetType == "" || reason == "" {
		return errors.New("targetId, targetType et reason requis")
	}
	exists, err := s.reportTargetExists(ctx, targetType, targetID)
	if err != nil {
		return err
	}
	if !exists {
		return ErrTargetNotFound
	}
	count, err := s.q.CountPendingReportsByReporter(ctx, db.CountPendingReportsByReporterParams{
		ReporterId: toUUID(userID),
		TargetId:   targetID,
		TargetType: targetType,
	})
	if err != nil {
		return err
	}
	if count > 0 {
		return nil // déjà signalé par ce reporter — ne pas spammer la file
	}
	detailsVal := pgtype.Text{}
	if details != "" {
		detailsVal = pgtype.Text{String: details, Valid: true}
	}
	_, err = s.q.CreateModerationReport(ctx, db.CreateModerationReportParams{
		ReporterId: toUUID(userID),
		TargetId:   targetID,
		TargetType: targetType,
		Reason:     reason,
		Details:    detailsVal,
	})
	if err != nil {
		return err
	}
	// Observation anti-abus (fiche 06 §8-§10, mode observation fiche §11) :
	// chaque signalement est un fait de confiance basse (une alerte n'est
	// pas une preuve). Deux compteurs indépendants, en UN appel Observe :
	//   - essaim contre la cible (10/h) → revue de LA CIBLE (jamais une
	//     sanction automatique) ;
	//   - volume du reporter (10/h, toutes cibles) → revue DU REPORTER
	//     (raid de signalement : l'arme est le volume du plaignant, pas la
	//     culpabilité des cibles — le dossier s'ouvre sur lui seul).
	// Convention (partout dans abuse) : subjectId = identifiant BRUT (id
	// utilisateur, article:xxx...), subjectType dit de quoi il s'agit. Le
	// même utilisateur suspect (dossier volume) et diffusé (éligibilité)
	// reste corrélable par le support.
	now := time.Now()
	subjectID := targetType + ":" + targetID
	abuse.Observe(ctx, s.pool, now,
		abuse.Signal{
			Type: abuse.SignalReportFiled, SubjectType: abuse.SubjectReportTarget, SubjectID: subjectID,
			Source: abuse.SourcePostsReport, Confidence: abuse.ConfidenceUserReport, Retention: abuse.ReportSignalRetention,
		},
		abuse.Signal{
			Type: abuse.SignalReportVolume, SubjectType: abuse.SubjectUser, SubjectID: userID,
			Source: abuse.SourcePostsReport, Confidence: abuse.ConfidenceObserved, Retention: abuse.ReportSignalRetention,
		},
	)
	if s.mod != nil {
		reportText := strings.TrimSpace(reason + " " + details)
		v := s.mod.CheckSync(ctx, moderation.CheckInput{
			Surface:   moderation.SurfaceUserReport,
			SubjectID: subjectID,
			UserID:    userID,
			Text:      reportText,
		})
		if v.AsyncScreen {
			s.mod.EnqueueScreen(moderation.CheckInput{
				Surface:   moderation.SurfaceUserReport,
				SubjectID: subjectID,
				UserID:    userID,
				Text:      reportText,
			})
		}
	}
	return nil
}

// Delete supprime (soft delete) une pensée de l'auteur. Les compteurs du
// parent (réponse) et de la cible (repost pur) sont ajustés dans la MÊME
// transaction : sans cela, supprimer une réponse laissait `replyCount` du
// parent définitivement gonflé, et le feed restait servi par le cache.
func (s *Service) Delete(ctx context.Context, postID, userID string) error {
	err := s.withTx(ctx, func(tq ServiceQuerier) error {
		row, err := tq.GetThoughtByID(ctx, postID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return errThoughtNotFound
			}
			return err
		}
		if row.AuthorId != userID {
			// Ne pas confirmer l'existence d'une pensée d'autrui.
			return errThoughtNotFound
		}

		if _, err := tq.SoftDeletePost(ctx, db.SoftDeletePostParams{ID: postID, AuthorId: userID}); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return errThoughtNotFound
			}
			return err
		}
		if row.ParentId.Valid && row.ParentId.String != "" {
			if err := tq.DecrementReplyCount(ctx, row.ParentId.String); err != nil {
				return err
			}
		}
		if row.RepostId.Valid && row.RepostId.String != "" && strings.TrimSpace(row.Content) == "" {
			if err := tq.DecrementRepostCount(ctx, row.RepostId.String); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}

	s.invalidateFeedCaches(ctx, userID)
	return nil
}

// TogglePin épingle/désépingle une pensée sur le profil de l'auteur.
// Épingler efface les épingles précédentes (un seul épinglé à la fois).
func (s *Service) TogglePin(ctx context.Context, postID, userID string) (bool, error) {
	var pinned bool
	err := s.withTx(ctx, func(tq ServiceQuerier) error {
		row, err := tq.GetThoughtByID(ctx, postID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return errThoughtNotFound
			}
			return err
		}
		if row.AuthorId != userID {
			// Même réponse qu'une pensée inexistante : ne pas révéler l'existence.
			return errThoughtNotFound
		}

		if row.IsPinned {
			pinned, err = tq.UnpinPost(ctx, db.UnpinPostParams{ID: postID, AuthorId: userID})
			return err
		}
		// Un seul épinglé par profil, atomiquement : un échec du pin ne doit
		// pas laisser le profil sans aucune épingle.
		if err := tq.ClearPinnedPosts(ctx, userID); err != nil {
			return err
		}
		pinned, err = tq.PinPost(ctx, db.PinPostParams{ID: postID, AuthorId: userID})
		return err
	})
	if err != nil {
		return false, err
	}
	return pinned, nil
}

// DraftItem — brouillon de pensée (contrat web getUserDraftsAction).
type DraftItem struct {
	ID             string     `json:"id"`
	Content        string     `json:"content"`
	ImageURL       *string    `json:"imageUrl"`
	Visibility     string     `json:"visibility"`
	ScheduledAt    *time.Time `json:"scheduledAt"`
	TriggerWarning *string    `json:"triggerWarning"`
	Tags           []string   `json:"tags"`
	UpdatedAt      *time.Time `json:"updatedAt"`
}

// ListDrafts renvoie les brouillons (isDraft=true) de l'utilisateur.
func (s *Service) ListDrafts(ctx context.Context, userID string, limit int) ([]DraftItem, error) {
	rows, err := s.q.ListUserDrafts(ctx, db.ListUserDraftsParams{AuthorId: userID, Limit: int32(limit)})
	if err != nil {
		return nil, err
	}
	out := make([]DraftItem, 0, len(rows))
	for _, r := range rows {
		item := DraftItem{
			ID:         r.ID,
			Content:    r.Content,
			Visibility: r.Visibility,
			Tags:       r.Tags,
		}
		if r.ImageUrl.Valid {
			item.ImageURL = &r.ImageUrl.String
		}
		if r.ScheduledAt.Valid {
			t := r.ScheduledAt.Time
			item.ScheduledAt = &t
		}
		if r.TriggerWarning.Valid {
			item.TriggerWarning = &r.TriggerWarning.String
		}
		if r.UpdatedAt.Valid {
			t := r.UpdatedAt.Time
			item.UpdatedAt = &t
		}
		out = append(out, item)
	}
	return out, nil
}

// ToggleHideReply masque/restaure une réponse (auteur uniquement).
func (s *Service) ToggleHideReply(ctx context.Context, replyID, userID string) (bool, error) {
	hidden, err := s.q.HidePostByAuthor(ctx, db.HidePostByAuthorParams{ID: replyID, AuthorId: userID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, errThoughtNotFound
		}
		return false, err
	}
	return hidden, nil
}
