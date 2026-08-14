package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"

	db "github.com/qoefi/api-go/internal/database"
)

const (
	// PublicationIDKey porte l'id de la publication PERSONAL du créateur (via clé API).
	PublicationIDKey ctxKey = "publicationId"
	// UmamiWebsiteIDKey porte l'umamiWebsiteId de la publication (pour analytics/stats).
	UmamiWebsiteIDKey ctxKey = "umamiWebsiteId"
)

// PublicationID extrait l'id de publication PERSONAL du contexte.
func PublicationID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(PublicationIDKey).(string)
	return id, ok
}

// UmamiWebsiteID extrait l'umamiWebsiteId du contexte.
func UmamiWebsiteID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(UmamiWebsiteIDKey).(string)
	return id, ok
}

// APIKeyAuth valide une clé API `qoe_live_…` (Bearer) et injecte l'UID + publication.
func APIKeyAuth(q *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if header == "" || !strings.HasPrefix(header, "Bearer ") {
				writeUnauthorized(w, "Authorization header manquant")
				return
			}
			token := strings.TrimPrefix(header, "Bearer ")
			if !strings.HasPrefix(token, "qoe_live_") {
				writeUnauthorized(w, "Clé API invalide (préfixe qoe_live_)")
				return
			}

			hashed := sha256.Sum256([]byte(token))
			keyHash := hex.EncodeToString(hashed[:])

			row, err := q.GetApiKeyByHash(r.Context(), keyHash)
			if err != nil {
				writeUnauthorized(w, "Clé API invalide")
				return
			}

			// Mise à jour best-effort du lastUsedAt.
			_ = q.UpdateApiKeyLastUsed(r.Context(), row.ApiKeyID)

			ctx := context.WithValue(r.Context(), UserIDKey, row.UserID)
			if row.PublicationID != "" {
				ctx = context.WithValue(ctx, PublicationIDKey, row.PublicationID)
			}
			if row.UmamiWebsiteID.Valid && row.UmamiWebsiteID.String != "" {
				ctx = context.WithValue(ctx, UmamiWebsiteIDKey, row.UmamiWebsiteID.String)
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// apiKeyUserID extrait le userID + publication depuis une clé API valide.
// Retourne (false, …) si le header n'est pas une clé API.
func apiKeyUserID(q *db.Queries, r *http.Request) (context.Context, bool) {
	header := r.Header.Get("Authorization")
	if header == "" || !strings.HasPrefix(header, "Bearer ") {
		return r.Context(), false
	}
	token := strings.TrimPrefix(header, "Bearer ")
	if !strings.HasPrefix(token, "qoe_live_") {
		return r.Context(), false
	}

	hashed := sha256.Sum256([]byte(token))
	row, err := q.GetApiKeyByHash(r.Context(), hex.EncodeToString(hashed[:]))
	if err != nil {
		return r.Context(), false
	}
	_ = q.UpdateApiKeyLastUsed(r.Context(), row.ApiKeyID)

	ctx := context.WithValue(r.Context(), UserIDKey, row.UserID)
	if row.PublicationID != "" {
		ctx = context.WithValue(ctx, PublicationIDKey, row.PublicationID)
	}
	if row.UmamiWebsiteID.Valid && row.UmamiWebsiteID.String != "" {
		ctx = context.WithValue(ctx, UmamiWebsiteIDKey, row.UmamiWebsiteID.String)
	}
	return ctx, true
}
