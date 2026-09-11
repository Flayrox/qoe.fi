package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"

	db "github.com/qoefi/api/internal/database"
)

const (
	// PublicationIDKey porte l'id de la publication (PERSONAL ou MEDIA) via clé API.
	PublicationIDKey ctxKey = "publicationId"
	// UmamiWebsiteIDKey porte l'umamiWebsiteId de la publication (pour analytics/stats).
	UmamiWebsiteIDKey ctxKey = "umamiWebsiteId"
	// ScopesKey porte les scopes effectifs d'une clé API (moindre privilège).
	ScopesKey ctxKey = "scopes"
	// APIKeyIDKey porte l'id interne de la clé API (rate-limit par clé, idempotence).
	APIKeyIDKey ctxKey = "apiKeyId"
	// PrincipalKey porte le Principal typé résolu depuis la clé API.
	PrincipalKey ctxKey = "principal"
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

// PrincipalType identifie le type d'entité représenté par une clé API.
type PrincipalType string

const (
	PrincipalTypeUser        PrincipalType = "user"
	PrincipalTypePublication PrincipalType = "publication"
)

// Principal est l'identité explicite et typée résolue depuis une clé API.
type Principal struct {
	Type            PrincipalType `json:"type"`
	UserID          *string       `json:"userId,omitempty"`
	PublicationID   *string       `json:"publicationId,omitempty"`
	MediaID         *string       `json:"mediaId,omitempty"`
	CreatedByUserID *string       `json:"createdByUserId,omitempty"`
	APIKeyID        string        `json:"apiKeyId"`
	Scopes          []string      `json:"scopes"`
}

// GetPrincipal extrait le Principal typé du contexte.
func GetPrincipal(ctx context.Context) (*Principal, bool) {
	p, ok := ctx.Value(PrincipalKey).(*Principal)
	return p, ok
}

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

// PublicationID extrait l'id de publication (PERSONAL ou MEDIA) du contexte.
func PublicationID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(PublicationIDKey).(string)
	return id, ok
}

// UmamiWebsiteID extrait l'umamiWebsiteId du contexte.
func UmamiWebsiteID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(UmamiWebsiteIDKey).(string)
	return id, ok
}

// APIKeyID extrait l'id interne de la clé API du contexte (rate-limit par clé,
// idempotence). false si la requête n'est pas authentifiée par clé API.
func APIKeyID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(APIKeyIDKey).(string)
	return id, ok
}

func isScopeEnabledOnPlatform(scope string, platformJSON string) bool {
	if strings.TrimSpace(platformJSON) == "" {
		return true
	}
	var mods []string
	if err := json.Unmarshal([]byte(platformJSON), &mods); err != nil || len(mods) == 0 {
		return true
	}
	var mod string
	switch scope {
	case ScopeRead:
		mod = "api:read"
	case ScopeWrite:
		mod = "api:write"
	case ScopeAnalytics:
		mod = "api:analytics"
	default:
		return false
	}
	for _, m := range mods {
		if m == mod {
			return true
		}
	}
	return false
}

func hasGrant(grants []string, target string) bool {
	for _, g := range grants {
		if g == target {
			return true
		}
	}
	return false
}

func resolveAPIKeyRow(ctx context.Context, row db.GetApiKeyByHashRow) (context.Context, bool) {
	isPersonal := row.KeyUserID != ""
	isMedia := row.KeyPublicationID != ""

	if !isPersonal && !isMedia {
		return ctx, false
	}

	// Si clé personnelle : refuser si l'accès a été explicitement révoqué.
	if isPersonal {
		if row.UserApiAccessStatus.Valid && row.UserApiAccessStatus.String == "revoked" {
			return ctx, false
		}
	}

	// Si clé média : la publication média doit exister.
	if isMedia && row.PublicationID == "" {
		return ctx, false
	}

	// Filtrage des scopes par la plateforme (SystemConfig API_ACCESS_MODULES).
	var effectiveScopes []string
	for _, s := range row.Scopes {
		if !isScopeEnabledOnPlatform(s, row.PlatformApiModules.String) {
			continue
		}
		effectiveScopes = append(effectiveScopes, s)
	}

	principal := &Principal{
		APIKeyID: row.ApiKeyID,
		Scopes:   effectiveScopes,
	}

	if isPersonal {
		principal.Type = PrincipalTypeUser
		uid := row.UserID
		principal.UserID = &uid
		if row.PublicationID != "" {
			pid := row.PublicationID
			principal.PublicationID = &pid
		}
		ctx = context.WithValue(ctx, UserIDKey, row.UserID)
	} else {
		principal.Type = PrincipalTypePublication
		pid := row.PublicationID
		principal.PublicationID = &pid
		if row.MediaID != "" {
			mid := row.MediaID
			principal.MediaID = &mid
		}
	}

	if row.CreatedByUserID != "" {
		cb := row.CreatedByUserID
		principal.CreatedByUserID = &cb
	}

	ctx = context.WithValue(ctx, PrincipalKey, principal)
	ctx = context.WithValue(ctx, APIKeyIDKey, row.ApiKeyID)
	ctx = context.WithValue(ctx, ScopesKey, effectiveScopes)
	if row.PublicationID != "" {
		ctx = context.WithValue(ctx, PublicationIDKey, row.PublicationID)
	}
	if row.UmamiWebsiteID.Valid && row.UmamiWebsiteID.String != "" {
		ctx = context.WithValue(ctx, UmamiWebsiteIDKey, row.UmamiWebsiteID.String)
	}

	return ctx, true
}

// APIKeyAuth valide une clé API `qoe_live_…` (Bearer) et injecte le Principal explicite + publication.
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

			ctx, ok := resolveAPIKeyRow(r.Context(), row)
			if !ok {
				writeUnauthorized(w, "Clé API invalide ou accès révoqué")
				return
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// APIKeyContext retourne le contexte enrichi si la requête porte une clé API valide
// (Bearer `qoe_live_…`), false sinon.
func APIKeyContext(q *db.Queries, r *http.Request) (context.Context, bool) {
	return apiKeyUserID(q, r)
}

// apiKeyUserID extrait le Principal depuis une clé API valide.
// Retourne (ctx, false) si le header n'est pas une clé API ou si elle est invalide.
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

	ctx, ok := resolveAPIKeyRow(r.Context(), row)
	if !ok {
		return r.Context(), false
	}
	return ctx, true
}
