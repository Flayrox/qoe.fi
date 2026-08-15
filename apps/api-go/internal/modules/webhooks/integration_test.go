package webhooks

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api-go/internal/database"
	"github.com/qoefi/api-go/internal/testutil"
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

func seedWebhooks(t *testing.T) *testutil.WebhookFixtures {
	t.Helper()
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed webhooks: %v", err)
	}
	return fx
}

func TestGetActiveWebhooksByPublication_FiltersEventAndActive(t *testing.T) {
	fx := seedWebhooks(t)
	q := db.New(poolTest)

	// article.published → seulement le webhook actif qui y est abonné
	// (wh_act_pub), pas l'inactif (wh_inact).
	rows, err := q.GetActiveWebhooksByPublication(context.Background(), db.GetActiveWebhooksByPublicationParams{
		PublicationId: fx.PublicationID,
		Column2:       "article.published",
	})
	if err != nil {
		t.Fatalf("GetActiveWebhooksByPublication: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("len = %d, attendu 1 (actif + abonné à article.published)", len(rows))
	}
	if rows[0].ID != fx.WebhookID {
		t.Fatalf("webhook = %q, attendu %q", rows[0].ID, fx.WebhookID)
	}
	// Le secret est bien présent pour la signature HMAC du worker.
	if rows[0].Secret == "" {
		t.Fatal("secret vide alors qu'il est requis par le worker")
	}
}

func TestGetActiveWebhooksByPublication_EventNotSubscribed(t *testing.T) {
	fx := seedWebhooks(t)
	q := db.New(poolTest)

	// article.updated : aucun webhook n'y est abonné → vide (pas d'erreur).
	rows, err := q.GetActiveWebhooksByPublication(context.Background(), db.GetActiveWebhooksByPublicationParams{
		PublicationId: fx.PublicationID,
		Column2:       "article.updated",
	})
	if err != nil {
		t.Fatalf("GetActiveWebhooksByPublication(article.updated): %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("len = %d, attendu 0 (personne n'est abonné à article.updated)", len(rows))
	}
}

func TestListWebhooksByPublication_ExcludesSecret(t *testing.T) {
	fx := seedWebhooks(t)
	q := db.New(poolTest)

	// ⚠️ La requête de liste ne sélectionne pas la colonne `secret` : c'est
	// garanti statiquement par le type généré ListWebhooksByPublicationRow
	// (aucun champ Secret). On le vérifie au niveau du DTO du service : le
	// JSON de List ne doit pas contenir la clé "secret".
	rows, err := q.ListWebhooksByPublication(context.Background(), fx.PublicationID)
	if err != nil {
		t.Fatalf("ListWebhooksByPublication: %v", err)
	}
	if len(rows) != 3 {
		t.Fatalf("len = %d, attendu 3", len(rows))
	}

	// Le service List expose un DTO Webhook sans secret.
	svc := NewService(poolTest)
	items, err := svc.List(context.Background(), fx.OwnerID, fx.PublicationID)
	if err != nil {
		t.Fatalf("service List: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("service List len = %d, attendu 3", len(items))
	}
	for _, item := range items {
		// Le type Webhook n'a pas de champ Secret (exclu du DTO) — on vérifie
		// via la sérialisation qu'aucun secret ne fuit dans le JSON.
		b, _ := json.Marshal(item)
		if bytes.Contains(b, []byte("secret")) {
			t.Fatalf("secret exposé dans le DTO JSON: %s", string(b))
		}
	}
}

func TestListWebhookDeliveries_OrderedAndLimited(t *testing.T) {
	fx := seedWebhooks(t)
	q := db.New(poolTest)

	// Crée 3 livraisons (PENDING) sur le webhook actif.
	for i := 0; i < 3; i++ {
		if _, err := q.CreateWebhookDelivery(context.Background(), db.CreateWebhookDeliveryParams{
			WebhookId: fx.WebhookID,
			Event:     "article.published",
			Payload:   []byte(`{"test":true}`),
		}); err != nil {
			t.Fatalf("create delivery %d: %v", i, err)
		}
	}

	// Limite 2 → 2 livraisons, ordre createdAt DESC.
	rows, err := q.ListWebhookDeliveries(context.Background(), db.ListWebhookDeliveriesParams{
		WebhookId: fx.WebhookID,
		Limit:     2,
	})
	if err != nil {
		t.Fatalf("ListWebhookDeliveries: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("len = %d, attendu 2 (limite)", len(rows))
	}
	// createdAt DESC : la 3e livraison (la plus récente) doit être en tête.
	if rows[0].CreatedAt.Time.Before(rows[1].CreatedAt.Time) {
		t.Fatal("ordre createdAt DESC violé")
	}
}

// resolveRole : owner (publication personnelle), editor/viewer (via Média),
// utilisateur inconnu → errForbidden.
func TestResolveRole(t *testing.T) {
	fx := seedWebhooks(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	cases := []struct {
		name   string
		userID string
		want   string
	}{
		{"owner (publication personnelle)", fx.OwnerID, "owner"},
		{"editor (via Média)", fx.EditorID, "editor"},
		{"viewer (via Média)", fx.ViewerID, "viewer"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			role, err := svc.resolveRole(ctx, tc.userID, fx.PublicationID)
			if err != nil {
				t.Fatalf("resolveRole: %v", err)
			}
			if role != tc.want {
				t.Fatalf("role = %q, attendu %q", role, tc.want)
			}
		})
	}

	// Utilisateur sans lien avec la publication → errForbidden.
	_, err := svc.resolveRole(ctx, "00000000-0000-0000-0000-000000000099", fx.PublicationID)
	if err == nil {
		t.Fatal("resolveRole d'un inconnu doit échouer")
	}
}

func TestCanManage(t *testing.T) {
	if !canManage("owner") || !canManage("editor") {
		t.Fatal("owner/editor doivent pouvoir gérer")
	}
	if canManage("viewer") || canManage("writer") {
		t.Fatal("viewer/writer ne doivent pas gérer")
	}
}
