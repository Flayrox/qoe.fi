package oauth

// Lot L29x — fournisseur OAuth : redirections d'erreur, appartenance média,
// pannes rendues en 401/404, et consommations/révocations avalées.

import (
	"context"
	"crypto/sha256"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

func unreachablePool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, "postgres://qoe:qoe@127.0.0.1:1/qoe?connect_timeout=1")
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// auditQ hérite du vrai *db.Queries et ne surcharge que ce que le test pilote.
type auditQ struct {
	*db.Queries
	client        *db.GetOAuthClientByClientIdRow
	clientErr     error
	clientByIDErr error
	media         *db.GetOAuthMediaContextRow
	publisherRows []db.ListOAuthClientsByPublisherRow
	code          *db.OAuthAuthorizationCode
	accessRow     *db.GetOAuthTokenByAccessHashRow
	refreshRow    *db.GetOAuthTokenByRefreshHashRow

	consumeErr       error
	revokeAccessErr  error
	revokeRefreshErr error
}

func (q *auditQ) GetOAuthClientByClientId(context.Context, string) (db.GetOAuthClientByClientIdRow, error) {
	if q.clientErr != nil {
		return db.GetOAuthClientByClientIdRow{}, q.clientErr
	}
	if q.client == nil {
		return db.GetOAuthClientByClientIdRow{}, errors.New("client absent du test")
	}
	return *q.client, nil
}

func (q *auditQ) GetOAuthClientByID(context.Context, string) (db.GetOAuthClientByIDRow, error) {
	if q.clientByIDErr != nil {
		return db.GetOAuthClientByIDRow{}, q.clientByIDErr
	}
	return db.GetOAuthClientByIDRow{ID: "client-db-id", OwnerUserId: "owner", ClientType: "CONFIDENTIAL"}, nil
}

func (q *auditQ) GetOAuthMediaContext(context.Context, db.GetOAuthMediaContextParams) (db.GetOAuthMediaContextRow, error) {
	if q.media == nil {
		return db.GetOAuthMediaContextRow{}, errors.New("média absent du test")
	}
	return *q.media, nil
}

func (q *auditQ) ListOAuthClientsByPublisher(context.Context, pgtype.Text) ([]db.ListOAuthClientsByPublisherRow, error) {
	return q.publisherRows, nil
}

func (q *auditQ) GetOAuthAuthorizationCodeByHash(context.Context, string) (db.OAuthAuthorizationCode, error) {
	if q.code == nil {
		return db.OAuthAuthorizationCode{}, errors.New("code absent du test")
	}
	return *q.code, nil
}

func (q *auditQ) ConsumeOAuthAuthorizationCode(context.Context, string) error {
	return q.consumeErr
}

func (q *auditQ) GetOAuthTokenByAccessHash(context.Context, string) (db.GetOAuthTokenByAccessHashRow, error) {
	if q.accessRow == nil {
		return db.GetOAuthTokenByAccessHashRow{}, errors.New("token absent du test")
	}
	return *q.accessRow, nil
}

func (q *auditQ) GetOAuthTokenByRefreshHash(context.Context, pgtype.Text) (db.GetOAuthTokenByRefreshHashRow, error) {
	if q.refreshRow == nil {
		return db.GetOAuthTokenByRefreshHashRow{}, errors.New("refresh absent du test")
	}
	return *q.refreshRow, nil
}

func (q *auditQ) RevokeOAuthTokenByAccessHash(context.Context, string) error {
	return q.revokeAccessErr
}
func (q *auditQ) RevokeOAuthTokenByRefreshHash(context.Context, pgtype.Text) error {
	return q.revokeRefreshErr
}
func (q *auditQ) RevokeOAuthTokensByUserClient(context.Context, db.RevokeOAuthTokensByUserClientParams) error {
	return nil
}
func (q *auditQ) InsertOAuthToken(context.Context, db.InsertOAuthTokenParams) error { return nil }
func (q *auditQ) CountActiveOAuthTokens(context.Context, string) (int64, error)     { return 0, nil }

func auditService(t *testing.T, q *auditQ) *Service {
	t.Helper()
	pool := unreachablePool(t)
	q.Queries = db.New(pool) // méthodes non surchargées : vrai sqlc, base injoignable
	svc := NewService(pool, "https://issuer.test", "https://issuer.test/authorize", "")
	svc.q = q
	return svc
}

type auditError interface{ Error() string }

func statusOf(t *testing.T, err error) int {
	t.Helper()
	var oerr *OAuthError
	if !errors.As(err, &oerr) {
		t.Fatalf("erreur non OAuth : %v", err)
	}
	return oerr.Status
}

func TestAuditL29X_UnapprovedClientRedirectsOnlyToValidatedURI(t *testing.T) {
	q := &auditQ{client: &db.GetOAuthClientByClientIdRow{
		ID: "client-db-id", ClientId: "cid", Status: "PENDING",
		RedirectUris: []string{"https://legitime.example/cb"},
		Scopes:       []string{"openid"},
	}}
	svc := auditService(t, q)
	res := svc.BeginAuthorization(context.Background(), "00000000-0000-0000-0000-0000000000aa", &AuthorizeRequest{
		ResponseType:  "code",
		ClientID:      "cid",
		RedirectURI:   "https://attaquant.example/vol",
		Scope:         "openid",
		State:         "s1",
		CodeChallenge: "abc",
	})
	if strings.HasPrefix(res.Redirect, "https://attaquant.example") {
		t.Fatalf("redirection d'erreur vers une redirect_uri non validée : %s", res.Redirect)
	}
}

func TestAuditL29X_MediaClientsRequireMembership(t *testing.T) {
	q := &auditQ{
		media: &db.GetOAuthMediaContextRow{
			PublisherId:   "pub-x",
			PublisherName: "Média d'autrui",
			IsMember:      pgtype.Bool{Bool: false, Valid: true},
		},
		publisherRows: []db.ListOAuthClientsByPublisherRow{{ID: "c1", ClientId: "c1", Name: "App du média"}},
	}
	svc := auditService(t, q)
	clients, err := svc.ListClients(context.Background(), "00000000-0000-0000-0000-0000000000aa", "pub-x")
	if err == nil {
		t.Fatalf("non-membre : %d application(s) OAuth d'un média d'autrui listée(s)", len(clients))
	}
	if statusOf(t, err) != 403 {
		t.Fatalf("non-membre : statut %d, attendu 403", statusOf(t, err))
	}
}

func TestAuditL29X_ClientLookupOutageIsNotInvalidClient(t *testing.T) {
	q := &auditQ{clientErr: errors.New("connexion perdue")}
	svc := auditService(t, q)
	if _, oerr := svc.AuthenticateClient(context.Background(), "cid", "secret"); oerr == nil {
		t.Fatal("client accepté malgré la panne")
	} else if oerr.Status == 401 {
		t.Fatalf("panne DB rendue en 401 %s", oerr.Code)
	}
}

func TestAuditL29X_RotateOutageIsNotNotFound(t *testing.T) {
	q := &auditQ{clientByIDErr: errors.New("connexion perdue")}
	svc := auditService(t, q)
	_, err := svc.RotateClientSecret(context.Background(), "owner", "client-db-id")
	if err == nil {
		t.Fatal("rotation réussie malgré la panne")
	}
	if statusOf(t, err) == 404 {
		t.Fatalf("panne DB rendue en 404 : %v", err)
	}
}

func TestAuditL29X_CodeConsumptionErrorAbortsExchange(t *testing.T) {
	verifier := "verifier-de-test"
	sum := sha256.Sum256([]byte(verifier))
	q := &auditQ{
		client: &db.GetOAuthClientByClientIdRow{
			ID: "client-db-id", ClientId: "cid", Status: "APPROVED", ClientType: "CONFIDENTIAL",
			RedirectUris: []string{"https://app.example/cb"}, Scopes: []string{"openid"},
		},
		code: &db.OAuthAuthorizationCode{
			ID: "code-row", ClientId: "client-db-id", UserId: "00000000-0000-0000-0000-0000000000aa",
			RedirectUri: "https://app.example/cb", Scopes: []string{"openid"},
			CodeChallenge: pgtype.Text{String: b64url(sum[:]), Valid: true},
			ExpiresAt:     pgtype.Timestamp{Time: time.Now().Add(time.Minute), Valid: true},
		},
		consumeErr: errors.New("connexion perdue"),
	}
	svc := auditService(t, q)
	resp, oerr := svc.Token(context.Background(), &TokenRequest{
		GrantType: "authorization_code", Code: "the-code",
		RedirectURI: "https://app.example/cb", CodeVerifier: verifier,
	}, *q.client)
	if oerr == nil {
		t.Fatalf("code non consommé mais jetons émis (access=%d caractères)", len(resp.AccessToken))
	}
}

func TestAuditL29X_RefreshRotationErrorAbortsRotation(t *testing.T) {
	q := &auditQ{
		client: &db.GetOAuthClientByClientIdRow{
			ID: "client-db-id", ClientId: "cid", Status: "APPROVED", ClientType: "CONFIDENTIAL",
			RedirectUris: []string{"https://app.example/cb"}, Scopes: []string{"openid"},
		},
		refreshRow: &db.GetOAuthTokenByRefreshHashRow{
			ClientId: "client-db-id", UserId: "00000000-0000-0000-0000-0000000000aa",
			Scopes: []string{"openid"}, PublicClientId: "cid",
			RefreshTokenExpiresAt: pgtype.Timestamp{Time: time.Now().Add(time.Hour), Valid: true},
		},
		revokeRefreshErr: errors.New("connexion perdue"),
	}
	svc := auditService(t, q)
	resp, oerr := svc.Token(context.Background(), &TokenRequest{
		GrantType: "refresh_token", RefreshToken: "ancien-refresh",
	}, *q.client)
	if oerr == nil {
		t.Fatalf("ancien refresh token toujours valide mais nouveau couple émis (access=%d caractères)", len(resp.AccessToken))
	}
}

func TestAuditL29X_RevokeOutageIsNotASuccess(t *testing.T) {
	q := &auditQ{
		accessRow: &db.GetOAuthTokenByAccessHashRow{
			ID: "tok", ClientId: "client-db-id", UserId: "00000000-0000-0000-0000-0000000000aa",
			Scopes: []string{"openid"}, PublicClientId: "cid",
			AccessTokenExpiresAt: pgtype.Timestamp{Time: time.Now().Add(time.Hour), Valid: true},
		},
		revokeAccessErr: errors.New("connexion perdue"),
	}
	svc := auditService(t, q)
	if oerr := svc.Revoke(context.Background(), "jeton", "", "cid"); oerr == nil {
		t.Fatal("révocation annoncée réussie alors que le token reste valide")
	}
}

var _ = auditError(nil)
