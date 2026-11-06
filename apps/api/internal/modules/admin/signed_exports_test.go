package admin

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSignedExport_Audit(t *testing.T) {
	ctx := context.Background()
	svc := &Service{}
	staffID := uuid.New().String()

	doc, docBytes, err := svc.ExportSignedAudit(ctx, staffID, AuditExportInput{
		Subject: "Contrôle périodique",
		Reason:  "Audit de conformité interne",
		Limit:   50,
	})
	require.NoError(t, err)
	require.NotNil(t, doc)
	assert.NotEmpty(t, docBytes)

	// Vérifie l'enveloppe
	assert.Equal(t, "admin.audit", doc.Envelope.Scope)
	assert.Equal(t, "Ed25519", doc.Envelope.Algorithm)
	assert.NotEmpty(t, doc.Envelope.PublicKey)
	assert.NotEmpty(t, doc.Envelope.Signature)
	assert.NotEmpty(t, doc.Envelope.ContentSha256)
	assert.NotEmpty(t, doc.Envelope.ChainSha256)
	assert.Equal(t, staffID, doc.Envelope.RequestedBy)

	// Vérifie la validité du document scellé
	verdict, err := svc.VerifySignedExport(docBytes)
	require.NoError(t, err)
	assert.True(t, verdict.IsValid, "le document produit doit être valide: %s", verdict.Error)
	assert.Equal(t, "admin.audit", verdict.Scope)
}

func TestSignedExport_Subscribers(t *testing.T) {
	ctx := context.Background()
	svc := &Service{}
	staffID := uuid.New().String()

	doc, docBytes, err := svc.ExportSignedSubscribers(ctx, staffID, SubscriberExportInput{
		Subject: "Registre légal CNIL",
		Reason:  "Preuve de double opt-in",
		Limit:   100,
	})
	require.NoError(t, err)
	require.NotNil(t, doc)
	assert.NotEmpty(t, docBytes)

	assert.Equal(t, "subscribers", doc.Envelope.Scope)
	assert.Equal(t, "Ed25519", doc.Envelope.Algorithm)
	assert.NotEmpty(t, doc.Envelope.PublicKey)
	assert.NotEmpty(t, doc.Envelope.Signature)

	// Vérifie la validité du document scellé
	verdict, err := svc.VerifySignedExport(docBytes)
	require.NoError(t, err)
	assert.True(t, verdict.IsValid, "le document produit doit être valide: %s", verdict.Error)
	assert.Equal(t, "subscribers", verdict.Scope)
}

func TestSignedExport_DetectsTampering(t *testing.T) {
	ctx := context.Background()
	svc := &Service{}
	staffID := uuid.New().String()

	_, docBytes, err := svc.ExportSignedAudit(ctx, staffID, AuditExportInput{})
	require.NoError(t, err)

	// 1. Altération du payload
	var raw map[string]any
	require.NoError(t, json.Unmarshal(docBytes, &raw))

	payload := raw["payload"].(map[string]any)
	payload["tampered_entry"] = "fraudulent_data"
	tamperedBytes, err := json.Marshal(raw)
	require.NoError(t, err)

	verdict, err := svc.VerifySignedExport(tamperedBytes)
	require.NoError(t, err)
	assert.False(t, verdict.IsValid)
	assert.Contains(t, verdict.Error, "altéré")

	// 2. Altération de la signature
	raw["payload"] = docBytes // reset payload
	env := raw["envelope"].(map[string]any)
	env["signature"] = "deadbeef12345678"
	tamperedSigBytes, err := json.Marshal(raw)
	require.NoError(t, err)

	verdict2, err := svc.VerifySignedExport(tamperedSigBytes)
	require.NoError(t, err)
	assert.False(t, verdict2.IsValid)
}
