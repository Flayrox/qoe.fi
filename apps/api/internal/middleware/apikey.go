package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	db "github.com/qoefi/api/internal/database"
)

const (
	// PublisherIDKey porte l'id de la publication (PERSONAL ou MEDIA) via clé API.
	PublisherIDKey ctxKey = "publisherId"
	// UmamiWebsiteIDKey porte l'umamiWebsiteId de la publication (pour analytics/stats).
	UmamiWebsiteIDKey ctxKey = "umamiWebsiteId"
	// ScopesKey porte les scopes effectifs d'une clé API (moindre privilège).
	ScopesKey ctxKey = "scopes"
	// APIKeyIDKey porte l'id interne de la clé API (rate-limit par clé, idempotence).
	APIKeyIDKey ctxKey = "apiKeyId"
	// PrincipalKey porte le Principal typé résolu depuis la clé API.
	PrincipalKey ctxKey = "principal"
	// ReadOnlyCutoffKey porte le timestamp de début de quarantaine lecture seule.
	ReadOnlyCutoffKey ctxKey = "readOnlyCutoff"
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
	PrincipalTypeUser      PrincipalType = "user"
	PrincipalTypePublisher PrincipalType = "publisher"
)

// Principal est l'identité explicite et typée résolue depuis une clé API.
type Principal struct {
	Type            PrincipalType `json:"type"`
	UserID          *string       `json:"userId,omitempty"`
	PublisherID     *string       `json:"publisherId,omitempty"`
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

// writeUnavailable écrit une erreur 503 JSON : la vérification d'identité n'a
// pas pu être faite (base indisponible), ce n'est pas un secret faux.
func writeUnavailable(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusServiceUnavailable)
	_, _ = w.Write([]byte(`{"error":"` + msg + `","code":"auth_unavailable"}`))
}

// writeForbidden écrit une erreur 403 JSON (même forme que le reste de l'API).
func writeForbidden(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusForbidden)
	_, _ = w.Write([]byte(`{"error":"` + msg + `"}`))
}

// ReadOnlyCutoff retourne le timestamp de quarantaine lecture seule si la clé
// ou la publication est gelée.
func ReadOnlyCutoff(ctx context.Context) (time.Time, bool) {
	t, ok := ctx.Value(ReadOnlyCutoffKey).(time.Time)
	return t, ok && !t.IsZero()
}

// RequireWritableAPIKey bloque les mutations HTTP (POST/PUT/PATCH/DELETE)
// lorsque la clé API ou sa publication est en quarantaine lecture seule.
func RequireWritableAPIKey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ro := ReadOnlyCutoff(r.Context()); ro &&
			r.Method != http.MethodGet &&
			r.Method != http.MethodHead &&
			r.Method != http.MethodOptions {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"error":"Clé API en mode lecture seule (quarantaine de sécurité)","code":"api_read_only_quarantine"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// PublisherID extrait l'id de publication (PERSONAL ou MEDIA) du contexte.
func PublisherID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(PublisherIDKey).(string)
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
	isMedia := row.KeyPublisherID != ""

	if !isPersonal && !isMedia {
		return ctx, false
	}

	if row.KeyStatus == "REVOKED" || row.UserIsSuspended {
		return ctx, false
	}

	// Si clé personnelle : refuser si l'accès a été explicitement révoqué.
	if isPersonal {
		if row.UserApiAccessStatus.Valid && row.UserApiAccessStatus.String == "revoked" {
			return ctx, false
		}
	}

	// Si clé média : la publication média doit exister.
	if isMedia && row.PublisherID == "" {
		return ctx, false
	}

	// Calcul de la borne de quarantaine lecture seule (READ_ONLY) :
	// - clé marquée READ_ONLY (suspendedAt)
	// - publication marquée apiReadOnlyAt
	// - RiskDecision active (pause_sending / suspend)
	var cutoff time.Time
	setCutoff := func(t time.Time) {
		if cutoff.IsZero() || t.Before(cutoff) {
			cutoff = t
		}
	}
	if row.KeyStatus == "READ_ONLY" {
		if row.KeySuspendedAt.Valid {
			setCutoff(row.KeySuspendedAt.Time)
		} else {
			setCutoff(time.Now().UTC())
		}
	}
	if row.PublisherReadOnlyAt.Valid {
		setCutoff(row.PublisherReadOnlyAt.Time)
	}
	if row.HasActiveRiskSuspension {
		setCutoff(time.Now().UTC())
	}
	if !cutoff.IsZero() {
		ctx = context.WithValue(ctx, ReadOnlyCutoffKey, cutoff)
	}

	// Filtrage des scopes par la plateforme (SystemConfig API_ACCESS_MODULES).
	var effectiveScopes []string
	for _, s := range row.Scopes {
		if !isScopeEnabledOnPlatform(s, row.PlatformApiModules.String) {
			continue
		}
		effectiveScopes = append(effectiveScopes, s)
	}

	// Une clé qui déclarait des scopes mais dont la plateforme a tout coupé ne
	// doit pas s'authentifier : elle resterait valide avec zéro permission, donc
	// acceptée par toutes les routes sans RequireAPIScope. Le silence (aucun
	// scope déclaré en base) n'est pas touché : on ne refuse que l'effacement.
	if len(row.Scopes) > 0 && len(effectiveScopes) == 0 {
		return ctx, false
	}

	principal := &Principal{
		APIKeyID: row.ApiKeyID,
		Scopes:   effectiveScopes,
	}

	if isPersonal {
		principal.Type = PrincipalTypeUser
		uid := row.UserID
		principal.UserID = &uid
		if row.PublisherID != "" {
			pid := row.PublisherID
			principal.PublisherID = &pid
		}
		ctx = context.WithValue(ctx, UserIDKey, row.UserID)
	} else {
		principal.Type = PrincipalTypePublisher
		pid := row.PublisherID
		principal.PublisherID = &pid
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
	if row.PublisherID != "" {
		ctx = context.WithValue(ctx, PublisherIDKey, row.PublisherID)
	}
	if row.UmamiWebsiteID.Valid && row.UmamiWebsiteID.String != "" {
		ctx = context.WithValue(ctx, UmamiWebsiteIDKey, row.UmamiWebsiteID.String)
	}

	return ctx, true
}

// apiKeyToken extrait le jeton d'une clé API `qoe_live_…` du header Bearer.
func apiKeyToken(r *http.Request) (string, bool) {
	header := r.Header.Get("Authorization")
	if header == "" || !strings.HasPrefix(header, "Bearer ") {
		return "", false
	}
	token := strings.TrimPrefix(header, "Bearer ")
	if !strings.HasPrefix(token, "qoe_live_") {
		return "", false
	}
	return token, true
}

// resolveAPIKeyToken résout une clé API en contexte de requête. Trois issues
// distinctes : ok=true (clé valide), ok=false sans erreur (clé inconnue, révoquée
// ou accès retiré — une réponse 401 est honnête et le client ne doit pas
// réessayer), err non nil (panne technique : 503, le client peut réessayer).
// Confondre les deux dernières faisait tourner une panne de base en « votre clé
// est invalide » : rotation de clé inutile, ticket support, aucun réessai.
func resolveAPIKeyToken(ctx context.Context, q *db.Queries, token string) (context.Context, bool, error) {
	if q == nil {
		return ctx, false, errors.New("base de données non disponible pour valider la clé API")
	}
	hashed := sha256.Sum256([]byte(token))
	row, err := q.GetApiKeyByHash(ctx, hex.EncodeToString(hashed[:]))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ctx, false, nil
		}
		return ctx, false, fmt.Errorf("lecture de la clé API: %w", err)
	}

	// Mise à jour best-effort du lastUsedAt : son échec n'invalide pas la clé.
	_ = q.UpdateApiKeyLastUsed(ctx, row.ApiKeyID)

	resolved, ok := resolveAPIKeyRow(ctx, row)
	return resolved, ok, nil
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
			token, ok := apiKeyToken(r)
			if !ok {
				writeUnauthorized(w, "Clé API invalide (préfixe qoe_live_)")
				return
			}

			ctx, valid, err := resolveAPIKeyToken(r.Context(), q, token)
			if err != nil {
				writeUnavailable(w, "Vérification de la clé API momentanément indisponible")
				return
			}
			if !valid {
				writeUnauthorized(w, "Clé API invalide ou accès révoqué")
				return
			}

			RequireWritableAPIKey(next).ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// APIKeyContext retourne le contexte enrichi si la requête porte une clé API valide
// (Bearer `qoe_live_…`), false sinon — y compris en cas de panne de base :
// l'appelant qui a besoin de distinguer une panne utilise apiKeyUserIDErr.
func APIKeyContext(q *db.Queries, r *http.Request) (context.Context, bool) {
	ctx, ok, _ := apiKeyUserIDErr(q, r)
	return ctx, ok
}

// apiKeyUserIDErr est la variante qui distingue une clé invalide d'une panne.
func apiKeyUserIDErr(q *db.Queries, r *http.Request) (context.Context, bool, error) {
	token, ok := apiKeyToken(r)
	if !ok {
		return r.Context(), false, nil
	}
	return resolveAPIKeyToken(r.Context(), q, token)
}
