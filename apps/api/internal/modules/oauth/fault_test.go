package oauth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	db "github.com/qoefi/api/internal/database"
)

// oauthFaultQ délègue au vrai *db.Queries sauf les méthodes listées.
type oauthFaultQ struct {
	*db.Queries
	err error
}

func (f *oauthFaultQ) ListOAuthClientsByOwner(ctx context.Context, owneruserid string) ([]db.ListOAuthClientsByOwnerRow, error) {
	return nil, f.err
}

// GetOAuthClientByID réussit (client valide du owner) pour atteindre les
// branches 500 de rotate/revoke ; les écritures échouent ensuite.
func (f *oauthFaultQ) GetOAuthClientByID(ctx context.Context, id string) (db.GetOAuthClientByIDRow, error) {
	return db.GetOAuthClientByIDRow{
		ID:           id,
		OwnerUserId:  ownerForFault,
		ClientType:   "CONFIDENTIAL",
		ClientId:     "client-fault",
		Status:       "APPROVED",
		Name:         "Fault",
		RedirectUris: []string{"https://x/cb"},
	}, nil
}

func (f *oauthFaultQ) UpdateOAuthClientSecret(ctx context.Context, arg db.UpdateOAuthClientSecretParams) error {
	return f.err
}
func (f *oauthFaultQ) DeleteOAuthClient(ctx context.Context, arg db.DeleteOAuthClientParams) error {
	return f.err
}

// ownerForFault est injecté par le test pour matcher le userID du requérant.
var ownerForFault string

// TestOAuth500Branches : list/rotate/revoke client → 500 quand le service échoue.
func TestOAuth500Branches(t *testing.T) {
	fx := seedOAuth(t)
	ownerForFault = fx.OwnerID
	svc := &Service{pool: poolTest, q: &oauthFaultQ{Queries: db.New(poolTest), err: errors.New("boom")}}
	h := NewHandler(svc)
	r := chi.NewRouter()
	h.RegisterPublic(r)
	h.RegisterProtected(r)

	req := httptest.NewRequest(http.MethodGet, "/v1/oauth/clients", strings.NewReader(""))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, fx.OwnerID))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("list = %d, attendu 500 (body %s)", w.Code, w.Body.String())
	}

	req2 := httptest.NewRequest(http.MethodPost, "/v1/oauth/clients/x/rotate-secret", strings.NewReader(""))
	req2 = req2.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, fx.OwnerID))
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusInternalServerError {
		t.Fatalf("rotate = %d, attendu 500 (body %s)", w2.Code, w2.Body.String())
	}

	req3 := httptest.NewRequest(http.MethodDelete, "/v1/oauth/clients/x", strings.NewReader(""))
	req3 = req3.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, fx.OwnerID))
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, req3)
	if w3.Code != http.StatusInternalServerError {
		t.Fatalf("revoke client = %d, attendu 500 (body %s)", w3.Code, w3.Body.String())
	}
}
