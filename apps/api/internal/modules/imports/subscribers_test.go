package imports

import (
	"strings"
	"testing"
)

// Le parsing tourne avant toute écriture en base : c'est lui qui décide ce qui
// entre en quarantaine. Ces tests ne nécessitent donc pas de Postgres.

func TestParseSubscriberCSV_HeaderAndDeduplication(t *testing.T) {
	csv := "email,first_name\n" +
		"Alice@Example.com,Alice\n" +
		"alice@example.com,Alice bis\n" + // doublon après normalisation
		"bob@example.org,Bob\n"

	rows, stats, err := parseSubscriberCSV(csv)
	if err != nil {
		t.Fatalf("parseSubscriberCSV: %v", err)
	}
	if stats.Received != 3 {
		t.Fatalf("reçues = %d, attendu 3", stats.Received)
	}
	if stats.Valid != 2 {
		t.Fatalf("valides = %d, attendu 2", stats.Valid)
	}
	if stats.Duplicates != 1 {
		t.Fatalf("doublons = %d, attendu 1", stats.Duplicates)
	}
	// 1 valide + 1 invalide : un doublon n'ajoute pas de ligne (l'adresse en a
	// déjà une dans ce lot), il n'apparaît que dans le bilan.
	if len(rows) != 2 {
		t.Fatalf("lignes classées = %d, attendu 2", len(rows))
	}
	if rows[0].Email != "alice@example.com" {
		t.Fatalf("adresse normalisée = %q", rows[0].Email)
	}
	if rows[0].Status != RowPendingConfirmation {
		t.Fatalf("statut = %q : une adresse nouvelle doit rester dans la branche stricte", rows[0].Status)
	}
}

func TestParseSubscriberCSV_NoHeader(t *testing.T) {
	rows, stats, err := parseSubscriberCSV("a@b.fr\nc@d.fr\n")
	if err != nil {
		t.Fatalf("parseSubscriberCSV: %v", err)
	}
	if stats.Valid != 2 || len(rows) != 2 {
		t.Fatalf("valides = %d / lignes = %d, attendu 2/2", stats.Valid, len(rows))
	}
}

func TestParseSubscriberCSV_InvalidRowsAreCountedNotFatal(t *testing.T) {
	csv := "email\npas-une-adresse\nvalid@example.com\n"
	rows, stats, err := parseSubscriberCSV(csv)
	if err != nil {
		t.Fatalf("parseSubscriberCSV: %v", err)
	}
	if stats.Invalid != 1 {
		t.Fatalf("invalides = %d, attendu 1", stats.Invalid)
	}
	if stats.Valid != 1 {
		t.Fatalf("valides = %d, attendu 1", stats.Valid)
	}
	if rows[0].Status != RowInvalid || rows[0].Reason == "" {
		t.Fatalf("la ligne invalide doit porter un motif, obtenu %+v", rows[0])
	}
}

func TestParseSubscriberCSV_AllInvalidIsRejected(t *testing.T) {
	if _, _, err := parseSubscriberCSV("email\nnope\nnope2\n"); err == nil {
		t.Fatal("un fichier sans adresse exploitable doit être refusé")
	}
}

// Un export d'ancien prestataire contient souvent « Prénom Nom <a@b.fr> » :
// c'est un dépliage de format, pas une « correction » d'adresse.
func TestNormalizeImportEmail_UnwrapsDisplayForm(t *testing.T) {
	if got := normalizeImportEmail("  Alice <Alice@Example.com> "); got != "alice@example.com" {
		t.Fatalf("normalisation = %q", got)
	}
	if got := normalizeImportEmail("\"bob@example.org\""); got != "bob@example.org" {
		t.Fatalf("normalisation = %q", got)
	}
}

// Aucune « réparation » : une adresse douteuse est écartée, jamais devinée.
func TestValidImportEmail_RejectsSuspiciousForms(t *testing.T) {
	rejected := []string{
		"", "a@b", "a@@b.fr", "a b@c.fr", "@c.fr", "a@", strings.Repeat("x", 65) + "@c.fr",
		"a..b@c.fr", "a@c..fr", "a@-c.fr", "a@c-.fr", "a@c.fr.",
	}
	for _, email := range rejected {
		if validImportEmail(email) {
			t.Fatalf("%q accepté à tort", email)
		}
	}
	accepted := []string{"a@b.fr", "first.last+tag@sub.example.co.uk", "x_y@example.io"}
	for _, email := range accepted {
		if !validImportEmail(email) {
			t.Fatalf("%q refusé à tort", email)
		}
	}
}

// Les cellules destinées à la revue staff viennent d'un fichier non fiable :
// une valeur commençant par « = » devient une formule dans un tableur.
func TestSanitizeImportCell_NeutralizesFormulas(t *testing.T) {
	cases := map[string]string{
		"=cmd|'/C calc'!A1": "'=cmd|'/C calc'!A1",
		"+1+1":              "'+1+1",
		"-2+3":              "'-2+3",
		"@SUM(A1)":          "'@SUM(A1)",
		"normal":            "normal",
		"  espaces  ":       "espaces",
	}
	for in, want := range cases {
		if got := sanitizeImportCell(in); got != want {
			t.Fatalf("sanitize(%q) = %q, attendu %q", in, got, want)
		}
	}
	if got := sanitizeImportCell("a\x00b\x01c"); got != "abc" {
		t.Fatalf("caractères de contrôle non retirés : %q", got)
	}
}

func TestFingerprintImport_StableAndSensitive(t *testing.T) {
	a := fingerprintImport("email\na@b.fr\n")
	if a != fingerprintImport("email\na@b.fr\n") {
		t.Fatal("l'empreinte doit être stable : une décision porte sur cette version exacte")
	}
	if a == fingerprintImport("email\na@b.fr\nb@c.fr\n") {
		t.Fatal("modifier le fichier doit changer l'empreinte")
	}
	if len(a) != 64 {
		t.Fatalf("empreinte = %d caractères, attendu 64", len(a))
	}
}

// ── Machine à états ──────────────────────────────────────────────────────

func TestCanTransition(t *testing.T) {
	allowed := [][2]string{
		{BatchSubmitted, BatchReviewing},
		{BatchSubmitted, BatchRejected},
		{BatchSubmitted, BatchNeedsInfo},
		{BatchSubmitted, BatchApprovedReconfirm},
		{BatchReviewing, BatchApprovedDirect},
		{BatchNeedsInfo, BatchSubmitted}, // nouvelle version à réexaminer
		{BatchApprovedDirect, BatchSuspended},
		{BatchApprovedDirect, BatchRunning},
		{BatchRunning, BatchCompleted},
		{BatchSuspended, BatchApprovedDirect}, // reprise explicite
	}
	for _, pair := range allowed {
		if !canTransition(pair[0], pair[1]) {
			t.Fatalf("%s → %s devrait être autorisé", pair[0], pair[1])
		}
	}

	forbidden := [][2]string{
		{BatchSubmitted, BatchRunning}, // on n'exécute pas un lot non décidé
		{BatchSubmitted, BatchCompleted},
		{BatchRejected, BatchApprovedDirect}, // une décision ne se réécrit pas
		{BatchCompleted, BatchRunning},
		{BatchCancelled, BatchSubmitted},
		{BatchDraft, BatchApprovedDirect}, // il faut soumettre avant de décider
	}
	for _, pair := range forbidden {
		if canTransition(pair[0], pair[1]) {
			t.Fatalf("%s → %s ne devrait pas être autorisé", pair[0], pair[1])
		}
	}
}

func TestStatusForDecision(t *testing.T) {
	cases := map[string]string{
		"needs_info":         BatchNeedsInfo,
		"rejected":           BatchRejected,
		"approved_reconfirm": BatchApprovedReconfirm,
		"approved_direct":    BatchApprovedDirect,
		"suspended":          BatchSuspended,
		"cancelled":          BatchCancelled,
		"unknown":            "",
	}
	for decision, want := range cases {
		if got := statusForDecision(decision, ""); got != want {
			t.Fatalf("statusForDecision(%q) = %q, attendu %q", decision, got, want)
		}
	}
	// `resumed` n'a pas d'état propre : il ramène à l'approbation précédente.
	if got := statusForDecision("resumed", BatchApprovedReconfirm); got != BatchApprovedReconfirm {
		t.Fatalf("resumed = %q, attendu %q", got, BatchApprovedReconfirm)
	}
}

func TestValidStaffDecision(t *testing.T) {
	for _, ok := range []string{"needs_info", "rejected", "approved_reconfirm", "approved_direct", "suspended", "cancelled", "resumed"} {
		if !validStaffDecision(ok) {
			t.Fatalf("décision %q refusée à tort", ok)
		}
	}
	for _, bad := range []string{"", "approve", "deleted", "running"} {
		if validStaffDecision(bad) {
			t.Fatalf("décision %q acceptée à tort", bad)
		}
	}
}

func TestDeclarations_Complete(t *testing.T) {
	full := SubscriberImportDeclarations{
		NoPurchased: true, NoScraped: true, NoUnsubscribed: true,
		SuppressionListIdentified: true, ConsentPurpose: "newsletter de la publication",
	}
	if !full.Complete() {
		t.Fatal("déclarations complètes refusées")
	}
	cases := map[string]SubscriberImportDeclarations{
		"adresses achetées non niées":   {NoScraped: true, NoUnsubscribed: true, SuppressionListIdentified: true, ConsentPurpose: "x"},
		"adresses collectées non niées": {NoPurchased: true, NoUnsubscribed: true, SuppressionListIdentified: true, ConsentPurpose: "x"},
		"désabonnés non niés":           {NoPurchased: true, NoScraped: true, SuppressionListIdentified: true, ConsentPurpose: "x"},
		"finalité absente":              {NoPurchased: true, NoScraped: true, NoUnsubscribed: true, SuppressionListIdentified: true},
		"finalité vide":                 {NoPurchased: true, NoScraped: true, NoUnsubscribed: true, SuppressionListIdentified: true, ConsentPurpose: "   "},
	}
	for name, decls := range cases {
		if decls.Complete() {
			t.Fatalf("déclarations incomplètes acceptées : %s", name)
		}
	}
}

// Invariant central de la tranche : aucun chemin d'import ne rend un contact
// destinataire. Ce test verrouille la formulation exposée à la documentation.
func TestSubscriberImportEligibilityDocumented(t *testing.T) {
	doc := SubscriberImportEligibilityDocumented()
	if !strings.Contains(doc, "confirmation individuelle") {
		t.Fatalf("l'invariant d'éligibilité n'est plus documenté : %q", doc)
	}
}
