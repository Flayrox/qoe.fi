package oauth

import (
	"context"
	"net/url"
	"testing"

	"github.com/golang-jwt/jwt/v5"
)

func TestMediaOAuth_FullFlow(t *testing.T) {
	fx := seedOAuth(t)
	ctx := context.Background()
	svc := newService()

	// 1. Seed publication & media
	const pubID = "pub_media_test_01"
	const mediaID = "med_media_test_01"
	_, err := poolTest.Exec(ctx, `
		INSERT INTO "Publication" (id, name, slug, type, "ownerUserId", "createdAt", "updatedAt")
		VALUES ($1, 'Lassez Mag', 'lassez-mag', 'MEDIA', $2, now(), now())
		ON CONFLICT (id) DO NOTHING;

		INSERT INTO "Media" (id, "publicationId", "createdAt", "updatedAt")
		VALUES ($3, $1, now(), now())
		ON CONFLICT (id) DO NOTHING;

		-- fx.OwnerID est membre editor avec articles:write
		INSERT INTO "MediaMember" (id, "mediaId", "userId", role, permissions, status, "createdAt", "updatedAt")
		VALUES ('mem_01', $3, $2, 'editor', ARRAY['articles:write', 'articles:publish'], 'active', now(), now())
		ON CONFLICT DO NOTHING;
	`, pubID, fx.OwnerID, mediaID)
	if err != nil {
		t.Fatalf("seed publication/media: %v", err)
	}

	// 2. Création d'un client OAuth rattaché au média
	res, err := svc.CreateClientRequest(ctx, fx.OwnerID, CreateClientInput{
		Name:          "Lassez Private Dashboard",
		RedirectURIs:  []string{"https://lassez.com/api/auth/callback"},
		Scopes:        []string{"openid", "profile", "email", "media"},
		ClientType:    "CONFIDENTIAL",
		PublicationID: pubID,
	})
	if err != nil {
		t.Fatalf("CreateClientRequest: %v", err)
	}
	clientID := res.ClientID
	clientSecret := res.ClientSecret

	// Lister les clients du média
	mediaClients, err := svc.ListClients(ctx, fx.OwnerID, pubID)
	if err != nil || len(mediaClients) == 0 {
		t.Fatalf("ListClients(pubID): %v (len=%d)", err, len(mediaClients))
	}
	dbID := mediaClients[0].ID
	if err := svc.SetClientStatus(ctx, dbID, "APPROVED"); err != nil {
		t.Fatalf("SetClientStatus: %v", err)
	}

	// 3. BeginAuthorization avec membre actif
	verifier := "abcdefghijklmnopqrstuvwxyz0123456789_abcdefghijklmn"
	challenge := pkceS256(verifier)
	req := &AuthorizeRequest{
		ResponseType:        "code",
		ClientID:            clientID,
		RedirectURI:         "https://lassez.com/api/auth/callback",
		Scope:               "openid profile email media",
		State:               "xyz_state",
		CodeChallenge:       challenge,
		CodeChallengeMethod: "S256",
	}

	beginMem := svc.BeginAuthorization(ctx, fx.OwnerID, req)
	if !beginMem.OK || beginMem.Info == nil {
		t.Fatalf("BeginAuthorization(member): %+v", beginMem)
	}
	if beginMem.Info.Publication == nil {
		t.Fatal("Publication nulle dans AuthorizeInfo")
	}
	if !beginMem.Info.Publication.IsMember || beginMem.Info.Publication.MemberRole != "editor" {
		t.Fatalf("Publication info incorrecte: %+v", beginMem.Info.Publication)
	}
	if beginMem.Info.Publication.Name != "Lassez Mag" {
		t.Fatalf("Publication name = %q, attendu 'Lassez Mag'", beginMem.Info.Publication.Name)
	}

	// 4. BeginAuthorization avec NON-membre (fx.ViewerID)
	beginNonMem := svc.BeginAuthorization(ctx, fx.ViewerID, req)
	if !beginNonMem.OK || beginNonMem.Info == nil {
		t.Fatalf("BeginAuthorization(non-member): %+v", beginNonMem)
	}
	if beginNonMem.Info.Publication == nil || beginNonMem.Info.Publication.IsMember {
		t.Fatalf("Non-membre vu comme membre: %+v", beginNonMem.Info.Publication)
	}

	// 5. Approve & Token exchange pour le membre
	approve := svc.ApproveAuthorization(ctx, fx.OwnerID, req, true)
	if !approve.OK || approve.Redirect == "" {
		t.Fatalf("ApproveAuthorization: %+v", approve)
	}
	u, _ := url.Parse(approve.Redirect)
	code := u.Query().Get("code")
	if code == "" {
		t.Fatal("Code manquant dans redirect")
	}

	clientRow, err := svc.q.GetOAuthClientByClientId(ctx, clientID)
	if err != nil {
		t.Fatalf("GetOAuthClientByClientId: %v", err)
	}

	tokenResp, terr := svc.Token(ctx, &TokenRequest{
		GrantType:    "authorization_code",
		Code:         code,
		RedirectURI:  req.RedirectURI,
		CodeVerifier: verifier,
		ClientID:     clientID,
		ClientSecret: clientSecret,
	}, clientRow)
	if terr != nil {
		t.Fatalf("Token error: %v", terr)
	}
	if tokenResp.AccessToken == "" || tokenResp.IDToken == "" {
		t.Fatalf("Tokens manquants: %+v", tokenResp)
	}

	// 6. Vérification du JWT id_token
	parsedIDToken, _, err := new(jwt.Parser).ParseUnverified(tokenResp.IDToken, jwt.MapClaims{})
	if err != nil {
		t.Fatalf("Parse id_token: %v", err)
	}
	idClaims, ok := parsedIDToken.Claims.(jwt.MapClaims)
	if !ok {
		t.Fatal("id_token claims invalides")
	}
	mediaClaimRaw, exists := idClaims["media"]
	if !exists {
		t.Fatal("Claim 'media' absent de l'id_token")
	}
	mediaClaim := mediaClaimRaw.(map[string]any)
	if mediaClaim["isMember"] != true || mediaClaim["role"] != "editor" {
		t.Fatalf("Media claim dans id_token invalide: %+v", mediaClaim)
	}

	// 7. Vérification de UserInfo
	userInfo, uerr := svc.UserInfo(ctx, tokenResp.AccessToken)
	if uerr != nil {
		t.Fatalf("UserInfo: %v", uerr)
	}
	uMedia, ok := userInfo["media"].(map[string]any)
	if !ok {
		t.Fatalf("media manquant dans UserInfo: %+v", userInfo)
	}
	if uMedia["isMember"] != true || uMedia["role"] != "editor" || uMedia["name"] != "Lassez Mag" {
		t.Fatalf("UserInfo media inattendu: %+v", uMedia)
	}
	perms, ok := uMedia["permissions"].([]string)
	if !ok || len(perms) != 2 {
		t.Fatalf("Permissions attendues dans UserInfo media: %+v", uMedia["permissions"])
	}
}
