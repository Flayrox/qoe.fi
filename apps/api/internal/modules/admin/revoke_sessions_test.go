package admin

import (
	"context"
	"net/http"
	"testing"
)

// Fiche 05 §8 : la récupération passe par une révocation explicite, tracée,
// jamais par SMS seul. Ces tests verrouillent la frontière : sans service des
// comptes branché, refus explicite (503, pas de contournement silencieux) ;
// sans auth, 401 ; et surtout, le rôle superadmin est vérifié AVANT toute
// révocation (matrice TestAdminRoutes_AuthMatrix : un lecteur obtient 403).
func TestRevokeUserSessions_NoUsersService(t *testing.T) {
	seedAdmin(t, context.Background())
	r := newHTTPRouter()

	// Service des comptes volontairement non branché (SetUsersService jamais
	// appelé) avec un superadmin authentifié : 503 explicite.
	w := do(r, http.MethodPost, "/v1/admin/users/"+adminCreator+"/revoke-sessions", adminAdminID, "")
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("sans service = %d, attendu 503 explicite", w.Code)
	}
}

func TestRevokeUserSessions_Anonymous(t *testing.T) {
	seedAdmin(t, context.Background())
	r := newHTTPRouter()

	if w := do(r, http.MethodPost, "/v1/admin/users/"+adminCreator+"/revoke-sessions", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonyme = %d, attendu 401", w.Code)
	}
}
