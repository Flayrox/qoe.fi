package oauth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"log"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.Pool(context.Background())
	if err != nil {
		log.Fatalf("testcontainers: %v", err)
	}
	poolTest = p
	code := m.Run()
	testutil.Cleanup()
	os.Exit(code)
}

func seedOAuth(t *testing.T) *testutil.OAuthFixtures {
	t.Helper()
	fx, err := testutil.SeedOAuth(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed oauth: %v", err)
	}
	return fx
}

func newService() *Service {
	return NewService(poolTest, "https://qoe.fi", "https://qoe.fi/oauth/authorize", "")
}

// seedApprovedClient crée une application confidentielle pour l'owner et la
// passe en statut APPROVED. Retourne (clientId public, clientSecret, id DB).
func seedApprovedClient(t *testing.T, fx *testutil.OAuthFixtures, redirectURI string) (clientID, clientSecret, dbID string) {
	t.Helper()
	svc := newService()
	ctx := context.Background()
	res, err := svc.CreateClientRequest(ctx, fx.OwnerID, CreateClientInput{
		Name:         "App Test",
		RedirectURIs: []string{redirectURI},
		Scopes:       []string{"openid", "profile", "email"},
		ClientType:   "CONFIDENTIAL",
	})
	if err != nil {
		t.Fatalf("CreateClientRequest: %v", err)
	}
	clients, err := svc.ListClients(ctx, fx.OwnerID)
	if err != nil || len(clients) != 1 {
		t.Fatalf("ListClients: %v (n=%d)", err, len(clients))
	}
	if err := svc.SetClientStatus(ctx, clients[0].ID, "APPROVED"); err != nil {
		t.Fatalf("SetClientStatus: %v", err)
	}
	return res.ClientID, res.ClientSecret, clients[0].ID
}

func pkceS256(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// ─── Gestion des applications ──────────────────────────────────────────

func TestCreateClientRequest_RequiresApproval(t *testing.T) {
	fx := seedOAuth(t)
	svc := newService()

	_, err := svc.CreateClientRequest(context.Background(), fx.ViewerID, CreateClientInput{
		Name:         "X",
		RedirectURIs: []string{"https://app.example.com/cb"},
		ClientType:   "CONFIDENTIAL",
	})
	if err == nil || !strings.Contains(err.Error(), "approuvée") {
		t.Fatalf("CreateClientRequest(viewer) = %v, attendu erreur d'approbation", err)
	}
}

func TestCreateClientRequest_SecretHashedNeverInClear(t *testing.T) {
	fx := seedOAuth(t)
	svc := newService()
	ctx := context.Background()

	res, err := svc.CreateClientRequest(ctx, fx.OwnerID, CreateClientInput{
		Name:         "Confidentiel",
		RedirectURIs: []string{"https://app.example.com/cb"},
		Scopes:       []string{"openid", "profile"},
		ClientType:   "CONFIDENTIAL",
	})
	if err != nil {
		t.Fatalf("CreateClientRequest: %v", err)
	}
	if !strings.HasPrefix(res.ClientID, "qoe_oauth_") {
		t.Fatalf("clientId = %q, attendu préfixe qoe_oauth_", res.ClientID)
	}
	if !strings.HasPrefix(res.ClientSecret, "qoe_secret_") {
		t.Fatalf("clientSecret = %q, attendu préfixe qoe_secret_", res.ClientSecret)
	}

	var hash *string
	if err := poolTest.QueryRow(ctx,
		`SELECT "clientSecretHash" FROM "OAuthClient" WHERE "clientId" = $1`, res.ClientID,
	).Scan(&hash); err != nil {
		t.Fatalf("lecture client: %v", err)
	}
	if hash == nil || *hash == res.ClientSecret {
		t.Fatal("le secret doit être stocké hashé (sha256 hex), jamais en clair")
	}
	if *hash != sha256hex(res.ClientSecret) {
		t.Fatalf("hash = %q, attendu sha256hex(secret)", *hash)
	}
}

func TestCreateClientRequest_RejectsInsecureRedirect(t *testing.T) {
	fx := seedOAuth(t)
	svc := newService()

	_, err := svc.CreateClientRequest(context.Background(), fx.OwnerID, CreateClientInput{
		Name:         "Insecure",
		RedirectURIs: []string{"http://app.example.com/cb"},
		ClientType:   "CONFIDENTIAL",
	})
	if err == nil || !strings.Contains(err.Error(), "https") {
		t.Fatalf("CreateClientRequest(http) = %v, attendu refus (https requis)", err)
	}
}

// ─── Flot Authorization Code + PKCE complet ────────────────────────────

func TestAuthorizeCodeFlow_EndToEnd(t *testing.T) {
	fx := seedOAuth(t)
	svc := newService()
	ctx := context.Background()

	const redirectURI = "https://app.example.com/cb"
	clientID, clientSecret, _ := seedApprovedClient(t, fx, redirectURI)

	verifier := "correct-horse-battery-staple-0123456789"
	req := &AuthorizeRequest{
		ResponseType:        "code",
		ClientID:            clientID,
		RedirectURI:         redirectURI,
		Scope:               "openid profile email",
		State:               "state-xyz",
		Nonce:               "nonce-abc",
		CodeChallenge:       pkceS256(verifier),
		CodeChallengeMethod: "S256",
	}

	begin := svc.BeginAuthorization(ctx, fx.OwnerID, req)
	if !begin.OK {
		t.Fatalf("BeginAuthorization: %+v", begin)
	}
	if begin.Info.Client.ClientID != clientID || begin.Info.Client.Name != "App Test" {
		t.Fatalf("client info inattendu: %+v", begin.Info.Client)
	}
	if len(begin.Info.Scopes) != 3 {
		t.Fatalf("scopes = %d, attendu 3", len(begin.Info.Scopes))
	}

	approve := svc.ApproveAuthorization(ctx, fx.OwnerID, req, true)
	if !approve.OK || approve.Redirect == "" {
		t.Fatalf("ApproveAuthorization: %+v", approve)
	}
	u, err := url.Parse(approve.Redirect)
	if err != nil {
		t.Fatalf("redirect invalide: %v", err)
	}
	code := u.Query().Get("code")
	if code == "" {
		t.Fatal("code manquant dans la redirection")
	}
	if u.Query().Get("state") != "state-xyz" {
		t.Fatalf("state = %q, attendu state-xyz", u.Query().Get("state"))
	}

	// Échange du code contre des tokens.
	client, oerr := svc.AuthenticateClient(ctx, clientID, clientSecret)
	if oerr != nil {
		t.Fatalf("AuthenticateClient: %v", oerr)
	}
	tok, oerr := svc.Token(ctx, &TokenRequest{
		GrantType:    "authorization_code",
		Code:         code,
		RedirectURI:  redirectURI,
		CodeVerifier: verifier,
	}, client)
	if oerr != nil {
		t.Fatalf("Token: %v", oerr)
	}
	if tok.AccessToken == "" || tok.RefreshToken == "" || tok.IDToken == "" {
		t.Fatalf("réponse token incomplète: %+v", tok)
	}
	if tok.TokenType != "Bearer" || tok.Scope != "email openid profile" {
		t.Fatalf("token_type/scope inattendus: %+v", tok)
	}

	// Vérification de l'id_token : signature ES256 + claims OIDC.
	parsed, err := jwt.Parse(tok.IDToken, func(t *jwt.Token) (any, error) {
		return &svc.signingKey.PublicKey, nil
	})
	if err != nil || !parsed.Valid {
		t.Fatalf("id_token invalide: %v", err)
	}
	claims := parsed.Claims.(jwt.MapClaims)
	if claims["iss"] != "https://qoe.fi" {
		t.Fatalf("iss = %v", claims["iss"])
	}
	if claims["aud"] != clientID {
		t.Fatalf("aud = %v, attendu le clientId public %q", claims["aud"], clientID)
	}
	if claims["nonce"] != "nonce-abc" {
		t.Fatalf("nonce = %v, attendu nonce-abc", claims["nonce"])
	}
	sub, _ := claims["sub"].(string)
	if sub == "" || sub == fx.OwnerID {
		t.Fatalf("sub = %q, attendu un identifiant pairwise (pas l'UID brut)", sub)
	}
	if sub != pairwiseSub(fx.OwnerID, clientID) {
		t.Fatalf("sub = %q, attendu pairwiseSub(uid, clientId public)", sub)
	}
	if claims["at_hash"] == nil || claims["c_hash"] == nil {
		t.Fatal("at_hash / c_hash manquants dans l'id_token")
	}
}

func TestToken_ReusedCodeRejected(t *testing.T) {
	fx := seedOAuth(t)
	svc := newService()
	ctx := context.Background()

	const redirectURI = "https://app.example.com/cb"
	clientID, clientSecret, _ := seedApprovedClient(t, fx, redirectURI)
	verifier := "verifier-verifier-verifier-verifier-42"
	req := &AuthorizeRequest{
		ResponseType:        "code",
		ClientID:            clientID,
		RedirectURI:         redirectURI,
		Scope:               "openid",
		CodeChallenge:       pkceS256(verifier),
		CodeChallengeMethod: "S256",
	}
	approve := svc.ApproveAuthorization(ctx, fx.OwnerID, req, false)
	u, _ := url.Parse(approve.Redirect)
	code := u.Query().Get("code")

	client, _ := svc.AuthenticateClient(ctx, clientID, clientSecret)
	tokReq := &TokenRequest{GrantType: "authorization_code", Code: code, RedirectURI: redirectURI, CodeVerifier: verifier}

	if _, oerr := svc.Token(ctx, tokReq, client); oerr != nil {
		t.Fatalf("premier échange: %v", oerr)
	}
	if _, oerr := svc.Token(ctx, tokReq, client); oerr == nil || oerr.Code != "invalid_grant" {
		t.Fatalf("réutilisation du code = %v, attendu invalid_grant", oerr)
	}
}

func TestRefreshToken_Rotation(t *testing.T) {
	fx := seedOAuth(t)
	svc := newService()
	ctx := context.Background()

	const redirectURI = "https://app.example.com/cb"
	clientID, clientSecret, _ := seedApprovedClient(t, fx, redirectURI)
	verifier := "verifier-verifier-verifier-verifier-77"
	req := &AuthorizeRequest{
		ResponseType:        "code",
		ClientID:            clientID,
		RedirectURI:         redirectURI,
		Scope:               "openid profile",
		CodeChallenge:       pkceS256(verifier),
		CodeChallengeMethod: "S256",
	}
	approve := svc.ApproveAuthorization(ctx, fx.OwnerID, req, false)
	u, _ := url.Parse(approve.Redirect)
	code := u.Query().Get("code")

	client, _ := svc.AuthenticateClient(ctx, clientID, clientSecret)
	tok, oerr := svc.Token(ctx, &TokenRequest{GrantType: "authorization_code", Code: code, RedirectURI: redirectURI, CodeVerifier: verifier}, client)
	if oerr != nil {
		t.Fatalf("Token: %v", oerr)
	}

	// Refresh → nouveau token, l'ancien refresh est révoqué.
	refreshed, oerr := svc.Token(ctx, &TokenRequest{GrantType: "refresh_token", RefreshToken: tok.RefreshToken}, client)
	if oerr != nil {
		t.Fatalf("refresh: %v", oerr)
	}
	if refreshed.RefreshToken == "" || refreshed.RefreshToken == tok.RefreshToken {
		t.Fatal("le refresh token doit être renouvelé (rotation)")
	}
	// Réutiliser l'ancien refresh → invalid_grant.
	if _, oerr := svc.Token(ctx, &TokenRequest{GrantType: "refresh_token", RefreshToken: tok.RefreshToken}, client); oerr == nil || oerr.Code != "invalid_grant" {
		t.Fatalf("ancien refresh = %v, attendu invalid_grant", oerr)
	}
}

// ─── Introspection / Révocation ────────────────────────────────────────

func TestIntrospect_ActiveAndInactive(t *testing.T) {
	fx := seedOAuth(t)
	svc := newService()
	ctx := context.Background()

	const redirectURI = "https://app.example.com/cb"
	clientID, clientSecret, _ := seedApprovedClient(t, fx, redirectURI)
	verifier := "verifier-verifier-verifier-verifier-99"
	req := &AuthorizeRequest{
		ResponseType:        "code",
		ClientID:            clientID,
		RedirectURI:         redirectURI,
		Scope:               "openid",
		CodeChallenge:       pkceS256(verifier),
		CodeChallengeMethod: "S256",
	}
	approve := svc.ApproveAuthorization(ctx, fx.OwnerID, req, false)
	u, _ := url.Parse(approve.Redirect)
	code := u.Query().Get("code")

	client, _ := svc.AuthenticateClient(ctx, clientID, clientSecret)
	tok, _ := svc.Token(ctx, &TokenRequest{GrantType: "authorization_code", Code: code, RedirectURI: redirectURI, CodeVerifier: verifier}, client)

	out, oerr := svc.Introspect(ctx, tok.AccessToken, clientID)
	if oerr != nil {
		t.Fatalf("Introspect: %v", oerr)
	}
	if out["active"] != true || out["client_id"] != clientID {
		t.Fatalf("introspect actif inattendu: %v", out)
	}
	if out["sub"] != pairwiseSub(fx.OwnerID, clientID) {
		t.Fatalf("sub = %v, attendu pairwise", out["sub"])
	}

	// Un token inconnu est inactif (jamais une erreur).
	out, _ = svc.Introspect(ctx, "inconnu", clientID)
	if out["active"] != false {
		t.Fatalf("introspect token inconnu = %v, attendu active:false", out)
	}
}

func TestRevoke_UnknownTokenIsSuccess(t *testing.T) {
	fx := seedOAuth(t)
	svc := newService()
	ctx := context.Background()

	const redirectURI = "https://app.example.com/cb"
	clientID, clientSecret, _ := seedApprovedClient(t, fx, redirectURI)
	client, _ := svc.AuthenticateClient(ctx, clientID, clientSecret)

	// RFC 7009 §2.2 : un token inconnu est TOUJOURS un succès.
	if oerr := svc.Revoke(ctx, "token-inexistant", "", client.ClientId); oerr != nil {
		t.Fatalf("Revoke(unknown) = %v, attendu succès", oerr)
	}
}
