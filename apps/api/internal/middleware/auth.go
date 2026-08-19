// Package middleware contient l'auth Supabase JWT, CORS, rate-limiting et récupération.
package middleware

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	db "github.com/qoefi/api/internal/database"
)

type ctxKey string

const UserIDKey ctxKey = "userId"

// UserID extrait l'UID Supabase du contexte.
func UserID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(UserIDKey).(string)
	return id, ok
}

// Auth est un validateur de jetons Supabase (RS256/ES256 via JWKS, fallback HS256).
type Auth struct {
	jwtSecret string
	jwksURL   string

	mu      sync.Mutex
	jwks    *jwkSet
	fetched time.Time
}

type jwkKey struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	N   string `json:"n"`
	E   string `json:"e"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
}
type jwkSet struct {
	Keys []jwkKey `json:"keys"`
}

func NewAuth(jwtSecret, supabaseAuthURL string) *Auth {
	jwksURL := ""
	if supabaseAuthURL != "" {
		base := strings.TrimSuffix(supabaseAuthURL, "/")
		jwksURL = base + "/auth/v1/.well-known/jwks.json"
	}
	return &Auth{jwtSecret: jwtSecret, jwksURL: jwksURL}
}

// OptionalAuth valide le Bearer token si présent (lectures publiques paywall),
// sans exiger d'authentification. L'UID est injecté dans le contexte sinon.
func (a *Auth) OptionalAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if header == "" {
			next.ServeHTTP(w, r)
			return
		}
		token := strings.TrimPrefix(header, "Bearer ")
		if token == header {
			next.ServeHTTP(w, r)
			return
		}
		claims, err := a.parseToken(token)
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}
		if sub, ok := claims["sub"].(string); ok && sub != "" {
			ctx := context.WithValue(r.Context(), UserIDKey, sub)
			next.ServeHTTP(w, r.WithContext(ctx))
		} else {
			next.ServeHTTP(w, r)
		}
	})
}

// CombinedAuth accepte un JWT Supabase OU une clé API `qoe_live_…`.
// Injecte l'UID (+ publication pour les clés API) dans le contexte.
// Usage : protéger les routes créateur accessibles aux deux types de clients.
func (a *Auth) CombinedAuth(q *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if header != "" {
				if token := strings.TrimPrefix(header, "Bearer "); token != header {
					if strings.HasPrefix(token, "qoe_live_") {
						ctx, ok := apiKeyUserID(q, r)
						if !ok {
							writeUnauthorized(w, "Clé API invalide")
							return
						}
						next.ServeHTTP(w, r.WithContext(ctx))
						return
					}
				}
			}
			a.Middleware(next).ServeHTTP(w, r)
		})
	}
}

// Middleware valide le Bearer token Supabase et injecte l'UID dans le contexte.
func (a *Auth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if header == "" {
			writeUnauthorized(w, "Authorization header manquant")
			return
		}

		token := strings.TrimPrefix(header, "Bearer ")
		if token == header {
			writeUnauthorized(w, "Token non-Bearer")
			return
		}

		claims, err := a.parseToken(token)
		if err != nil {
			writeUnauthorized(w, "Token invalide ou expiré")
			return
		}

		sub, _ := claims["sub"].(string)
		if sub == "" {
			writeUnauthorized(w, "Token sans sujet (sub)")
			return
		}

		ctx := context.WithValue(r.Context(), UserIDKey, sub)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (a *Auth) parseToken(tokenString string) (jwt.MapClaims, error) {
	// 1) HS256 avec le secret (GoTrue legacy `sb_secret_…`).
	secret := a.hmacSecret()
	if len(secret) > 0 {
		token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("méthode de signature inattendue: %v", t.Header["alg"])
			}
			return secret, nil
		})
		if err == nil && token.Valid {
			if claims, ok := token.Claims.(jwt.MapClaims); ok {
				return claims, nil
			}
		}
	}

	// 2) RS256/ES256 via JWKS (Supabase moderne / self-hosted).
	if a.jwksURL != "" {
		key, err := a.findJWKSKey(tokenString)
		if err == nil {
			token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
				return key, nil
			})
			if err == nil && token.Valid {
				if claims, ok := token.Claims.(jwt.MapClaims); ok {
					return claims, nil
				}
			}
		}
	}

	return nil, fmt.Errorf("token invalide")
}

// hmacSecret décode la clé GoTrue : si elle commence par "sb_secret_", on base64-décode la suite.
func (a *Auth) hmacSecret() []byte {
	s := a.jwtSecret
	if s == "" {
		return nil
	}
	const prefix = "sb_secret_"
	if strings.HasPrefix(s, prefix) {
		b64 := s[len(prefix):]
		if len(b64)%4 != 0 {
			b64 += strings.Repeat("=", 4-len(b64)%4)
		}
		if raw, err := base64.URLEncoding.DecodeString(b64); err == nil {
			return raw
		}
		if raw, err := base64.StdEncoding.DecodeString(b64); err == nil {
			return raw
		}
		return []byte(s)
	}
	return []byte(s)
}

// findJWKSKey retrouve la clé publique (RSA ou ECDSA) qui valide le token,
// en essayant chaque clé du JWKS. Supabase signe en ES256 (P-256) sur les
// projets récents, en RS256 sur les plus anciens — on gère les deux.
func (a *Auth) findJWKSKey(tokenString string) (interface{}, error) {
	set, err := a.getJWKS()
	if err != nil {
		return nil, err
	}
	// On essaie sans connaître le kid : on tente chaque clé.
	var lastErr error
	for _, k := range set.Keys {
		var key interface{}
		switch k.Kty {
		case "RSA":
			key, err = buildRSAKey(k)
		case "EC":
			key, err = buildECKey(k)
		default:
			lastErr = fmt.Errorf("type de clé JWKS non supporté: %s", k.Kty)
			continue
		}
		if err != nil {
			lastErr = err
			continue
		}
		token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
			return key, nil
		})
		if err == nil && token.Valid {
			return key, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

func (a *Auth) getJWKS() (*jwkSet, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.jwks != nil && time.Since(a.fetched) < 5*time.Minute {
		return a.jwks, nil
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(a.jwksURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("jwks status %d", resp.StatusCode)
	}

	var set jwkSet
	if err := json.NewDecoder(resp.Body).Decode(&set); err != nil {
		return nil, err
	}
	a.jwks = &set
	a.fetched = time.Now()
	return &set, nil
}

func writeUnauthorized(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	fmt.Fprintf(w, `{"error":%q}`, msg)
}
