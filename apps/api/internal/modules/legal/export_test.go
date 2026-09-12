package legal

// Tests de l'export signé du registre de consentement : une pièce produite
// pour un contrôle doit être vérifiable, chaînée, et détecter une altération.

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"testing"
)

type exportEnvelope struct {
	ID                   string         `json:"id"`
	Seq                  int64          `json:"seq"`
	Scope                string         `json:"scope"`
	GeneratedAt          string         `json:"generatedAt"`
	Counts               map[string]int `json:"counts"`
	ContentSha256        string         `json:"contentSha256"`
	PreviousChain        string         `json:"previousChain"`
	Canonical            string         `json:"canonical"`
	ChainSha256          string         `json:"chainSha256"`
	Algorithm            string         `json:"algorithm"`
	KeyID                string         `json:"keyId"`
	PublicKey            string         `json:"publicKey"`
	Signature            string         `json:"signature"`
	ContainsPersonalData bool           `json:"containsPersonalData"`
	Filters              ExportFilters  `json:"filters"`
}

type exportDocument struct {
	Envelope exportEnvelope `json:"envelope"`
	Payload  struct {
		Versions      []map[string]any `json:"versions"`
		Acceptances   []map[string]any `json:"acceptances"`
		CookieConsent []map[string]any `json:"cookieConsent"`
	} `json:"payload"`
}

func cleanExportTables(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE legal_consent_export`); err != nil {
		t.Fatalf("truncate legal_consent_export: %v", err)
	}
}

// signingKey installe une clé Ed25519 déterministe : les tests doivent pouvoir
// recalculer les signatures.
func signingKey(t *testing.T, svc *Service) ed25519.PublicKey {
	t.Helper()
	seed := make([]byte, ed25519.SeedSize)
	for i := range seed {
		seed[i] = byte(i + 1)
	}
	svc.SetExportSigningKey(base64.StdEncoding.EncodeToString(seed))
	return ed25519.NewKeyFromSeed(seed).Public().(ed25519.PublicKey)
}

func parseExport(t *testing.T, raw []byte) exportDocument {
	t.Helper()
	var doc exportDocument
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("export illisible: %v", err)
	}
	return doc
}

func verifyEnvelope(t *testing.T, doc exportDocument, pub ed25519.PublicKey) {
	t.Helper()
	sum := sha256.Sum256([]byte(doc.Envelope.Canonical))
	chain := hex.EncodeToString(sum[:])
	if chain != doc.Envelope.ChainSha256 {
		t.Fatalf("empreinte du message signé = %s, enveloppe = %s", chain, doc.Envelope.ChainSha256)
	}
	sig, err := hex.DecodeString(doc.Envelope.Signature)
	if err != nil {
		t.Fatalf("signature illisible: %v", err)
	}
	if !ed25519.Verify(pub, []byte(chain), sig) {
		t.Fatal("signature Ed25519 invalide")
	}
	// La clé publique embarquée doit permettre la vérification à un tiers.
	embedded, err := base64.StdEncoding.DecodeString(doc.Envelope.PublicKey)
	if err != nil {
		t.Fatalf("clé publique illisible: %v", err)
	}
	if !ed25519.Verify(ed25519.PublicKey(embedded), []byte(chain), sig) {
		t.Fatal("la clé publique embarquée ne vérifie pas la signature")
	}
}

func TestLegal_ExportConsentRegister_SignedChainedAndVerifiable(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)
	cleanExportTables(t, ctx)
	pub := signingKey(t, svc)

	// Un lecteur accepte un document, un visiteur anonyme fait un choix.
	if _, err := svc.Accept(ctx, legalReaderID, "conditions-generales-utilisation", AcceptInput{Locale: "fr", Source: "test"}); err != nil {
		t.Fatalf("accept: %v", err)
	}
	if _, err := svc.RecordCookieConsent(ctx, CookieConsentInput{
		ConsentID: "browser-1", Locale: "fr", PolicyVersion: "1.0",
		Categories: map[string]bool{"necessary": true, "analytics": true},
		Source:     "exempt-notice",
	}); err != nil {
		t.Fatalf("cookie consent: %v", err)
	}

	first, err := svc.ExportConsentRegister(ctx, legalAdminID, ConsentExportInput{
		Subject: "Contrôle CNIL",
		Reason:  "Demande de pièces du 12/09/2026",
	})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	doc := parseExport(t, first.Document)

	if doc.Envelope.Algorithm != exportAlgorithm {
		t.Fatalf("algorithme = %s", doc.Envelope.Algorithm)
	}
	if doc.Envelope.KeyID == "" || doc.Envelope.PublicKey == "" {
		t.Fatal("l'enveloppe doit publier sa clé pour être vérifiable par un tiers")
	}
	if doc.Envelope.PreviousChain != "" {
		t.Fatalf("le premier export ne doit pas avoir de maillon précédent, obtenu %q", doc.Envelope.PreviousChain)
	}
	verifyEnvelope(t, doc, pub)
	// La pièce est nominative : le dire explicitement évite un partage distrait.
	if !doc.Envelope.ContainsPersonalData {
		t.Fatal("l'export contient des données personnelles et doit le signaler")
	}
	// Une preuve sans le texte accepté ne prouve rien : le corps doit être là.
	if len(doc.Payload.Versions) == 0 || len(doc.Payload.Acceptances) == 0 {
		t.Fatalf("contenu incomplet : %d version(s), %d acceptation(s)",
			len(doc.Payload.Versions), len(doc.Payload.Acceptances))
	}
	if len(doc.Payload.CookieConsent) != 1 {
		t.Fatalf("journal traceurs = %d ligne(s), attendu 1", len(doc.Payload.CookieConsent))
	}
	// L'octet qui a été haché est l'octet qui a été écrit : les octets du
	// champ `payload` de la réponse doivent reproduire l'empreinte annoncée.
	// C'est la propriété qui rend la pièce vérifiable ailleurs que chez nous.
	marker := []byte(`,"payload":`)
	idx := bytes.Index(first.Document, marker)
	if idx < 0 {
		t.Fatal("champ payload absent de la réponse")
	}
	payloadBytes := bytes.TrimSuffix(first.Document[idx+len(marker):], []byte("}"))
	contentSum := sha256.Sum256(payloadBytes)
	if hex.EncodeToString(contentSum[:]) != doc.Envelope.ContentSha256 {
		t.Fatalf("empreinte du contenu = %s, enveloppe = %s",
			hex.EncodeToString(contentSum[:]), doc.Envelope.ContentSha256)
	}

	// Second export : il doit pointer sur le premier.
	second, err := svc.ExportConsentRegister(ctx, legalAdminID, ConsentExportInput{Subject: "Copie de courtoisie"})
	if err != nil {
		t.Fatalf("second export: %v", err)
	}
	doc2 := parseExport(t, second.Document)
	if doc2.Envelope.PreviousChain != doc.Envelope.ChainSha256 {
		t.Fatalf("chaînage rompu : précédent = %q, attendu %q", doc2.Envelope.PreviousChain, doc.Envelope.ChainSha256)
	}
	verifyEnvelope(t, doc2, pub)

	verdict, err := svc.VerifyConsentExports(ctx, legalAdminID)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if verdict.Total != 2 || verdict.Valid != 2 || len(verdict.Broken) != 0 {
		t.Fatalf("vérification = %+v", verdict)
	}
	if verdict.HeadChain != doc2.Envelope.ChainSha256 {
		t.Fatal("la tête de chaîne doit être le dernier export")
	}
}

func TestLegal_VerifyConsentExports_DetectsTampering(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)
	cleanExportTables(t, ctx)
	signingKey(t, svc)

	if _, err := svc.ExportConsentRegister(ctx, legalAdminID, ConsentExportInput{Subject: "origine"}); err != nil {
		t.Fatalf("export: %v", err)
	}
	// Une réécriture directe en base (le scénario que la signature doit
	// rattraper) : le contenu annoncé ne correspond plus.
	if _, err := poolTest.Exec(ctx,
		`UPDATE legal_consent_export SET content_sha256 = repeat('a', 64)`); err != nil {
		t.Fatalf("altération: %v", err)
	}

	verdict, err := svc.VerifyConsentExports(ctx, legalAdminID)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if verdict.Valid != 0 || len(verdict.Broken) != 1 {
		t.Fatalf("l'altération n'a pas été détectée: %+v", verdict)
	}
}

func TestLegal_ExportConsentRegister_ScopesAndFilters(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)
	cleanExportTables(t, ctx)
	signingKey(t, svc)

	if _, err := svc.Accept(ctx, legalReaderID, "politique-confidentialite", AcceptInput{Locale: "fr"}); err != nil {
		t.Fatalf("accept: %v", err)
	}

	scoped, err := svc.ExportConsentRegister(ctx, legalAdminID, ConsentExportInput{
		Filters: ExportFilters{Slug: "politique-confidentialite", UserID: legalReaderID},
	})
	if err != nil {
		t.Fatalf("export filtré: %v", err)
	}
	doc := parseExport(t, scoped.Document)
	if doc.Envelope.Scope != "user" {
		t.Fatalf("portée = %s, attendu user", doc.Envelope.Scope)
	}
	for _, a := range doc.Payload.Acceptances {
		if a["documentSlug"] != "politique-confidentialite" {
			t.Fatalf("filtre document non respecté: %v", a["documentSlug"])
		}
	}
	// Le périmètre est rejoué à l'identique lors d'une vérification : il doit
	// voyager dans l'export.
	if doc.Envelope.Filters.Slug != "politique-confidentialite" {
		t.Fatal("les filtres doivent être embarqués dans la pièce")
	}
}

func TestLegal_ExportRequiresSuperadmin(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)
	if _, err := svc.ExportConsentRegister(ctx, legalReaderID, ConsentExportInput{}); !IsForbidden(err) {
		t.Fatalf("un non-superadmin ne doit pas pouvoir exporter (err=%v)", err)
	}
	if _, err := svc.ListConsentExports(ctx, legalReaderID, 10); !IsForbidden(err) {
		t.Fatalf("registre réservé au superadmin (err=%v)", err)
	}
}

// Le contrat de contenu : l'export doit contenir le texte accepté, pas
// seulement la référence à une version que personne ne peut relire.
func TestLegal_ExportCarriesTheAcceptedText(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)
	cleanExportTables(t, ctx)
	signingKey(t, svc)

	result, err := svc.ExportConsentRegister(ctx, legalAdminID, ConsentExportInput{
		Filters: ExportFilters{Slug: "conditions-generales-utilisation"},
	})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	doc := parseExport(t, result.Document)
	found := false
	for _, v := range doc.Payload.Versions {
		body, _ := v["body"].(string)
		if len(body) > 200 && v["bodySha256"] != "" {
			found = true
		}
	}
	if !found {
		t.Fatal("aucune version exportée avec son texte et son empreinte")
	}
}
