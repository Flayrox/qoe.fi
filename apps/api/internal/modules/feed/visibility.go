package feed

import (
	"context"

	db "github.com/qoefi/api/internal/database"
)

// postVisible est la décision d'accès à une pensée. Les routes qui la servent
// (`GET /v1/posts/{id}/thread`, `POST /v1/feed/hydrate`, la home) sont publiques
// ou à auth optionnelle : la visibilité de la PENSÉE (pas seulement celle du
// profil) doit être vérifiée. Inconnue = refus (fermé par défaut).
func postVisible(visibility string, viewerIsAuthor, viewerFollowsAuthor bool) bool {
	if viewerIsAuthor {
		return true
	}
	switch visibility {
	case "public":
		return true
	case "followers":
		return viewerFollowsAuthor
	}
	return false
}

// dropInvisiblePosts retire de la fermeture chargée les pensées que le viewer
// n'a pas le droit de voir. Une pensée « followers » n'est donc jamais servie
// à un visiteur anonyme, et son contenu ne sort pas par le parent non plus :
// l'assemblage la traite ensuite comme indisponible (placeholder existant).
func (s *Service) dropInvisiblePosts(ctx context.Context, all map[string]*db.GetPostsByIDsRow, viewerID string) error {
	if len(all) == 0 {
		return nil
	}
	ids := make([]string, 0, len(all))
	for id := range all {
		ids = append(ids, id)
	}
	rows, err := s.pool.Query(ctx, `
		SELECT p.id, p."authorId"::text, p.visibility,
		       EXISTS (
		         SELECT 1 FROM "Follows" f
		         JOIN "User" u ON u."publisherId" = f."publisherId"
		         WHERE f."readerId" = $2 AND u.id = p."authorId"
		       ) AS viewer_follows
		FROM "Post" p
		WHERE p.id = ANY($1::text[])`, ids, toUUID(viewerID))
	if err != nil {
		return err
	}
	defer rows.Close()

	allowed := make(map[string]bool, len(ids))
	for rows.Next() {
		var id, authorID, visibility string
		var follows bool
		if err := rows.Scan(&id, &authorID, &visibility, &follows); err != nil {
			continue
		}
		if postVisible(visibility, viewerID != "" && viewerID == authorID, follows) {
			allowed[id] = true
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for id := range all {
		if !allowed[id] {
			delete(all, id)
		}
	}
	return nil
}
