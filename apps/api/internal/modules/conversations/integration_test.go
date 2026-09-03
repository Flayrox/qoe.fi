package conversations

import (
	"context"
	"log"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

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

// insertMessage brut pour préparer des états.
func insertMessage(t *testing.T, convID, senderID, content string) string {
	t.Helper()
	var id string
	if err := poolTest.QueryRow(context.Background(),
		`INSERT INTO "Message" (id, "conversationId", "senderId", content)
		 VALUES (gen_random_uuid()::text, $1, $2, $3) RETURNING id`,
		convID, senderID, content).Scan(&id); err != nil {
		t.Fatalf("insert message: %v", err)
	}
	return id
}

func newSvc() *Service { return NewService(poolTest) }

// ─── Création (get-or-create déterministe) ─────────────────────────────

func TestCreateDirectCreatesOnceAndIsIdempotent(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newSvc()
	ctx := context.Background()

	conv, err := svc.CreateDirect(ctx, fx.AuthorID, fx.ViewerID)
	if err != nil {
		t.Fatalf("CreateDirect: %v", err)
	}
	if conv.Participant.ID != fx.ViewerID {
		t.Fatalf("participant = %s, attendu %s", conv.Participant.ID, fx.ViewerID)
	}
	if conv.ID == "" {
		t.Fatal("conversation sans id")
	}

	// Sens inverse → MÊME conversation (une seule par paire).
	rev, err := svc.CreateDirect(ctx, fx.ViewerID, fx.AuthorID)
	if err != nil {
		t.Fatalf("CreateDirect inverse: %v", err)
	}
	if rev.ID != conv.ID {
		t.Fatalf("conversations distinctes (%s != %s) pour la même paire", rev.ID, conv.ID)
	}

	// Idempotence : nouveau appel → même id.
	again, err := svc.CreateDirect(ctx, fx.AuthorID, fx.ViewerID)
	if err != nil {
		t.Fatalf("CreateDirect bis: %v", err)
	}
	if again.ID != conv.ID {
		t.Fatalf("idempotence cassée : %s != %s", again.ID, conv.ID)
	}

	// Une seule ligne en base.
	var count int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Conversation" WHERE "directKey" IS NOT NULL`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Fatalf("conversations en base = %d, attendu 1", count)
	}
}

func TestCreateDirectValidations(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newSvc()
	ctx := context.Background()

	// Soi-même → refusé.
	if _, err := svc.CreateDirect(ctx, fx.AuthorID, fx.AuthorID); err != ErrSelfDirect {
		t.Fatalf("self-DM: err = %v, attendu ErrSelfDirect", err)
	}
	// Participant inexistant → introuvable.
	if _, err := svc.CreateDirect(ctx, fx.AuthorID, "00000000-0000-0000-0000-00000000dead"); err != ErrParticipantMissing {
		t.Fatalf("participant absent: err = %v, attendu ErrParticipantMissing", err)
	}
}

func TestCreateDirectBlocked(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newSvc()
	ctx := context.Background()

	// Viewer bloque Author (creatorId = le bloqué, readerId = celui qui bloque).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "BlockedUser" (id, "creatorId", "readerId")
		 VALUES (gen_random_uuid()::text, $1, $2)`,
		fx.AuthorID, fx.ViewerID); err != nil {
		t.Fatalf("insert block: %v", err)
	}

	// Author tente de messager Viewer (qui l'a bloqué) → bloqué.
	if _, err := svc.CreateDirect(ctx, fx.AuthorID, fx.ViewerID); err != ErrBlocked {
		t.Fatalf("création vers bloqueur: err = %v, attendu ErrBlocked", err)
	}
	// Viewer ne peut pas non plus messager Author (blocage réciproque).
	if _, err := svc.CreateDirect(ctx, fx.ViewerID, fx.AuthorID); err != ErrBlocked {
		t.Fatalf("création vers bloqué: err = %v, attendu ErrBlocked", err)
	}
}

// ─── Envoi & lecture des messages ───────────────────────────────────────

func TestSendAndListMessages(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newSvc()
	ctx := context.Background()

	conv, err := svc.CreateDirect(ctx, fx.AuthorID, fx.ViewerID)
	if err != nil {
		t.Fatalf("CreateDirect: %v", err)
	}

	// Envoi par l'auteur.
	msg, err := svc.SendMessage(ctx, fx.AuthorID, conv.ID, "Salut Bob !")
	if err != nil {
		t.Fatalf("SendMessage: %v", err)
	}
	if msg.SenderID != fx.AuthorID || msg.Content != "Salut Bob !" {
		t.Fatalf("message inattendu: %+v", msg)
	}
	if _, err := svc.SendMessage(ctx, fx.ViewerID, conv.ID, "Salut Alice !"); err != nil {
		t.Fatalf("SendMessage viewer: %v", err)
	}

	// Lecture côté viewer : 2 messages ascendants.
	page, err := svc.ListMessages(ctx, fx.ViewerID, conv.ID, nil, 50)
	if err != nil {
		t.Fatalf("ListMessages: %v", err)
	}
	if len(page.Messages) != 2 || page.HasMore {
		t.Fatalf("page = %d messages (hasMore=%v), attendu 2/false", len(page.Messages), page.HasMore)
	}
	if page.Messages[0].Content != "Salut Bob !" || page.Messages[1].Content != "Salut Alice !" {
		t.Fatalf("ordre ascendant cassé : %+v", page.Messages)
	}

	// Non-membre → introuvable.
	if _, err := svc.ListMessages(ctx, fx.AuthorID, "00000000-0000-0000-0000-000000000099", nil, 50); err != ErrNotFound {
		t.Fatalf("non-membre: err = %v, attendu ErrNotFound", err)
	}
}

func TestListMessagesPaginationBackward(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newSvc()
	ctx := context.Background()

	conv, err := svc.CreateDirect(ctx, fx.AuthorID, fx.ViewerID)
	if err != nil {
		t.Fatalf("CreateDirect: %v", err)
	}

	// 5 messages avec des createdAt DISTINCTS (TIMESTAMP(3) : plusieurs
	// INSERT dans la même milliseconde partageraient le même timestamp et
	// casseraient le curseur exclusif).
	base := time.Now().Add(-10 * time.Minute)
	for i := 0; i < 5; i++ {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Message" (id, "conversationId", "senderId", content, "createdAt")
			 VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`,
			conv.ID, fx.AuthorID, "msg-"+strconv.Itoa(i), base.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatalf("insert message %d: %v", i, err)
		}
	}

	// Page 1 : les 2 plus récents (msg-3, msg-4), hasMore=true.
	page, err := svc.ListMessages(ctx, fx.AuthorID, conv.ID, nil, 2)
	if err != nil {
		t.Fatalf("ListMessages: %v", err)
	}
	if len(page.Messages) != 2 || !page.HasMore {
		t.Fatalf("page 1 = %d messages (hasMore=%v), attendu 2/true", len(page.Messages), page.HasMore)
	}
	if page.Messages[1].Content != "msg-4" || page.Messages[0].Content != "msg-3" {
		t.Fatalf("page 1 contenu inattendu: %+v", page.Messages)
	}

	// Page 2 : avant msg-3 → msg-0..msg-2 (3 messages), sans hasMore.
	before := page.Messages[0].CreatedAt
	page2, err := svc.ListMessages(ctx, fx.AuthorID, conv.ID, parseRFC3339(t, before), 50)
	if err != nil {
		t.Fatalf("ListMessages page 2: %v", err)
	}
	if len(page2.Messages) != 3 || page2.HasMore {
		t.Fatalf("page 2 = %d messages (hasMore=%v), attendu 3/false", len(page2.Messages), page2.HasMore)
	}
	if page2.Messages[0].Content != "msg-0" || page2.Messages[2].Content != "msg-2" {
		t.Fatalf("page 2 contenu inattendu: %+v", page2.Messages)
	}
}

func TestSendMessageValidations(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newSvc()
	ctx := context.Background()

	conv, err := svc.CreateDirect(ctx, fx.AuthorID, fx.ViewerID)
	if err != nil {
		t.Fatalf("CreateDirect: %v", err)
	}

	// Vide (ou blancs) → erreur.
	if _, err := svc.SendMessage(ctx, fx.AuthorID, conv.ID, "   "); err == nil {
		t.Fatal("message vide accepté")
	}
	// Trop long → erreur.
	long := strings.Repeat("a", maxContentRunes+1)
	if _, err := svc.SendMessage(ctx, fx.AuthorID, conv.ID, long); err == nil {
		t.Fatal("message trop long accepté")
	}
	// Non-membre → introuvable.
	if _, err := svc.SendMessage(ctx, fx.AuthorID, "00000000-0000-0000-0000-000000000099", "hello"); err != ErrNotFound {
		t.Fatalf("non-membre: err = %v, attendu ErrNotFound", err)
	}
}

// ─── Non-lus & lecture ──────────────────────────────────────────────────

func TestUnreadCountAndMarkRead(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newSvc()
	ctx := context.Background()

	conv, err := svc.CreateDirect(ctx, fx.AuthorID, fx.ViewerID)
	if err != nil {
		t.Fatalf("CreateDirect: %v", err)
	}

	// Nettoyage : cette conversation a déjà des non-lus des tests précédents
	// (base partagée par package). On la marque lue puis on raisonne en delta.
	if err := svc.MarkRead(ctx, fx.ViewerID, conv.ID); err != nil {
		t.Fatalf("MarkRead initial: %v", err)
	}
	aliceBase, err := svc.UnreadCount(ctx, fx.AuthorID)
	if err != nil {
		t.Fatalf("UnreadCount alice: %v", err)
	}
	base, err := svc.UnreadCount(ctx, fx.ViewerID)
	if err != nil {
		t.Fatalf("UnreadCount: %v", err)
	}

	// 2 messages → +1 conversation non lue pour le destinataire.
	if _, err := svc.SendMessage(ctx, fx.AuthorID, conv.ID, "un"); err != nil {
		t.Fatalf("SendMessage: %v", err)
	}
	if _, err := svc.SendMessage(ctx, fx.AuthorID, conv.ID, "deux"); err != nil {
		t.Fatalf("SendMessage: %v", err)
	}
	count, _ := svc.UnreadCount(ctx, fx.ViewerID)
	if count != base+1 {
		t.Fatalf("unread = %d, attendu %d", count, base+1)
	}
	// L'auteur ne compte pas SES messages : son compteur est inchangé.
	count, _ = svc.UnreadCount(ctx, fx.AuthorID)
	if count != aliceBase {
		t.Fatalf("unread auteur = %d, attendu %d", count, aliceBase)
	}

	// MarkRead → retour à la baseline.
	if err := svc.MarkRead(ctx, fx.ViewerID, conv.ID); err != nil {
		t.Fatalf("MarkRead: %v", err)
	}
	count, _ = svc.UnreadCount(ctx, fx.ViewerID)
	if count != base {
		t.Fatalf("unread après lecture = %d, attendu %d", count, base)
	}

	// Un nouveau message relance le non-lu. (Pause de 10 ms : TIMESTAMP(3)
	// à la milliseconde — un envoi dans la même ms que le mark-read serait
	// considéré lu.)
	time.Sleep(10 * time.Millisecond)
	if _, err := svc.SendMessage(ctx, fx.AuthorID, conv.ID, "trois"); err != nil {
		t.Fatalf("SendMessage: %v", err)
	}
	count, _ = svc.UnreadCount(ctx, fx.ViewerID)
	if count != base+1 {
		t.Fatalf("unread après nouveau message = %d, attendu %d", count, base+1)
	}
}

// ─── Liste des conversations ────────────────────────────────────────────

func TestListShowsLastMessageAndOrder(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newSvc()
	ctx := context.Background()

	// Troisième utilisateur (Carol) pour la seconde conversation.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, "updatedAt")
		 VALUES ('00000000-0000-0000-0000-000000000004', 'carol@test.dev', 'carol', 'Carol', now())`); err != nil {
		t.Fatalf("insert carol: %v", err)
	}

	convAB, err := svc.CreateDirect(ctx, fx.AuthorID, fx.ViewerID)
	if err != nil {
		t.Fatalf("CreateDirect AB: %v", err)
	}
	convBC, err := svc.CreateDirect(ctx, fx.ViewerID, "00000000-0000-0000-0000-000000000004")
	if err != nil {
		t.Fatalf("CreateDirect BC: %v", err)
	}

	if _, err := svc.SendMessage(ctx, fx.AuthorID, convAB.ID, "dernier sur AB"); err != nil {
		t.Fatalf("SendMessage: %v", err)
	}
	_ = convBC // conversation vide : doit apparaître sans lastMessage

	list, err := svc.List(ctx, fx.ViewerID, 50)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("conversations = %d, attendu 2", len(list))
	}
	// La plus récemment active d'abord : AB (a un message).
	if list[0].ID != convAB.ID {
		t.Fatalf("première conversation = %s, attendu %s (activité)", list[0].ID, convAB.ID)
	}
	if list[0].LastMessage == nil || list[0].LastMessage.Content != "dernier sur AB" {
		t.Fatalf("lastMessage manquant/incorrect: %+v", list[0].LastMessage)
	}
	if list[0].UnreadCount != 1 {
		t.Fatalf("unreadCount = %d, attendu 1", list[0].UnreadCount)
	}
	if list[1].LastMessage != nil {
		t.Fatalf("conversation vide avec lastMessage: %+v", list[1].LastMessage)
	}
}

// ─── Helpers ────────────────────────────────────────────────────────────

func parseRFC3339(t *testing.T, s string) *time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatalf("parse %q: %v", s, err)
	}
	return &parsed
}