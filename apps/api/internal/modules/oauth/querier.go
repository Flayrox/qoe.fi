package oauth

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// oauthQuerier : surface sqlc utilisée par le Service oauth (mockable en
// test — *db.Queries l'implémente en prod).
type oauthQuerier interface {
	ConsumeOAuthAuthorizationCode(ctx context.Context, id string) error
	CountActiveOAuthTokens(ctx context.Context, userid string) (int64, error)
	CountOAuthClientsByOwner(ctx context.Context, owneruserid string) (int64, error)
	DeleteExpiredOAuthArtifacts(ctx context.Context) error
	DeleteOAuthClient(ctx context.Context, arg db.DeleteOAuthClientParams) error
	DeleteRevokedOAuthTokens(ctx context.Context) error
	GetOAuthAuthorizationCodeByHash(ctx context.Context, codehash string) (db.OAuthAuthorizationCode, error)
	GetOAuthClientByClientId(ctx context.Context, clientid string) (db.GetOAuthClientByClientIdRow, error)
	GetOAuthClientByID(ctx context.Context, id string) (db.GetOAuthClientByIDRow, error)
	GetOAuthConsent(ctx context.Context, arg db.GetOAuthConsentParams) (db.OAuthConsent, error)
	GetOAuthTokenByAccessHash(ctx context.Context, accesstokenhash string) (db.GetOAuthTokenByAccessHashRow, error)
	GetOAuthTokenByRefreshHash(ctx context.Context, refreshtokenhash pgtype.Text) (db.GetOAuthTokenByRefreshHashRow, error)
	GetOAuthUserClaims(ctx context.Context, id string) (db.GetOAuthUserClaimsRow, error)
	GetUserApiAccessStatus(ctx context.Context, id string) (string, error)
	InsertOAuthAuthorizationCode(ctx context.Context, arg db.InsertOAuthAuthorizationCodeParams) error
	InsertOAuthClient(ctx context.Context, arg db.InsertOAuthClientParams) error
	InsertOAuthToken(ctx context.Context, arg db.InsertOAuthTokenParams) error
	ListOAuthClientsByOwner(ctx context.Context, owneruserid string) ([]db.ListOAuthClientsByOwnerRow, error)
	ListOAuthConfig(ctx context.Context) ([]db.ListOAuthConfigRow, error)
	RevokeOAuthTokenByAccessHash(ctx context.Context, accesstokenhash string) error
	RevokeOAuthTokenByRefreshHash(ctx context.Context, refreshtokenhash pgtype.Text) error
	RevokeOAuthTokensByUserClient(ctx context.Context, arg db.RevokeOAuthTokensByUserClientParams) error
	UpdateOAuthClientSecret(ctx context.Context, arg db.UpdateOAuthClientSecretParams) error
	UpdateOAuthClientStatus(ctx context.Context, arg db.UpdateOAuthClientStatusParams) error
	UpdateOAuthTokenLastUsed(ctx context.Context, id string) error
	UpsertOAuthConsent(ctx context.Context, arg db.UpsertOAuthConsentParams) error
}

// compile-time check : *db.Queries satisfait oauthQuerier.
var _ oauthQuerier = (*db.Queries)(nil)
