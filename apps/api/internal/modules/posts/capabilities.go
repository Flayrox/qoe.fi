package posts

// ─────────────────────────────────────────────────────────────────────────────
// Server-driven capabilities — les droits d'action d'un viewer sur une pensée
// sont CALCULÉS ici et consommés déclarativement par l'UI (ThoughtCard,
// ArticleCard, ArticleEngagementBar). Le front n'a plus à deviner avec
// `currentUserId === author.id` ni à réimplémenter les règles de threadgate.
// ─────────────────────────────────────────────────────────────────────────────

import (
	"context"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

// Raisons de verrouillage d'une réponse (contrat JSON stable avec le front).
const (
	ReplyLockBlocked         = "blocked"
	ReplyLockSubscribersOnly = "subscribers_only"
	ReplyLockFollowingOnly   = "following_only"
	ReplyLockMentionedOnly   = "mentioned_only"
)

// ViewerGraph regroupe les relations entre le viewer et les auteurs d'une page,
// chargées en une passe pour que l'assemblage des FeedPost reste pur (aucune
// requête par post). Toutes les maps sont indexées par authorID.
type ViewerGraph struct {
	// ViewerID permet de calculer isSelf sans le faire circuler séparément.
	ViewerID string
	// Following : le viewer suit-il cet auteur ?
	Following map[string]bool
	// AuthorFollowsViewer : cet auteur suit-il le viewer ? (threadgate
	// « following »)
	AuthorFollowsViewer map[string]bool
	// Muted : cet auteur est-il en sourdine pour le viewer ?
	Muted map[string]bool
	// Blocked : blocage dans un sens ou l'autre entre viewer et auteur.
	Blocked map[string]bool
	// ViewerUsername sert au threadgate « mentioned ».
	ViewerUsername string
}

// EmptyViewerGraph renvoie un graphe vide utilisable sans requête (visiteur,
// tests, chemins qui n'ont pas de pool).
func EmptyViewerGraph(viewerID string, following map[string]bool) ViewerGraph {
	if following == nil {
		following = map[string]bool{}
	}
	return ViewerGraph{
		ViewerID:            viewerID,
		Following:           following,
		AuthorFollowsViewer: map[string]bool{},
		Muted:               map[string]bool{},
		Blocked:             map[string]bool{},
	}
}

// LoadViewerGraph complète les relations viewer → auteurs en DEUX requêtes au
// plus (pseudo du viewer + état social groupé). `following` est fourni par
// l'appelant (déjà chargé par FollowingFor) pour ne pas requêter deux fois.
//
// Best-effort : une erreur de lecture rend un graphe partiel mais jamais une
// erreur — les capabilities sont un affinage d'UX, pas une garde de sécurité
// (le serveur revalide toujours à l'écriture via CanReply / ToggleMute).
func LoadViewerGraph(ctx context.Context, pool *pgxpool.Pool, viewerID string, authorIDs []string, following map[string]bool) ViewerGraph {
	g := EmptyViewerGraph(viewerID, following)
	if pool == nil || viewerID == "" || len(authorIDs) == 0 {
		return g
	}

	_ = pool.QueryRow(ctx,
		`SELECT COALESCE(username, '') FROM "User" WHERE id = $1`, toUUID(viewerID),
	).Scan(&g.ViewerUsername)

	uuids := make([]pgtype.UUID, 0, len(authorIDs))
	for _, id := range authorIDs {
		uuids = append(uuids, toUUID(id))
	}
	rows, err := pool.Query(ctx, `
		SELECT u.id::text,
		       EXISTS (
		         SELECT 1 FROM "Follows" f
		         JOIN "User" me ON me."publicationId" = f."publicationId"
		         WHERE f."readerId" = u.id AND me.id = $1
		       ) AS author_follows_viewer,
		       is_muted_by($1, u.id) AS muted,
		       is_blocked_bidirectional($1, u.id) AS blocked
		FROM "User" u
		WHERE u.id = ANY($2::uuid[])`, toUUID(viewerID), uuids)
	if err != nil {
		return g
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var follows, muted, blocked bool
		if rows.Scan(&id, &follows, &muted, &blocked) == nil {
			g.AuthorFollowsViewer[id] = follows
			g.Muted[id] = muted
			g.Blocked[id] = blocked
		}
	}
	return g
}

// ContainsMention indique si `content` mentionne `username`, avec une frontière
// de mot (`@jean` ne matche pas `@jeanne`). Fonction pure, testable.
func ContainsMention(content, username string) bool {
	username = strings.TrimSpace(strings.TrimPrefix(username, "@"))
	if username == "" {
		return false
	}
	lower := strings.ToLower(content)
	needle := "@" + strings.ToLower(username)
	for offset := 0; offset < len(lower); {
		idx := strings.Index(lower[offset:], needle)
		if idx < 0 {
			return false
		}
		start := offset + idx
		end := start + len(needle)
		if end >= len(lower) || !isHandleChar(rune(lower[end])) {
			return true
		}
		offset = end
	}
	return false
}

func isHandleChar(r rune) bool {
	return r == '_' || unicode.IsLetter(r) || unicode.IsDigit(r)
}

// RootAuthorOf renvoie l'auteur de la racine de conversation d'une pensée.
// On remonte d'abord l'id racine, puis, à défaut, le parent direct : un parent
// sans parent EST la racine. Fonction pure.
func RootAuthorOf(r *db.GetPostsByIDsRow, all map[string]*db.GetPostsByIDsRow) string {
	if r == nil {
		return ""
	}
	if rid := RootIDOf(r); rid != nil {
		if root, ok := all[*rid]; ok {
			return root.AuthorId
		}
	}
	if pid := ParentIDOf(r); pid != nil {
		if parent, ok := all[*pid]; ok {
			if grand := ParentIDOf(parent); grand != nil {
				if root, ok := all[*grand]; ok {
					return root.AuthorId
				}
			}
			return parent.AuthorId
		}
	}
	return ""
}

// ComputePostCapabilities calcule les droits du viewer sur une pensée.
// Fonction pure et déterministe : aucune requête, aucun état global — donc
// testable sans Postgres et cohérente pour tous les flux (feed, thread, profil).
func ComputePostCapabilities(r *db.GetPostsByIDsRow, rootAuthorID string, graph ViewerGraph) PostCapabilities {
	caps := PostCapabilities{}
	if r == nil {
		return caps
	}

	isSelf := graph.ViewerID != "" && graph.ViewerID == r.AuthorId
	caps.IsSelf = isSelf
	caps.CanDelete = isSelf
	caps.CanPin = isSelf && !r.ParentId.Valid
	caps.CanHideReply = graph.ViewerID != "" && r.ParentId.Valid && rootAuthorID == graph.ViewerID && !isSelf
	caps.CanReport = !isSelf
	caps.CanMuteAuthor = graph.ViewerID != "" && !isSelf
	caps.CanBlockAuthor = graph.ViewerID != "" && !isSelf

	// Un visiteur ne peut jamais répondre : l'authentification est exigée à
	// l'écriture. Aucun motif de threadgate ne doit fuiter pour autant.
	if graph.ViewerID == "" {
		caps.CanReply = false
		return caps
	}
	if isSelf {
		caps.CanReply = true
		return caps
	}
	// Blocage symétrique : le contenu reste lisible (il n'est pas ici filtré),
	// mais aucune réponse ne part vers un compte bloqué.
	if graph.Blocked[r.AuthorId] {
		caps.CanReply = false
		caps.ReplyLockReason = ReplyLockBlocked
		return caps
	}

	switch r.ReplyRestriction {
	case "", "everyone":
		caps.CanReply = true
	case "subscribers":
		// Le batch ne peut pas vérifier l'abonnement sans une requête par post :
		// on verrouille et le détail du thread (GET /can-reply) affine.
		caps.CanReply = false
		caps.ReplyLockReason = ReplyLockSubscribersOnly
	case "following":
		// Si le graphe n'a pas pu établir la relation inverse, on reste
		// permissif : le serveur refuse de toute façon à l'écriture.
		follows, known := graph.AuthorFollowsViewer[r.AuthorId]
		caps.CanReply = !known || follows
		if !caps.CanReply {
			caps.ReplyLockReason = ReplyLockFollowingOnly
		}
	case "mentioned":
		caps.CanReply = ContainsMention(r.Content, graph.ViewerUsername)
		if !caps.CanReply {
			caps.ReplyLockReason = ReplyLockMentionedOnly
		}
	default:
		caps.CanReply = true
	}
	return caps
}
