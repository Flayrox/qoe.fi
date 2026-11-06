package admin

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRetention_ListPolicies(t *testing.T) {
	ctx := context.Background()
	svc := &Service{}

	policies, err := svc.ListRetentionPolicies(ctx)
	require.NoError(t, err)
	assert.NotEmpty(t, policies)

	// Vérifie la présence des tables clés et de leurs fondements légaux
	policyMap := make(map[string]RetentionPolicyDTO)
	for _, p := range policies {
		policyMap[p.Table] = p
		assert.NotEmpty(t, p.Label, "label obligatoire pour %s", p.Table)
		assert.NotEmpty(t, p.LegalBasis, "fondement légal obligatoire pour %s", p.Table)
		assert.NotEmpty(t, p.RetentionPeriod, "durée de rétention obligatoire pour %s", p.Table)
	}

	assert.Contains(t, policyMap, "AbuseSignal")
	assert.Contains(t, policyMap, "CapabilityBudget")
	assert.Contains(t, policyMap, "FeatureSignal")
	assert.Contains(t, policyMap, "NotificationDelivery")
	assert.Contains(t, policyMap, "WebhookDelivery")
	assert.Contains(t, policyMap, "ReadingSession")
	assert.Contains(t, policyMap, "FeedImpression")
	assert.Contains(t, policyMap, "MediaAsset")
	assert.Contains(t, policyMap, "AccountDeletionRequest")
	assert.Contains(t, policyMap, "AdminAuditLog")

	// La table d'audit doit obligatoirement être protégée contre toute purge
	assert.True(t, policyMap["AdminAuditLog"].IsProtected)
}

func TestRetention_PurgeProtectedForbidden(t *testing.T) {
	ctx := context.Background()
	svc := &Service{}
	staffID := uuid.New().String()

	tbl := "AdminAuditLog"
	_, err := svc.PurgeRetentionData(ctx, staffID, RetentionPurgeInput{
		Table: &tbl,
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "protection légale renforcée")
}

func TestRetention_PurgeUnknownTable(t *testing.T) {
	ctx := context.Background()
	svc := &Service{}
	staffID := uuid.New().String()

	tbl := "NonExistentTable_123"
	_, err := svc.PurgeRetentionData(ctx, staffID, RetentionPurgeInput{
		Table: &tbl,
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "non reconnue dans le registre")
}

func TestRetention_PurgeDryRun_NilPool(t *testing.T) {
	ctx := context.Background()
	svc := &Service{pool: nil}
	staffID := uuid.New().String()

	tbl := "AbuseSignal"
	res, err := svc.PurgeRetentionData(ctx, staffID, RetentionPurgeInput{
		Table:  &tbl,
		DryRun: true,
	})
	require.NoError(t, err)
	assert.True(t, res.DryRun)
}

func TestRetention_Journal_NilPool(t *testing.T) {
	ctx := context.Background()
	svc := &Service{pool: nil}

	journal, err := svc.GetRetentionJournal(ctx, 20)
	require.NoError(t, err)
	assert.Empty(t, journal)
}
