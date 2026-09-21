package media

// Tests d'intégration du module Média (création, listes, membres,
// invitations, réglages) — migration de studio media/actions.ts vers Go.

import (
	"context"
	"log"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.TryPool(context.Background())
	if err != nil {
		log.Printf("testcontainers indisponible, tests DB skippes: %v", err)
		poolTest = nil
	} else {
		poolTest = p
	}
	code := m.Run()
	if poolTest != nil {
		testutil.Cleanup()
	}
	os.Exit(code)
}
// requirePool skippe les tests DB quand Docker/testcontainers est absent.
func requirePool(t *testing.T) {
	t.Helper()
	if poolTest == nil {
		t.Skip("DB indisponible (Docker/testcontainers requis)")
	}
}


const (
	mediaOwnerID  = "00000000-0000-0000-0000-0000000000a1"
	mediaWriterID = "00000000-0000-0000-0000-0000000000a2"
	mediaViewerID = "00000000-0000-0000-0000-0000000000a3"
	mediaStranger = "00000000-0000-0000-0000-0000000000a4"
	mediaInvitee  = "00000000-0000-0000-0000-0000000000a5"
)

// seedMedia crée :
//   - media_001 (publication MEDIA) avec owner, writer et viewer membres ;
//   - stranger (aucune membership) et invitee (utilisateur sans membership).
func seedMedia(t *testing.T, ctx context.Context) {
	requirePool(t)
	t.Helper()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"MediaAuditLog", "MediaMember", "Media", "User", "Publication"
		CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, subdomain, "createdAt", "updatedAt")
		 VALUES ('pub_media_001', 'MEDIA', 'Média Un', 'media-un', 'media-un', now(), now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Media" (id, "publicationId", "createdAt", "updatedAt")
		 VALUES ('media_001', 'pub_media_001', now(), now())`); err != nil {
		t.Fatalf("media: %v", err)
	}
	users := []struct{ id, email, username, role string }{
		{mediaOwnerID, "owner.media@test.dev", "ownermedia", "owner"},
		{mediaWriterID, "writer.media@test.dev", "writermedia", "writer"},
		{mediaViewerID, "viewer.media@test.dev", "viewermedia", "viewer"},
		{mediaStranger, "stranger.media@test.dev", "strangermedia", ""},
		{mediaInvitee, "invitee.media@test.dev", "inviteemedia", ""},
	}
	for _, u := range users {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $3, 'user', now(), now())`,
			u.id, u.email, u.username); err != nil {
			t.Fatalf("user %s: %v", u.username, err)
		}
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "MediaMember" (id, "mediaId", "userId", role, permissions, status, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'media_001', $1, 'owner', ARRAY[]::text[], 'active', now(), now()),
		        (gen_random_uuid()::text, 'media_001', $2, 'writer', ARRAY[]::text[], 'active', now(), now()),
		        (gen_random_uuid()::text, 'media_001', $3, 'viewer', ARRAY[]::text[], 'active', now(), now())`,
		mediaOwnerID, mediaWriterID, mediaViewerID); err != nil {
		t.Fatalf("members: %v", err)
	}
}

func newTestService() *Service {
	return NewService(poolTest)
}

func TestCreateMedia_Owner(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	out, err := svc.CreateMedia(ctx, mediaOwnerID, "Nouveau Média", "nouveau-media", "bio", "")
	if err != nil {
		t.Fatalf("CreateMedia: %v", err)
	}
	if out["id"] == "" || out["publicationId"] == "" {
		t.Fatalf("out = %v", out)
	}

	// Publication MEDIA + membre owner + audit.
	var ptype string
	if err := poolTest.QueryRow(ctx,
		`SELECT type FROM "Publication" WHERE id = $1`, out["publicationId"]).Scan(&ptype); err != nil || ptype != "MEDIA" {
		t.Fatalf("type publication = %q (err %v), attendu MEDIA", ptype, err)
	}
	var role string
	if err := poolTest.QueryRow(ctx,
		`SELECT role FROM "MediaMember" WHERE "mediaId" = $1 AND "userId" = $2`,
		out["id"], mediaOwnerID).Scan(&role); err != nil || role != "owner" {
		t.Fatalf("membre owner = %q (err %v)", role, err)
	}
	var actions []string
	rows, err := poolTest.Query(ctx, `SELECT action FROM "MediaAuditLog" WHERE "mediaId" = $1`, out["id"])
	if err != nil {
		t.Fatalf("audit: %v", err)
	}
	for rows.Next() {
		var a string
		_ = rows.Scan(&a)
		actions = append(actions, a)
	}
	rows.Close()
	if len(actions) != 1 || actions[0] != "media.created" {
		t.Fatalf("audit = %v, attendu [media.created]", actions)
	}
}

func TestCreateMedia_SlugTaken(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	// media-un est déjà pris (publication seedée).
	_, err := svc.CreateMedia(ctx, mediaOwnerID, "Doublon", "media-un", "", "")
	if err == nil || !strings.Contains(err.Error(), "déjà utilisé") {
		t.Fatalf("CreateMedia(slug pris) = %v, attendu erreur de permalien", err)
	}
}

func TestListWorkspaces(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	out, err := svc.ListWorkspaces(ctx, mediaOwnerID)
	if err != nil {
		t.Fatalf("ListWorkspaces: %v", err)
	}
	personal := out["personal"].(WorkspaceDTO)
	if personal.Type != "PERSONAL" || personal.ID == "" {
		t.Fatalf("personal = %+v", personal)
	}
	medias := out["medias"].([]WorkspaceDTO)
	if len(medias) != 1 || medias[0].ID != "media_001" || medias[0].Role == nil || *medias[0].Role != "owner" {
		t.Fatalf("medias = %+v", medias)
	}
}

func TestListMedia(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	items, err := svc.ListMedia(ctx, mediaOwnerID)
	if err != nil {
		t.Fatalf("ListMedia: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("médias = %d, attendu 1", len(items))
	}
	if items[0].MembersCount != 3 || items[0].Role != "owner" {
		t.Fatalf("media = %+v (members attendu 3)", items[0])
	}
}

func TestGetMedia_Owner(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	detail, myRole, err := svc.GetMedia(ctx, mediaOwnerID, "media_001")
	if err != nil {
		t.Fatalf("GetMedia: %v", err)
	}
	if detail.Publication.Name != "Média Un" || myRole != "owner" {
		t.Fatalf("detail = %+v, myRole = %s", detail, myRole)
	}
	if len(detail.Members) != 3 {
		t.Fatalf("membres = %d, attendu 3", len(detail.Members))
	}
	if detail.Publication.Count.Articles != 0 {
		t.Fatalf("articlesCount = %d, attendu 0", detail.Publication.Count.Articles)
	}
	// Shapes Prisma : member.user imbriqué + invite.inviter.
	if detail.Members[0].User.ID == "" || detail.Members[0].ID == "" {
		t.Fatalf("membre = %+v", detail.Members[0])
	}
}

func TestGetMedia_Forbidden(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	if _, _, err := svc.GetMedia(ctx, mediaStranger, "media_001"); err != errForbidden {
		t.Fatalf("GetMedia(stranger) = %v, attendu errForbidden", err)
	}
}

func TestInviteMemberByUsername_AddsMemberAndNotifies(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	out, err := svc.InviteMemberByUsername(ctx, mediaOwnerID, "media_001", "@inviteemedia", "editor")
	if err != nil {
		t.Fatalf("InviteMemberByUsername: %v", err)
	}
	if out["alreadyMember"] == true {
		t.Fatalf("out = %v, attendu un ajout direct", out)
	}

	// Le collaborateur est membre actif avec le rôle demandé (aucun email requis).
	var role, status string
	if err := poolTest.QueryRow(ctx,
		`SELECT role, status FROM "MediaMember" WHERE "mediaId" = 'media_001' AND "userId" = $1`,
		mediaInvitee).Scan(&role, &status); err != nil || role != "editor" || status != "active" {
		t.Fatalf("member = %q/%q (err %v), attendu editor/active", role, status, err)
	}

	// L'intéressé reçoit une notification MEDIA_INVITE dans la section collaboration.
	var notifType string
	if err := poolTest.QueryRow(ctx,
		`SELECT type FROM "Notification" WHERE "recipientId" = $1 AND "senderId" = $2`,
		mediaInvitee, mediaOwnerID).Scan(&notifType); err != nil || notifType != "MEDIA_INVITE" {
		t.Fatalf("notification = %q (err %v), attendu MEDIA_INVITE", notifType, err)
	}
}

func TestInviteMemberByUsername_ErrorsAndRoleUpdate(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	// viewer n'a pas media:manage_members.
	if _, err := svc.InviteMemberByUsername(ctx, mediaViewerID, "media_001", "inviteemedia", "writer"); err != errForbidden {
		t.Fatalf("InviteMemberByUsername(viewer) = %v, attendu errForbidden", err)
	}
	// @username inconnu → refus explicite (jamais de recherche par email).
	if _, err := svc.InviteMemberByUsername(ctx, mediaOwnerID, "media_001", "inconnu", "writer"); err == nil {
		t.Fatal("username inconnu accepté")
	}
	// Le rôle propriétaire ne peut pas être accordé par invitation.
	if _, err := svc.InviteMemberByUsername(ctx, mediaOwnerID, "media_001", "inviteemedia", "owner"); err == nil {
		t.Fatal("rôle owner attribué par invitation")
	}
	// S'auto-ajouter → refus.
	if _, err := svc.InviteMemberByUsername(ctx, mediaOwnerID, "media_001", "ownermedia", "writer"); err == nil {
		t.Fatal("auto-ajout accepté")
	}

	// Déjà membre → simple mise à jour du rôle (idempotent).
	out, err := svc.InviteMemberByUsername(ctx, mediaOwnerID, "media_001", "writermedia", "editor")
	if err != nil {
		t.Fatalf("InviteMemberByUsername(membre): %v", err)
	}
	if out["alreadyMember"] != true {
		t.Fatalf("out = %v, attendu alreadyMember=true", out)
	}
	var role string
	if err := poolTest.QueryRow(ctx,
		`SELECT role FROM "MediaMember" WHERE "mediaId" = 'media_001' AND "userId" = $1`,
		mediaWriterID).Scan(&role); err != nil || role != "editor" {
		t.Fatalf("rôle = %q (err %v), attendu editor", role, err)
	}
}

func TestUpdateMemberRole_Permissions_Remove(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	// viewer ne peut pas gérer les membres.
	if err := svc.UpdateMemberRole(ctx, mediaViewerID, "media_001", mediaWriterID, "editor"); err != errForbidden {
		t.Fatalf("UpdateMemberRole(viewer) = %v, attendu errForbidden", err)
	}
	if err := svc.RemoveMember(ctx, mediaViewerID, "media_001", mediaWriterID); err != errForbidden {
		t.Fatalf("RemoveMember(viewer) = %v, attendu errForbidden", err)
	}

	// owner : rôle invalide refusé.
	if err := svc.UpdateMemberRole(ctx, mediaOwnerID, "media_001", mediaWriterID, "boss"); err == nil {
		t.Fatal("rôle invalide accepté")
	}

	// owner : change le rôle (permissions réinitialisées).
	if err := svc.UpdateMemberRole(ctx, mediaOwnerID, "media_001", mediaWriterID, "editor"); err != nil {
		t.Fatalf("UpdateMemberRole: %v", err)
	}
	var role string
	var perms []string
	if err := poolTest.QueryRow(ctx,
		`SELECT role, permissions FROM "MediaMember" WHERE "mediaId" = 'media_001' AND "userId" = $1`,
		mediaWriterID).Scan(&role, &perms); err != nil || role != "editor" || len(perms) != 0 {
		t.Fatalf("member = %q/%v (err %v), attendu editor/[]", role, perms, err)
	}

	// owner : permissions granulaires.
	if err := svc.UpdateMemberPermissions(ctx, mediaOwnerID, "media_001", mediaWriterID, []string{"media:review", "-media:create_articles"}); err != nil {
		t.Fatalf("UpdateMemberPermissions: %v", err)
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT permissions FROM "MediaMember" WHERE "mediaId" = 'media_001' AND "userId" = $1`,
		mediaWriterID).Scan(&perms); err != nil || len(perms) != 2 {
		t.Fatalf("permissions = %v (err %v), attendu 2", perms, err)
	}

	// owner ne peut pas retirer l'owner.
	if err := svc.RemoveMember(ctx, mediaOwnerID, "media_001", mediaOwnerID); err == nil {
		t.Fatal("retrait de l'owner accepté")
	}

	// owner retire writer.
	if err := svc.RemoveMember(ctx, mediaOwnerID, "media_001", mediaWriterID); err != nil {
		t.Fatalf("RemoveMember: %v", err)
	}
	var remain int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "MediaMember" WHERE "mediaId" = 'media_001' AND "userId" = $1`,
		mediaWriterID).Scan(&remain); err != nil || remain != 0 {
		t.Fatalf("membre restant = %d (err %v), attendu 0", remain, err)
	}
}

func TestUpdateSettings(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	// viewer n'a pas media:manage_settings.
	if _, err := svc.UpdateSettings(ctx, mediaViewerID, "media_001", map[string]any{"name": "X"}); err != errForbidden {
		t.Fatalf("UpdateSettings(viewer) = %v, attendu errForbidden", err)
	}

	pub, err := svc.UpdateSettings(ctx, mediaOwnerID, "media_001", map[string]any{
		"name": "Média Renommé", "heroText": "Nouveau héros", "allowIndexing": false,
	})
	if err != nil {
		t.Fatalf("UpdateSettings: %v", err)
	}
	if pub.Name != "Média Renommé" || pub.HeroText == nil || *pub.HeroText != "Nouveau héros" || pub.AllowIndexing {
		t.Fatalf("publication = %+v", pub)
	}
	var name, hero string
	var idx bool
	if err := poolTest.QueryRow(ctx,
		`SELECT name, "heroText", "allowIndexing" FROM "Publication" WHERE id = 'pub_media_001'`,
	).Scan(&name, &hero, &idx); err != nil || name != "Média Renommé" || hero != "Nouveau héros" || idx {
		t.Fatalf("publication = %q/%q/%v (err %v)", name, hero, idx, err)
	}
}
