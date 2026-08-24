package collaborations

// Tests d'intégration du module Collaborations (co-rédaction / attributions) —
// migration de apps/studio/src/app/(creator)/advanced/actions.ts vers Go.

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
	authorID    = "00000000-0000-0000-0000-0000000000d1"
	inviteeID   = "00000000-0000-0000-0000-0000000000d2"
	strangerID  = "00000000-0000-0000-0000-0000000000d3"
	mediaMember = "00000000-0000-0000-0000-0000000000d4"
	pubPerso    = "pub_adv_perso_001"
	pubMedia    = "pub_adv_media_001"
	mediaAdv    = "media_adv_001"
)

// seedCollab crée : publication PERSONAL (author + article), un média
// (mediaMember + article), et un invité/étranger sans droits.
func seedCollab(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"ArticleAttribution", "CollaborationRequest", "Notification", "Article", "Category",
		"MediaMember", "Media", "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Journal Adv', 'journal-adv', now(), now()),
		        ($2, 'MEDIA', 'Média Adv', 'media-adv', now(), now())`,
		pubPerso, pubMedia); err != nil {
		t.Fatalf("publications: %v", err)
	}
	users := []struct{ id, email, username, pub string }{
		{authorID, "author-adv@test.dev", "authoradv", pubPerso},
		{inviteeID, "invitee-adv@test.dev", "inviteeadv", ""},
		{strangerID, "stranger-adv@test.dev", "strangeradv", ""},
		{mediaMember, "member-adv@test.dev", "memberadv", ""},
	}
	for _, u := range users {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $3, 'creator', NULLIF($4, ''), now(), now())`,
			u.id, u.email, u.username, u.pub); err != nil {
			t.Fatalf("user %s: %v", u.username, err)
		}
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Media" (id, "publicationId", "createdAt", "updatedAt")
		 VALUES ($1, $2, now(), now())`, mediaAdv, pubMedia); err != nil {
		t.Fatalf("media: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "MediaMember" (id, "mediaId", "userId", role, permissions, status, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, $2, 'writer', ARRAY[]::text[], 'active', now(), now())`,
		mediaAdv, mediaMember); err != nil {
		t.Fatalf("member: %v", err)
	}
	for _, a := range []struct{ id, pub, author string }{
		{"art_adv_01", pubPerso, authorID},
		{"art_adv_02", pubMedia, mediaMember},
	} {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime",
			                        status, "publicationId", "authorId", "createdAt", "updatedAt")
			 VALUES ($1, 'Article ' || $1, 'slug-' || $1, '<p>x</p>', false, 'PUBLIC', 3,
			         'DRAFT', $2, $3, now(), now())`,
			a.id, a.pub, a.author); err != nil {
			t.Fatalf("article %s: %v", a.id, err)
		}
	}
}

func newTestService() *Service {
	return NewService(poolTest)
}

func TestInviteByEmail(t *testing.T) {
	ctx := context.Background()
	seedCollab(t, ctx)
	svc := newTestService()

	// Invitation par email OK → demande PENDING + notification.
	req, err := svc.InviteByEmail(ctx, authorID, "art_adv_01", "invitee-adv@test.dev")
	if err != nil {
		t.Fatalf("InviteByEmail: %v", err)
	}
	if req.Status != "PENDING" || req.InviteeID != inviteeID {
		t.Fatalf("request = %+v", req)
	}
	var notifCount int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Notification" WHERE type='ARTICLE_CONTRIBUTOR_INVITED' AND "recipientId"=$1`,
		inviteeID).Scan(&notifCount); err != nil {
		t.Fatalf("notif: %v", err)
	}
	if notifCount != 1 {
		t.Fatalf("notifications = %d, attendu 1", notifCount)
	}

	// Ré-invitation → upsert (toujours une seule demande), pas de doublon notif.
	if _, err := svc.InviteByEmail(ctx, authorID, "art_adv_01", "invitee-adv@test.dev"); err != nil {
		t.Fatalf("re-invite: %v", err)
	}
	var reqCount int
	_ = poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "CollaborationRequest" WHERE "articleId"='art_adv_01'`).Scan(&reqCount)
	if reqCount != 1 {
		t.Fatalf("demandes = %d, attendu 1 (upsert)", reqCount)
	}

	// Non-auteur → refus.
	if _, err := svc.InviteByEmail(ctx, strangerID, "art_adv_01", "invitee-adv@test.dev"); err == nil {
		t.Fatalf("invitation par non-auteur acceptée")
	}
	// Email inconnu → refus.
	if _, err := svc.InviteByEmail(ctx, authorID, "art_adv_01", "nobody@test.dev"); err == nil {
		t.Fatalf("email inconnu accepté")
	}
	// Auto-invitation → refus.
	if _, err := svc.InviteByEmail(ctx, authorID, "art_adv_01", "author-adv@test.dev"); err == nil {
		t.Fatalf("auto-invitation acceptée")
	}
	// Article inconnu → refus.
	if _, err := svc.InviteByEmail(ctx, authorID, "art_inconnu", "invitee-adv@test.dev"); err == nil {
		t.Fatalf("article inconnu accepté")
	}
}

func TestInviteContributor(t *testing.T) {
	ctx := context.Background()
	seedCollab(t, ctx)
	svc := newTestService()

	// Membre média actif (auteur de l'article média) → peut inviter.
	req, err := svc.InviteContributor(ctx, mediaMember, "art_adv_02", inviteeID, "CO_AUTHOR", 2)
	if err != nil {
		t.Fatalf("InviteContributor (média): %v", err)
	}
	if req.RequestedOrder != 2 || req.Status != "PENDING" {
		t.Fatalf("request = %+v", req)
	}
	// Étranger (ni auteur ni membre) → refus.
	if _, err := svc.InviteContributor(ctx, strangerID, "art_adv_02", inviteeID, "CO_AUTHOR", 1); err == nil {
		t.Fatalf("invitation par étranger acceptée")
	}
	// Inviter l'auteur principal → refus.
	if _, err := svc.InviteContributor(ctx, mediaMember, "art_adv_02", mediaMember, "CO_AUTHOR", 1); err == nil {
		t.Fatalf("invitation de l'auteur principal acceptée")
	}
	// Invité inexistant → refus.
	if _, err := svc.InviteContributor(ctx, mediaMember, "art_adv_02", "00000000-0000-0000-0000-000000000099", "CO_AUTHOR", 1); err == nil {
		t.Fatalf("invité inconnu accepté")
	}
}

func TestRespondAndList(t *testing.T) {
	ctx := context.Background()
	seedCollab(t, ctx)
	svc := newTestService()

	req, err := svc.InviteByEmail(ctx, authorID, "art_adv_01", "invitee-adv@test.dev")
	if err != nil {
		t.Fatalf("invite: %v", err)
	}

	// Le destinataire accepte avec visibilité publique.
	if err := svc.Respond(ctx, inviteeID, req.ID, true, true); err != nil {
		t.Fatalf("Respond(accept): %v", err)
	}
	var status, consent string
	var visible bool
	if err := poolTest.QueryRow(ctx,
		`SELECT status FROM "CollaborationRequest" WHERE id=$1`, req.ID).Scan(&status); err != nil {
		t.Fatalf("request status: %v", err)
	}
	if status != "ACCEPTED" {
		t.Fatalf("status = %s, attendu ACCEPTED", status)
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT "consentStatus", "isVisible" FROM "ArticleAttribution" WHERE "articleId"='art_adv_01' AND "userId"=$1`,
		inviteeID).Scan(&consent, &visible); err != nil {
		t.Fatalf("attribution: %v", err)
	}
	if consent != "ACCEPTED" || !visible {
		t.Fatalf("attribution = %s / %v, attendu ACCEPTED/true", consent, visible)
	}

	// Re-répondre → déjà traitée.
	if err := svc.Respond(ctx, inviteeID, req.ID, false, false); err == nil {
		t.Fatalf("re-réponse acceptée (déjà traitée)")
	}

	// Liste : le destinataire voit la demande reçue, l'auteur la demande envoyée.
	received, sent, err := svc.ListRequests(ctx, inviteeID)
	if err != nil {
		t.Fatalf("ListRequests: %v", err)
	}
	if len(received) != 1 || received[0].Article.Title != "Article art_adv_01" {
		t.Fatalf("received = %+v", received)
	}
	if received[0].Inviter == nil || received[0].Inviter.Email != "author-adv@test.dev" {
		t.Fatalf("received inviter = %+v", received[0].Inviter)
	}
	_, sent, err = svc.ListRequests(ctx, authorID)
	if err != nil {
		t.Fatalf("ListRequests(author): %v", err)
	}
	if len(sent) != 1 || sent[0].Invitee.Email != "invitee-adv@test.dev" {
		t.Fatalf("sent = %+v", sent)
	}

	// Réponse par un non-destinataire → refus.
	req2, err := svc.InviteByEmail(ctx, authorID, "art_adv_01", "invitee-adv@test.dev")
	if err != nil {
		t.Fatalf("re-invite 2: %v", err)
	}
	if err := svc.Respond(ctx, strangerID, req2.ID, true, false); err == nil {
		t.Fatalf("réponse par non-destinataire acceptée")
	}
}

func TestDeclineRemoveWithdraw(t *testing.T) {
	ctx := context.Background()
	seedCollab(t, ctx)
	svc := newTestService()

	// Refus → attribution DECLINED.
	req, err := svc.InviteByEmail(ctx, authorID, "art_adv_01", "invitee-adv@test.dev")
	if err != nil {
		t.Fatalf("invite: %v", err)
	}
	if err := svc.Respond(ctx, inviteeID, req.ID, false, false); err != nil {
		t.Fatalf("Respond(decline): %v", err)
	}
	// Parité TS (updateMany) : le refus met à jour l'attribution existante,
	// il n'en crée pas — on vérifie le statut de la demande.
	var reqStatus string
	if err := poolTest.QueryRow(ctx,
		`SELECT status FROM "CollaborationRequest" WHERE id=$1`, req.ID).Scan(&reqStatus); err != nil {
		t.Fatalf("request status: %v", err)
	}
	if reqStatus != "DECLINED" {
		t.Fatalf("request = %s, attendu DECLINED", reqStatus)
	}

	// Retrait par le propriétaire → REVOKED + demande REVOKED.
	req2, err := svc.InviteByEmail(ctx, authorID, "art_adv_01", "invitee-adv@test.dev")
	if err != nil {
		t.Fatalf("re-invite: %v", err)
	}
	if err := svc.RemoveContributor(ctx, authorID, "art_adv_01", inviteeID); err != nil {
		t.Fatalf("RemoveContributor: %v", err)
	}
	// La demande (réinvitée PENDING) est révoquée.
	if err := poolTest.QueryRow(ctx,
		`SELECT status FROM "CollaborationRequest" WHERE id=$1`, req2.ID).Scan(&reqStatus); err != nil {
		t.Fatalf("request status: %v", err)
	}
	if reqStatus != "REVOKED" {
		t.Fatalf("request = %s, attendu REVOKED", reqStatus)
	}
	// Retrait de l'auteur principal → refus.
	if err := svc.RemoveContributor(ctx, authorID, "art_adv_01", authorID); err == nil {
		t.Fatalf("retrait de l'auteur principal accepté")
	}
	// Étranger → refus.
	if err := svc.RemoveContributor(ctx, strangerID, "art_adv_01", inviteeID); err == nil {
		t.Fatalf("retrait par étranger accepté")
	}

	// Retrait de consentement par le contributeur → WITHDRAWN.
	req3, err := svc.InviteByEmail(ctx, authorID, "art_adv_01", "invitee-adv@test.dev")
	if err != nil {
		t.Fatalf("re-invite 3: %v", err)
	}
	if err := svc.WithdrawConsent(ctx, inviteeID, "art_adv_01"); err != nil {
		t.Fatalf("WithdrawConsent: %v", err)
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT status FROM "CollaborationRequest" WHERE id=$1`, req3.ID).Scan(&reqStatus); err != nil {
		t.Fatalf("request status (withdraw): %v", err)
	}
	if reqStatus != "REVOKED" {
		t.Fatalf("request = %s, attendu REVOKED", reqStatus)
	}
	// L'auteur principal ne peut pas se retirer.
	if err := svc.WithdrawConsent(ctx, authorID, "art_adv_01"); err == nil {
		t.Fatalf("withdraw par l'auteur principal accepté")
	}
}
