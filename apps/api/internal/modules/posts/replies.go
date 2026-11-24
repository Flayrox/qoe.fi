// Fils de réponses : une seule pagination par curseur pour toutes les
// surfaces (réponses d'un post, fil d'une conversation, commentaires d'un
// article, réponses d'un profil).
//
// Le curseur est un ordre total ("createdAt", id) encodé en base64url. Il ne
// dépend d'aucun offset : une réponse publiée pendant la lecture tombe après
// le curseur, donc dans une page suivante, jamais en double ni en trou.
package posts

import (
	"context"
	"encoding/base64"
	"errors"
	"github.com/qoefi/api/internal/eligibility"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// Portées de lecture d'un fil.
const (
	// ReplyScopeChildren : réponses directes d'un post.
	ReplyScopeChildren = "children"
	// ReplyScopeThread : tous les descendants d'une conversation (par rootId).
	ReplyScopeThread = "thread"
	// ReplyScopeRoots : commentaires de niveau 1 d'un article.
	ReplyScopeRoots = "roots"
)

const (
	// DefaultReplyLimit est la taille de page par défaut d'un fil.
	DefaultReplyLimit = 20
	// MaxReplyLimit borne une page : au-delà, la réponse devient lourde et le
	// client n'en affiche pas tant.
	MaxReplyLimit = 50
)

// ErrInvalidCursor signale un curseur illisible. Les handlers le traduisent en
// 400 : un curseur corrompu ne doit pas être interprété comme « première
// page » (l'utilisateur verrait deux fois le début du fil).
var ErrInvalidCursor = errors.New("curseur de pagination invalide")

// ReplyAuthor est l'auteur dénormalisé d'une réponse. Nil sur un tombstone :
// un contenu supprimé ne doit jamais révéler qui l'a écrit.
type ReplyAuthor struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
}

// ReplyItem est une réponse de fil telle que l'API la rend.
type ReplyItem struct {
	ID        string  `json:"id"`
	ParentID  *string `json:"parentId"`
	RootID    *string `json:"rootId"`
	CreatedAt string  `json:"createdAt"`
	UpdatedAt string  `json:"updatedAt"`
	Content   string  `json:"content"`
	// Tombstone : la place de la réponse est conservée (structure du fil et
	// compteur) mais ni le contenu ni l'auteur ne sortent.
	Tombstone bool `json:"tombstone"`
	// TombstoneReason est le code machine de l'exclusion (deleted, moderated,
	// blocked, muted_word, ...), Why sa version lisible. L'interface explique
	// la place vide sans jamais révéler le contenu (L43).
	TombstoneReason string       `json:"tombstoneReason,omitempty"`
	Why             string       `json:"why,omitempty"`
	ReplyCount      int          `json:"replyCount"`
	LikeCount       int          `json:"likeCount"`
	RepostCount     int          `json:"repostCount"`
	Author          *ReplyAuthor `json:"author"`
}

// ReplyPage est une page de fil.
type ReplyPage struct {
	Items      []ReplyItem `json:"items"`
	NextCursor string      `json:"nextCursor"`
	HasMore    bool        `json:"hasMore"`
}

// NormalizeReplyLimit ramène une taille de page demandée dans les bornes.
func NormalizeReplyLimit(raw int) int {
	if raw <= 0 {
		return DefaultReplyLimit
	}
	if raw > MaxReplyLimit {
		return MaxReplyLimit
	}
	return raw
}

// EncodeReplyCursor sérialise la position de la dernière ligne lue.
func EncodeReplyCursor(at time.Time, id string) string {
	raw := at.UTC().Format(time.RFC3339Nano) + "|" + id
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

// DecodeReplyCursor relit un curseur. Un curseur absent vaut « première
// page » ; un curseur présent mais illisible est une erreur, jamais un
// silencieux retour au début.
func DecodeReplyCursor(cursor string) (pgtype.Timestamp, pgtype.Text, error) {
	if strings.TrimSpace(cursor) == "" {
		return pgtype.Timestamp{}, pgtype.Text{}, nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return pgtype.Timestamp{}, pgtype.Text{}, ErrInvalidCursor
	}
	at, id, ok := strings.Cut(string(decoded), "|")
	if !ok || id == "" {
		return pgtype.Timestamp{}, pgtype.Text{}, ErrInvalidCursor
	}
	parsed, err := time.Parse(time.RFC3339Nano, at)
	if err != nil {
		return pgtype.Timestamp{}, pgtype.Text{}, ErrInvalidCursor
	}
	return pgtype.Timestamp{Time: parsed.UTC(), Valid: true},
		pgtype.Text{String: id, Valid: true}, nil
}

// ReplyItemFromRow mappe une ligne sqlc vers la forme API. Le tombstone efface
// auteur et contenu : la décision de visibilité est prise en SQL (une seule
// politique pour toutes les surfaces).
func ReplyItemFromRow(row db.ListThreadPageRow) ReplyItem {
	item := ReplyItem{
		ID:         row.ID,
		ParentID:   textPtr(row.ParentId),
		RootID:     textPtr(row.RootId),
		CreatedAt:  row.CreatedAt.Time.UTC().Format(time.RFC3339),
		UpdatedAt:  row.UpdatedAt.Time.UTC().Format(time.RFC3339),
		ReplyCount: int(row.ReplyCount),
		Content:    row.Content,
		Tombstone:  row.Tombstone,
	}
	if row.Tombstone {
		reason := eligibility.Reason(row.TombstoneReason)
		item.TombstoneReason = string(reason)
		item.Why = eligibility.WhyFor(reason, eligibility.SurfaceThread)
	}
	if !row.Tombstone {
		item.LikeCount = int(row.LikeCount)
		item.RepostCount = int(row.RepostCount)
		item.Author = &ReplyAuthor{
			ID:          row.AuthorID,
			Name:        textPtr(row.AuthorName),
			Username:    textPtr(row.AuthorUsername),
			LogoURL:     textPtr(row.AuthorLogo),
			IsCertified: row.AuthorCertified,
		}
	}
	return item
}

// ReplyQuerier est la seule méthode dont la pagination a besoin : elle se
// branche aussi bien sur db.Queries que sur l'interface de test d'un module.
type ReplyQuerier interface {
	ListThreadPage(ctx context.Context, arg db.ListThreadPageParams) ([]db.ListThreadPageRow, error)
}

// ReplyPageFor lit une page de fil. C'est l'unique chemin de lecture des
// réponses : les trois surfaces passent par ici, donc la politique de
// visibilité et l'ordre ne peuvent pas diverger.
func ReplyPageFor(
	ctx context.Context,
	q ReplyQuerier,
	scope, parentID, rootID, articleID, viewerID, cursor string,
	limit int,
) (ReplyPage, error) {
	page := NormalizeReplyLimit(limit)
	cursorAt, cursorID, err := DecodeReplyCursor(cursor)
	if err != nil {
		return ReplyPage{}, err
	}
	// Une ligne de plus que la page : sa présence dit « il reste quelque
	// chose », sans compter le fil entier.
	rows, err := q.ListThreadPage(ctx, db.ListThreadPageParams{
		Scope:     scope,
		ParentID:  parentID,
		RootID:    rootID,
		ArticleID: articleID,
		ViewerID:  toUUID(viewerID),
		CursorAt:  cursorAt,
		CursorID:  cursorID,
		TakeCount: int32(page + 1),
	})
	if err != nil {
		return ReplyPage{}, err
	}
	out := ReplyPage{Items: make([]ReplyItem, 0, page)}
	for i, row := range rows {
		if i == page {
			last := rows[page-1]
			out.NextCursor = EncodeReplyCursor(last.CreatedAt.Time, last.ID)
			out.HasMore = true
			break
		}
		out.Items = append(out.Items, ReplyItemFromRow(row))
	}
	return out, nil
}
