package creator

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	db "github.com/qoefi/api/internal/database"
)

// profileAccess résume ce qu'un viewer peut voir d'un profil.
//
// profileVisibility est stocké côté UserSettings mais n'était appliqué nulle
// part : ce helper est la source unique de vérité pour le profil public, les
// listes d'abonnés et le bouton suivre.
type profileAccess struct {
	OwnerID        string
	Visibility     string
	IsOwn          bool
	IsFollowing    bool
	Requested      bool
	CanViewContent bool
	Blocked        bool
}

// resolveProfileAccess calcule l'accès au profil d'une publication.
// Un blocage, dans un sens ou dans l'autre, rend le profil invisible.
func (h *Handler) resolveProfileAccess(ctx context.Context, publicationID, viewerID string) (profileAccess, error) {
	access := profileAccess{Visibility: "PUBLIC"}
	if publicationID == "" {
		return access, nil
	}

	ownerID, err := h.q.GetPublicationOwner(ctx, publicationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return access, nil
		}
		return access, err
	}
	access.OwnerID = ownerID
	access.IsOwn = viewerID != "" && viewerID == ownerID

	if visibility, err := h.q.GetUserProfileVisibility(ctx, ownerID); err == nil && visibility != "" {
		access.Visibility = visibility
	} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return access, err
	}

	if viewerID != "" {
		blocked, err := h.q.IsBlockedEitherWay(ctx, db.IsBlockedEitherWayParams{
			ReaderId:  toUUID(viewerID),
			CreatorId: toUUID(ownerID),
		})
		if err != nil {
			return access, err
		}
		access.Blocked = blocked

		if _, err := h.q.GetExistingFollow(ctx, db.GetExistingFollowParams{
			ReaderId:      toUUID(viewerID),
			PublicationId: publicationID,
		}); err == nil {
			access.IsFollowing = true
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return access, err
		}

		if _, err := h.q.GetExistingFollowRequest(ctx, db.GetExistingFollowRequestParams{
			RequesterId:   toUUID(viewerID),
			PublicationId: publicationID,
		}); err == nil {
			access.Requested = true
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return access, err
		}
	}

	access.CanViewContent = access.IsOwn || access.Visibility == "PUBLIC" || access.IsFollowing
	return access, nil
}

// canManagePublication vérifie que l'utilisateur possède la publication
// (compte personnel) ou en est owner/admin (média). Sert aux décisions sur
// les demandes d'abonnement.
func (h *Handler) canManagePublication(ctx context.Context, userID, publicationID string) bool {
	if ownerID, err := h.q.GetPublicationOwner(ctx, publicationID); err == nil && ownerID == userID {
		return true
	}
	var ok bool
	err := h.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM "MediaMember" mm
			JOIN "Media" md ON md.id = mm."mediaId"
			WHERE md."publicationId" = $2
			  AND mm."userId" = $1
			  AND mm.status = 'active'
			  AND mm.role IN ('owner', 'admin')
		)`, toUUID(userID), publicationID).Scan(&ok)
	return err == nil && ok
}
