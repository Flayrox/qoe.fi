package support

// Support général (tranche 6) : un dossier ouvert par (ouvreur, kind),
// l'ouverture ne change rien, on ne clôt jamais son propre dossier,
// clos = clos. Transitions et kinds purs testés sans base.

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"testing"
	"time"

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

func TestValidKind(t *testing.T) {
	for _, k := range []string{"account_restricted", "account_lost", "content_moderation", "api_access", "import_issue", "delivery", "report_issue", "other"} {
		if !ValidKind(k) {
			t.Errorf("kind %s doit être valide", k)
		}
	}
	for _, k := range []string{"", "ban", "ACCOUNT_LOST"} {
		if ValidKind(k) {
			t.Errorf("kind %q doit être invalide", k)
		}
	}
}

func TestValidTransition(t *testing.T) {
	ok := map[[2]string]bool{
		{"open", "under_review"}: true, {"open", "closed"}: true,
		{"open", "open"}:           false,
		{"under_review", "closed"}: true,
		{"under_review", "open"}:   false, {"under_review", "under_review"}: false,
		{"closed", "open"}: false, {"closed", "under_review"}: false, {"closed", "closed"}: false,
		{"bogus", "open"}: false,
	}
	for pair, want := range ok {
		if got := ValidTransition(pair[0], pair[1]); got != want {
			t.Errorf("transition %s → %s : attendu %v", pair[0], pair[1], want)
		}
	}
}

func requirePool(t *testing.T) {
	t.Helper()
	if poolTest == nil {
		t.Skip("DB indisponible (Docker/testcontainers requis)")
	}
}

func TestTicket_NilPool(t *testing.T) {
	ctx := context.Background()
	now := time.Now()
	if _, err := OpenTicket(ctx, nil, "other", "sujet assez long", "u", "msg", "", "", now); err == nil {
		t.Error("OpenTicket nil : erreur attendue")
	}
	if _, err := GetTicket(ctx, nil, "x"); err == nil {
		t.Error("GetTicket nil : erreur attendue")
	}
	if items, total, err := ListUserTickets(ctx, nil, "u", 20, 0); err != nil || total != 0 || len(items) != 0 {
		t.Error("ListUserTickets nil : vide attendu")
	}
	if items, total, err := ListAllTickets(ctx, nil, "", 50, 0); err != nil || total != 0 || len(items) != 0 {
		t.Error("ListAllTickets nil : vide attendu")
	}
	if _, err := AssignTicket(ctx, nil, "x", "s", now); err == nil {
		t.Error("AssignTicket nil : erreur attendue")
	}
	if _, err := UpdateTicket(ctx, nil, "x", "s", "", "", "", now); err == nil {
		t.Error("UpdateTicket nil : erreur attendue")
	}
	if _, err := ComputeMetrics(ctx, nil, now); err != nil {
		t.Error("ComputeMetrics nil : aucune erreur attendue")
	}
}

func TestOpenPublicTicket_Validation(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()
	if _, err := OpenPublicTicket(ctx, poolTest, "", "", "pas-un-email", "other", "sujet assez long", "msg", now); !errors.Is(err, ErrInvalidTicket) {
		t.Fatalf("e-mail invalide : attendu ErrInvalidTicket, obtenu %v", err)
	}
	if _, err := OpenPublicTicket(ctx, poolTest, "", "", "a@b.cd", "bogus", "sujet assez long", "msg", now); !errors.Is(err, ErrInvalidTicket) {
		t.Fatalf("kind inconnu : attendu ErrInvalidTicket, obtenu %v", err)
	}
}

func TestOpenPublicTicket_GuestAndAccount(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()
	tag := fmt.Sprintf("pub-%d", now.UnixNano())
	guestEmail := tag + "@example.com"
	user := "user-" + tag

	// Invité : dossier préfixé guest:<email>.
	g, err := OpenPublicTicket(ctx, poolTest, "", "Jean", guestEmail, "account_lost", "Compte perdu "+tag, "je ne peux plus me connecter", now)
	if err != nil {
		t.Fatalf("invité : %v", err)
	}
	if g.OpenedBy != GuestOpener(guestEmail) {
		t.Fatalf("invité : openedBy %q attendu guest:<email>", g.OpenedBy)
	}
	if len(g.Messages) != 1 || g.Messages[0].Body != "Jean — je ne peux plus me connecter" {
		t.Fatalf("nom préfixé au message attendu, obtenu %+v", g.Messages)
	}
	// Connecté : dossier AU COMPTE (l'e-mail ne sert qu'au budget).
	a, err := OpenPublicTicket(ctx, poolTest, user, "", "autre@example.com", "other", "Question "+tag, "bonjour", now)
	if err != nil {
		t.Fatalf("compte : %v", err)
	}
	if a.OpenedBy != user {
		t.Fatalf("compte : openedBy %q attendu %q", a.OpenedBy, user)
	}
	// Budget : 3/j/adresse — kinds distincts (l'unicité par kind frapperait
	// sinon avant le budget). Le 4e est refusé, explicitement.
	for _, kind := range []string{"other", "delivery"} {
		if _, err := OpenPublicTicket(ctx, poolTest, "", "", guestEmail, kind, "Sujet "+kind+" "+tag, "msg", now); err != nil {
			t.Fatalf("budget (kind %s) : %v", kind, err)
		}
	}
	if _, err := OpenPublicTicket(ctx, poolTest, "", "", guestEmail, "api_access", "Sujet4 "+tag, "msg", now); !errors.Is(err, ErrPublicBudgetExhausted) {
		t.Fatalf("4e : attendu ErrPublicBudgetExhausted, obtenu %v", err)
	}

	// Nettoyage (dossiers + budgets du tag).
	for _, opener := range []string{GuestOpener(guestEmail), user} {
		poolTest.Exec(ctx, `DELETE FROM "SupportMessage" WHERE "ticketId" IN (SELECT "id" FROM "SupportTicket" WHERE "openedBy" = $1)`, opener)
		poolTest.Exec(ctx, `DELETE FROM "SupportTicket" WHERE "openedBy" = $1`, opener)
	}
	poolTest.Exec(ctx, `DELETE FROM "CapabilityBudget" WHERE "scopeId" IN ($1, $2)`, guestEmail, "autre@example.com")
}

func TestTicket_FullCycle(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()
	user := fmt.Sprintf("support-user-%d", now.UnixNano())
	staff := "support-staff-1"

	if _, err := OpenTicket(ctx, poolTest, "bogus", "sujet assez long", user, "msg", "", "", now); !errors.Is(err, ErrInvalidTicket) {
		t.Fatalf("kind inconnu : attendu ErrInvalidTicket, obtenu %v", err)
	}
	if _, err := OpenTicket(ctx, poolTest, "other", "abc", user, "msg", "", "", now); !errors.Is(err, ErrInvalidTicket) {
		t.Fatalf("sujet trop court : attendu ErrInvalidTicket, obtenu %v", err)
	}

	d, err := OpenTicket(ctx, poolTest, "delivery", "Mes e-mails n'arrivent plus", user, "depuis mardi, rien", "", "", now)
	if err != nil {
		t.Fatalf("ouverture : %v", err)
	}
	if d.Status != "open" || len(d.Messages) != 1 {
		t.Fatalf("dossier ouvert + message initial attendus, obtenu %+v", d)
	}
	// Anti-saturation : même kind → refus ; autre kind → OK.
	if _, err := OpenTicket(ctx, poolTest, "delivery", "Autre sujet de livraison", user, "bis", "", "", now); !errors.Is(err, ErrTicketAlreadyOpen) {
		t.Fatalf("doublon : attendu ErrTicketAlreadyOpen, obtenu %v", err)
	}
	d2, err := OpenTicket(ctx, poolTest, "other", "Autre sujet quelconque", user, "bonjour", "", "", now)
	if err != nil {
		t.Fatalf("kind différent : %v", err)
	}

	// Message de l'ouvreur ; autrui ne lit ni n'écrit (404).
	if _, err := AddUserMessage(ctx, poolTest, d.ID, user, "précision : free.fr", now); err != nil {
		t.Fatalf("message ouvreur : %v", err)
	}
	if _, err := GetTicket(ctx, poolTest, d.ID); err != nil {
		t.Fatalf("lecture : %v", err)
	}

	// Prise en main → clôture par un tiers (pas l'ouvreur).
	d, err = AssignTicket(ctx, poolTest, d.ID, staff, now)
	if err != nil || d.Status != "under_review" || d.Assignee == nil || *d.Assignee != staff {
		t.Fatalf("assignation : %v (%+v)", err, d)
	}
	d, err = UpdateTicket(ctx, poolTest, d.ID, staff, "closed", "délivrabilité rétablie", "c'est réparé", now)
	if err != nil {
		t.Fatalf("clôture : %v", err)
	}
	if d.Status != "closed" || d.ClosedBy == nil || *d.ClosedBy != staff {
		t.Fatalf("clos signé attendu, obtenu %+v", d)
	}
	if len(d.Messages) != 3 {
		t.Fatalf("réponse staff en message attendue (3), obtenu %d", len(d.Messages))
	}
	// Clos = clos.
	if _, err := AddUserMessage(ctx, poolTest, d.ID, user, "trop tard", now); !errors.Is(err, ErrTicketClosed) {
		t.Fatalf("message sur clos : attendu ErrTicketClosed, obtenu %v", err)
	}

	// Conflit d'intérêts : l'ouvreur (même staff) ne clôt jamais son dossier.
	d3, err := OpenTicket(ctx, poolTest, "other", "Dossier du staff lui-même", staff, "moi staff", "", "", now)
	if err != nil {
		t.Fatalf("ouverture staff : %v", err)
	}
	if _, err := UpdateTicket(ctx, poolTest, d3.ID, staff, "closed", "", "", now); !errors.Is(err, ErrInvalidTicket) {
		t.Fatalf("auto-clôture : attendu ErrInvalidTicket, obtenu %v", err)
	}

	// Charge : nos dossiers comptent.
	m, err := ComputeMetrics(ctx, poolTest, now)
	if err != nil {
		t.Fatalf("métriques : %v", err)
	}
	if m.OpenByKind["other"] < 2 {
		t.Fatalf("2 dossiers 'other' ouverts attendus, obtenu %v", m.OpenByKind)
	}

	// Nettoyage (préfixe unique).
	for _, u := range []string{user, staff} {
		poolTest.Exec(ctx, `DELETE FROM "SupportMessage" WHERE "ticketId" IN (SELECT "id" FROM "SupportTicket" WHERE "openedBy" = $1)`, u)
		poolTest.Exec(ctx, `DELETE FROM "SupportTicket" WHERE "openedBy" = $1`, u)
	}
	_ = d2
}
