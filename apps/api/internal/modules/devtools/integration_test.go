package devtools

// Tests d'intégration de l'inspecteur DevTools (GET /v1/devtools/data) :
// superadmin → utilisateurs + compteurs ; non-superadmin → refus.

import (
	"context"
	"log"
	"os"
	"testing"

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

const (
	devtoolsAdminID  = "00000000-0000-0000-0000-0000000000f1"
	devtoolsCreator  = "00000000-0000-0000-0000-0000000000f2"
	devtoolsReaderID = "00000000-0000-0000-0000-0000000000f3"
)

// seedDevtools crée :
//   - admin (superadmin) avec publication personnelle (subdomain/accentColor) ;
//   - creator (rôle creator, sans publication) avec 1 article + 1 pensée + 1 like ;
//   - reader (rôle user) + 1 subscriber sur la publication du creator ;
//
// Les createdAt sont explicites pour tester le tri DESC (creator plus récent).
func seedDevtools(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"Like", "Subscriber", "Post", "Article", "Category", "Publication", "User"
		CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	// Publication personnelle de l'admin (porteur du design).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, subdomain, "accentColor", "layoutStyle", "createdAt", "updatedAt")
		 VALUES ('pub_dev_001', 'PERSONAL', 'Admin Sanctuaire', 'admin-dev', 'admin-dev', '#c5a880', 'minimal',
		         '2026-01-01 10:00:00', '2026-01-01 10:00:00')`); err != nil {
		t.Fatalf("publication admin: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ('pub_dev_002', 'PERSONAL', 'Journal Devtools', 'journal-devtools', now(), now())`); err != nil {
		t.Fatalf("publication creator: %v", err)
	}

	users := []struct{ id, email, username, name, role, pubID, createdAt string }{
		{devtoolsAdminID, "admin-dev@test.dev", "admindev", "Admin", "superadmin", "pub_dev_001", "2026-01-01 11:00:00"},
		{devtoolsCreator, "creator-dev@test.dev", "creatordev", "Creator", "creator", "pub_dev_002", "2026-01-02 11:00:00"},
		{devtoolsReaderID, "reader-dev@test.dev", "readerdev", "Reader", "user", "", "2026-01-03 11:00:00"},
	}
	for _, u := range users {
		if u.pubID == "" {
			if _, err := poolTest.Exec(ctx,
				`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
				 VALUES ($1, $2, $3, $4, $5, $6::timestamp, $6::timestamp)`,
				u.id, u.email, u.username, u.name, u.role, u.createdAt); err != nil {
				t.Fatalf("user %s: %v", u.username, err)
			}
			continue
		}
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $4, $5, $6, $7::timestamp, $7::timestamp)`,
			u.id, u.email, u.username, u.name, u.role, u.pubID, u.createdAt); err != nil {
			t.Fatalf("user %s: %v", u.username, err)
		}
	}

	// 1 article (creator) + 1 pensée + 1 like + 1 subscriber.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, "isPremium", visibility,
		                        "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_dev_01', 'Article Devtools', 'article-devtools', '<p>x</p>', true, false, 'PUBLIC', 4, 'PUBLISHED',
		         'pub_dev_002', $1, now(), now())`, devtoolsCreator); err != nil {
		t.Fatalf("article: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt")
		 VALUES ('post_dev_01', 'Pensée devtools', $1, now(), now())`, devtoolsCreator); err != nil {
		t.Fatalf("post: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Like" (id, "postId", "userId", "createdAt")
		 VALUES ('like_dev_01', 'post_dev_01', $1, now())`, devtoolsReaderID); err != nil {
		t.Fatalf("like: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "receiveArticles", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'sub-dev@test.dev', 'pub_dev_002', true, true, now(), now())`); err != nil {
		t.Fatalf("subscriber: %v", err)
	}
}

func newTestService() *Service {
	return NewService(poolTest)
}

func TestGetData_Superadmin(t *testing.T) {
	ctx := context.Background()
	seedDevtools(t, ctx)
	svc := newTestService()

	data, err := svc.GetData(ctx, devtoolsAdminID)
	if err != nil {
		t.Fatalf("GetData: %v", err)
	}

	// Stats : 3 users, 1 article, 1 post, 1 like, 1 subscriber.
	stats := data.Stats
	if stats.Users != 3 || stats.Articles != 1 || stats.Posts != 1 || stats.Likes != 1 || stats.Subscribers != 1 {
		t.Fatalf("stats = %+v, attendu users 3 / articles 1 / posts 1 / likes 1 / subscribers 1", stats)
	}

	// Users triés createdAt DESC → reader (03/01) en premier, admin (01/01) en dernier.
	if len(data.Users) != 3 {
		t.Fatalf("users = %d, attendu 3", len(data.Users))
	}
	if data.Users[0].Email != "reader-dev@test.dev" || data.Users[2].Email != "admin-dev@test.dev" {
		t.Fatalf("ordre = %v", data.Users)
	}

	// Shape parité DevtoolsUser TS : publication personnelle imbriquée à plat.
	admin := data.Users[2]
	if admin.Role != "superadmin" || admin.Subdomain == nil || *admin.Subdomain != "admin-dev" ||
		admin.AccentColor == nil || *admin.AccentColor != "#c5a880" || admin.LayoutStyle == nil ||
		*admin.LayoutStyle != "minimal" {
		t.Fatalf("admin = %+v", admin)
	}
	if admin.CreatedAt == "" {
		t.Fatalf("createdAt vide pour admin")
	}
	reader := data.Users[0]
	if reader.Subdomain != nil || reader.CustomDomain != nil {
		t.Fatalf("reader (sans publication) = %+v, attendu nil design", reader)
	}
}

func TestGetData_Forbidden(t *testing.T) {
	ctx := context.Background()
	seedDevtools(t, ctx)
	svc := newTestService()

	// Creator (rôle creator) → refus.
	if _, err := svc.GetData(ctx, devtoolsCreator); err != errForbidden {
		t.Fatalf("GetData(creator) = %v, attendu errForbidden", err)
	}
	// User inexistant → refus (pas de fuite d'existence).
	if _, err := svc.GetData(ctx, "00000000-0000-0000-0000-0000000000ff"); err != errForbidden {
		t.Fatalf("GetData(inconnu) = %v, attendu errForbidden", err)
	}
}
