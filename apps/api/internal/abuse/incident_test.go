package abuse

// Registre d'incidents (fiche 06 §9-§10) : le statut avance sans se
// réécrire, les mesures s'ajoutent sans s'écraser, l'inexistant est un
// refus explicite. Transitions pures testées sans base.

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestValidIncidentTransition(t *testing.T) {
	ok := map[[2]string]bool{
		{"open", "contained"}: true, {"open", "resolved"}: true,
		{"open", "open"}: false, {"open", "reopened"}: false,
		{"contained", "resolved"}: true, {"contained", "reopened"}: true,
		{"contained", "open"}:     true,
		{"reopened", "contained"}: true, {"reopened", "resolved"}: true,
		{"reopened", "open"}:     false,
		{"resolved", "reopened"}: true,
		{"resolved", "open"}:     false, // jamais d'effacement : passer par reopened
		{"resolved", "resolved"}: false,
		{"bogus", "open"}:        false, {"open", "bogus"}: false,
	}
	for pair, want := range ok {
		if got := ValidIncidentTransition(pair[0], pair[1]); got != want {
			t.Errorf("transition %s → %s : attendu %v, obtenu %v", pair[0], pair[1], want, got)
		}
	}
}

func TestValidIncidentKind(t *testing.T) {
	for _, k := range []string{"account_farm", "report_raid", "signup_flood", "api_abuse", "impersonation", "spam_wave", "other"} {
		if !ValidIncidentKind(k) {
			t.Errorf("kind %s doit être valide", k)
		}
	}
	for _, k := range []string{"", "nuke", "ACCOUNT_FARM"} {
		if ValidIncidentKind(k) {
			t.Errorf("kind %q doit être invalide", k)
		}
	}
}

func TestOpenIncident_Validation(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()
	if _, err := OpenIncident(ctx, poolTest, "abc", "other", "", "", "staff", now); !errors.Is(err, ErrInvalidIncident) {
		t.Fatalf("titre trop court : attendu ErrInvalidIncident, obtenu %v", err)
	}
	if _, err := OpenIncident(ctx, poolTest, "Titre assez long", "bogus", "", "", "staff", now); !errors.Is(err, ErrInvalidIncident) {
		t.Fatalf("kind inconnu : attendu ErrInvalidIncident, obtenu %v", err)
	}
	if _, err := GetIncident(ctx, poolTest, "00000000-0000-0000-0000-000000000000"); !errors.Is(err, ErrNoIncident) {
		t.Fatalf("inexistant : attendu ErrNoIncident, obtenu %v", err)
	}
	// Le pool nil est un refus propre, pas un panic (même si ce test exige
	// la base pour les cas ci-dessus, la dégradation est vérifiée ici).
	if _, err := OpenIncident(ctx, nil, "Titre assez long", "other", "", "", "staff", now); err == nil {
		t.Fatal("pool nil : erreur attendue")
	}
}

func TestIncident_FullCycle(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()
	tag := fmt.Sprintf("incident-%d", now.UnixNano())

	d, err := OpenIncident(ctx, poolTest, "Ferme de comptes "+tag, "account_farm", "publication X", "200 faux comptes", "staff-1", now)
	if err != nil {
		t.Fatalf("ouverture : %v", err)
	}
	if d.Status != "open" || d.OpenedBy != "staff-1" || d.ResolvedBy != nil {
		t.Fatalf("dossier ouvert incohérent : %+v", d)
	}

	// Containment avec mesure : la mesure est horodatée et signée.
	d, err = UpdateIncident(ctx, poolTest, d.ID, "staff-1", "contained", "", "", "coupe-feu inscriptions engagé", now)
	if err != nil {
		t.Fatalf("containment : %v", err)
	}
	if d.Status != "contained" {
		t.Fatalf("statut contained attendu, obtenu %s", d.Status)
	}
	if d.Measures == "" || !contains(d.Measures, "coupe-feu inscriptions engagé") || !contains(d.Measures, "staff-1") {
		t.Fatalf("mesure horodatée et signée attendue, obtenu %q", d.Measures)
	}

	// Transition interdite : contained → contained (sur place).
	if _, err := UpdateIncident(ctx, poolTest, d.ID, "staff-1", "contained", "", "", "", now); !errors.Is(err, ErrInvalidIncident) {
		t.Fatalf("sur-place : attendu ErrInvalidIncident, obtenu %v", err)
	}

	// Clôture : signée.
	d, err = UpdateIncident(ctx, poolTest, d.ID, "staff-2", "resolved", "", "comptes supprimés", "bilan écrit", now)
	if err != nil {
		t.Fatalf("clôture : %v", err)
	}
	if d.ResolvedBy == nil || *d.ResolvedBy != "staff-2" || d.ResolvedAt == nil {
		t.Fatalf("clôture signée attendue, obtenu %+v", d)
	}
	// Deux mesures accumulées, pas écrasées.
	if !contains(d.Measures, "coupe-feu") || !contains(d.Measures, "bilan écrit") {
		t.Fatalf("mesures accumulées attendues, obtenu %q", d.Measures)
	}

	// resolved → open direct : interdit (passer par reopened).
	if _, err := UpdateIncident(ctx, poolTest, d.ID, "staff-2", "open", "", "", "", now); !errors.Is(err, ErrInvalidIncident) {
		t.Fatalf("resolved→open : attendu ErrInvalidIncident, obtenu %v", err)
	}
	// Reouverture : signature effacée, historique gardé.
	d, err = UpdateIncident(ctx, poolTest, d.ID, "staff-2", "reopened", "", "", "reprise d'activité", now)
	if err != nil {
		t.Fatalf("réouverture : %v", err)
	}
	if d.Status != "reopened" || d.ResolvedBy != nil {
		t.Fatalf("réouvert sans signature attendu, obtenu %+v", d)
	}
	if !contains(d.Measures, "bilan écrit") || !contains(d.Measures, "reprise d'activité") {
		t.Fatalf("historique conservé attendu, obtenu %q", d.Measures)
	}

	// Liste : le dossier rouvert sort avant les clos.
	items, total, err := ListIncidents(ctx, poolTest, "", 50, 0, now)
	if err != nil || total < 1 {
		t.Fatalf("liste : %v (total=%d)", err, total)
	}
	found := false
	for _, it := range items {
		if it.ID == d.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("dossier manquant de la liste")
	}

	// Nettoyage (tag unique).
	if _, err := poolTest.Exec(ctx, `DELETE FROM "AntiAbuseIncident" WHERE "title" LIKE '%`+tag+`'`); err != nil {
		t.Fatalf("nettoyage : %v", err)
	}
}

func contains(s, sub string) bool { return strings.Contains(s, sub) }
