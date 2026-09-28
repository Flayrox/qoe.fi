package middleware

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/qoefi/api/internal/authz"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/permissions"
)

// NewDBInputsResolver construit le resolver standard du garde : il lit en base
// ce que le JWT ne porte pas — statut du compte, téléphone vérifié, et droit
// effectif sur le **média visé** par la route.
//
// Règles de sûreté :
//   - une erreur de lecture ne produit jamais une autorisation : les preuves
//     restent vides et le garde refuse (refus par défaut) ;
//   - `MediaPermissionResolved` ne passe à vrai que si l'appartenance a
//     réellement été évaluée. Un acteur non membre donne « résolu mais sans
//     permission » — un refus explicable, pas une preuve manquante ;
//   - la permission est calculée avec permissions.CanMedia sur le média de la
//     route, jamais sur un autre média de l'acteur : une preuve forte ne
//     transfère aucun droit d'un média à un autre.
func NewDBInputsResolver(pool *pgxpool.Pool) AuthzResolver {
	q := db.New(pool)
	return func(ctx context.Context, r *http.Request, s authz.Session, action authz.Action) authz.Inputs {
		if s.UserID == "" {
			return authz.Inputs{}
		}
		var uid pgtype.UUID
		if err := uid.Scan(s.UserID); err != nil {
			return authz.Inputs{}
		}

		in := authz.Inputs{}
		// Une seule requête pour les deux prérequis de compte.
		if err := pool.QueryRow(ctx,
			`SELECT "isSuspended", ("phoneVerifiedAt" IS NOT NULL) FROM "User" WHERE id = $1`,
			uid).Scan(&in.Suspended, &in.PhoneVerified); err != nil {
			return authz.Inputs{}
		}

		rule, ok := authz.Lookup(action)
		if !ok || rule.MediaPermission == "" {
			return in
		}
		kind, param := AuthzResourceOf(ctx)
		mediaID := mediaIDForRoute(ctx, q, r, kind, param)
		if mediaID == "" {
			// Ressource non identifiable : on ne prétend rien.
			return in
		}

		in.MediaPermissionResolved = true
		m, err := q.GetMediaMemberByID(ctx, db.GetMediaMemberByIDParams{MediaId: mediaID, UserId: uid})
		if err != nil {
			// Non membre (ou lecture impossible) → permission absente.
			return in
		}
		in.HasMediaPermission = permissions.CanMedia(&permissions.MediaMember{
			Role: m.Role, Permissions: m.Permissions, Status: m.Status,
		}, rule.MediaPermission)
		return in
	}
}

// mediaIDForRoute résout le média visé selon le type déclaré par la route.
// Un type non déclaré (AuthzResourceNone) ne résout rien : l'appelant qui
// attend une permission média verra un refus, jamais une autorisation par
// défaut.
func mediaIDForRoute(ctx context.Context, q *db.Queries, r *http.Request, kind AuthzResource, param string) string {
	if param == "" {
		return ""
	}
	value := chi.URLParam(r, param)
	if value == "" {
		return ""
	}
	switch kind {
	case AuthzResourceMedia:
		return value
	case AuthzResourcePublication:
		if row, err := q.GetMediaByPublicationID(ctx, value); err == nil {
			return row.MediaID
		}
	case AuthzResourceNewsletter:
		// Une édition appartient à une publication, qui appartient au média :
		// on remonte la chaîne plutôt que de faire confiance à l'appelant.
		issue, err := q.GetNewsletterIssue(ctx, value)
		if err != nil {
			return ""
		}
		if row, err := q.GetMediaByPublicationID(ctx, issue.PublicationId); err == nil {
			return row.MediaID
		}
	}
	return ""
}
