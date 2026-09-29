package admin

// Gardes superadmin + wiring des routes abuse (le métier est testé dans le
// package abuse ; ici on verrouille que la console exige superadmin et que
// les erreurs métier remontent intactes pour le mapping HTTP).

import (
	"context"
	"errors"
	"testing"

	"github.com/qoefi/api/internal/abuse"
	db "github.com/qoefi/api/internal/database"
)

func abuseSvc() *Service {
	return &Service{pool: poolTest, q: db.New(poolTest)}
}

func TestAbuseGuards_ForbiddenForStranger(t *testing.T) {
	requirePool(t)
	seedAdmin(t, context.Background())
	svc := abuseSvc()
	ctx := context.Background()
	const stranger = "00000000-0000-0000-0000-000000000000"

	if _, _, err := svc.ListAbuseDecisions(ctx, stranger, 10, 0); !errors.Is(err, errForbidden) {
		t.Errorf("ListAbuseDecisions = %v, attendu errForbidden", err)
	}
	if _, err := svc.ResolveAbuseDecision(ctx, stranger, "report_target", "x", "allow", ""); !errors.Is(err, errForbidden) {
		t.Errorf("ResolveAbuseDecision = %v, attendu errForbidden", err)
	}
	if _, err := svc.AbuseMetrics(ctx, stranger, 30); !errors.Is(err, errForbidden) {
		t.Errorf("AbuseMetrics = %v, attendu errForbidden", err)
	}
	if _, _, err := svc.ListAbuseIncidents(ctx, stranger, "", 10, 0); !errors.Is(err, errForbidden) {
		t.Errorf("ListAbuseIncidents = %v, attendu errForbidden", err)
	}
	if _, err := svc.OpenAbuseIncident(ctx, stranger, "Titre assez long", "other", "", ""); !errors.Is(err, errForbidden) {
		t.Errorf("OpenAbuseIncident = %v, attendu errForbidden", err)
	}
	if _, err := svc.UpdateAbuseIncident(ctx, stranger, "x", "", "", "", ""); !errors.Is(err, errForbidden) {
		t.Errorf("UpdateAbuseIncident = %v, attendu errForbidden", err)
	}
	if _, _, err := svc.ListAbuseAppeals(ctx, stranger, "", 10, 0); !errors.Is(err, errForbidden) {
		t.Errorf("ListAbuseAppeals = %v, attendu errForbidden", err)
	}
	if _, err := svc.GetAbuseAppeal(ctx, stranger, "x"); !errors.Is(err, errForbidden) {
		t.Errorf("GetAbuseAppeal = %v, attendu errForbidden", err)
	}
	if _, err := svc.DecideAbuseAppeal(ctx, stranger, "x", "", "", "", ""); !errors.Is(err, errForbidden) {
		t.Errorf("DecideAbuseAppeal = %v, attendu errForbidden", err)
	}
	if _, _, err := svc.ListSupportTickets(ctx, stranger, "", 10, 0); !errors.Is(err, errForbidden) {
		t.Errorf("ListSupportTickets = %v, attendu errForbidden", err)
	}
	if _, err := svc.GetSupportTicket(ctx, stranger, "x"); !errors.Is(err, errForbidden) {
		t.Errorf("GetSupportTicket = %v, attendu errForbidden", err)
	}
	if _, err := svc.AssignSupportTicket(ctx, stranger, "x"); !errors.Is(err, errForbidden) {
		t.Errorf("AssignSupportTicket = %v, attendu errForbidden", err)
	}
	if _, err := svc.UpdateSupportTicket(ctx, stranger, "x", "", "", ""); !errors.Is(err, errForbidden) {
		t.Errorf("UpdateSupportTicket = %v, attendu errForbidden", err)
	}
	if _, err := svc.SupportMetrics(ctx, stranger); !errors.Is(err, errForbidden) {
		t.Errorf("SupportMetrics = %v, attendu errForbidden", err)
	}
	if _, err := svc.SetPublicationEmailPro(ctx, stranger, "pub_adm_001", true); !errors.Is(err, errForbidden) {
		t.Errorf("SetPublicationEmailPro = %v, attendu errForbidden", err)
	}
}

func TestAbuseWiring_SuperadminPassthrough(t *testing.T) {
	requirePool(t)
	seedAdmin(t, context.Background())
	svc := abuseSvc()
	ctx := context.Background()

	// Listes vides mais sans erreur (le superadmin passe les gardes).
	if _, _, err := svc.ListAbuseDecisions(ctx, adminAdminID, 10, 0); err != nil {
		t.Errorf("ListAbuseDecisions superadmin: %v", err)
	}
	if _, err := svc.AbuseMetrics(ctx, adminAdminID, 7); err != nil {
		t.Errorf("AbuseMetrics superadmin: %v", err)
	}
	if _, _, err := svc.ListAbuseIncidents(ctx, adminAdminID, "", 10, 0); err != nil {
		t.Errorf("ListAbuseIncidents superadmin: %v", err)
	}
	if _, _, err := svc.ListAbuseAppeals(ctx, adminAdminID, "", 10, 0); err != nil {
		t.Errorf("ListAbuseAppeals superadmin: %v", err)
	}
	// Inexistants : les sentinelles métier remontent intactes (mapping HTTP).
	if _, err := svc.ResolveAbuseDecision(ctx, adminAdminID, "report_target", "inexistant", "allow", ""); !errors.Is(err, abuse.ErrNoOpenDecision) {
		t.Errorf("Resolve inexistant = %v, attendu ErrNoOpenDecision", err)
	}
	if _, err := svc.GetAbuseAppeal(ctx, adminAdminID, "00000000-0000-0000-0000-000000000000"); !errors.Is(err, abuse.ErrAppealNotFound) {
		t.Errorf("GetAbuseAppeal inexistant = %v, attendu ErrAppealNotFound", err)
	}
	if _, err := svc.DecideAbuseAppeal(ctx, adminAdminID, "00000000-0000-0000-0000-000000000000", "decided", "upheld", "", ""); !errors.Is(err, abuse.ErrAppealNotFound) {
		t.Errorf("DecideAbuseAppeal inexistant = %v, attendu ErrAppealNotFound", err)
	}
	if _, err := svc.UpdateAbuseIncident(ctx, adminAdminID, "00000000-0000-0000-0000-000000000000", "", "", "", ""); !errors.Is(err, abuse.ErrNoIncident) {
		t.Errorf("UpdateAbuseIncident inexistant = %v, attendu ErrNoIncident", err)
	}
}
