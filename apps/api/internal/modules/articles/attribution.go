package articles

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// AttributionInfo est une attribution d'article pour l'éditeur (co-auteur).
type AttributionInfo struct {
	User          AuthorInfo `json:"user"`
	Role          string     `json:"role"`
	Order         int        `json:"order"`
	IsVisible     bool       `json:"isVisible"`
	ConsentStatus string     `json:"consentStatus"`
}

func (s *Service) fetchUserIsCertified(ctx context.Context, userID string) *bool {
	if s.pool == nil {
		return nil
	}
	var v bool
	if err := s.pool.QueryRow(ctx, `SELECT "isCertified" FROM "User" WHERE id=$1`, userID).Scan(&v); err != nil {
		return nil
	}
	return &v
}

func (s *Service) fetchAttributions(ctx context.Context, articleID string) []AttributionInfo {
	if s.pool == nil {
		return []AttributionInfo{}
	}
	rows, err := s.pool.Query(ctx, `
		SELECT aa.role, aa."order", aa."isVisible", aa."consentStatus",
		       u.id::text, u.name, u.username, u."logoUrl", u."isCertified"
		FROM "ArticleAttribution" aa
		JOIN "User" u ON u.id = aa."userId"
		WHERE aa."articleId"=$1
		ORDER BY aa."order" ASC`, articleID)
	if err != nil {
		return []AttributionInfo{}
	}
	defer rows.Close()
	out := []AttributionInfo{}
	for rows.Next() {
		var role string
		var order int32
		var isVisible bool
		var consentStatus string
		var uid string
		var name, username, logoUrl pgtype.Text
		var isCertified bool
		if err := rows.Scan(&role, &order, &isVisible, &consentStatus, &uid, &name, &username, &logoUrl, &isCertified); err != nil {
			continue
		}
		out = append(out, AttributionInfo{
			User: AuthorInfo{
				ID: uid, Name: textPtr(name), Username: textPtr(username), LogoURL: textPtr(logoUrl), IsCertified: isCertified,
			},
			Role: role, Order: int(order), IsVisible: isVisible, ConsentStatus: consentStatus,
		})
	}
	return out
}

func (s *Service) fetchCoAuthors(ctx context.Context, articleID string) []AuthorInfo {
	if s.pool == nil {
		return []AuthorInfo{}
	}
	rows, err := s.pool.Query(ctx, `
		SELECT u.id::text, u.name, u.username, u."logoUrl", u."isCertified"
		FROM "_CoAuthors" ca
		JOIN "User" u ON u.id = ca."B"
		WHERE ca."A"=$1`, articleID)
	if err != nil {
		return []AuthorInfo{}
	}
	defer rows.Close()
	out := []AuthorInfo{}
	for rows.Next() {
		var uid string
		var name, username, logoUrl pgtype.Text
		var isCertified bool
		if err := rows.Scan(&uid, &name, &username, &logoUrl, &isCertified); err != nil {
			continue
		}
		out = append(out, AuthorInfo{ID: uid, Name: textPtr(name), Username: textPtr(username), LogoURL: textPtr(logoUrl), IsCertified: isCertified})
	}
	// Enrichit avec les co-auteurs issus de ArticleAttribution
	attrRows, err := s.pool.Query(ctx, `
		SELECT u.id::text, u.name, u.username, u."logoUrl", u."isCertified"
		FROM "ArticleAttribution" aa
		JOIN "User" u ON u.id = aa."userId"
		WHERE aa."articleId"=$1 AND aa.role='CO_AUTHOR' AND aa."consentStatus"='ACCEPTED'`, articleID)
	if err == nil {
		defer attrRows.Close()
		seen := make(map[string]bool)
		for _, a := range out {
			seen[a.ID] = true
		}
		for attrRows.Next() {
			var uid string
			var name, username, logoUrl pgtype.Text
			var isCertified bool
			if err := attrRows.Scan(&uid, &name, &username, &logoUrl, &isCertified); err == nil && !seen[uid] {
				seen[uid] = true
				out = append(out, AuthorInfo{ID: uid, Name: textPtr(name), Username: textPtr(username), LogoURL: textPtr(logoUrl), IsCertified: isCertified})
			}
		}
	}
	return out
}

func (s *Service) syncAttributions(ctx context.Context, articleID, authorID string, attributions []ArticleAttributionInput, showOnPersonalProfile ...bool) {
	if s.pool == nil {
		return
	}
	primaryVisible := true
	if len(showOnPersonalProfile) > 0 {
		primaryVisible = showOnPersonalProfile[0]
	}
	// Toujours s'assurer que l'auteur principal a son attribution PRIMARY_AUTHOR ACCEPTED,
	// avec isVisible synchronisé avec showOnPersonalProfile.
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO "ArticleAttribution" (id, "articleId", "userId", role, "order", "isVisible", "consentStatus", "consentUpdatedAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2, 'PRIMARY_AUTHOR', 0, $3, 'ACCEPTED', now(), now())
		ON CONFLICT ("articleId", "userId") DO UPDATE SET
		  role = 'PRIMARY_AUTHOR', "order" = 0, "isVisible" = $3, "consentStatus" = 'ACCEPTED', "updatedAt" = now()
	`, articleID, toUUID(authorID), primaryVisible)

	newUsers := make(map[string]bool)
	for _, attr := range attributions {
		if attr.UserID != "" && attr.UserID != authorID {
			newUsers[attr.UserID] = true
		}
	}

	// Détecter les attributions supprimées / révoquées
	existingRows, err := s.pool.Query(ctx, `
		SELECT "userId"::text, "consentStatus"
		FROM "ArticleAttribution"
		WHERE "articleId" = $1 AND "userId" != $2
	`, articleID, toUUID(authorID))
	if err == nil {
		type existingContr struct {
			userID string
			status string
		}
		var toRevoke []existingContr
		var toDelete []string
		for existingRows.Next() {
			var uID, status string
			if scanErr := existingRows.Scan(&uID, &status); scanErr == nil {
				if !newUsers[uID] {
					if status == "ACCEPTED" {
						toRevoke = append(toRevoke, existingContr{userID: uID, status: status})
					} else if status == "PENDING" {
						toDelete = append(toDelete, uID)
					}
				}
			}
		}
		existingRows.Close()

		if len(toRevoke) > 0 {
			articleRow, _ := s.q.GetArticleByID(ctx, articleID)
			for _, r := range toRevoke {
				if articleRow.ID != "" {
					_ = s.captureSnapshot(ctx, articleID, &r.userID, articleRow.Title, articleRow.Content, "BEFORE_REVOCATION")
				}
				_, _ = s.pool.Exec(ctx, `
					UPDATE "ArticleAttribution"
					SET "consentStatus" = 'REVOKED', "isVisible" = false, "updatedAt" = now()
					WHERE "articleId" = $1 AND "userId" = $2
				`, articleID, toUUID(r.userID))
			}
		}
		for _, dID := range toDelete {
			_, _ = s.pool.Exec(ctx, `DELETE FROM "ArticleAttribution" WHERE "articleId" = $1 AND "userId" = $2`, articleID, toUUID(dID))
			_, _ = s.pool.Exec(ctx, `DELETE FROM "CollaborationRequest" WHERE "articleId" = $1 AND "inviteeId" = $2`, articleID, toUUID(dID))
		}
	}

	if len(attributions) == 0 {
		return
	}

	for _, attr := range attributions {
		if attr.UserID == "" || attr.UserID == authorID {
			continue
		}
		role := attr.Role
		if role == "" {
			role = "CO_AUTHOR"
		}
		order := attr.Order
		if order <= 0 {
			order = 1
		}

		// Vérifie si une attribution existe déjà
		var existingConsent pgtype.Text
		err := s.pool.QueryRow(ctx, `
			SELECT "consentStatus" FROM "ArticleAttribution"
			WHERE "articleId" = $1 AND "userId" = $2
		`, articleID, toUUID(attr.UserID)).Scan(&existingConsent)

		if errors.Is(err, pgx.ErrNoRows) {
			// Nouveau contributeur : insertion avec statut PENDING
			_, _ = s.pool.Exec(ctx, `
				INSERT INTO "ArticleAttribution" (id, "articleId", "userId", role, "order", "isVisible", "consentStatus", "consentUpdatedAt", "updatedAt")
				VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'PENDING', now(), now())
				ON CONFLICT ("articleId", "userId") DO NOTHING
			`, articleID, toUUID(attr.UserID), role, order, attr.IsVisible)

			// Création de la demande de collaboration
			_, _ = s.pool.Exec(ctx, `
				INSERT INTO "CollaborationRequest" (id, "articleId", "inviterId", "inviteeId", status, "requestedRole", "requestedOrder", "showOnPublicProfile", "createdAt", "updatedAt")
				VALUES (gen_random_uuid()::text, $1, $2, $3, 'PENDING', $4, $5, $6, now(), now())
				ON CONFLICT ("articleId", "inviteeId") DO UPDATE SET
				  status = 'PENDING', "requestedRole" = $4, "requestedOrder" = $5, "showOnPublicProfile" = $6, "updatedAt" = now()
			`, articleID, toUUID(authorID), toUUID(attr.UserID), role, order, attr.IsVisible)

			// Émission de la notification in-app garantie
			_ = s.q.InsertArticleContributorNotification(ctx, db.InsertArticleContributorNotificationParams{
				Column1: toUUID(attr.UserID),
				Column2: toUUID(authorID),
				Column3: db.NotificationTypeARTICLECONTRIBUTORINVITED,
				Column4: articleID,
			})
		} else if err == nil {
			// Contributeur existant : mise à jour du rôle, de l'ordre et de la visibilité
			_, _ = s.pool.Exec(ctx, `
				UPDATE "ArticleAttribution"
				SET role = $3, "order" = $4, "isVisible" = $5, "updatedAt" = now()
				WHERE "articleId" = $1 AND "userId" = $2
			`, articleID, toUUID(attr.UserID), role, order, attr.IsVisible)
		}
	}
}
