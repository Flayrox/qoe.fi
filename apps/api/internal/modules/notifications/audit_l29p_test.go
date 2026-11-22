package notifications

// Tests du lot d'audit L29p : chaque cas reproduit un défaut constaté sur le
// code d'avant correction (worktree à HEAD) et doit y échouer.

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/qoefi/api/internal/testutil"
)

// F634 : sans identité, le handler servait une liste vide en 200 au lieu de
// refuser (la route est montée derrière le middleware protégé).
func TestAuditL29P_AnonymousIsUnauthorized(t *testing.T) {
	requirePool(t)
	r := newHTTPRouter()
	for _, path := range []string{"/v1/notifications/", "/v1/notifications/unread-count", "/v1/notifications/preferences"} {
		w := doReq(r, http.MethodGet, path, "", "")
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s anonyme = %d (%s), attendu 401", path, w.Code, w.Body.String())
		}
	}
}

// F635 : un expéditeur compte média était toujours typé PERSONAL (mauvais
// avatar, carte de survol fausse).
func TestAuditL29P_SenderTypeComesFromPublisher(t *testing.T) {
	requirePool(t)
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx,
		`UPDATE "Publisher" SET type = 'MEDIA'
		 WHERE id = (SELECT "publisherId" FROM "User" WHERE id = $1)`, fx.AuthorID); err != nil {
		t.Fatalf("publisher MEDIA: %v", err)
	}
	insertNotification(t, fx.ViewerID, fx.AuthorID, "FOLLOW", "", false)

	res, err := NewService(poolTest).List(ctx, fx.ViewerID, "", 30, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(res.Notifications) == 0 || len(res.Notifications[0].Senders) == 0 {
		t.Fatalf("aucune notification rendue: %+v", res)
	}
	if got := res.Notifications[0].Senders[0].Type; got != "MEDIA" {
		t.Fatalf("sender type = %q, attendu MEDIA", got)
	}
}

// F636 : une clé de préférence inconnue était silencieusement ignorée (200,
// réglage non enregistré) ; et le patch complet relisait puis réécrivait la
// ligne (perte de mise à jour concurrente).
func TestAuditL29P_UnknownPreferenceKeyIsRejected(t *testing.T) {
	requirePool(t)
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newHTTPRouter()
	w := doReq(r, http.MethodPatch, "/v1/notifications/preferences", fx.AuthorID,
		`{"emailLikes":false,"cléInconnue":true}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("clé inconnue = %d (%s), attendu 400", w.Code, w.Body.String())
	}
}

// F637 : un marquage de 500 identifiants était accepté (ANY inutile).
func TestAuditL29P_MarkReadIsBounded(t *testing.T) {
	requirePool(t)
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	ids := make([]string, 0, 500)
	for i := 0; i < 500; i++ {
		ids = append(ids, fmt.Sprintf("%q", uuid.NewString()))
	}
	r := newHTTPRouter()
	w := doReq(r, http.MethodPost, "/v1/notifications/read", fx.ViewerID,
		`{"notificationIds":[`+strings.Join(ids, ",")+`]}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("500 ids = %d (%s), attendu 400", w.Code, w.Body.String())
	}
}

// F638 : un curseur non numérique était ignoré et la liste repartait de zéro.
func TestAuditL29P_InvalidCursorIsRejected(t *testing.T) {
	requirePool(t)
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newHTTPRouter()
	w := doReq(r, http.MethodGet, "/v1/notifications/?cursor=abc", fx.ViewerID, "")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("cursor=abc = %d (%s), attendu 400", w.Code, w.Body.String())
	}
}

// F639 : les routes clientes de création média laissaient n'importe quel compte
// fabriquer une notification vers n'importe quel destinataire.
func TestAuditL29P_MediaNotificationRoutesAreGone(t *testing.T) {
	requirePool(t)
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	var pubID string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "publisherId" FROM "User" WHERE id = $1`, fx.AuthorID).Scan(&pubID); err != nil {
		t.Fatalf("pub: %v", err)
	}
	r := newHTTPRouter()
	body := `{"recipientId":"` + fx.ViewerID + `","publisherId":"` + pubID + `"}`
	for _, path := range []string{"/v1/notifications/media-invite", "/v1/notifications/media-member-joined"} {
		w := doReq(r, http.MethodPost, path, fx.AuthorID, body)
		if w.Code != http.StatusNotFound {
			t.Fatalf("%s = %d (%s), attendu 404 (route supprimée)", path, w.Code, w.Body.String())
		}
	}
}
