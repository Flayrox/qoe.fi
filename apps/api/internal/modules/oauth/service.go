// Package oauth — fournisseur d'identité OAuth 2.1 / OpenID Connect (qoe.fi).
//
// L'API Go est l'autorité : elle détient les clients, les codes, les tokens
// et le consentement. La page de consentement (apps/core) et la gestion des
// apps (apps/studio) ne font que du rendu — elles appellent les endpoints
// internes /v1/oauth/* authentifiés par JWT Supabase.
package oauth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

// ─────────────────────────────────────────────────────────────────────
// Erreurs OAuth typées (RFC 6749 / 6749bis)
// ─────────────────────────────────────────────────────────────────────
var (
	ErrInvalidRequest          = errors.New("invalid_request")
	ErrUnauthorizedClient      = errors.New("unauthorized_client")
	ErrAccessDenied            = errors.New("access_denied")
	ErrUnsupportedResponseType = errors.New("unsupported_response_type")
	ErrInvalidScope            = errors.New("invalid_scope")
	ErrInvalidClient           = errors.New("invalid_client")
	ErrInvalidGrant            = errors.New("invalid_grant")
	ErrServerError             = errors.New("server_error")
)

// OAuthError porte un code + description normalisés (renvoyés au client).
type OAuthError struct {
	Code        string
	Description string
	Status      int
}

func (e *OAuthError) Error() string { return e.Code + ": " + e.Description }

func oauthError(code, description string, status int) *OAuthError {
	return &OAuthError{Code: code, Description: description, Status: status}
}

// ─────────────────────────────────────────────────────────────────────
// Scopes supportés (identité OIDC)
// ─────────────────────────────────────────────────────────────────────
var supportedScopes = map[string]string{
	"openid":  "Votre identifiant de connexion qoe.fi",
	"profile": "Votre nom, pseudo et photo de profil",
	"email":   "Votre adresse e-mail",
}

func scopeDescription(name string) string {
	if d, ok := supportedScopes[name]; ok {
		return d
	}
	return name
}

// ─────────────────────────────────────────────────────────────────────
// Quotas configurables (SystemConfig, modifiables par les admins — aucun
// seuil codé en dur : les valeurs ci-dessous ne sont que des défauts sûrs
// appliqués si la clé n'est pas renseignée).
// ─────────────────────────────────────────────────────────────────────
type Settings struct {
	MaxClientsPerUser        int
	MaxRedirectUrisPerClient int
	MaxActiveTokensPerUser   int
	AuthCodeTTL              time.Duration
	AccessTokenTTL           time.Duration
	RefreshTokenTTL          time.Duration
	IDTokenTTL               time.Duration
	AllowInsecureRedirect    bool
}

func defaultSettings() Settings {
	return Settings{
		MaxClientsPerUser:        3,
		MaxRedirectUrisPerClient: 10,
		MaxActiveTokensPerUser:   50,
		AuthCodeTTL:              60 * time.Second,
		AccessTokenTTL:           time.Hour,
		RefreshTokenTTL:          30 * 24 * time.Hour,
		IDTokenTTL:               time.Hour,
		AllowInsecureRedirect:    false,
	}
}

// ─────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────
type Service struct {
	pool         *pgxpool.Pool
	q            oauthQuerier
	issuer       string
	authorizeURL string
	signingKey   *ecdsa.PrivateKey
	kid          string

	settingsMu sync.Mutex
	settingsAt time.Time
	settings   Settings
}

func NewService(pool *pgxpool.Pool, issuer, authorizeURL, signingKeyPEM string) *Service {
	key, kid := loadSigningKey(signingKeyPEM)
	return &Service{
		pool:         pool,
		q:            db.New(pool),
		issuer:       strings.TrimSuffix(issuer, "/"),
		authorizeURL: strings.TrimSuffix(authorizeURL, "/"),
		signingKey:   key,
		kid:          kid,
		settings:     defaultSettings(),
	}
}

// Issuer expose l'origine canonique (pour le handler discovery).
func (s *Service) Issuer() string { return s.issuer }

// AuthorizeURL expose la page de consentement (pour le handler discovery).
func (s *Service) AuthorizeURL() string { return s.authorizeURL }

// Kid expose le key-id courant (pour le handler jwks).
func (s *Service) Kid() string { return s.kid }

// PublicKeyJWT expose la clé publique (pour le handler jwks).
func (s *Service) PublicKeyJWT() *ecdsa.PublicKey { return &s.signingKey.PublicKey }

// Settings charge les quotas depuis SystemConfig (cache court).
func (s *Service) Settings(ctx context.Context) Settings {
	s.settingsMu.Lock()
	defer s.settingsMu.Unlock()
	if time.Since(s.settingsAt) < 30*time.Second {
		return s.settings
	}
	out := defaultSettings()
	rows, err := s.q.ListOAuthConfig(ctx)
	if err == nil {
		for _, r := range rows {
			applySetting(&out, r.Key, r.Value)
		}
	}
	s.settings = out
	s.settingsAt = time.Now()
	return out
}

func applySetting(s *Settings, key, value string) {
	switch key {
	case "OAUTH_MAX_CLIENTS_PER_USER":
		if v, err := strconv.Atoi(value); err == nil && v > 0 {
			s.MaxClientsPerUser = v
		}
	case "OAUTH_MAX_REDIRECT_URIS":
		if v, err := strconv.Atoi(value); err == nil && v > 0 {
			s.MaxRedirectUrisPerClient = v
		}
	case "OAUTH_MAX_ACTIVE_TOKENS_PER_USER":
		if v, err := strconv.Atoi(value); err == nil && v > 0 {
			s.MaxActiveTokensPerUser = v
		}
	case "OAUTH_AUTH_CODE_TTL":
		if v, err := strconv.Atoi(value); err == nil && v > 0 {
			s.AuthCodeTTL = time.Duration(v) * time.Second
		}
	case "OAUTH_ACCESS_TOKEN_TTL":
		if v, err := strconv.Atoi(value); err == nil && v > 0 {
			s.AccessTokenTTL = time.Duration(v) * time.Second
		}
	case "OAUTH_REFRESH_TOKEN_TTL":
		if v, err := strconv.Atoi(value); err == nil && v > 0 {
			s.RefreshTokenTTL = time.Duration(v) * time.Second
		}
	case "OAUTH_ID_TOKEN_TTL":
		if v, err := strconv.Atoi(value); err == nil && v > 0 {
			s.IDTokenTTL = time.Duration(v) * time.Second
		}
	case "OAUTH_ALLOW_INSECURE_REDIRECT":
		s.AllowInsecureRedirect = strings.EqualFold(value, "true") || value == "1"
	}
}

// ─────────────────────────────────────────────────────────────────────
// Helpers cryptographiques
// ─────────────────────────────────────────────────────────────────────
func sha256hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func b64url(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func pairwiseSub(userID, clientID string) string {
	mac := hmac.New(sha256.New, []byte(clientID))
	mac.Write([]byte(userID))
	return hex.EncodeToString(mac.Sum(nil))
}

func hasScope(scopes []string, name string) bool {
	for _, s := range scopes {
		if s == name {
			return true
		}
	}
	return false
}

// normalizeScopes trie et dédoublonne une liste de scopes.
func normalizeScopes(scopes []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(scopes))
	for _, s := range scopes {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	sort.Strings(out)
	return out
}

func textPtr(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}

func timestampPtr(t time.Time) pgtype.Timestamp {
	return pgtype.Timestamp{Time: t, Valid: true}
}

func isHTTPS(uri string) bool {
	u, err := url.Parse(uri)
	if err != nil {
		return false
	}
	return u.Scheme == "https"
}

func isLocalhostHTTP(uri string) bool {
	u, err := url.Parse(uri)
	if err != nil {
		return false
	}
	if u.Scheme != "http" {
		return false
	}
	return u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1"
}

func (s *Service) redirectAllowed(uri string) bool {
	if isHTTPS(uri) {
		return true
	}
	return isLocalhostHTTP(uri) && s.Settings(context.Background()).AllowInsecureRedirect
}

// exactRedirectURI vérifie une correspondance EXACTE dans l'allowlist.
func exactRedirectURI(uris []string, candidate string) bool {
	for _, u := range uris {
		if u == candidate {
			return true
		}
	}
	return false
}

// ─────────────────────────────────────────────────────────────────────
// Gestion des clients (Studio)
// ─────────────────────────────────────────────────────────────────────
type CreateClientInput struct {
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	LogoURL       string   `json:"logoUrl"`
	HomepageURL   string   `json:"homepageUrl"`
	RedirectURIs  []string `json:"redirectUris"`
	Scopes        []string `json:"scopes"`
	ClientType    string   `json:"clientType"` // CONFIDENTIAL | PUBLIC
	PublicationID string   `json:"publicationId"`
}

type CreateClientResult struct {
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret,omitempty"`
}

func (s *Service) CreateClientRequest(ctx context.Context, userID string, in CreateClientInput) (*CreateClientResult, error) {
	// 1) L'accès API doit déjà avoir été approuvé par un admin.
	status, err := s.q.GetUserApiAccessStatus(ctx, userID)
	if err != nil {
		return nil, oauthError("forbidden", "Utilisateur introuvable", 403)
	}
	if status != "approved" {
		return nil, oauthError("forbidden", "Votre demande d'accès API doit être approuvée avant de créer une application OAuth.", 403)
	}

	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, oauthError("invalid_request", "Le nom de l'application est requis.", 400)
	}
	if len(in.RedirectURIs) == 0 {
		return nil, oauthError("invalid_request", "Au moins une URL de redirection est requise.", 400)
	}
	settings := s.Settings(ctx)
	if len(in.RedirectURIs) > settings.MaxRedirectUrisPerClient {
		return nil, oauthError("invalid_request", fmt.Sprintf("Maximum %d URL de redirection.", settings.MaxRedirectUrisPerClient), 400)
	}
	for _, u := range in.RedirectURIs {
		if !s.redirectAllowed(u) {
			return nil, oauthError("invalid_request", "Les URL de redirection doivent être en https:// (ou http://localhost en dev).", 400)
		}
	}

	clientType := strings.ToUpper(in.ClientType)
	if clientType == "" {
		clientType = "CONFIDENTIAL"
	}
	if clientType != "CONFIDENTIAL" && clientType != "PUBLIC" {
		return nil, oauthError("invalid_request", "clientType doit être CONFIDENTIAL ou PUBLIC.", 400)
	}

	scopes := normalizeScopes(in.Scopes)
	if len(scopes) == 0 {
		scopes = []string{"openid", "profile", "email"}
	}
	for _, sc := range scopes {
		if _, ok := supportedScopes[sc]; !ok {
			return nil, oauthError("invalid_scope", "Scope non supporté: "+sc, 400)
		}
	}

	count, err := s.q.CountOAuthClientsByOwner(ctx, userID)
	if err == nil && int(count) >= settings.MaxClientsPerUser {
		return nil, oauthError("forbidden", fmt.Sprintf("Quota atteint : maximum %d applications OAuth par compte.", settings.MaxClientsPerUser), 403)
	}

	clientID := "qoe_oauth_" + mustHex(16)
	var secretPlain string
	var secretHash pgtype.Text
	if clientType == "CONFIDENTIAL" {
		secretPlain = "qoe_secret_" + mustHex(32)
		secretHash = textPtr(sha256hex(secretPlain))
	}

	clientTypeEnum := db.OAuthClientTypeCONFIDENTIAL
	if clientType == "PUBLIC" {
		clientTypeEnum = db.OAuthClientTypePUBLIC
	}

	if err := s.q.InsertOAuthClient(ctx, db.InsertOAuthClientParams{
		ClientId:         clientID,
		ClientSecretHash: secretHash,
		Name:             name,
		Description:      textPtr(strings.TrimSpace(in.Description)),
		LogoUrl:          textPtr(strings.TrimSpace(in.LogoURL)),
		HomepageUrl:      textPtr(strings.TrimSpace(in.HomepageURL)),
		RedirectUris:     in.RedirectURIs,
		Scopes:           scopes,
		Column9:          clientTypeEnum,
		Column10:         db.OAuthClientStatusPENDING,
		PublicationId:    textPtr(in.PublicationID),
		OwnerUserId:      userID,
	}); err != nil {
		return nil, oauthError("server_error", "Impossible d'enregistrer l'application.", 500)
	}

	return &CreateClientResult{ClientID: clientID, ClientSecret: secretPlain}, nil
}

// ClientDTO est la forme publique d'un client (jamais le secret en clair).
type ClientDTO struct {
	ID           string   `json:"id"`
	ClientID     string   `json:"clientId"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	LogoURL      string   `json:"logoUrl"`
	HomepageURL  string   `json:"homepageUrl"`
	RedirectURIs []string `json:"redirectUris"`
	Scopes       []string `json:"scopes"`
	ClientType   string   `json:"clientType"`
	Status       string   `json:"status"`
	HasSecret    bool     `json:"hasSecret"`
	CreatedAt    string   `json:"createdAt"`
}

func rowToClientDTO(r db.ListOAuthClientsByOwnerRow) ClientDTO {
	return ClientDTO{
		ID:           r.ID,
		ClientID:     r.ClientId,
		Name:         r.Name,
		Description:  textOrEmpty(r.Description),
		LogoURL:      textOrEmpty(r.LogoUrl),
		HomepageURL:  textOrEmpty(r.HomepageUrl),
		RedirectURIs: r.RedirectUris,
		Scopes:       r.Scopes,
		ClientType:   r.ClientType,
		Status:       r.Status,
		HasSecret:    r.ClientSecretHash.Valid && r.ClientSecretHash.String != "",
		CreatedAt:    tsString(r.CreatedAt),
	}
}

func (s *Service) ListClients(ctx context.Context, userID string) ([]ClientDTO, error) {
	rows, err := s.q.ListOAuthClientsByOwner(ctx, userID)
	if err != nil {
		return nil, oauthError("server_error", "Impossible de lister les applications.", 500)
	}
	out := make([]ClientDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, rowToClientDTO(r))
	}
	return out, nil
}

// RotateClientSecret régénère le secret d'un client confidentiel.
func (s *Service) RotateClientSecret(ctx context.Context, userID, id string) (string, error) {
	row, err := s.q.GetOAuthClientByID(ctx, id)
	if err != nil {
		return "", oauthError("invalid_client", "Application introuvable.", 404)
	}
	if row.OwnerUserId != userID {
		return "", oauthError("forbidden", "Cette application ne vous appartient pas.", 403)
	}
	if row.ClientType != "CONFIDENTIAL" {
		return "", oauthError("invalid_request", "Les applications publiques n'ont pas de secret client.", 400)
	}
	secret := "qoe_secret_" + mustHex(32)
	if err := s.q.UpdateOAuthClientSecret(ctx, db.UpdateOAuthClientSecretParams{
		ID: id, ClientSecretHash: textPtr(sha256hex(secret)),
	}); err != nil {
		return "", oauthError("server_error", "Rotation du secret impossible.", 500)
	}
	return secret, nil
}

func (s *Service) RevokeClient(ctx context.Context, userID, id string) error {
	// Supprime le client (cascade → codes + tokens + consentements).
	if err := s.q.DeleteOAuthClient(ctx, db.DeleteOAuthClientParams{ID: id, OwnerUserId: userID}); err != nil {
		return oauthError("server_error", "Révocation impossible.", 500)
	}
	return nil
}

// SetClientStatus change le statut d'un client (admin).
func (s *Service) SetClientStatus(ctx context.Context, id, status string) error {
	status = strings.ToUpper(status)
	var enum db.OAuthClientStatus
	switch status {
	case "PENDING":
		enum = db.OAuthClientStatusPENDING
	case "APPROVED":
		enum = db.OAuthClientStatusAPPROVED
	case "REJECTED":
		enum = db.OAuthClientStatusREJECTED
	case "REVOKED":
		enum = db.OAuthClientStatusREVOKED
	default:
		return oauthError("invalid_request", "Statut invalide.", 400)
	}
	if err := s.q.UpdateOAuthClientStatus(ctx, db.UpdateOAuthClientStatusParams{ID: id, Column2: enum}); err != nil {
		return oauthError("server_error", "Mise à jour du statut impossible.", 500)
	}
	return nil
}

// AuthenticateClient valide client_id + client_secret (RFC 6749 §2.3) et
// retourne le client approuvé. Les clients PUBLIC n'exigent pas de secret
// (PKCE seul). Utilisé par les endpoints publics token/introspect/revoke.
func (s *Service) AuthenticateClient(ctx context.Context, clientID, clientSecret string) (db.GetOAuthClientByClientIdRow, *OAuthError) {
	var zero db.GetOAuthClientByClientIdRow
	if clientID == "" {
		return zero, oauthError(ErrInvalidClient.Error(), "client_id manquant.", http.StatusUnauthorized)
	}
	client, err := s.q.GetOAuthClientByClientId(ctx, clientID)
	if err != nil {
		return zero, oauthError(ErrInvalidClient.Error(), "Application inconnue.", http.StatusUnauthorized)
	}
	if client.Status != "APPROVED" {
		return zero, oauthError(ErrUnauthorizedClient.Error(), "Cette application n'est pas approuvée.", http.StatusUnauthorized)
	}
	if client.ClientType == "CONFIDENTIAL" {
		if !client.ClientSecretHash.Valid || client.ClientSecretHash.String == "" || clientSecret == "" {
			return zero, oauthError(ErrInvalidClient.Error(), "client_secret manquant.", http.StatusUnauthorized)
		}
		if sha256hex(clientSecret) != client.ClientSecretHash.String {
			return zero, oauthError(ErrInvalidClient.Error(), "client_secret invalide.", http.StatusUnauthorized)
		}
	}
	return client, nil
}

// ─────────────────────────────────────────────────────────────────────
// Autorisation (page de consentement)
// ─────────────────────────────────────────────────────────────────────
type AuthorizeRequest struct {
	ResponseType        string `json:"responseType"`
	ClientID            string `json:"clientId"`
	RedirectURI         string `json:"redirectUri"`
	Scope               string `json:"scope"`
	State               string `json:"state"`
	Nonce               string `json:"nonce"`
	CodeChallenge       string `json:"codeChallenge"`
	CodeChallengeMethod string `json:"codeChallengeMethod"`
}

func (r *AuthorizeRequest) scopes() []string {
	return normalizeScopes(strings.Fields(r.Scope))
}

type ScopeInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Required    bool   `json:"required"`
}

type ClientInfo struct {
	ID          string `json:"id"`
	ClientID    string `json:"clientId"`
	Name        string `json:"name"`
	Description string `json:"description"`
	LogoURL     string `json:"logoUrl"`
	HomepageURL string `json:"homepageUrl"`
}

type AuthorizeInfo struct {
	Client           ClientInfo  `json:"client"`
	Scopes           []ScopeInfo `json:"scopes"`
	State            string      `json:"state"`
	AlreadyConsented bool        `json:"alreadyConsented"`
}

type AuthorizeResult struct {
	OK               bool           `json:"ok"`
	Info             *AuthorizeInfo `json:"info,omitempty"`
	Error            string         `json:"error,omitempty"`
	ErrorDescription string         `json:"errorDescription,omitempty"`
	Redirect         string         `json:"redirect,omitempty"`
}

// validateAuthorize valide la requête et retourne le client. Les erreurs
// structurellement "redirigeables" sont accompagnées d'une URL d'erreur.
func (s *Service) validateAuthorize(ctx context.Context, req *AuthorizeRequest) (db.GetOAuthClientByClientIdRow, *OAuthError) {
	var zero db.GetOAuthClientByClientIdRow
	if req.ResponseType != "code" {
		return zero, oauthError(ErrUnsupportedResponseType.Error(), "Seul response_type=code est supporté.", 400)
	}
	if req.ClientID == "" {
		return zero, oauthError(ErrInvalidRequest.Error(), "client_id manquant.", 400)
	}
	if req.RedirectURI == "" {
		return zero, oauthError(ErrInvalidRequest.Error(), "redirect_uri manquant.", 400)
	}
	client, err := s.q.GetOAuthClientByClientId(ctx, req.ClientID)
	if err != nil {
		return zero, oauthError(ErrInvalidClient.Error(), "Application inconnue.", 400)
	}
	if client.Status != "APPROVED" {
		return zero, oauthError(ErrUnauthorizedClient.Error(), "Cette application n'est pas encore approuvée.", 400)
	}
	if !exactRedirectURI(client.RedirectUris, req.RedirectURI) {
		return zero, oauthError(ErrInvalidRequest.Error(), "redirect_uri non autorisé pour cette application.", 400)
	}
	if req.CodeChallenge == "" {
		return zero, oauthError(ErrInvalidRequest.Error(), "PKCE obligatoire (code_challenge manquant).", 400)
	}
	method := req.CodeChallengeMethod
	if method == "" {
		method = "S256"
	}
	if method != "S256" && method != "plain" {
		return zero, oauthError(ErrInvalidRequest.Error(), "code_challenge_method invalide (S256 ou plain).", 400)
	}
	scopes := req.scopes()
	if len(scopes) == 0 {
		return zero, oauthError(ErrInvalidScope.Error(), "scope manquant.", 400)
	}
	for _, sc := range scopes {
		if _, ok := supportedScopes[sc]; !ok {
			return zero, oauthError(ErrInvalidScope.Error(), "Scope non supporté: "+sc, 400)
		}
		if !hasScope(client.Scopes, sc) {
			return zero, oauthError(ErrInvalidScope.Error(), "Scope non autorisé pour cette application: "+sc, 400)
		}
	}
	return client, nil
}

// BeginAuthorization prépare l'écran de consentement (GET interne).
func (s *Service) BeginAuthorization(ctx context.Context, userID string, req *AuthorizeRequest) *AuthorizeResult {
	client, verr := s.validateAuthorize(ctx, req)
	if verr != nil {
		return &AuthorizeResult{OK: false, Error: verr.Code, ErrorDescription: verr.Description, Redirect: errorRedirect(req, verr)}
	}
	scopes := req.scopes()
	infos := make([]ScopeInfo, 0, len(scopes))
	for _, sc := range scopes {
		infos = append(infos, ScopeInfo{Name: sc, Description: scopeDescription(sc), Required: sc == "openid"})
	}

	already := false
	if consent, err := s.q.GetOAuthConsent(ctx, db.GetOAuthConsentParams{ClientId: client.ID, UserId: userID}); err == nil {
		already = coversScopes(consent.Scopes, scopes)
	}

	return &AuthorizeResult{OK: true, Info: &AuthorizeInfo{
		Client: ClientInfo{
			ID:          client.ID,
			ClientID:    client.ClientId,
			Name:        client.Name,
			Description: textOrEmpty(client.Description),
			LogoURL:     textOrEmpty(client.LogoUrl),
			HomepageURL: textOrEmpty(client.HomepageUrl),
		},
		Scopes:           infos,
		State:            req.State,
		AlreadyConsented: already,
	}}
}

// ApproveAuthorization mint un code d'autorisation et renvoie l'URL de redirection.
func (s *Service) ApproveAuthorization(ctx context.Context, userID string, req *AuthorizeRequest, remember bool) *AuthorizeResult {
	client, verr := s.validateAuthorize(ctx, req)
	if verr != nil {
		return &AuthorizeResult{OK: false, Error: verr.Code, ErrorDescription: verr.Description, Redirect: errorRedirect(req, verr)}
	}
	scopes := req.scopes()
	if remember {
		_ = s.q.UpsertOAuthConsent(ctx, db.UpsertOAuthConsentParams{ClientId: client.ID, UserId: userID, Scopes: scopes})
	}

	code, err := randomHex(16)
	if err != nil {
		return &AuthorizeResult{OK: false, Error: ErrServerError.Error(), ErrorDescription: "Impossible de générer le code.", Redirect: errorRedirect(req, oauthError(ErrServerError.Error(), "server", 500))}
	}
	method := req.CodeChallengeMethod
	if method == "" {
		method = "S256"
	}
	if err := s.q.InsertOAuthAuthorizationCode(ctx, db.InsertOAuthAuthorizationCodeParams{
		CodeHash:            sha256hex(code),
		ClientId:            client.ID,
		UserId:              userID,
		RedirectUri:         req.RedirectURI,
		Scopes:              scopes,
		CodeChallenge:       textPtr(req.CodeChallenge),
		CodeChallengeMethod: textPtr(method),
		Nonce:               textPtr(req.Nonce),
		ExpiresAt:           timestampPtr(time.Now().Add(s.Settings(ctx).AuthCodeTTL)),
	}); err != nil {
		return &AuthorizeResult{OK: false, Error: ErrServerError.Error(), ErrorDescription: "Impossible d'enregistrer le code.", Redirect: errorRedirect(req, oauthError(ErrServerError.Error(), "server", 500))}
	}

	u, _ := url.Parse(req.RedirectURI)
	q := u.Query()
	q.Set("code", code)
	if req.State != "" {
		q.Set("state", req.State)
	}
	u.RawQuery = q.Encode()
	return &AuthorizeResult{OK: true, Redirect: u.String()}
}

// DenyAuthorization renvoie l'URL d'erreur access_denied.
func (s *Service) DenyAuthorization(req *AuthorizeRequest) *AuthorizeResult {
	return &AuthorizeResult{OK: false, Error: ErrAccessDenied.Error(), Redirect: errorRedirect(req, oauthError(ErrAccessDenied.Error(), "L'utilisateur a refusé l'autorisation.", 400))}
}

func errorRedirect(req *AuthorizeRequest, oerr *OAuthError) string {
	if req == nil || req.RedirectURI == "" || oerr == nil {
		return ""
	}
	// On ne redirige jamais sur une erreur invalid_client (redirect non fiable).
	if oerr.Code == ErrInvalidClient.Error() {
		return ""
	}
	u, err := url.Parse(req.RedirectURI)
	if err != nil {
		return ""
	}
	q := u.Query()
	q.Set("error", oerr.Code)
	if oerr.Description != "" {
		q.Set("error_description", oerr.Description)
	}
	if req.State != "" {
		q.Set("state", req.State)
	}
	u.RawQuery = q.Encode()
	return u.String()
}

// coversScopes vérifie qu'un consentement couvre tous les scopes demandés.
func coversScopes(granted, requested []string) bool {
	for _, r := range requested {
		if !hasScope(granted, r) {
			return false
		}
	}
	return true
}

// ─────────────────────────────────────────────────────────────────────
// Token endpoint (Authorization Code + Refresh Token)
// ─────────────────────────────────────────────────────────────────────
type TokenRequest struct {
	GrantType    string `json:"grant_type"`
	Code         string `json:"code"`
	RedirectURI  string `json:"redirect_uri"`
	CodeVerifier string `json:"code_verifier"`
	RefreshToken string `json:"refresh_token"`
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
}

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int64  `json:"expires_in"`
	RefreshToken string `json:"refresh_token,omitempty"`
	Scope        string `json:"scope"`
	IDToken      string `json:"id_token,omitempty"`
}

func (s *Service) Token(ctx context.Context, req *TokenRequest, client db.GetOAuthClientByClientIdRow) (*TokenResponse, *OAuthError) {
	switch req.GrantType {
	case "authorization_code":
		return s.exchangeCode(ctx, req, client)
	case "refresh_token":
		return s.refreshToken(ctx, req, client)
	default:
		return nil, oauthError(ErrInvalidGrant.Error(), "grant_type non supporté.", 400)
	}
}

func (s *Service) exchangeCode(ctx context.Context, req *TokenRequest, client db.GetOAuthClientByClientIdRow) (*TokenResponse, *OAuthError) {
	if req.Code == "" {
		return nil, oauthError(ErrInvalidRequest.Error(), "code manquant.", 400)
	}
	row, err := s.q.GetOAuthAuthorizationCodeByHash(ctx, sha256hex(req.Code))
	if err != nil {
		return nil, oauthError(ErrInvalidGrant.Error(), "Code invalide ou expiré.", 400)
	}
	if row.ClientId != client.ID {
		return nil, oauthError(ErrInvalidGrant.Error(), "Le code n'appartient pas à ce client.", 400)
	}
	if row.UsedAt.Valid {
		return nil, oauthError(ErrInvalidGrant.Error(), "Code déjà utilisé.", 400)
	}
	if time.Now().After(row.ExpiresAt.Time) {
		return nil, oauthError(ErrInvalidGrant.Error(), "Code expiré.", 400)
	}
	if req.RedirectURI == "" || req.RedirectURI != row.RedirectUri {
		return nil, oauthError(ErrInvalidGrant.Error(), "redirect_uri invalide.", 400)
	}
	if !verifyPKCE(row, req.CodeVerifier) {
		return nil, oauthError(ErrInvalidGrant.Error(), "Échec de la vérification PKCE.", 400)
	}
	_ = s.q.ConsumeOAuthAuthorizationCode(ctx, row.ID)

	return s.issueTokens(ctx, client.ID, client.ClientId, row.UserId, row.Scopes, textOrEmpty(row.Nonce), req)
}

func (s *Service) refreshToken(ctx context.Context, req *TokenRequest, client db.GetOAuthClientByClientIdRow) (*TokenResponse, *OAuthError) {
	if req.RefreshToken == "" {
		return nil, oauthError(ErrInvalidRequest.Error(), "refresh_token manquant.", 400)
	}
	row, err := s.q.GetOAuthTokenByRefreshHash(ctx, textPtr(sha256hex(req.RefreshToken)))
	if err != nil {
		return nil, oauthError(ErrInvalidGrant.Error(), "Refresh token invalide.", 400)
	}
	if row.ClientId != client.ID {
		return nil, oauthError(ErrInvalidGrant.Error(), "Le refresh token n'appartient pas à ce client.", 400)
	}
	if row.RevokedAt.Valid {
		// Réutilisation d'un refresh token révoqué → révocation de la famille.
		_ = s.q.RevokeOAuthTokensByUserClient(ctx, db.RevokeOAuthTokensByUserClientParams{UserId: row.UserId, ClientId: row.ClientId})
		return nil, oauthError(ErrInvalidGrant.Error(), "Refresh token révoqué.", 400)
	}
	if row.RefreshTokenExpiresAt.Valid && time.Now().After(row.RefreshTokenExpiresAt.Time) {
		return nil, oauthError(ErrInvalidGrant.Error(), "Refresh token expiré.", 400)
	}
	// Rotation : l'ancien refresh token est révoqué.
	_ = s.q.RevokeOAuthTokenByRefreshHash(ctx, textPtr(sha256hex(req.RefreshToken)))

	return s.issueTokens(ctx, client.ID, client.ClientId, row.UserId, row.Scopes, "", req)
}

func (s *Service) issueTokens(ctx context.Context, clientDBID, clientPublicID, userID string, scopes []string, nonce string, req *TokenRequest) (*TokenResponse, *OAuthError) {
	settings := s.Settings(ctx)
	count, err := s.q.CountActiveOAuthTokens(ctx, userID)
	if err == nil && int(count) >= settings.MaxActiveTokensPerUser {
		return nil, oauthError(ErrInvalidGrant.Error(), "Trop de sessions actives pour ce compte.", 400)
	}

	access := "qoe_at_" + mustHex(16)
	refresh := "qoe_rt_" + mustHex(24)
	now := time.Now()

	if err := s.q.InsertOAuthToken(ctx, db.InsertOAuthTokenParams{
		ClientId:              clientDBID,
		UserId:                userID,
		AccessTokenHash:       sha256hex(access),
		RefreshTokenHash:      textPtr(sha256hex(refresh)),
		Scopes:                scopes,
		AccessTokenExpiresAt:  timestampPtr(now.Add(settings.AccessTokenTTL)),
		RefreshTokenExpiresAt: timestampPtr(now.Add(settings.RefreshTokenTTL)),
	}); err != nil {
		return nil, oauthError(ErrServerError.Error(), "Émission du token impossible.", 500)
	}

	resp := &TokenResponse{
		AccessToken:  access,
		TokenType:    "Bearer",
		ExpiresIn:    int64(settings.AccessTokenTTL.Seconds()),
		RefreshToken: refresh,
		Scope:        strings.Join(scopes, " "),
	}

	if hasScope(scopes, "openid") {
		idToken, err := s.signIDToken(userID, clientPublicID, nonce, access, req.Code, scopes, settings.IDTokenTTL)
		if err != nil {
			return nil, oauthError(ErrServerError.Error(), "Signature de l'id_token impossible.", 500)
		}
		resp.IDToken = idToken
	}
	return resp, nil
}

// signIDToken émet un id_token ES256 avec sub pairwise.
func (s *Service) signIDToken(userID, clientID, nonce, accessToken, code string, scopes []string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"iss": s.issuer,
		"sub": pairwiseSub(userID, clientID),
		"aud": clientID,
		"exp": now.Add(ttl).Unix(),
		"iat": now.Unix(),
	}
	if nonce != "" {
		claims["nonce"] = nonce
	}
	if accessToken != "" {
		claims["at_hash"] = atHash(accessToken)
	}
	if code != "" {
		claims["c_hash"] = atHash(code)
	}
	token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	token.Header["kid"] = s.kid
	return token.SignedString(s.signingKey)
}

// atHash est la moitié gauche du SHA-256, encodée base64url (OIDC §3.1.3.6).
func atHash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return b64url(sum[:len(sum)/2])
}

func verifyPKCE(code db.OAuthAuthorizationCode, verifier string) bool {
	if !code.CodeChallenge.Valid || code.CodeChallenge.String == "" {
		return verifier == "" // client sans PKCE (jamais émis ici, mais toléré)
	}
	method := code.CodeChallengeMethod.String
	if method == "" {
		method = "S256"
	}
	switch method {
	case "S256":
		sum := sha256.Sum256([]byte(verifier))
		return b64url(sum[:]) == code.CodeChallenge.String
	case "plain":
		return verifier == code.CodeChallenge.String
	default:
		return false
	}
}

// ─────────────────────────────────────────────────────────────────────
// Introspection (RFC 7662)
// ─────────────────────────────────────────────────────────────────────
func (s *Service) Introspect(ctx context.Context, token, clientID string) (map[string]any, *OAuthError) {
	row, err := s.q.GetOAuthTokenByAccessHash(ctx, sha256hex(token))
	if err != nil {
		return map[string]any{"active": false}, nil
	}
	if row.PublicClientId != clientID {
		return map[string]any{"active": false}, nil
	}
	if row.RevokedAt.Valid || time.Now().After(row.AccessTokenExpiresAt.Time) {
		return map[string]any{"active": false}, nil
	}
	_ = s.q.UpdateOAuthTokenLastUsed(ctx, row.ID)
	exp := row.AccessTokenExpiresAt.Time.Unix()
	return map[string]any{
		"active":     true,
		"scope":      strings.Join(row.Scopes, " "),
		"client_id":  row.PublicClientId,
		"sub":        pairwiseSub(row.UserId, row.PublicClientId),
		"token_type": "Bearer",
		"exp":        exp,
		"iat":        row.CreatedAt.Time.Unix(),
	}, nil
}

// Revoke révoque un access ou refresh token (RFC 7009).
func (s *Service) Revoke(ctx context.Context, token, tokenTypeHint, clientID string) *OAuthError {
	// Un token inconnu est TOUJOURS un succès (RFC 7009 §2.2).
	if tokenTypeHint == "refresh_token" {
		row, err := s.q.GetOAuthTokenByRefreshHash(ctx, textPtr(sha256hex(token)))
		if err == nil && row.PublicClientId == clientID {
			_ = s.q.RevokeOAuthTokenByRefreshHash(ctx, textPtr(sha256hex(token)))
		}
		return nil
	}
	row, err := s.q.GetOAuthTokenByAccessHash(ctx, sha256hex(token))
	if err == nil && row.PublicClientId == clientID {
		_ = s.q.RevokeOAuthTokenByAccessHash(ctx, sha256hex(token))
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────
// UserInfo (OIDC)
// ─────────────────────────────────────────────────────────────────────
func (s *Service) UserInfo(ctx context.Context, accessToken string) (map[string]any, *OAuthError) {
	row, err := s.q.GetOAuthTokenByAccessHash(ctx, sha256hex(accessToken))
	if err != nil {
		return nil, oauthError("invalid_token", "Access token invalide.", 401)
	}
	if row.RevokedAt.Valid || time.Now().After(row.AccessTokenExpiresAt.Time) {
		return nil, oauthError("invalid_token", "Access token expiré.", 401)
	}
	user, err := s.q.GetOAuthUserClaims(ctx, row.UserId)
	if err != nil {
		return nil, oauthError("invalid_token", "Utilisateur introuvable.", 401)
	}
	_ = s.q.UpdateOAuthTokenLastUsed(ctx, row.ID)

	out := map[string]any{"sub": pairwiseSub(row.UserId, row.PublicClientId)}
	if hasScope(row.Scopes, "email") {
		out["email"] = user.Email
		out["email_verified"] = true
	}
	if hasScope(row.Scopes, "profile") {
		out["name"] = user.Name.String
		out["preferred_username"] = user.Username.String
		if user.LogoUrl.Valid {
			out["picture"] = user.LogoUrl.String
		}
		if user.Pronouns.Valid {
			out["pronouns"] = user.Pronouns.String
		}
	}
	return out, nil
}

// ─────────────────────────────────────────────────────────────────────
// Nettoyage opportuniste (codes usés/expirés, tokens révoqués anciens)
// ─────────────────────────────────────────────────────────────────────
func (s *Service) Purge(ctx context.Context) {
	_ = s.q.DeleteExpiredOAuthArtifacts(ctx)
	_ = s.q.DeleteRevokedOAuthTokens(ctx)
}

// ─────────────────────────────────────────────────────────────────────
// Helpers de sérialisation
// ─────────────────────────────────────────────────────────────────────
func textOrEmpty(t pgtype.Text) string {
	if t.Valid {
		return t.String
	}
	return ""
}

func tsString(t pgtype.Timestamp) string {
	if t.Valid {
		return t.Time.UTC().Format(time.RFC3339)
	}
	return ""
}

func mustHex(n int) string {
	v, err := randomHex(n)
	if err != nil {
		// crypto/rand ne doit jamais échouer ; en dernier recours, fallback déterministe.
		return hex.EncodeToString(make([]byte, n))
	}
	return v
}

// loadSigningKey parse une clé privée ES256 PEM (PKCS8 ou SEC1) ; si vide,
// génère une clé éphémère (dev uniquement) et un kid stable.
func loadSigningKey(pemStr string) (*ecdsa.PrivateKey, string) {
	if pemStr != "" {
		if key, kid, ok := parseECPrivateKey(pemStr); ok {
			return key, kid
		}
	}
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	return key, keyThumbprint(&key.PublicKey)
}

func parseECPrivateKey(pemStr string) (*ecdsa.PrivateKey, string, bool) {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, "", false
	}
	if k, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		if ec, ok := k.(*ecdsa.PrivateKey); ok {
			return ec, keyThumbprint(&ec.PublicKey), true
		}
	}
	if k, err := x509.ParseECPrivateKey(block.Bytes); err == nil {
		return k, keyThumbprint(&k.PublicKey), true
	}
	return nil, "", false
}

func keyThumbprint(pub *ecdsa.PublicKey) string {
	raw := append(pub.X.Bytes(), pub.Y.Bytes()...)
	sum := sha256.Sum256(raw)
	return b64url(sum[:])
}
