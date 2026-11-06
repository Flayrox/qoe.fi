package admin

// =====================================================================
// 🛡️ retention.go — Politiques de rétention & purge des tables (Lot D2)
// =====================================================================
// Déclare les politiques de conservation des données par table conformément
// à l'Art. 5(1)(e) RGPD (minimisation de la durée de conservation), exécute
// les purges planifiées ou manuelles avec garde d'intégrité, et consigne
// chaque purge de façon inaltérable dans le journal d'audit administratif.
// =====================================================================

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/qoefi/api/internal/response"
)

// TablePolicyDef définit la règle de conservation d'une table du système.
type TablePolicyDef struct {
	Table           string
	Label           string
	Purpose         string
	LegalBasis      string
	RetentionPeriod string
	PurgeRule       string
	CountTotalQuery string
	CountExpQuery   string
	PurgeQuery      string
	IsProtected     bool
}

// RetentionPolicyDTO représente la politique et l'état d'une table pour l'API admin.
type RetentionPolicyDTO struct {
	Table           string  `json:"table"`
	Label           string  `json:"label"`
	Purpose         string  `json:"purpose"`
	LegalBasis      string  `json:"legalBasis"`
	RetentionPeriod string  `json:"retentionPeriod"`
	PurgeRule       string  `json:"purgeRule"`
	TotalRows       int64   `json:"totalRows"`
	ExpiredRows     int64   `json:"expiredRows"`
	LastPurgeAt     *string `json:"lastPurgeAt,omitempty"`
	IsProtected     bool    `json:"isProtected"`
}

// RetentionPurgeInput est le corps de requête pour lancer une purge.
type RetentionPurgeInput struct {
	Table  *string `json:"table,omitempty"`
	DryRun bool    `json:"dryRun"`
}

// TablePurgeResult représente le bilan de purge d'une table.
type TablePurgeResult struct {
	Table       string `json:"table"`
	DeletedRows int64  `json:"deletedRows"`
	DurationMs  int64  `json:"durationMs"`
	Status      string `json:"status"`
	Error       string `json:"error,omitempty"`
}

// RetentionPurgeSummary résume l'exécution globale d'une opération de purge.
type RetentionPurgeSummary struct {
	PurgedAt        string             `json:"purgedAt"`
	DryRun          bool               `json:"dryRun"`
	TotalDeleted    int64              `json:"totalDeleted"`
	TotalDurationMs int64              `json:"totalDurationMs"`
	Results         []TablePurgeResult `json:"results"`
}

// RetentionJournalEntryDTO est une entrée du journal d'audit consacrée aux purges.
type RetentionJournalEntryDTO struct {
	ID         string         `json:"id"`
	ActorID    string         `json:"actorId"`
	ActorEmail string         `json:"actorEmail"`
	Table      string         `json:"table"`
	Deleted    int64          `json:"deleted"`
	DurationMs int64          `json:"durationMs"`
	DryRun     bool           `json:"dryRun"`
	CreatedAt  string         `json:"createdAt"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

// Registre exhaustif des politiques de conservation de la plateforme.
var platformRetentionPolicies = []TablePolicyDef{
	{
		Table:           "AbuseSignal",
		Label:           "Signaux anti-abus",
		Purpose:         "Indicateurs comportementaux temporaires (likes suspects, inscriptions rafale)",
		LegalBasis:      "RGPD Art. 6(1)(f) & Art. 5(1)(e) (minimisation stricte)",
		RetentionPeriod: "24h à 7 jours",
		PurgeRule:       "expiresAt <= NOW()",
		CountTotalQuery: `SELECT COUNT(*) FROM "AbuseSignal"`,
		CountExpQuery:   `SELECT COUNT(*) FROM "AbuseSignal" WHERE "expiresAt" <= NOW()`,
		PurgeQuery:      `DELETE FROM "AbuseSignal" WHERE "expiresAt" <= NOW()`,
		IsProtected:     false,
	},
	{
		Table:           "CapabilityBudget",
		Label:           "Budgets & plafonds d'usage",
		Purpose:         "Compteurs de requêtes et de modération par tranche calendaire",
		LegalBasis:      "RGPD Art. 6(1)(f) (protection déni de service et limitation de charge)",
		RetentionPeriod: "7 jours glissants",
		PurgeRule:       "window < NOW() - 7 jours",
		CountTotalQuery: `SELECT COUNT(*) FROM "CapabilityBudget"`,
		CountExpQuery:   `SELECT COUNT(*) FROM "CapabilityBudget" WHERE "window" < NOW() - INTERVAL '7 days'`,
		PurgeQuery:      `DELETE FROM "CapabilityBudget" WHERE "window" < NOW() - INTERVAL '7 days'`,
		IsProtected:     false,
	},
	{
		Table:           "FeatureSignal",
		Label:           "Télémétrie d'usage features",
		Purpose:         "Signaux d'adoption et interactions produit anonymisées",
		LegalBasis:      "RGPD Art. 6(1)(f) (analytics et optimisation des fonctionnalités)",
		RetentionPeriod: "180 jours",
		PurgeRule:       "createdAt < NOW() - 180 jours",
		CountTotalQuery: `SELECT COUNT(*) FROM "FeatureSignal"`,
		CountExpQuery:   `SELECT COUNT(*) FROM "FeatureSignal" WHERE "createdAt" < NOW() - INTERVAL '180 days'`,
		PurgeQuery:      `DELETE FROM "FeatureSignal" WHERE "createdAt" < NOW() - INTERVAL '180 days'`,
		IsProtected:     false,
	},
	{
		Table:           "NotificationDelivery",
		Label:           "Livraisons de notifications",
		Purpose:         "Traces techniques d'envoi et d'acheminement des notifications",
		LegalBasis:      "RGPD Art. 6(1)(b) (exécution des notifications utilisateur)",
		RetentionPeriod: "90 jours",
		PurgeRule:       "createdAt < NOW() - 90 jours",
		CountTotalQuery: `SELECT COUNT(*) FROM "NotificationDelivery"`,
		CountExpQuery:   `SELECT COUNT(*) FROM "NotificationDelivery" WHERE "createdAt" < NOW() - INTERVAL '90 days'`,
		PurgeQuery:      `DELETE FROM "NotificationDelivery" WHERE "createdAt" < NOW() - INTERVAL '90 days'`,
		IsProtected:     false,
	},
	{
		Table:           "WebhookDelivery",
		Label:           "Traces HTTP de webhooks",
		Purpose:         "Logs de livraison des événements API tiers et charges utiles associées",
		LegalBasis:      "RGPD Art. 6(1)(b) (service d'API pour intégrateurs)",
		RetentionPeriod: "30 jours",
		PurgeRule:       "createdAt < NOW() - 30 jours",
		CountTotalQuery: `SELECT COUNT(*) FROM "WebhookDelivery"`,
		CountExpQuery:   `SELECT COUNT(*) FROM "WebhookDelivery" WHERE "createdAt" < NOW() - INTERVAL '30 days'`,
		PurgeQuery:      `DELETE FROM "WebhookDelivery" WHERE "createdAt" < NOW() - INTERVAL '30 days'`,
		IsProtected:     false,
	},
	{
		Table:           "ReadingSession",
		Label:           "Sessions de lecture",
		Purpose:         "Historique technique des sessions et calcul du temps de lecture",
		LegalBasis:      "RGPD Art. 6(1)(f) (analytics de lectorat)",
		RetentionPeriod: "365 jours",
		PurgeRule:       "createdAt < NOW() - 365 jours",
		CountTotalQuery: `SELECT COUNT(*) FROM "ReadingSession"`,
		CountExpQuery:   `SELECT COUNT(*) FROM "ReadingSession" WHERE "createdAt" < NOW() - INTERVAL '365 days'`,
		PurgeQuery:      `DELETE FROM "ReadingSession" WHERE "createdAt" < NOW() - INTERVAL '365 days'`,
		IsProtected:     false,
	},
	{
		Table:           "FeedImpression",
		Label:           "Impressions du fil de lecture",
		Purpose:         "Télémétrie d'affichage d'articles dans le fil d'actualité",
		LegalBasis:      "RGPD Art. 6(1)(f) (optimisation algorithmique)",
		RetentionPeriod: "60 jours",
		PurgeRule:       "createdAt < NOW() - 60 jours",
		CountTotalQuery: `SELECT COUNT(*) FROM "FeedImpression"`,
		CountExpQuery:   `SELECT COUNT(*) FROM "FeedImpression" WHERE "createdAt" < NOW() - INTERVAL '60 days'`,
		PurgeQuery:      `DELETE FROM "FeedImpression" WHERE "createdAt" < NOW() - INTERVAL '60 days'`,
		IsProtected:     false,
	},
	{
		Table:           "MediaAsset",
		Label:           "Médias orphelins & périmés",
		Purpose:         "Fichiers temporaires ou supprimés en attente de purge définitive",
		LegalBasis:      "RGPD Art. 5(1)(e) (purge des données orphelines)",
		RetentionPeriod: "30 jours après échéance",
		PurgeRule:       "status = 'DRAFT_ORPHAN' ET purgeDueAt <= NOW()",
		CountTotalQuery: `SELECT COUNT(*) FROM "MediaAsset"`,
		CountExpQuery:   `SELECT COUNT(*) FROM "MediaAsset" WHERE "status" = 'DRAFT_ORPHAN' AND "purgeDueAt" IS NOT NULL AND "purgeDueAt" <= NOW()`,
		PurgeQuery:      `DELETE FROM "MediaAsset" WHERE "status" = 'DRAFT_ORPHAN' AND "purgeDueAt" IS NOT NULL AND "purgeDueAt" <= NOW()`,
		IsProtected:     false,
	},
	{
		Table:           "AccountDeletionRequest",
		Label:           "Demandes d'effacement traitées",
		Purpose:         "Registre des demandes de droit à l'oubli Art. 17 RGPD exécutées",
		LegalBasis:      "Prescription légale (1 an pour défense de droits en cas de contestation)",
		RetentionPeriod: "365 jours après purge",
		PurgeRule:       "status = 'PROCESSED' ET processedAt < NOW() - 365 jours",
		CountTotalQuery: `SELECT COUNT(*) FROM "AccountDeletionRequest"`,
		CountExpQuery:   `SELECT COUNT(*) FROM "AccountDeletionRequest" WHERE "status" = 'PROCESSED' AND "processedAt" IS NOT NULL AND "processedAt" < NOW() - INTERVAL '365 days'`,
		PurgeQuery:      `DELETE FROM "AccountDeletionRequest" WHERE "status" = 'PROCESSED' AND "processedAt" IS NOT NULL AND "processedAt" < NOW() - INTERVAL '365 days'`,
		IsProtected:     false,
	},
	{
		Table:           "AdminAuditLog",
		Label:           "Journal d'audit administratif",
		Purpose:         "Preuves d'actes d'administration, modération et purges de sécurité",
		LegalBasis:      "RGPD Art. 32 (sécurité des traitements) & prescription légale (5 ans)",
		RetentionPeriod: "5 ans (1825 jours)",
		PurgeRule:       "Conservation obligatoire — purge manuelle interdite",
		CountTotalQuery: `SELECT COUNT(*) FROM "AdminAuditLog"`,
		CountExpQuery:   `SELECT 0`,
		PurgeQuery:      "",
		IsProtected:     true,
	},
}

// ListRetentionPolicies calcule l'état actuel de rétention pour toutes les tables.
func (s *Service) ListRetentionPolicies(ctx context.Context) ([]RetentionPolicyDTO, error) {
	out := make([]RetentionPolicyDTO, 0, len(platformRetentionPolicies))

	for _, p := range platformRetentionPolicies {
		dto := RetentionPolicyDTO{
			Table:           p.Table,
			Label:           p.Label,
			Purpose:         p.Purpose,
			LegalBasis:      p.LegalBasis,
			RetentionPeriod: p.RetentionPeriod,
			PurgeRule:       p.PurgeRule,
			IsProtected:     p.IsProtected,
		}

		if s.pool != nil {
			var total int64
			if err := s.pool.QueryRow(ctx, p.CountTotalQuery).Scan(&total); err == nil {
				dto.TotalRows = total
			}

			if !p.IsProtected && p.CountExpQuery != "" {
				var expired int64
				if err := s.pool.QueryRow(ctx, p.CountExpQuery).Scan(&expired); err == nil {
					dto.ExpiredRows = expired
				}
			}

			// Récupère la date de dernière purge depuis l'audit
			var lastPurge time.Time
			err := s.pool.QueryRow(ctx,
				`SELECT "createdAt" FROM "AdminAuditLog" WHERE "action" = 'retention.purge' AND "targetId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
				p.Table,
			).Scan(&lastPurge)
			if err == nil {
				formatted := lastPurge.UTC().Format(time.RFC3339)
				dto.LastPurgeAt = &formatted
			}
		}

		out = append(out, dto)
	}

	return out, nil
}

// PurgeRetentionData exécute la purge contrôlée des lignes périmées d'une ou plusieurs tables.
func (s *Service) PurgeRetentionData(
	ctx context.Context,
	staffID string,
	in RetentionPurgeInput,
) (*RetentionPurgeSummary, error) {
	var targetPolicies []TablePolicyDef

	if in.Table != nil && strings.TrimSpace(*in.Table) != "" {
		tableName := strings.TrimSpace(*in.Table)
		var found *TablePolicyDef
		for _, p := range platformRetentionPolicies {
			if strings.EqualFold(p.Table, tableName) {
				found = &p
				break
			}
		}
		if found == nil {
			return nil, fmt.Errorf("table '%s' non reconnue dans le registre de rétention", tableName)
		}
		if found.IsProtected {
			return nil, fmt.Errorf("la table '%s' fait l'objet d'une protection légale renforcée et ne peut pas être purgée", tableName)
		}
		targetPolicies = []TablePolicyDef{*found}
	} else {
		for _, p := range platformRetentionPolicies {
			if !p.IsProtected && p.PurgeQuery != "" {
				targetPolicies = append(targetPolicies, p)
			}
		}
	}

	summary := &RetentionPurgeSummary{
		PurgedAt: time.Now().UTC().Format(time.RFC3339),
		DryRun:   in.DryRun,
		Results:  make([]TablePurgeResult, 0, len(targetPolicies)),
	}

	if s.pool == nil {
		return summary, nil
	}

	for _, p := range targetPolicies {
		start := time.Now()
		res := TablePurgeResult{
			Table:  p.Table,
			Status: "OK",
		}

		if in.DryRun {
			// En simulation, on compte uniquement les lignes qui seraient supprimées
			var expired int64
			err := s.pool.QueryRow(ctx, p.CountExpQuery).Scan(&expired)
			res.DurationMs = time.Since(start).Milliseconds()
			if err != nil {
				res.Status = "ERROR"
				res.Error = err.Error()
			} else {
				res.DeletedRows = expired
				summary.TotalDeleted += expired
			}
		} else {
			// Exécution réelle
			tag, err := s.pool.Exec(ctx, p.PurgeQuery)
			res.DurationMs = time.Since(start).Milliseconds()
			if err != nil {
				res.Status = "ERROR"
				res.Error = err.Error()
			} else {
				res.DeletedRows = tag.RowsAffected()
				summary.TotalDeleted += res.DeletedRows

				// Journalisation inconditionnelle de chaque purge dans AdminAuditLog
				s.logAudit(ctx, staffID, "retention.purge", "system", p.Table, map[string]any{
					"deleted":     res.DeletedRows,
					"duration_ms": res.DurationMs,
					"dry_run":     false,
					"policy":      p.RetentionPeriod,
				})
			}
		}

		summary.TotalDurationMs += res.DurationMs
		summary.Results = append(summary.Results, res)
	}

	return summary, nil
}

// GetRetentionJournal extrait le journal des opérations de purge récentes depuis AdminAuditLog.
func (s *Service) GetRetentionJournal(ctx context.Context, limit int) ([]RetentionJournalEntryDTO, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	if s.pool == nil {
		return []RetentionJournalEntryDTO{}, nil
	}

	query := `
		SELECT
			a."id",
			a."actorId",
			COALESCE(u."email", 'Système'),
			COALESCE(a."targetId", 'Toutes les tables'),
			a."metadata",
			a."createdAt"
		FROM "AdminAuditLog" a
		LEFT JOIN "User" u ON u."id" = a."actorId"
		WHERE a."action" = 'retention.purge'
		ORDER BY a."createdAt" DESC
		LIMIT $1
	`

	rows, err := s.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]RetentionJournalEntryDTO, 0)
	for rows.Next() {
		var (
			id         string
			actorID    string
			actorEmail string
			table      string
			metaJSON   []byte
			createdAt  time.Time
		)

		if err := rows.Scan(&id, &actorID, &actorEmail, &table, &metaJSON, &createdAt); err != nil {
			return nil, err
		}

		var meta map[string]any
		if len(metaJSON) > 0 {
			_ = json.Unmarshal(metaJSON, &meta)
		}

		var deleted int64
		if v, ok := meta["deleted"].(float64); ok {
			deleted = int64(v)
		}
		var duration int64
		if v, ok := meta["duration_ms"].(float64); ok {
			duration = int64(v)
		}
		var dryRun bool
		if v, ok := meta["dry_run"].(bool); ok {
			dryRun = v
		}

		entries = append(entries, RetentionJournalEntryDTO{
			ID:         id,
			ActorID:    actorID,
			ActorEmail: actorEmail,
			Table:      table,
			Deleted:    deleted,
			DurationMs: duration,
			DryRun:     dryRun,
			CreatedAt:  createdAt.UTC().Format(time.RFC3339),
			Metadata:   meta,
		})
	}

	return entries, nil
}

// ── Handlers HTTP ────────────────────────────────────────────────────────────

func (h *Handler) listRetentionPolicies(w http.ResponseWriter, r *http.Request) {
	policies, err := h.svc.ListRetentionPolicies(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": policies})
}

func (h *Handler) purgeRetentionData(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}

	var in RetentionPurgeInput
	if r.Body != nil && r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&in)
	}

	summary, err := h.svc.PurgeRetentionData(r.Context(), staffID, in)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}

	response.OK(w, summary)
}

func (h *Handler) getRetentionJournal(w http.ResponseWriter, r *http.Request) {
	journal, err := h.svc.GetRetentionJournal(r.Context(), 50)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": journal})
}
