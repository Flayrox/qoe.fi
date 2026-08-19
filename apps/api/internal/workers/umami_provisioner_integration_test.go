package workers

import (
	"context"
	"testing"
)

// fakeUmamiCreator simule l'API Umami : retourne un id stable par domaine.
type fakeUmamiCreator struct {
	created []string // domaines créés (pour assertions)
}

func (f *fakeUmamiCreator) CreateWebsite(_ context.Context, name, domain string) (string, error) {
	f.created = append(f.created, domain)
	return "umami_website_" + domain, nil
}

// seedPublicationsWithoutUmami crée des publications dont certaines ont déjà
// un websiteId (ne doivent pas être touchées) et d'autres non (à provisionner).
// prefix rend les IDs uniques par test (les tests partagent le même pool DB).
func seedPublicationsWithoutUmami(t *testing.T, prefix string) (withoutID1, withoutID2, withID string) {
	t.Helper()
	ctx := context.Background()

	// Vide la table (les tests du package partagent le même pool DB : on ne
	// veut provisionner QUE nos publications, pas celles des autres seeds).
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "Publication" CASCADE`); err != nil {
		t.Fatalf("truncate publication: %v", err)
	}

	// Publication avec websiteId déjà présent → ignorée.
	withID = prefix + "_with"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, subdomain, "umamiWebsiteId", "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Déjà configurée', $2, $2, 'existing_web_id', now(), now())`,
		withID, withID+"-slug",
	); err != nil {
		t.Fatalf("insert withID: %v", err)
	}

	// Publications sans websiteId → à provisionner.
	withoutID1 = prefix + "_a"
	withoutID2 = prefix + "_b"
	for i, id := range []string{withoutID1, withoutID2} {
		slug := prefix + "-blog-" + string(rune('a'+i))
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Publication" (id, type, name, slug, subdomain, "createdAt", "updatedAt")
			 VALUES ($1, 'PERSONAL', $2, $3, $3, now(), now())`,
			id, "Blog "+slug, slug,
		); err != nil {
			t.Fatalf("insert %s: %v", id, err)
		}
	}
	return withoutID1, withoutID2, withID
}

func umamiWebsiteID(t *testing.T, pubID string) string {
	t.Helper()
	var id string
	err := poolTest.QueryRow(context.Background(),
		`SELECT COALESCE("umamiWebsiteId", '') FROM "Publication" WHERE id = $1`, pubID,
	).Scan(&id)
	if err != nil {
		t.Fatalf("lire umamiWebsiteId %s: %v", pubID, err)
	}
	return id
}

func TestUmamiProvisionOnce_ProvisionsMissingOnly(t *testing.T) {
	without1, without2, withID := seedPublicationsWithoutUmami(t, "pub_um_only")
	fake := &fakeUmamiCreator{}

	if err := runUmamiProvisionOnce(context.Background(), poolTest, fake); err != nil {
		t.Fatalf("provision: %v", err)
	}

	// Les 2 publications sans id ont reçu un website, stocké en DB.
	if got := umamiWebsiteID(t, without1); got != "umami_website_pub_um_only-blog-a.qoe.fi" {
		t.Fatalf("pub1 umamiWebsiteId = %q", got)
	}
	if got := umamiWebsiteID(t, without2); got != "umami_website_pub_um_only-blog-b.qoe.fi" {
		t.Fatalf("pub2 umamiWebsiteId = %q", got)
	}
	// La publication déjà configurée est intacte.
	if got := umamiWebsiteID(t, withID); got != "existing_web_id" {
		t.Fatalf("pub avec id existant modifiée → %q", got)
	}
	if len(fake.created) != 2 {
		t.Fatalf("2 websites attendus, %d créés: %v", len(fake.created), fake.created)
	}
}

func TestUmamiProvisionOnce_Idempotent(t *testing.T) {
	without1, _, _ := seedPublicationsWithoutUmami(t, "pub_um_idem")
	fake := &fakeUmamiCreator{}

	if err := runUmamiProvisionOnce(context.Background(), poolTest, fake); err != nil {
		t.Fatalf("provision #1: %v", err)
	}
	if err := runUmamiProvisionOnce(context.Background(), poolTest, fake); err != nil {
		t.Fatalf("provision #2: %v", err)
	}

	// Second run : plus rien à provisionner (les 2 id sont stockés).
	if got := umamiWebsiteID(t, without1); got == "" {
		t.Fatalf("pub1 n'a pas d'id après provision")
	}
	if len(fake.created) != 2 {
		t.Fatalf("idempotence cassée : %d créations au lieu de 2", len(fake.created))
	}
}
