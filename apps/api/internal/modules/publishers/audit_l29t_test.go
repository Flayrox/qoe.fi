package publishers

// Tests du lot d'audit L29t : chaque cas reproduit un défaut constaté sur le
// code d'avant correction (worktree à HEAD) et doit y échouer.

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

// failOnPool délègue au vrai pool sauf pour les requêtes dont le SQL contient
// `match`, qui échouent : isole une panne DB sur une seule requête.
type failOnPool struct {
	pooler
	match string
}

type auditErrRow struct{ err error }

func (r auditErrRow) Scan(...any) error { return r.err }

func (p failOnPool) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	if strings.Contains(sql, p.match) {
		return nil, errors.New("db down")
	}
	return p.pooler.Query(ctx, sql, args...)
}

func (p failOnPool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if strings.Contains(sql, p.match) {
		return auditErrRow{err: errors.New("db down")}
	}
	return p.pooler.QueryRow(ctx, sql, args...)
}

func byDomainArticles(t *testing.T, domain string) []map[string]any {
	t.Helper()
	h := NewHandler(NewService(poolTest))
	w := doRoute(h, http.MethodGet, "/v1/publishers/by-domain/"+domain)
	if w.Code != http.StatusOK {
		t.Fatalf("by-domain = %d (%s)", w.Code, w.Body.String())
	}
	var body struct {
		Articles []map[string]any `json:"articles"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	return body.Articles
}

// F677 : la lecture d'article ne vérifiait ni `published` ni `scheduledAt` :
// un brouillon (ou un article programmé) était servi en 200 sur le domaine
// public, contenu compris.
func TestAuditL29T_DraftAndScheduledArticlesAreNotPublic(t *testing.T) {
	_, userID, _ := seedPublisher(t)
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Article" (id, title, slug, content, published, status, "publisherId", "authorId", "createdAt", "updatedAt")
		VALUES ('art_l29t_draft', 'Brouillon', 'mon-brouillon', '<p>secret</p>', false, 'DRAFT', 'pub_tenant_test', $1, now(), now())`,
		userID); err != nil {
		t.Fatalf("draft: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Article" (id, title, slug, content, published, status, "scheduledAt", "publisherId", "authorId", "createdAt", "updatedAt")
		VALUES ('art_l29t_sched', 'Programmé', 'mon-programme', '<p>pas encore</p>', true, 'SCHEDULED', now() + interval '2 days', 'pub_tenant_test', $1, now(), now())`,
		userID); err != nil {
		t.Fatalf("scheduled: %v", err)
	}

	h := NewHandler(NewService(poolTest))
	for _, slug := range []string{"mon-brouillon", "mon-programme"} {
		w := doRoute(h, http.MethodGet, "/v1/publishers/by-domain/tenant/article/"+slug)
		if w.Code != http.StatusNotFound {
			t.Fatalf("%s: code = %d (%s), attendu 404", slug, w.Code, w.Body.String())
		}
	}
}

// F678 : les compteurs d'engagement comptaient les reposts brouillons,
// supprimés ou masqués — un article pouvait afficher des milliers de reposts
// invisibles.
func TestAuditL29T_RepostCountIgnoresHiddenPosts(t *testing.T) {
	_, userID, articleID := seedPublisher(t)
	ctx := context.Background()
	posts := []struct {
		id, extra string
	}{
		{"post_l29t_visible", ""},
		{"post_l29t_draft", `, "isDraft"`},
		{"post_l29t_deleted", `, "deletedAt"`},
		{"post_l29t_hidden", `, "isHiddenByAuthor"`},
	}
	for _, p := range posts {
		q := `INSERT INTO "Post" (id, content, "authorId", "quotedArticleId"` + p.extra + `, "updatedAt")
			VALUES ($1, '', $2, $3`
		switch p.id {
		case "post_l29t_draft":
			q += `, true`
		case "post_l29t_deleted":
			q += `, now()`
		case "post_l29t_hidden":
			q += `, true`
		}
		q += `, now())`
		if _, err := poolTest.Exec(ctx, q, p.id, userID, articleID); err != nil {
			t.Fatalf("post %s: %v", p.id, err)
		}
	}

	svc := NewService(poolTest)
	bundle, err := svc.Article(ctx, "tenant", "article-tenant", "", "")
	if err != nil {
		t.Fatalf("Article: %v", err)
	}
	if bundle.Article.RepostsCount != 1 {
		t.Fatalf("repostsCount = %d, attendu 1 (seul le repost visible)", bundle.Article.RepostsCount)
	}

	arts := byDomainArticles(t, "tenant")
	var card RepostsCountView
	for _, a := range arts {
		if a["id"] == articleID {
			raw, _ := json.Marshal(a)
			if err := json.Unmarshal(raw, &card); err != nil {
				t.Fatalf("carte: %v", err)
			}
		}
	}
	if card.RepostsCount != 1 {
		t.Fatalf("carte repostsCount = %d, attendu 1", card.RepostsCount)
	}
}

type RepostsCountView struct {
	RepostsCount int `json:"repostsCount"`
}

// F679 : une panne DB pendant le repli d'attribution était convertie en 404
// (« article introuvable ») au lieu de remonter en 500.
func TestAuditL29T_AttributionOutageIsNotNotFound(t *testing.T) {
	seedPublisher(t)
	svc := &Service{pool: failOnPool{pooler: poolTest, match: `FROM "ArticleAttribution" at`}}
	_, err := svc.Article(context.Background(), "tenant", "article-inexistant", "", "")
	if err == nil {
		t.Fatal("erreur attendue")
	}
	if errors.Is(err, errNotFound) {
		t.Fatalf("panne DB rendue en errNotFound (404) : %v", err)
	}
}

// F680 : une panne DB sur la résolution des entitlements était avalée ; un
// abonné payant recevait un contenu tronqué en 200, sans aucun signal.
func TestAuditL29T_EntitlementOutageIsNotSilent(t *testing.T) {
	_, _, articleID := seedPublisher(t)
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx,
		`UPDATE "Article" SET visibility = 'MEMBERS_ONLY' WHERE id = $1`, articleID); err != nil {
		t.Fatalf("visibility: %v", err)
	}
	svc := &Service{pool: failOnPool{pooler: poolTest, match: `FROM "Subscriber"`}}
	_, err := svc.Article(ctx, "tenant", "article-tenant",
		"00000000-0000-0000-0000-0000000000e2", "tenant.reader@test.dev")
	if err == nil {
		t.Fatal("panne des entitlements avalée : aucun signal")
	}
}

// F681 : la liste des recommandations n'était pas bornée.
func TestAuditL29T_RecommendationsAreBounded(t *testing.T) {
	pubID, _, _ := seedPublisher(t)
	ctx := context.Background()
	for i := 0; i < 60; i++ {
		target := "pub_l29t_rec_" + strings.Repeat("a", i%3) + string(rune('a'+i%26)) + string(rune('a'+i/26))
		if _, err := poolTest.Exec(ctx, `
			INSERT INTO "Publisher" (id, type, name, slug, subdomain, "updatedAt")
			VALUES ($1, 'PERSONAL', $1, $1, $1, now())
			ON CONFLICT (id) DO NOTHING`, target); err != nil {
			t.Fatalf("publisher %d: %v", i, err)
		}
		if _, err := poolTest.Exec(ctx, `
			INSERT INTO "Recommendation" (id, "recommenderId", "recommendedId", "createdAt")
			VALUES ($1, $2, $3, now())`, "rec_l29t_"+string(rune('a'+i%26))+string(rune('a'+i/26)), pubID, target); err != nil {
			t.Fatalf("reco %d: %v", i, err)
		}
	}
	items, err := NewService(poolTest).Recommendations(ctx, "tenant")
	if err != nil {
		t.Fatalf("Recommendations: %v", err)
	}
	if len(items) > 50 {
		t.Fatalf("%d recommandations renvoyées, attendu <= 50", len(items))
	}
}

// F682 : le domaine racine du TLS on-demand était codé en dur (`qoe.fi`,
// `updates.qoe.fi`) : impossible de self-hoster un autre domaine sans patcher
// le code.
func TestAuditL29T_TLSRootDomainIsConfigurable(t *testing.T) {
	seedPublisher(t)
	t.Setenv("QOE_ROOT_DOMAIN", "example.com")
	svc := NewService(poolTest)
	for _, domain := range []string{"tenant.example.com", "updates.example.com"} {
		ok, err := svc.AllowTLS(context.Background(), domain)
		if err != nil {
			t.Fatalf("%s: %v", domain, err)
		}
		if !ok {
			t.Fatalf("%s refusé alors que QOE_ROOT_DOMAIN=example.com", domain)
		}
	}
	ok, err := svc.AllowTLS(context.Background(), "tenant.qoe.fi")
	if err != nil {
		t.Fatalf("qoe.fi: %v", err)
	}
	if ok {
		t.Fatal("qoe.fi encore autorisé : le domaine racine reste codé en dur")
	}
}

// F683 : le profil d'un compte privé exposait ses articles à un visiteur
// anonyme sur le site tenant, alors que la recherche et le feed les masquent
// (can_view_profile).
func TestAuditL29T_PrivateAccountArticlesAreHidden(t *testing.T) {
	_, userID, _ := seedPublisher(t)
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "UserSettings" (id, "userId", "profileVisibility", "updatedAt")
		VALUES ('us_l29t_private', $1::uuid, 'PRIVATE', now())
		ON CONFLICT ("userId") DO UPDATE SET "profileVisibility" = 'PRIVATE'`, userID); err != nil {
		t.Fatalf("settings: %v", err)
	}

	if arts := byDomainArticles(t, "tenant"); len(arts) != 0 {
		t.Fatalf("%d articles d'un compte privé servis à un anonyme", len(arts))
	}
	h := NewHandler(NewService(poolTest))
	w := doRoute(h, http.MethodGet, "/v1/publishers/by-domain/tenant/article/article-tenant")
	if w.Code != http.StatusNotFound {
		t.Fatalf("article d'un compte privé = %d (%s), attendu 404", w.Code, w.Body.String())
	}
}

// F684 : domaine et slug n'étaient pas bornés côté handler.
func TestAuditL29T_RouteParamsAreBounded(t *testing.T) {
	h := NewHandler(NewService(poolTest))
	long := strings.Repeat("a", 300)
	w := doRoute(h, http.MethodGet, "/v1/publishers/by-domain/"+long)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("domaine de 300 caractères = %d, attendu 400", w.Code)
	}
	w = doRoute(h, http.MethodGet, "/v1/publishers/by-domain/tenant/article/"+long)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("slug de 300 caractères = %d, attendu 400", w.Code)
	}
}
