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
	// ScopesKey porte les scopes d'une clé API (moindre privilège).
	ScopesKey ctxKey = "scopes"
)

// Scopes des clés API (moindre privilège). Les valeurs par défaut d'une clé
// couvrent l'accès complet : READ | WRITE | ANALYTICS.
const (
	ScopeRead      = "READ"
	ScopeWrite     = "WRITE"
	ScopeAnalytics = "ANALYTICS"
)

// AllScopes est l'ensemble de scopes d'une clé à accès complet (défaut).
var AllScopes = []string{ScopeRead, ScopeWrite, ScopeAnalytics}

// Scopes extrait les scopes d'une requête authentifiée par clé API.
// (false si la requête n'est pas authentifiée par clé API — ex. JWT.)
func Scopes(ctx context.Context) ([]string, bool) {
	s, ok := ctx.Value(ScopesKey).([]string)
	return s, ok
}

// HasScope vérifie qu'un scope requis est présent dans la liste.
func HasScope(scopes []string, required string) bool {
	for _, s := range scopes {
		if s == required {
			return true
		}
	}
	return false
}

// RequireAPIScope refuse l'accès aux clés API n'ayant pas le scope requis (403).
// Les requêtes authentifiées par JWT (pas de scopes en contexte) passent : elles
// sont déjà couvertes par le RBAC publication.
func RequireAPIScope(required string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if scopes, ok := Scopes(r.Context()); ok && !HasScope(scopes, required) {
				writeForbidden(w, "Scope "+required+" requis")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// writeForbidden écrit une erreur 403 JSON (même forme que le reste de l'API).
func writeForbidden(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusForbidden)
	_, _ = w.Write([]byte(`{"error":"` + msg + `"}`))
}

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
			if len(row.Scopes) > 0 {
				ctx = context.WithValue(ctx, ScopesKey, row.Scopes)
			}
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

// APIKeyContext retourne le contexte enrichi (userID + publicationId) si la
// requête porte une clé API valide (Bearer `qoe_live_…`), false sinon.
// Utilisé sur les routes à double mode (public / créateur) pour basculer.
func APIKeyContext(q *db.Queries, r *http.Request) (context.Context, bool) {
	return apiKeyUserID(q, r)
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
	if len(row.Scopes) > 0 {
		ctx = context.WithValue(ctx, ScopesKey, row.Scopes)
	}
	if row.PublicationID != "" {
		ctx = context.WithValue(ctx, PublicationIDKey, row.PublicationID)
	}
	if row.UmamiWebsiteID.Valid && row.UmamiWebsiteID.String != "" {
		ctx = context.WithValue(ctx, UmamiWebsiteIDKey, row.UmamiWebsiteID.String)
	}
	return ctx, true
}
