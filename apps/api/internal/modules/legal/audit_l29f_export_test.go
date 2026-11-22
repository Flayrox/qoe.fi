package legal

// Tests de non-régression L29f — export signé du registre de consentement :
// bornes refusées, pièce jamais tronquée, brouillons exclus, rotation de clé
// distinguée d'une altération.

import (
	"context"
	"encoding/base64"
	"strings"
	"testing"
)

// ─── Export signé ────────────────────────────────────────────────────

func TestLegal_ExportRejectsUnreadableBound(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)
	cleanExportTables(t, ctx)
	signingKey(t, svc)

	_, err := svc.ExportConsentRegister(ctx, legalAdminID, ConsentExportInput{
		Filters: ExportFilters{From: "2026-13-45"},
	})
	if !IsInvalid(err) {
		t.Fatalf("borne illisible acceptée (err=%v), attendu errInvalid", err)
	}
}

func TestLegal_ExportRefusesSilentTruncation(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)
	cleanExportTables(t, ctx)
	signingKey(t, svc)

	for _, slug := range []string{"conditions-generales-utilisation", "politique-confidentialite"} {
		if _, err := svc.Accept(ctx, legalReaderID, slug, AcceptInput{Locale: "fr"}); err != nil {
			t.Fatalf("accept %s: %v", slug, err)
		}
	}
	// maxRows=1 avec deux preuves : l'export ne peut pas être complet.
	_, err := svc.ExportConsentRegister(ctx, legalAdminID, ConsentExportInput{
		Filters: ExportFilters{MaxRows: 1},
	})
	if !IsInvalid(err) {
		t.Fatalf("export tronqué silencieusement accepté (err=%v), attendu errInvalid", err)
	}
}

func TestLegal_ExportExcludesDrafts(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)
	cleanExportTables(t, ctx)
	signingKey(t, svc)

	doc, err := svc.q.GetLegalDocumentBySlug(ctx, "conditions-generales-utilisation")
	if err != nil {
		t.Fatalf("document: %v", err)
	}
	if _, err := svc.CreateVersion(ctx, legalAdminID, doc.ID, SaveVersionInput{
		Locale: "fr", Version: "9.9.9-audit", Title: "Brouillon interne",
		Body: "SECRET-BROUILLON-NON-OPPOSABLE",
	}); err != nil {
		t.Fatalf("create version: %v", err)
	}

	res, err := svc.ExportConsentRegister(ctx, legalAdminID, ConsentExportInput{})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	if strings.Contains(string(res.Document), "SECRET-BROUILLON-NON-OPPOSABLE") ||
		strings.Contains(string(res.Document), "9.9.9-audit") {
		t.Fatal("un brouillon non publié figure dans l'export signé remis à un tiers")
	}
}

func TestLegal_VerifyRotationIsNotTampering(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)
	cleanExportTables(t, ctx)
	signingKey(t, svc)

	if _, err := svc.ExportConsentRegister(ctx, legalAdminID, ConsentExportInput{}); err != nil {
		t.Fatalf("export: %v", err)
	}
	// Rotation : la pièce a été signée avec une autre clé, elle n'est pas
	// altérée pour autant. Le verdict doit le dire sans accuser la donnée.
	rotated := make([]byte, 32)
	for i := range rotated {
		rotated[i] = byte(200 - i)
	}
	svc.SetExportSigningKey(base64.StdEncoding.EncodeToString(rotated))

	verdict, err := svc.VerifyConsentExports(ctx, legalAdminID)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if len(verdict.Broken) != 1 {
		t.Fatalf("maillons en défaut = %d, attendu 1", len(verdict.Broken))
	}
	reason := verdict.Broken[0].Reason
	if strings.Contains(reason, "signature Ed25519 invalide") {
		t.Fatalf("rotation de clé signalée comme altération : %q", reason)
	}
	if !strings.Contains(reason, "clé") {
		t.Fatalf("motif inattendu pour une pièce signée avec une autre clé : %q", reason)
	}
}
