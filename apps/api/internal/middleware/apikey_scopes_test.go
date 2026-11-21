package middleware

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// Une clé dont tous les scopes ont été désactivés côté plateforme
// (SystemConfig API_ACCESS_MODULES) ne doit pas s'authentifier : elle
// resterait sinon valide avec zéro permission, donc acceptée par toutes
// les routes qui ne portent pas RequireAPIScope.
func TestResolveAPIKeyRow_RefuseQuandTousLesScopesSontDesactives(t *testing.T) {
	row := db.GetApiKeyByHashRow{
		ApiKeyID:  "key_1",
		KeyUserID: "user_1",
		UserID:    "user_1",
		KeyStatus: "ACTIVE",
		Scopes:    AllScopes,
	}
	row.PublisherID = "pub_1"
	row.PlatformApiModules = pgtype.Text{String: `["articles"]`, Valid: true}

	if _, ok := resolveAPIKeyRow(context.Background(), row); ok {
		t.Fatal("clé avec tous les scopes désactivés acceptée : elle obtient un accès non scopé")
	}
}

// Contre-épreuve : un seul module api:* encore actif suffit à garder la clé valide.
func TestResolveAPIKeyRow_AccepteSiUnScopeSurvit(t *testing.T) {
	row := db.GetApiKeyByHashRow{
		ApiKeyID:  "key_2",
		KeyUserID: "user_2",
		UserID:    "user_2",
		KeyStatus: "ACTIVE",
		Scopes:    []string{ScopeRead},
	}
	row.PlatformApiModules = pgtype.Text{String: `["api:read"]`, Valid: true}

	ctx, ok := resolveAPIKeyRow(context.Background(), row)
	if !ok {
		t.Fatal("clé avec READ actif refusée")
	}
	scopes, _ := Scopes(ctx)
	if len(scopes) != 1 || scopes[0] != ScopeRead {
		t.Fatalf("scopes = %v, attendu [READ]", scopes)
	}
}
