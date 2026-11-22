package media

// Tests du lot d'audit L29k : chaque cas reproduit un défaut constaté sur le
// code d'avant correction (worktree à HEAD) et doit échouer là-bas.

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/qoefi/api/internal/permissions"
)

func mediaMemberRole(t *testing.T, ctx context.Context, userID string) string {
	t.Helper()
	var role string
	if err := poolTest.QueryRow(ctx,
		`SELECT role FROM "MediaMember" WHERE "mediaId" = 'media_001' AND "userId" = $1`,
		userID).Scan(&role); err != nil {
		t.Fatalf("rôle de %s: %v", userID, err)
	}
	return role
}

// F574 : `UpdateSettings` écrivait la valeur brute (javascript:, XSS, longueurs).
func TestAuditL29K_UpdateSettings_RejectsUnsafeValues(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	if _, err := svc.UpdateSettings(ctx, mediaOwnerID, "media_001", map[string]any{
		"logoUrl": "javascript:alert(1)",
	}); err == nil {
		t.Fatal("logoUrl javascript: accepté")
	}
	if _, err := svc.UpdateSettings(ctx, mediaOwnerID, "media_001", map[string]any{
		"heroText": "<script>alert(1)</script>",
	}); err == nil {
		t.Fatal("heroText avec <script> accepté")
	}
	if _, err := svc.UpdateSettings(ctx, mediaOwnerID, "media_001", map[string]any{
		"seoTitle": strings.Repeat("a", 5000),
	}); err == nil {
		t.Fatal("seoTitle de 5000 caractères accepté")
	}
	if _, err := svc.UpdateSettings(ctx, mediaOwnerID, "media_001", map[string]any{
		"subdomain": "admin",
	}); err == nil {
		t.Fatal("sous-domaine réservé accepté")
	}

	var logo, hero, sub string
	var seoLen int
	if err := poolTest.QueryRow(ctx,
		`SELECT COALESCE("logoUrl", ''), COALESCE("heroText", ''), COALESCE(subdomain, ''),
		        COALESCE(length("seoTitle"), 0)
		 FROM "Publisher" WHERE id = 'pub_media_001'`,
	).Scan(&logo, &hero, &sub, &seoLen); err != nil {
		t.Fatalf("lecture réglages: %v", err)
	}
	if logo != "" || hero != "" || sub != "media-un" || seoLen > 200 {
		t.Fatalf("valeurs écrites malgré refus: logo=%q hero=%q sub=%q seo=%d", logo, hero, sub, seoLen)
	}
}

// F574 : un sous-domaine déjà attribué à une autre publication ne peut pas être pris.
func TestAuditL29K_UpdateSettings_RefusesTakenSubdomain(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publisher" (id, type, name, slug, subdomain, "createdAt", "updatedAt")
		 VALUES ('pub_other', 'MEDIA', 'Autre', 'autre', 'autre-sub', now(), now())`); err != nil {
		t.Fatalf("publication voisine: %v", err)
	}
	if _, err := svc.UpdateSettings(ctx, mediaOwnerID, "media_001", map[string]any{"subdomain": "autre-sub"}); err == nil {
		t.Fatal("sous-domaine d'autrui accepté")
	}
	var sub string
	if err := poolTest.QueryRow(ctx, `SELECT subdomain FROM "Publisher" WHERE id = 'pub_media_001'`).Scan(&sub); err != nil {
		t.Fatalf("subdomain: %v", err)
	}
	if sub != "media-un" {
		t.Fatalf("subdomain = %q, la valeur volée a été écrite", sub)
	}
}

// F575 : un gestionnaire de membres pouvait rétrograder le propriétaire.
func TestAuditL29K_UpdateMemberRole_CannotDemoteOwner(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	if err := svc.UpdateMemberPermissions(ctx, mediaOwnerID, "media_001", mediaWriterID,
		[]string{permissions.PermManageMembers}); err != nil {
		t.Fatalf("octroi manage_members: %v", err)
	}
	if err := svc.UpdateMemberRole(ctx, mediaWriterID, "media_001", mediaOwnerID, "viewer"); err == nil {
		t.Fatal("rétrogradation du propriétaire acceptée")
	}
	if role := mediaMemberRole(t, ctx, mediaOwnerID); role != "owner" {
		t.Fatalf("rôle du propriétaire = %q", role)
	}
}

// F575 : le rôle owner ne peut pas être octroyé par un gestionnaire.
func TestAuditL29K_UpdateMemberRole_CannotGrantOwner(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	if err := svc.UpdateMemberRole(ctx, mediaOwnerID, "media_001", mediaWriterID, "owner"); err == nil {
		t.Fatal("octroi du rôle owner accepté")
	}
	if role := mediaMemberRole(t, ctx, mediaWriterID); role != "writer" {
		t.Fatalf("rôle du writer = %q", role)
	}
}

// F575 : modifier un membre inexistant répondait 200 sans rien changer.
func TestAuditL29K_UpdateMemberRole_UnknownMemberIs404(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	if err := svc.UpdateMemberRole(ctx, mediaOwnerID, "media_001", mediaStranger, "writer"); !errors.Is(err, errNotFound) {
		t.Fatalf("membre inexistant = %v, attendu errNotFound", err)
	}
}

// F576 : permissions hors allowlist stockées sans effet.
func TestAuditL29K_UpdateMemberPermissions_RejectsUnknown(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	if err := svc.UpdateMemberPermissions(ctx, mediaOwnerID, "media_001", mediaWriterID,
		[]string{"media:root"}); err == nil {
		t.Fatal("permission inconnue acceptée")
	}
	var perms []string
	if err := poolTest.QueryRow(ctx,
		`SELECT permissions FROM "MediaMember" WHERE "mediaId" = 'media_001' AND "userId" = $1`,
		mediaWriterID).Scan(&perms); err != nil {
		t.Fatalf("permissions: %v", err)
	}
	if len(perms) != 0 {
		t.Fatalf("permissions = %v, la valeur inconnue a été écrite", perms)
	}
}

// F577 : ré-inviter un membre existant propriétaire le rétrogradait.
func TestAuditL29K_InviteMember_DoesNotDemoteOwner(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "MediaMember" (id, "mediaId", "userId", role, permissions, status, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'media_001', $1, 'owner', ARRAY[]::text[], 'active', now(), now())`,
		mediaInvitee); err != nil {
		t.Fatalf("second owner: %v", err)
	}
	if _, err := svc.InviteMemberByUsername(ctx, mediaOwnerID, "media_001", "inviteemedia", "writer"); err == nil {
		t.Fatal("ré-invitation d'un propriétaire acceptée")
	}
	if role := mediaMemberRole(t, ctx, mediaInvitee); role != "owner" {
		t.Fatalf("rôle = %q, le propriétaire a été rétrogradé", role)
	}
}

// F579 : un lien d'invitation avec rôle owner donnait le média à quiconque.
func TestAuditL29K_CreateInviteLink_RefusesOwnerRole(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	if _, err := svc.CreateInviteLink(ctx, mediaOwnerID, "media_001", "owner", 24, 1); err == nil {
		t.Fatal("lien d'invitation avec rôle owner accepté")
	}
}

// F579 : durées et usages non bornés.
func TestAuditL29K_CreateInviteLink_ClampsBounds(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	link, err := svc.CreateInviteLink(ctx, mediaOwnerID, "media_001", "writer", 100000, 5000)
	if err != nil {
		t.Fatalf("CreateInviteLink: %v", err)
	}
	if link.ExpiresAt == nil {
		t.Fatal("expiration absente")
	}
	exp, err := time.Parse(time.RFC3339, *link.ExpiresAt)
	if err != nil {
		t.Fatalf("expiration illisible: %v", err)
	}
	// Bornes produit : 30 jours, 1000 usages.
	if d := time.Until(exp); d > 721*time.Hour {
		t.Fatalf("expiration à %v, borne 720h non appliquée", d)
	}
	if link.MaxUses > 1000 {
		t.Fatalf("maxUses = %d, borne 1000 non appliquée", link.MaxUses)
	}
}

// F580 : `maxUses = 1` servait plusieurs fois (TOCTOU entre preview et UPDATE).
func TestAuditL29K_JoinViaInviteLink_HonoursMaxUses(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	// 12 comptes sans adhesion, pour des jointures concurrentes.
	joiners := make([]string, 0, 12)
	for i := 0; i < 12; i++ {
		id := uuid.NewString()
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $3, 'user', now(), now())`,
			id, "joiner"+strconv.Itoa(i)+"@media.test", "joiner"+strconv.Itoa(i)); err != nil {
			t.Fatalf("user joiner %d: %v", i, err)
		}
		joiners = append(joiners, id)
	}

	link, err := svc.CreateInviteLink(ctx, mediaOwnerID, "media_001", "writer", 24, 1)
	if err != nil {
		t.Fatalf("CreateInviteLink: %v", err)
	}

	// TOCTOU : la preview est lue hors transaction, l'UPDATE doit refuser tout
	// dépassement même quand les adhésions arrivent en parallèle.
	var wg sync.WaitGroup
	var mu sync.Mutex
	successes := 0
	for _, id := range joiners {
		wg.Add(1)
		go func(userID string) {
			defer wg.Done()
			if _, err := svc.JoinViaInviteLink(context.Background(), userID, link.Token); err == nil {
				mu.Lock()
				successes++
				mu.Unlock()
			}
		}(id)
	}
	wg.Wait()
	if successes > 1 {
		t.Fatalf("%d adhésions sur un lien maxUses=1", successes)
	}
	var used int32
	if err := poolTest.QueryRow(ctx,
		`SELECT "usedCount" FROM "MediaInviteLink" WHERE id = $1`, link.ID).Scan(&used); err != nil {
		t.Fatalf("usedCount: %v", err)
	}
	if used != 1 {
		t.Fatalf("usedCount = %d, attendu 1", used)
	}
}

// F581 : `ListInviteLinks` non bornée et lignes illisibles silencieusement perdues.
func TestAuditL29K_ListInviteLinks_IsBounded(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	for i := 0; i < 250; i++ {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "MediaInviteLink" (id, "mediaId", "createdById", token, role, "maxUses", "usedCount", "isRevoked", "createdAt", "updatedAt")
			 VALUES ($1, 'media_001', $3, $2, 'writer', 1, 0, false, now(), now())`,
			"mlink_bulk_"+strconv.Itoa(i), "tok_"+strconv.Itoa(i), mediaOwnerID); err != nil {
			t.Fatalf("insert lien %d: %v", i, err)
		}
	}
	links, err := svc.ListInviteLinks(ctx, mediaOwnerID, "media_001")
	if err != nil {
		t.Fatalf("ListInviteLinks: %v", err)
	}
	if len(links) > 200 {
		t.Fatalf("%d liens retournés, borne 200 non appliquée", len(links))
	}
}

// F582 : borne de nom en octets (un nom accentué valide était refusé).
func TestAuditL29K_CreateApiKey_NameBoundInRunes(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	name := strings.Repeat("é", 60) // 60 runes, 120 octets
	if _, err := svc.CreateApiKey(ctx, mediaOwnerID, "media_001", name, nil); err != nil {
		t.Fatalf("nom de 60 caractères accentués refusé: %v", err)
	}
}

// F588 : `CreateMedia` acceptait URL javascript:, XSS et permaliens réservés.
func TestAuditL29K_CreateMedia_ValidatesInput(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	if _, err := svc.CreateMedia(ctx, mediaStranger, "Journal X", "journal-x", "bio", "javascript:alert(1)"); err == nil {
		t.Fatal("logoUrl javascript: accepté à la création")
	}
	if _, err := svc.CreateMedia(ctx, mediaStranger, "Journal X", "admin", "", ""); err == nil {
		t.Fatal("permalien réservé accepté")
	}
	if _, err := svc.CreateMedia(ctx, mediaStranger, "Journal X", "x", "", ""); err == nil {
		t.Fatal("permalien d'un caractère accepté")
	}
	out, err := svc.CreateMedia(ctx, mediaStranger, "Journal X", "journal-x", "<script>alert(1)</script>", "")
	if err != nil {
		return // refus explicite : acceptable
	}
	var bio string
	if err := poolTest.QueryRow(ctx, `SELECT COALESCE(bio, '') FROM "Publisher" WHERE id = $1`, out["publisherId"]).Scan(&bio); err != nil {
		t.Fatalf("bio: %v", err)
	}
	if strings.Contains(strings.ToLower(bio), "<script") {
		t.Fatalf("bio stockée avec script: %q", bio)
	}
}

// F571 : `writeErr` répondait 400 + message du driver à toute erreur interne.
func TestAuditL29K_WriteErr_InternalIs500(t *testing.T) {
	w := httptest.NewRecorder()
	writeErr(w, errors.New(`pq: relation "Media" does not exist`))
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("statut = %d, attendu 500", w.Code)
	}
	if strings.Contains(w.Body.String(), "pq:") {
		t.Fatalf("détail interne exposé: %s", w.Body.String())
	}
}

// F587 : `by-publication` résolvait l'id interne d'un média pour tout compte.
func TestAuditL29K_MediaByPublication_RequiresMembership(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	w := doMedia(t, svc, http.MethodGet, "/v1/media/by-publication/pub_media_001", mediaStranger, nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("étranger: statut = %d, attendu 403 (corps %s)", w.Code, w.Body.String())
	}
	ok := doMedia(t, svc, http.MethodGet, "/v1/media/by-publication/pub_media_001", mediaOwnerID, nil)
	if ok.Code != http.StatusOK {
		t.Fatalf("membre: statut = %d, attendu 200 (corps %s)", ok.Code, ok.Body.String())
	}
}
