// Package highlights implémente le domaine des surlignages d'articles
// (annotations publiques/privées, upvotes, commentaires) — consommé par le
// mobile (lecteur d'article + bibliothèque).
package highlights

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/canon"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/identity"
	"github.com/qoefi/api/internal/modules/articles"
	"github.com/qoefi/api/internal/subscriptions"
	"github.com/qoefi/api/internal/vectorfeed"
)

const (
	// maxArticleHighlights borne la liste publique d'un article très annoté.
	maxArticleHighlights = 200
	// maxPageLimit plafonne les listes paginées de la bibliothèque.
	maxPageLimit = 100
	// maxListOffset borne la pagination profonde (offset quadratique en SQL).
	maxListOffset = 10_000
)

// Author est l'auteur d'un surlignage ou d'un commentaire d'annotation.
type Author struct {
	ID       string  `json:"id"`
	Name     *string `json:"name"`
	Username *string `json:"username"`
	LogoURL  *string `json:"logoUrl"`
	// Type (PERSONAL | MEDIA) décide de la forme de l'avatar côté UI.
	Type string `json:"type"`
}

// Highlight est un surlignage d'article (shape API).
type Highlight struct {
	ID         string  `json:"id"`
	Text       string  `json:"text"`
	Note       *string `json:"note"`
	IsPublic   bool    `json:"isPublic"`
	IsOfficial bool    `json:"isOfficial"`
	// QuoteOrdinal = quelle occurrence du passage citer (0-based) quand
	// le même texte apparaît plusieurs fois dans l'article.
	QuoteOrdinal int `json:"quoteOrdinal"`
	// Ancres canoniques (additives) : offsets en code points dans le document
	// canonique de l'article + empreinte du contenu. NULL pour les données
	// héritées non résolues — les clients retombent alors sur text+quoteOrdinal.
	CanonicalStart *int    `json:"canonicalStart,omitempty"`
	CanonicalEnd   *int    `json:"canonicalEnd,omitempty"`
	ContentSha     *string `json:"contentSha,omitempty"`
	UpvotesCount   int     `json:"upvotesCount"`
	ReaderID       string  `json:"readerId"`
	ArticleID      string  `json:"articleId"`
	CreatedAt      string  `json:"createdAt"`
	Reader         Author  `json:"reader"`
	ViewerUpvoted  bool    `json:"viewerUpvoted"`
	CommentsCount  int     `json:"commentsCount"`
}

// AnnotationComment est un commentaire attaché à un surlignage.
type AnnotationComment struct {
	ID          string `json:"id"`
	Content     string `json:"content"`
	CreatedAt   string `json:"createdAt"`
	HighlightID string `json:"highlightId"`
	Author      Author `json:"author"`
}

// MyHighlight est un surlignage du lecteur avec l'article associé (bibliothèque).
type MyHighlight struct {
	ID                    string  `json:"id"`
	Text                  string  `json:"text"`
	Note                  *string `json:"note"`
	IsPublic              bool    `json:"isPublic"`
	IsOfficial            bool    `json:"isOfficial"`
	UpvotesCount          int     `json:"upvotesCount"`
	ReaderID              string  `json:"readerId"`
	ArticleID             string  `json:"articleId"`
	CreatedAt             string  `json:"createdAt"`
	ArticleTitle          string  `json:"articleTitle"`
	ArticleSlug           string  `json:"articleSlug"`
	PublisherID           string  `json:"publisherId"`
	PublisherName         string  `json:"publisherName"`
	PublisherSlug         string  `json:"publisherSlug"`
	PublisherSubdomain    *string `json:"subdomain"`
	PublisherCustomDomain *string `json:"customDomain"`
}

// BookmarkItem est un article sauvegardé (bibliothèque).
type BookmarkItem struct {
	BookmarkID            string  `json:"bookmarkId"`
	BookmarkedAt          string  `json:"bookmarkedAt"`
	ArticleID             string  `json:"articleId"`
	ArticleTitle          string  `json:"articleTitle"`
	ArticleSlug           string  `json:"articleSlug"`
	ArticleReadingTime    int     `json:"readingTime"`
	ArticleIsPremium      bool    `json:"isPremium"`
	ArticleCreatedAt      string  `json:"articleCreatedAt"`
	ArticleContent        string  `json:"content"`
	PublisherID           string  `json:"publisherId"`
	PublisherName         string  `json:"publisherName"`
	PublisherSlug         string  `json:"publisherSlug"`
	PublisherSubdomain    *string `json:"subdomain"`
	PublisherCustomDomain *string `json:"customDomain"`
	PublisherLogo         *string `json:"logoUrl"`
	CategoryName          *string `json:"categoryName"`
	Author                Author  `json:"author"`
}

// errHighlightNotFound couvre l'inexistant ET l'inaccessible : un surlignage
// privé ou d'un compte bloqué est indistinguable d'un 404 (zéro-fuite).
var errHighlightNotFound = errors.New("surlignage introuvable")

// errQuoteNotFound signale qu'une citation publique ne correspond à aucun
// passage réel de l'article (anti-spoofing de citation).
var errQuoteNotFound = errors.New("passage introuvable dans l'article")

// errAnnotationsDisabled : l'auteur de l'article a coupé les annotations
// publiques (réglage studio `allowPublicAnnotations`). Le surlignage privé
// reste permis.
var errAnnotationsDisabled = errors.New("annotations publiques désactivées pour cet article")

// Service porte les dépendances du domaine highlights.
type Service struct {
	pool *pgxpool.Pool
	q    highlightQuerier
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}

// authorFrom construit l'identité publique d'un lecteur / commentateur. Le
// type vient de sa membership média active — jamais de la surface d'affichage.
func authorFrom(id string, name, username, logo pgtype.Text) Author {
	return Author{
		ID:       id,
		Name:     textPtr(name),
		Username: textPtr(username),
		LogoURL:  textPtr(logo),
		Type:     identity.Personal,
	}
}

func tsString(t pgtype.Timestamp) string {
	return t.Time.Format(time.RFC3339)
}

func intPtr(v pgtype.Int4) *int {
	if !v.Valid {
		return nil
	}
	n := int(v.Int32)
	return &n
}

func shaPtr(v pgtype.Text) *string {
	if !v.Valid {
		return nil
	}
	s := v.String
	return &s
}

// canViewArticle applique la visibilité de la publication (PUBLIC |
// FOLLOWERS | PRIVATE) et le blocage symétrique à la lecture des annotations.
func (s *Service) canViewArticle(ctx context.Context, articleID, viewerID string) (bool, error) {
	return s.q.CanViewArticle(ctx, db.CanViewArticleParams{ArticleId: articleID, ViewerId: toUUID(viewerID)})
}

// isBlockedWith vérifie un blocage dans un sens ou l'autre entre deux comptes.
func (s *Service) isBlockedWith(ctx context.Context, a, b string) (bool, error) {
	if a == "" || b == "" || a == b {
		return false, nil
	}
	return s.q.IsBlockedEitherWay(ctx, db.IsBlockedEitherWayParams{
		ReaderId:  toUUID(a),
		CreatorId: toUUID(b),
	})
}

// ensureHighlightAccess vérifie qu'un surlignage est visible par le viewer :
// article lisible, surlignage public (ou le sien) et aucun blocage symétrique.
func (s *Service) ensureHighlightAccess(ctx context.Context, highlightID, viewerID string) (db.GetHighlightByIDRow, error) {
	row, err := s.q.GetHighlightByID(ctx, highlightID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.GetHighlightByIDRow{}, errHighlightNotFound
		}
		return db.GetHighlightByIDRow{}, err
	}
	if row.ReaderId.String() != viewerID {
		if !row.IsPublic && !row.IsOfficial {
			return db.GetHighlightByIDRow{}, errHighlightNotFound
		}
		blocked, err := s.isBlockedWith(ctx, viewerID, row.ReaderId.String())
		if err != nil {
			return db.GetHighlightByIDRow{}, err
		}
		if blocked {
			return db.GetHighlightByIDRow{}, errHighlightNotFound
		}
	}
	allowed, err := s.canViewArticle(ctx, row.ArticleId, viewerID)
	if err != nil {
		return db.GetHighlightByIDRow{}, err
	}
	if !allowed && row.ReaderId.String() != viewerID {
		return db.GetHighlightByIDRow{}, errHighlightNotFound
	}
	return row, nil
}

// ListByArticle retourne les surlignages d'un article : publics + les siens,
// avec l'état upvote du viewer. Auth optionnelle (viewerID peut être "").
func (s *Service) ListByArticle(ctx context.Context, articleID, viewerID string) ([]Highlight, error) {
	allowed, err := s.canViewArticle(ctx, articleID, viewerID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		// Article privé / bloqué : aucune annotation ne fuit.
		return []Highlight{}, nil
	}
	rows, err := s.q.ListHighlightsByArticle(ctx, db.ListHighlightsByArticleParams{
		ArticleId: articleID,
		ViewerId:  toUUID(viewerID),
		Limit:     maxArticleHighlights,
		Offset:    0,
	})
	if err != nil {
		return nil, err
	}
	out := make([]Highlight, 0, len(rows))
	for _, r := range rows {
		out = append(out, Highlight{
			ID:             r.ID,
			Text:           r.Text,
			Note:           textPtr(r.Note),
			IsPublic:       r.IsPublic,
			IsOfficial:     r.IsOfficial,
			QuoteOrdinal:   int(r.QuoteOrdinal),
			CanonicalStart: intPtr(r.CanonicalStart),
			CanonicalEnd:   intPtr(r.CanonicalEnd),
			ContentSha:     shaPtr(r.ContentSha),
			UpvotesCount:   int(r.UpvotesCount),
			ReaderID:       r.ReaderID,
			ArticleID:      r.ArticleId,
			CreatedAt:      tsString(r.CreatedAt),
			Reader:         authorFrom(r.ReaderID, r.ReaderName, r.ReaderUsername, r.ReaderLogo),
			ViewerUpvoted:  r.ViewerUpvoted,
			CommentsCount:  int(r.CommentsCount),
		})
	}
	return out, nil
}

// resolveAnchor canonicalise le contenu de l'article et résout le passage en
// offsets (code points) + empreinte. En cas d'échec, retourne des ancres NULL
// (le surlignage reste lisible via text + quoteOrdinal — modèle hérité).
func (s *Service) resolveAnchor(ctx context.Context, articleID, text string, quoteOrdinal int) (pgtype.Int4, pgtype.Int4, pgtype.Text) {
	if s.pool == nil {
		return pgtype.Int4{}, pgtype.Int4{}, pgtype.Text{}
	}
	var html string
	if err := s.pool.QueryRow(ctx, `SELECT "content" FROM "Article" WHERE id=$1`, articleID).Scan(&html); err != nil {
		// Repli documenté (text + quoteOrdinal), mais jamais silencieux : une
		// panne de lecture ne doit pas ressembler à « ancre introuvable ».
		log.Printf("[highlights] resolveAnchor(%s): lecture contenu: %v", articleID, err)
		return pgtype.Int4{}, pgtype.Int4{}, pgtype.Text{}
	}
	doc := canon.Parse(html)
	start, end, ok := doc.Find(text, quoteOrdinal)
	if !ok {
		return pgtype.Int4{}, pgtype.Int4{}, pgtype.Text{}
	}
	return pgtype.Int4{Int32: int32(start), Valid: true},
		pgtype.Int4{Int32: int32(end), Valid: true},
		pgtype.Text{String: doc.Sha, Valid: true}
}

// Create crée un surlignage pour un lecteur sur un article.
// Surlignages illimités pour tous (gratuit et Plus).

// HighlightQuota renvoie (utilisés, plafond, plus) : plafond = -1 (illimité pour
// tous). Une erreur de lecture REMONTE : afficher « 0 » quand la base est en
// panne masquerait les vrais compteurs (le handler répond 500).
func (s *Service) HighlightQuota(ctx context.Context, readerID string) (used, limit int, plus bool, err error) {
	plus = subscriptions.HasPlus(ctx, s.pool, readerID, time.Now())
	var n int64
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM "Highlight" WHERE "readerId" = $1::uuid`, readerID).Scan(&n); err != nil {
		return 0, -1, plus, err
	}
	return int(n), -1, plus, nil
}

func (s *Service) Create(ctx context.Context, articleID, readerID, text string, note *string, isPublic bool, quoteOrdinal int) (Highlight, error) {
	allowed, err := s.canViewArticle(ctx, articleID, readerID)
	if err != nil {
		return Highlight{}, err
	}
	if !allowed {
		return Highlight{}, errHighlightNotFound
	}
	if quoteOrdinal < 0 {
		quoteOrdinal = 0
	}
	if quoteOrdinal > maxQuoteOrdinal {
		// Défense en profondeur : le handler valide déjà, mais un appel direct
		// (test, futur consommateur) ne peut plus écrire un ordinal absurde.
		return Highlight{}, errQuoteNotFound
	}
	start, end, sha := s.resolveAnchor(ctx, articleID, text, quoteOrdinal)
	if isPublic && !start.Valid {
		return Highlight{}, errQuoteNotFound
	}
	if isPublic {
		allowed, err := s.q.ArticleAllowsPublicAnnotations(ctx, articleID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return Highlight{}, errHighlightNotFound
			}
			return Highlight{}, err
		}
		if !allowed {
			return Highlight{}, errAnnotationsDisabled
		}
	}
	id, err := s.q.CreateHighlight(ctx, db.CreateHighlightParams{
		Text:           text,
		Note:           pgtype.Text{String: deref(note), Valid: note != nil},
		IsPublic:       isPublic,
		IsOfficial:     false,
		QuoteOrdinal:   int32(quoteOrdinal),
		ReaderId:       toUUID(readerID),
		ArticleId:      articleID,
		CanonicalStart: start,
		CanonicalEnd:   end,
		ContentSha:     sha,
	})
	if err != nil {
		return Highlight{}, err
	}
	// 🧠 EMA vectorielle : surligner = l'engagement le plus profond (on a
	// vraiment lu le passage) → rapproche fortement le profil du thème.
	if readerID != "" {
		var emb string
		if err := s.pool.QueryRow(ctx, `SELECT COALESCE("embedding"::text,'') FROM "Article" WHERE id=$1`, articleID).Scan(&emb); err == nil && strings.TrimSpace(emb) != "" {
			if vec, ok := vectorfeed.ParseLit(emb); ok {
				_ = vectorfeed.ApplyInteraction(ctx, s.pool, readerID, vec, vectorfeed.InteractionHighlight)
			}
		}
	}
	return s.highlightByID(ctx, id)
}

// highlightDTO mappe la ligne complète (tous les champs du contrat, ancres
// comprises) : PATCH renvoyait auparavant une forme tronquée qui faisait perdre
// quoteOrdinal et les ancres canoniques au client après une modification.
func highlightDTO(row db.GetHighlightByIDRow) Highlight {
	return Highlight{
		ID:             row.ID,
		Text:           row.Text,
		Note:           textPtr(row.Note),
		IsPublic:       row.IsPublic,
		IsOfficial:     row.IsOfficial,
		QuoteOrdinal:   int(row.QuoteOrdinal),
		CanonicalStart: intPtr(row.CanonicalStart),
		CanonicalEnd:   intPtr(row.CanonicalEnd),
		ContentSha:     shaPtr(row.ContentSha),
		UpvotesCount:   int(row.UpvotesCount),
		ReaderID:       row.ReaderID,
		ArticleID:      row.ArticleId,
		CreatedAt:      tsString(row.CreatedAt),
		Reader:         authorFrom(row.ReaderID, row.ReaderName, row.ReaderUsername, row.ReaderLogo),
	}
}

// highlightByID relit un surlignage en distinguant l'inexistant (404) d'une
// panne : avant, un PATCH sur un id inconnu partait en 500.
func (s *Service) highlightByID(ctx context.Context, id string) (Highlight, error) {
	row, err := s.q.GetHighlightByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Highlight{}, errHighlightNotFound
		}
		return Highlight{}, err
	}
	return highlightDTO(row), nil
}

// Delete supprime un de ses surlignages (ownership vérifié en requête).
func (s *Service) Delete(ctx context.Context, highlightID, readerID string) (bool, error) {
	rows, err := s.q.DeleteHighlight(ctx, db.DeleteHighlightParams{
		ID:       highlightID,
		ReaderId: toUUID(readerID),
	})
	if err != nil {
		return false, err
	}
	// 0 ligne affectée = surlignage inexistant OU non propriétaire.
	return rows > 0, nil
}

// Update modifie la note et/ou la visibilité d'un de ses surlignages
// (parité toggleHighlightPrivacy / updateHighlightNote Prisma).
func (s *Service) Update(ctx context.Context, highlightID, readerID string, note *string, isPublic *bool) (Highlight, error) {
	// On résout les valeurs finales AVANT l'UPDATE : la requête COALESCE ne
	// peut pas distinguer « non fourni » d'une valeur concrète pour un bool.
	current, err := s.q.GetHighlightByID(ctx, highlightID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Highlight{}, errHighlightNotFound
		}
		return Highlight{}, err
	}
	if current.ReaderId.String() != readerID {
		// Même réponse que l'inexistant : zéro-fuite sur le surlignage d'autrui.
		return Highlight{}, errHighlightNotFound
	}
	finalNote := current.Note
	if note != nil {
		finalNote = pgtype.Text{String: *note, Valid: *note != ""}
	}
	finalPublic := current.IsPublic
	if isPublic != nil {
		finalPublic = *isPublic
	}
	if _, err := s.q.UpdateHighlight(ctx, db.UpdateHighlightParams{
		ID:       highlightID,
		ReaderId: toUUID(readerID),
		Note:     finalNote,
		IsPublic: finalPublic,
	}); err != nil {
		return Highlight{}, err
	}
	return s.highlightByID(ctx, highlightID)
}

// ToggleUpvote ajoute/retire l'upvote du viewer sur un surlignage.
// Transaction unique + verrou de la ligne : l'état renvoyé est celui qui vient
// d'être écrit, même sous double-tap concurrent.
func (s *Service) ToggleUpvote(ctx context.Context, highlightID, userID string) (upvoted bool, count int, err error) {
	if _, err := s.ensureHighlightAccess(ctx, highlightID, userID); err != nil {
		return false, 0, err
	}

	// Le basculement est atomique : trois requêtes séparées (insert, delete,
	// count) laissaient deux taps concurrents s'annuler et renvoyaient un
	// `upvoted` qui ne correspondait pas à l'état réel. La ligne du surlignage
	// est verrouillée, l'existence est lue dans la même transaction que
	// l'écriture et le compteur.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var lockedID string
	if err := tx.QueryRow(ctx, `SELECT id FROM "Highlight" WHERE id = $1 FOR UPDATE`, highlightID).Scan(&lockedID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, 0, errHighlightNotFound
		}
		return false, 0, err
	}

	var exists bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM "AnnotationUpvote" WHERE "highlightId" = $1 AND "userId" = $2)`,
		highlightID, toUUID(userID)).Scan(&exists); err != nil {
		return false, 0, err
	}
	if exists {
		if _, err := tx.Exec(ctx,
			`DELETE FROM "AnnotationUpvote" WHERE "highlightId" = $1 AND "userId" = $2`,
			highlightID, toUUID(userID)); err != nil {
			return false, 0, err
		}
	} else {
		if _, err := tx.Exec(ctx,
			`INSERT INTO "AnnotationUpvote" (id, "highlightId", "userId")
			 VALUES (gen_random_uuid()::text, $1, $2)
			 ON CONFLICT ("highlightId", "userId") DO NOTHING`,
			highlightID, toUUID(userID)); err != nil {
			return false, 0, err
		}
		upvoted = true
	}

	var total int32
	if err := tx.QueryRow(ctx,
		`SELECT COUNT(*)::int FROM "AnnotationUpvote" WHERE "highlightId" = $1`,
		highlightID).Scan(&total); err != nil {
		return false, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, 0, err
	}
	return upvoted, int(total), nil
}

// ListComments retourne les commentaires d'un surlignage visibles par le
// viewer (surlignage public ou le sien, sans blocage symétrique).
func (s *Service) ListComments(ctx context.Context, highlightID, viewerID string) ([]AnnotationComment, error) {
	if _, err := s.ensureHighlightAccess(ctx, highlightID, viewerID); err != nil {
		return nil, err
	}
	rows, err := s.q.ListAnnotationComments(ctx, db.ListAnnotationCommentsParams{
		HighlightId: highlightID,
		ViewerId:    toUUID(viewerID),
	})
	if err != nil {
		return nil, err
	}
	out := make([]AnnotationComment, 0, len(rows))
	for _, r := range rows {
		out = append(out, AnnotationComment{
			ID:          r.ID,
			Content:     r.Content,
			CreatedAt:   tsString(r.CreatedAt),
			HighlightID: r.HighlightId,
			Author:      authorFrom(r.AuthorID, r.AuthorName, r.AuthorUsername, r.AuthorLogo),
		})
	}
	return out, nil
}

// CreateComment ajoute un commentaire d'annotation.
func (s *Service) CreateComment(ctx context.Context, highlightID, authorID, content string) (AnnotationComment, error) {
	if _, err := s.ensureHighlightAccess(ctx, highlightID, authorID); err != nil {
		return AnnotationComment{}, err
	}
	id, err := s.q.CreateAnnotationComment(ctx, db.CreateAnnotationCommentParams{
		Content:     content,
		HighlightId: highlightID,
		AuthorId:    toUUID(authorID),
	})
	if err != nil {
		return AnnotationComment{}, err
	}
	rows, err := s.q.ListAnnotationComments(ctx, db.ListAnnotationCommentsParams{
		HighlightId: highlightID,
		ViewerId:    toUUID(authorID),
	})
	if err != nil {
		return AnnotationComment{}, err
	}
	for _, r := range rows {
		if r.ID == id {
			return AnnotationComment{
				ID:          r.ID,
				Content:     r.Content,
				CreatedAt:   tsString(r.CreatedAt),
				HighlightID: r.HighlightId,
				Author:      authorFrom(r.AuthorID, r.AuthorName, r.AuthorUsername, r.AuthorLogo),
			}, nil
		}
	}
	// Le commentaire est écrit mais invisible (blocage ou surlignage devenu
	// privé entre-temps) : répondre 201 avec un objet vide annonçait un succès
	// que le client ne pouvait pas afficher.
	log.Printf("[highlights] CreateComment: commentaire %s introuvable en relecture", id)
	return AnnotationComment{}, errors.New("commentaire créé mais introuvable en relecture")
}

// DeleteComment supprime un de ses commentaires d'annotation.
func (s *Service) DeleteComment(ctx context.Context, commentID, authorID string) (bool, error) {
	rows, err := s.q.DeleteAnnotationComment(ctx, db.DeleteAnnotationCommentParams{
		ID:       commentID,
		AuthorId: toUUID(authorID),
	})
	if err != nil {
		return false, err
	}
	return rows > 0, nil
}

// MyHighlights retourne les surlignages du lecteur (bibliothèque), paginés.
func (s *Service) MyHighlights(ctx context.Context, readerID string, limit, offset int) ([]MyHighlight, error) {
	limit, offset = clampPage(limit, offset)
	rows, err := s.q.ListMyHighlights(ctx, db.ListMyHighlightsParams{
		ReaderId: toUUID(readerID),
		Limit:    int32(limit),
		Offset:   int32(offset),
	})
	if err != nil {
		return nil, err
	}
	out := make([]MyHighlight, 0, len(rows))
	for _, r := range rows {
		out = append(out, MyHighlight{
			ID:                    r.ID,
			Text:                  r.Text,
			Note:                  textPtr(r.Note),
			IsPublic:              r.IsPublic,
			IsOfficial:            r.IsOfficial,
			UpvotesCount:          int(r.UpvotesCount),
			ReaderID:              r.ReaderId.String(),
			ArticleID:             r.ArticleId,
			CreatedAt:             tsString(r.CreatedAt),
			ArticleTitle:          r.ArticleTitle,
			ArticleSlug:           r.ArticleSlug,
			PublisherID:           r.PublisherID,
			PublisherName:         r.PublisherName,
			PublisherSlug:         r.PublisherSlug,
			PublisherSubdomain:    textPtr(r.PublisherSubdomain),
			PublisherCustomDomain: textPtr(r.PublisherCustomDomain),
		})
	}
	return out, nil
}

// clampPage borne la page (défaut 20, max 100) et la pagination profonde.
func clampPage(limit, offset int) (int, int) {
	if limit <= 0 || limit > maxPageLimit {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	if offset > maxListOffset {
		offset = maxListOffset
	}
	return limit, offset
}

// Bookmarks retourne les articles sauvegardés d'un lecteur (bibliothèque),
// paginés et **coupés au paywall** : la bibliothèque servait le HTML complet
// d'un article premium à un lecteur non abonné (contournement du paywall).
func (s *Service) Bookmarks(ctx context.Context, readerID string, limit, offset int) ([]BookmarkItem, error) {
	limit, offset = clampPage(limit, offset)
	rows, err := s.q.ListBookmarksByReader(ctx, db.ListBookmarksByReaderParams{
		ReaderId: toUUID(readerID),
		Limit:    int32(limit),
		Offset:   int32(offset),
	})
	if err != nil {
		return nil, err
	}
	// Entitlements calculés une fois par publication de la page (pas un appel
	// par bookmark), comme `publishers`/`feed` pour leurs listes.
	entitlements := make(map[string]articles.UserEntitlements, 4)
	for _, r := range rows {
		if _, seen := entitlements[r.PublisherID]; seen {
			continue
		}
		ent := articles.UserEntitlements{}
		sub, err := s.q.GetSubscriberEntitlement(ctx, db.GetSubscriberEntitlementParams{
			PublisherId: r.PublisherID,
			UserId:      toUUID(readerID),
			Email:       "",
		})
		switch {
		case err == nil:
			ent.IsMember = sub.IsActive
			ent.IsPaidSubscriber = sub.IsPremium && sub.IsActive
			if sub.TierId.Valid {
				tier := sub.TierId.String
				ent.TierID = &tier
			}
		case errors.Is(err, pgx.ErrNoRows):
			// Pas d'abonnement : accès public seulement.
		default:
			return nil, err
		}
		entitlements[r.PublisherID] = ent
	}
	out := make([]BookmarkItem, 0, len(rows))
	for _, r := range rows {
		cut := articles.SliceContentAtPaywall(r.ArticleContent, entitlements[r.PublisherID], r.ArticleVisibility, textPtr(r.ArticleTierID))
		out = append(out, BookmarkItem{
			BookmarkID:            r.BookmarkID,
			BookmarkedAt:          tsString(r.BookmarkedAt),
			ArticleID:             r.ArticleID,
			ArticleTitle:          r.ArticleTitle,
			ArticleSlug:           r.ArticleSlug,
			ArticleReadingTime:    int(r.ArticleReadingTime),
			ArticleIsPremium:      r.ArticleIsPremium,
			ArticleCreatedAt:      tsString(r.ArticleCreatedAt),
			PublisherID:           r.PublisherID,
			PublisherName:         r.PublisherName,
			PublisherSlug:         r.PublisherSlug,
			PublisherSubdomain:    textPtr(r.PublisherSubdomain),
			PublisherCustomDomain: textPtr(r.PublisherCustomDomain),
			PublisherLogo:         textPtr(r.PublisherLogo),
			ArticleContent:        cut.Content,
			CategoryName:          textPtr(r.CategoryName), Author: authorFrom(r.AuthorID, r.AuthorName, r.AuthorUsername, r.AuthorLogo),
		})
	}
	return out, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
