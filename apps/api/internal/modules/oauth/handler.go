// Package oauth — endpoints OAuth 2.1 / OpenID Connect (fournisseur d'identité qoe.fi).
package oauth

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// Handler expose les endpoints du fournisseur d'identité OAuth 2.1 / OIDC.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// RegisterPublic enregistre les endpoints OAuth publics (discovery, JWKS,
// introspection, révocation, userinfo). Le token endpoint est enregistré à
// part (rate-limit dédié anti-brute-force) via Handler.Token.
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/.well-known/openid-configuration", h.discovery)
	r.Get("/.well-known/jwks.json", h.jwks)
	r.Post("/v1/oauth/introspect", h.introspect)
	r.Post("/v1/oauth/revoke", h.revoke)
	r.Get("/v1/oauth/userinfo", h.userinfo)
	r.Post("/v1/oauth/userinfo", h.userinfo)
}

// RegisterProtected enregistre les endpoints internes (JWT Supabase) utilisés
// par la page de consentement (apps/core) et la gestion des apps (apps/studio).
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Route("/v1/oauth", func(r chi.Router) {
		r.Get("/authorize", h.beginAuthorize)
		r.Post("/authorize", h.decideAuthorize)
		r.Get("/clients", h.listClients)
		r.Post("/clients", h.createClient)
		r.Post("/clients/{id}/rotate-secret", h.rotateSecret)
		r.Delete("/clients/{id}", h.revokeClient)
	})
}

// Token expose le handler du token endpoint (pour un rate-limit dédié).
func (h *Handler) Token() http.HandlerFunc { return h.token }

// ─────────────────────────────────────────────────────────────────────
// Discovery OIDC + JWKS (publics)
// ─────────────────────────────────────────────────────────────────────

// GET /.well-known/openid-configuration
func (h *Handler) discovery(w http.ResponseWriter, _ *http.Request) {
	issuer := h.svc.Issuer()
	response.OK(w, map[string]any{
		"issuer":                                issuer,
		"authorization_endpoint":                h.svc.AuthorizeURL(),
		"token_endpoint":                        issuer + "/v1/oauth/token",
		"userinfo_endpoint":                     issuer + "/v1/oauth/userinfo",
		"jwks_uri":                              issuer + "/.well-known/jwks.json",
		"response_types_supported":              []string{"code"},
		"grant_types_supported":                 []string{"authorization_code", "refresh_token"},
		"subject_types_supported":               []string{"pairwise"},
		"id_token_signing_alg_values_supported": []string{"ES256"},
		"scopes_supported":                      []string{"openid", "profile", "email"},
		"token_endpoint_auth_methods_supported": []string{"client_secret_basic", "client_secret_post", "none"},
		"code_challenge_methods_supported":      []string{"S256", "plain"},
		"revocation_endpoint":                   issuer + "/v1/oauth/revoke",
		"introspection_endpoint":                issuer + "/v1/oauth/introspect",
		"claims_supported": []string{
			"sub", "iss", "aud", "exp", "iat", "nonce", "at_hash", "c_hash",
			"email", "email_verified", "name", "preferred_username", "picture", "pronouns",
		},
	})
}

// GET /.well-known/jwks.json — clé publique ES256 de signature des id_token.
func (h *Handler) jwks(w http.ResponseWriter, _ *http.Request) {
	pub := h.svc.PublicKeyJWT()
	size := (pub.Curve.Params().BitSize + 7) / 8
	x := make([]byte, size)
	y := make([]byte, size)
	pub.X.FillBytes(x)
	pub.Y.FillBytes(y)
	response.OK(w, map[string]any{
		"keys": []map[string]any{{
			"kty": "EC",
			"crv": "P-256",
			"x":   base64.RawURLEncoding.EncodeToString(x),
			"y":   base64.RawURLEncoding.EncodeToString(y),
			"kid": h.svc.Kid(),
			"use": "sig",
			"alg": "ES256",
		}},
	})
}

// ─────────────────────────────────────────────────────────────────────
// Authorisation (interne, JWT) — appelée par la page de consentement
// ─────────────────────────────────────────────────────────────────────

// GET /v1/oauth/authorize — valide la requête et renvoie l'écran de consentement.
func (h *Handler) beginAuthorize(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Authentification requise.")
		return
	}
	result := h.svc.BeginAuthorization(r.Context(), userID, authorizeRequestFromQuery(r))
	response.OK(w, result)
}

// POST /v1/oauth/authorize — décision utilisateur (approve / deny).
func (h *Handler) decideAuthorize(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Authentification requise.")
		return
	}
	var in struct {
		AuthorizeRequest
		Decision string `json:"decision"` // "approve" | "deny"
		Remember bool   `json:"remember"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	var result *AuthorizeResult
	if strings.EqualFold(in.Decision, "deny") {
		result = h.svc.DenyAuthorization(&in.AuthorizeRequest)
	} else {
		result = h.svc.ApproveAuthorization(r.Context(), userID, &in.AuthorizeRequest, in.Remember)
	}
	response.OK(w, result)
}

func authorizeRequestFromQuery(r *http.Request) *AuthorizeRequest {
	q := r.URL.Query()
	return &AuthorizeRequest{
		ResponseType:        q.Get("response_type"),
		ClientID:            q.Get("client_id"),
		RedirectURI:         q.Get("redirect_uri"),
		Scope:               q.Get("scope"),
		State:               q.Get("state"),
		Nonce:               q.Get("nonce"),
		CodeChallenge:       q.Get("code_challenge"),
		CodeChallengeMethod: q.Get("code_challenge_method"),
	}
}

// ─────────────────────────────────────────────────────────────────────
// Token / Introspection / Revocation / UserInfo (publics, RFC)
// ─────────────────────────────────────────────────────────────────────

// POST /v1/oauth/token — RFC 6749 §3.2 (application/x-www-form-urlencoded).
func (h *Handler) token(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writeOAuthError(w, oauthError(ErrInvalidRequest.Error(), "Corps de requête invalide.", http.StatusBadRequest))
		return
	}
	clientID, clientSecret := clientCredentials(r)
	client, oerr := h.svc.AuthenticateClient(r.Context(), clientID, clientSecret)
	if oerr != nil {
		writeOAuthError(w, oerr)
		return
	}
	req := &TokenRequest{
		GrantType:    r.FormValue("grant_type"),
		Code:         r.FormValue("code"),
		RedirectURI:  r.FormValue("redirect_uri"),
		CodeVerifier: r.FormValue("code_verifier"),
		RefreshToken: r.FormValue("refresh_token"),
		ClientID:     clientID,
		ClientSecret: clientSecret,
	}
	resp, oerr := h.svc.Token(r.Context(), req, client)
	if oerr != nil {
		writeOAuthError(w, oerr)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	response.OK(w, resp)
}

// POST /v1/oauth/introspect — RFC 7662.
func (h *Handler) introspect(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writeOAuthError(w, oauthError(ErrInvalidRequest.Error(), "Corps de requête invalide.", http.StatusBadRequest))
		return
	}
	clientID, clientSecret := clientCredentials(r)
	client, oerr := h.svc.AuthenticateClient(r.Context(), clientID, clientSecret)
	if oerr != nil {
		writeOAuthError(w, oerr)
		return
	}
	out, _ := h.svc.Introspect(r.Context(), r.FormValue("token"), client.ClientId)
	w.Header().Set("Cache-Control", "no-store")
	response.OK(w, out)
}

// POST /v1/oauth/revoke — RFC 7009.
func (h *Handler) revoke(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writeOAuthError(w, oauthError(ErrInvalidRequest.Error(), "Corps de requête invalide.", http.StatusBadRequest))
		return
	}
	clientID, clientSecret := clientCredentials(r)
	client, oerr := h.svc.AuthenticateClient(r.Context(), clientID, clientSecret)
	if oerr != nil {
		writeOAuthError(w, oerr)
		return
	}
	if oerr := h.svc.Revoke(r.Context(), r.FormValue("token"), r.FormValue("token_type_hint"), client.ClientId); oerr != nil {
		writeOAuthError(w, oerr)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
}

// GET/POST /v1/oauth/userinfo — OIDC (Bearer access token).
func (h *Handler) userinfo(w http.ResponseWriter, r *http.Request) {
	token := ""
	if header := r.Header.Get("Authorization"); strings.HasPrefix(header, "Bearer ") {
		token = strings.TrimPrefix(header, "Bearer ")
	}
	if token == "" && r.Method == http.MethodPost {
		_ = r.ParseForm()
		token = r.FormValue("access_token")
	}
	if token == "" {
		w.Header().Set("WWW-Authenticate", `Bearer realm="qoe.fi OAuth", error="invalid_request"`)
		writeOAuthError(w, oauthError("invalid_request", "Access token manquant.", http.StatusUnauthorized))
		return
	}
	out, oerr := h.svc.UserInfo(r.Context(), token)
	if oerr != nil {
		w.Header().Set("WWW-Authenticate", `Bearer realm="qoe.fi OAuth", error="invalid_token"`)
		writeOAuthError(w, oerr)
		return
	}
	response.OK(w, out)
}

// ─────────────────────────────────────────────────────────────────────
// Gestion des applications (interne, JWT) — Studio
// ─────────────────────────────────────────────────────────────────────

// GET /v1/oauth/clients
func (h *Handler) listClients(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Authentification requise.")
		return
	}
	clients, err := h.svc.ListClients(r.Context(), userID)
	if err != nil {
		writeInternalError(w, err)
		return
	}
	response.OK(w, map[string]any{"clients": clients})
}

// POST /v1/oauth/clients
func (h *Handler) createClient(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Authentification requise.")
		return
	}
	var in CreateClientInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	res, err := h.svc.CreateClientRequest(r.Context(), userID, in)
	if err != nil {
		writeInternalError(w, err)
		return
	}
	response.Created(w, res)
}

// POST /v1/oauth/clients/{id}/rotate-secret
func (h *Handler) rotateSecret(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Authentification requise.")
		return
	}
	secret, err := h.svc.RotateClientSecret(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		writeInternalError(w, err)
		return
	}
	response.OK(w, map[string]string{"clientSecret": secret})
}

// DELETE /v1/oauth/clients/{id}
func (h *Handler) revokeClient(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Authentification requise.")
		return
	}
	if err := h.svc.RevokeClient(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		writeInternalError(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// ─────────────────────────────────────────────────────────────────────
// Helpers de sérialisation des erreurs
// ─────────────────────────────────────────────────────────────────────

// clientCredentials lit le client_id/secret depuis HTTP Basic (RFC 6749 §2.3.1)
// ou depuis le corps form-encoded (client_secret_post).
func clientCredentials(r *http.Request) (clientID, clientSecret string) {
	if id, secret, ok := r.BasicAuth(); ok {
		return id, secret
	}
	return r.FormValue("client_id"), r.FormValue("client_secret")
}

// writeOAuthError écrit une erreur protocolaire OAuth (token/introspect/…)
// au format RFC 6749 §5.2 : {error, error_description}.
func writeOAuthError(w http.ResponseWriter, oerr *OAuthError) {
	status := oerr.Status
	if status == 0 {
		status = http.StatusBadRequest
	}
	if oerr.Code == ErrInvalidClient.Error() {
		w.Header().Set("WWW-Authenticate", `Basic realm="qoe.fi OAuth"`)
	}
	w.Header().Set("Cache-Control", "no-store")
	response.JSON(w, status, map[string]any{
		"error":             oerr.Code,
		"error_description": oerr.Description,
	})
}

// writeInternalError écrit une erreur d'un endpoint interne (JWT) avec un
// message lisible pour l'utilisateur (consommé par goFetch côté Next.js).
func writeInternalError(w http.ResponseWriter, err error) {
	var oerr *OAuthError
	if errors.As(err, &oerr) {
		status := oerr.Status
		if status == 0 {
			status = http.StatusBadRequest
		}
		response.Error(w, status, oerr.Description)
		return
	}
	response.Internal(w)
}
