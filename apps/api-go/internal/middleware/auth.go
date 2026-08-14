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
)

type ctxKey string

const UserIDKey ctxKey = "userId"

// UserID extrait l'UID Supabase du contexte.
func UserID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(UserIDKey).(string)
	return id, ok
}

// Auth est un validateur de jetons Supabase (RS256 via JWKS, fallback HS256).
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

	// 2) RS256 via JWKS (Supabase moderne / self-hosted).
	if a.jwksURL != "" {
		key, err := a.findRSAKey(tokenString)
		if err == nil {
			token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
					return nil, fmt.Errorf("méthode de signature inattendue: %v", t.Header["alg"])
				}
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

func (a *Auth) findRSAKey(tokenString string) (*rsaPublicKey, error) {
	set, err := a.getJWKS()
	if err != nil {
		return nil, err
	}
	// On essaie sans connaître le kid : on tente chaque clé.
	var lastErr error
	for _, k := range set.Keys {
		key, err := buildRSAKey(k)
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
