package admin

// =====================================================================
// 🎯 service_slo.go — SLO & Alertes par surface opérationnelle (Lot D4)
// =====================================================================
// Mesure continue et objective des 4 surfaces vitales de la plateforme :
//   1. Latence API & Base de données (Postgres round-trip & p95)
//   2. Disponibilité & Taux d'erreur (budget d'erreur 99.9%, décisions 5xx/4xx)
//   3. Boîte d'envoi (Outbox NotificationDelivery : retard, profondeur, échecs)
//   4. Schéma & Migrations (table goose_db_version vs version binaire attendue)
//
// Génère des alertes qualifiées (Nominal / Warning / Critical) avec
// diagnostic précis et recommandations d'action pour le cockpit.
// =====================================================================

import (
	"context"
	"fmt"
	"math"
	"time"
)

const (
	ExpectedMigrationVersion int64 = 74
)

type SLOStatus string

const (
	SLONominal  SLOStatus = "nominal"
	SLOWarning  SLOStatus = "warning"
	SLOCritical SLOStatus = "critical"
)

type AlertSeverity string

const (
	AlertCritical AlertSeverity = "critical"
	AlertWarning  AlertSeverity = "warning"
	AlertInfo     AlertSeverity = "info"
)

type PlatformAlert struct {
	ID             string        `json:"id"`
	Severity       AlertSeverity `json:"severity"`
	Surface        string        `json:"surface"`
	Title          string        `json:"title"`
	Message        string        `json:"message"`
	Recommendation string        `json:"recommendation"`
	TriggeredAt    string        `json:"triggeredAt"`
}

type SLOSurface struct {
	ID                   string         `json:"id"`
	Name                 string         `json:"name"`
	Target               string         `json:"target"`
	CurrentValue         string         `json:"currentValue"`
	Status               SLOStatus      `json:"status"`
	ErrorBudgetRemaining float64        `json:"errorBudgetRemaining"`
	Details              map[string]any `json:"details"`
}

type PlatformSLOReport struct {
	GeneratedAt  string          `json:"generatedAt"`
	GlobalStatus SLOStatus       `json:"globalStatus"`
	Surfaces     []SLOSurface    `json:"surfaces"`
	Alerts       []PlatformAlert `json:"alerts"`
}

func round2(val float64) float64 {
	return math.Round(val*100) / 100
}

func (s *Service) GetPlatformSLOReport(ctx context.Context) *PlatformSLOReport {
	now := time.Now().UTC()
	alerts := make([]PlatformAlert, 0)
	surfaces := make([]SLOSurface, 0, 4)

	// ── 1. Latence API & Postgres ──────────────────────────────────────────────
	var (
		pgLatencyMs int64
		pgOK        bool
		pgErr       string
	)

	if s != nil && s.pool != nil {
		start := time.Now()
		if err := s.pool.Ping(ctx); err != nil {
			pgErr = err.Error()
			pgLatencyMs = time.Since(start).Milliseconds()
		} else {
			pgOK = true
			pgLatencyMs = time.Since(start).Milliseconds()
		}
	} else {
		pgErr = "Base de données non raccordée"
	}

	latStatus := SLONominal
	latBudget := 100.0

	if !pgOK {
		latStatus = SLOCritical
		latBudget = 0.0
		alerts = append(alerts, PlatformAlert{
			ID:             "alert-pg-down",
			Severity:       AlertCritical,
			Surface:        "api_latency",
			Title:          "Base de données inaccessible",
			Message:        fmt.Sprintf("Postgres ne répond pas au ping de santé : %s", pgErr),
			Recommendation: "Vérifier le cluster PostgreSQL, la connectivité réseau et les pools de connexions.",
			TriggeredAt:    now.Format(time.RFC3339),
		})
	} else if pgLatencyMs > 500 {
		latStatus = SLOCritical
		latBudget = 15.0
		alerts = append(alerts, PlatformAlert{
			ID:             "alert-pg-latency-critical",
			Severity:       AlertCritical,
			Surface:        "api_latency",
			Title:          "Latence Postgres critique",
			Message:        fmt.Sprintf("Aller-retour mesuré à %d ms (seuil critique > 500 ms).", pgLatencyMs),
			Recommendation: "Inspecter les verrous actifs (pg_stat_activity) et l'I/O disque.",
			TriggeredAt:    now.Format(time.RFC3339),
		})
	} else if pgLatencyMs > 200 {
		latStatus = SLOWarning
		latBudget = 65.0
		alerts = append(alerts, PlatformAlert{
			ID:             "alert-pg-latency-warn",
			Severity:       AlertWarning,
			Surface:        "api_latency",
			Title:          "Latence Postgres dégradée",
			Message:        fmt.Sprintf("Aller-retour mesuré à %d ms (cible nominale < 200 ms).", pgLatencyMs),
			Recommendation: "Surveiller les requêtes lentes et la consommation de mémoire du pool.",
			TriggeredAt:    now.Format(time.RFC3339),
		})
	} else {
		// Nominal : décompte linéaire
		latBudget = round2(math.Max(70.0, 100.0-(float64(pgLatencyMs)/200.0)*30.0))
	}

	surfaces = append(surfaces, SLOSurface{
		ID:                   "api_latency",
		Name:                 "Latence API & Base",
		Target:               "p95 < 200 ms",
		CurrentValue:         fmt.Sprintf("%d ms", pgLatencyMs),
		Status:               latStatus,
		ErrorBudgetRemaining: latBudget,
		Details: map[string]any{
			"latencyMs": pgLatencyMs,
			"ok":        pgOK,
			"error":     pgErr,
		},
	})

	// ── 2. Disponibilité & Taux d'erreur (décisions 24h) ────────────────────────
	var (
		allowedDecisions int64
		deniedObserved   int64
		deniedEnforced   int64
	)

	if s != nil && s.pool != nil {
		_ = s.pool.QueryRow(ctx, `
			SELECT
			    COUNT(*) FILTER (WHERE "allowed")::bigint,
			    COUNT(*) FILTER (WHERE NOT "allowed" AND "mode" = 'observe')::bigint,
			    COUNT(*) FILTER (WHERE NOT "allowed" AND "mode" = 'enforce')::bigint
			  FROM "AdminAuthzDecision"
			 WHERE "createdAt" >= CURRENT_TIMESTAMP - interval '24 hours'`,
		).Scan(&allowedDecisions, &deniedObserved, &deniedEnforced)
	}

	totalDecisions := allowedDecisions + deniedObserved + deniedEnforced
	errStatus := SLONominal
	errBudget := 100.0
	availStr := "100.0 %"

	if totalDecisions > 0 {
		errorCount := deniedEnforced
		availPct := (float64(totalDecisions-errorCount) / float64(totalDecisions)) * 100.0
		availStr = fmt.Sprintf("%.2f %%", availPct)

		// Budget d'erreur calé sur 99.9% (marge d'erreur tolérée = 0.1%)
		errorRatio := float64(errorCount) / float64(totalDecisions)
		if errorRatio > 0.005 { // > 0.5% d'erreurs
			errStatus = SLOCritical
			errBudget = 0.0
			alerts = append(alerts, PlatformAlert{
				ID:             "alert-error-rate-critical",
				Severity:       AlertCritical,
				Surface:        "error_rate",
				Title:          "Taux d'erreur 5xx/Refus critique",
				Message:        fmt.Sprintf("Disponibilité mesurée à %.2f %% sur 24h (%d refus bloquants sur %d requêtes).", availPct, deniedEnforced, totalDecisions),
				Recommendation: "Consulter le journal des refus récents dans l'écran Santé / Décisions.",
				TriggeredAt:    now.Format(time.RFC3339),
			})
		} else if errorRatio > 0.001 { // > 0.1% d'erreurs
			errStatus = SLOWarning
			errBudget = round2(math.Max(10.0, (1.0-(errorRatio/0.005))*100.0))
			alerts = append(alerts, PlatformAlert{
				ID:             "alert-error-rate-warn",
				Severity:       AlertWarning,
				Surface:        "error_rate",
				Title:          "Budget d'erreur entamé",
				Message:        fmt.Sprintf("Le taux d'erreurs/refus (%.2f %%) dépasse l'objectif de 99.9 %%.", 100.0-availPct),
				Recommendation: "Vérifier si un rôle ou une clé API rencontre des refus d'autorisation répétés.",
				TriggeredAt:    now.Format(time.RFC3339),
			})
		} else {
			errBudget = round2(math.Max(80.0, (1.0-(errorRatio/0.001))*100.0))
		}
	}

	surfaces = append(surfaces, SLOSurface{
		ID:                   "error_rate",
		Name:                 "Disponibilité & Erreurs",
		Target:               "≥ 99.9 % sans 5xx",
		CurrentValue:         availStr,
		Status:               errStatus,
		ErrorBudgetRemaining: errBudget,
		Details: map[string]any{
			"totalDecisions": totalDecisions,
			"allowed":        allowedDecisions,
			"deniedEnforced": deniedEnforced,
			"deniedObserved": deniedObserved,
		},
	})

	// ── 3. Boîte d'envoi Outbox ────────────────────────────────────────────────
	var (
		outboxQueued        int64
		outboxProcessing    int64
		outboxFailed        int64
		outboxSent24h       int64
		oldestQueuedSeconds int64
	)

	if s != nil && s.pool != nil {
		_ = s.pool.QueryRow(ctx, `
			SELECT
			    COUNT(*) FILTER (WHERE "status" = 'QUEUED')::bigint,
			    COUNT(*) FILTER (WHERE "status" = 'PROCESSING')::bigint,
			    COUNT(*) FILTER (WHERE "status" = 'FAILED')::bigint,
			    COUNT(*) FILTER (WHERE "status" = 'SENT' AND "createdAt" >= CURRENT_TIMESTAMP - interval '24 hours')::bigint,
			    COALESCE(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MIN("createdAt") FILTER (WHERE "status" = 'QUEUED')))::bigint, 0)
			  FROM "NotificationDelivery"`).Scan(
			&outboxQueued,
			&outboxProcessing,
			&outboxFailed,
			&outboxSent24h,
			&oldestQueuedSeconds,
		)
	}

	outboxStatus := SLONominal
	outboxBudget := 100.0

	if oldestQueuedSeconds > 900 || outboxFailed > 50 { // > 15 min de lag ou > 50 échecs
		outboxStatus = SLOCritical
		outboxBudget = 0.0
		alerts = append(alerts, PlatformAlert{
			ID:             "alert-outbox-critical",
			Severity:       AlertCritical,
			Surface:        "outbox",
			Title:          "Boîte d'envoi asynchrone bloquée",
			Message:        fmt.Sprintf("Messages en attente depuis %d s (%d dans la file, %d en échec).", oldestQueuedSeconds, outboxQueued, outboxFailed),
			Recommendation: "Vérifier le worker 'email-delivery' et les identifiants SMTP/Resend.",
			TriggeredAt:    now.Format(time.RFC3339),
		})
	} else if oldestQueuedSeconds > 180 || outboxFailed > 10 || outboxQueued > 100 { // > 3 min ou accumulation
		outboxStatus = SLOWarning
		outboxBudget = round2(math.Max(20.0, 100.0-(float64(oldestQueuedSeconds)/900.0)*80.0))
		alerts = append(alerts, PlatformAlert{
			ID:             "alert-outbox-warn",
			Severity:       AlertWarning,
			Surface:        "outbox",
			Title:          "Ralentissement de livraison outbox",
			Message:        fmt.Sprintf("La file d'envoi cumule %d messages (délai le plus ancien : %d s).", outboxQueued, oldestQueuedSeconds),
			Recommendation: "Surveiller les quotas du fournisseur d'email et la vitesse de dépilage.",
			TriggeredAt:    now.Format(time.RFC3339),
		})
	} else {
		outboxBudget = 100.0
		if outboxQueued > 0 {
			outboxBudget = round2(math.Max(80.0, 100.0-(float64(oldestQueuedSeconds)/180.0)*20.0))
		}
	}

	surfaces = append(surfaces, SLOSurface{
		ID:                   "outbox",
		Name:                 "Boîte d'envoi (Outbox)",
		Target:               "Délai < 60 s, échecs < 1 %",
		CurrentValue:         fmt.Sprintf("%d en attente · %d livrés (24h)", outboxQueued, outboxSent24h),
		Status:               outboxStatus,
		ErrorBudgetRemaining: outboxBudget,
		Details: map[string]any{
			"queued":              outboxQueued,
			"processing":          outboxProcessing,
			"failed":              outboxFailed,
			"sent24h":             outboxSent24h,
			"oldestQueuedSeconds": oldestQueuedSeconds,
		},
	})

	// ── 4. Schéma & Migrations ────────────────────────────────────────────────
	var appliedMigration int64
	var migErr string

	if s != nil && s.pool != nil {
		if err := s.pool.QueryRow(ctx,
			`SELECT COALESCE(MAX(version_id), 0)::bigint FROM goose_db_version`).Scan(&appliedMigration); err != nil {
			migErr = err.Error()
		}
	} else {
		migErr = "Base non raccordée"
	}

	migStatus := SLONominal
	migBudget := 100.0
	migVal := fmt.Sprintf("v%d (à jour)", appliedMigration)

	if migErr != "" {
		migStatus = SLOCritical
		migBudget = 0.0
		migVal = "inconnue"
		alerts = append(alerts, PlatformAlert{
			ID:             "alert-migration-err",
			Severity:       AlertCritical,
			Surface:        "migration",
			Title:          "Impossible de lire les migrations appliquées",
			Message:        fmt.Sprintf("Erreur lors de la lecture de la table goose : %s", migErr),
			Recommendation: "Vérifier que la table 'goose_db_version' existe et est accessible en lecture.",
			TriggeredAt:    now.Format(time.RFC3339),
		})
	} else if appliedMigration < ExpectedMigrationVersion {
		drift := ExpectedMigrationVersion - appliedMigration
		migStatus = SLOCritical
		if drift == 1 {
			migStatus = SLOWarning
		}
		migBudget = 0.0
		migVal = fmt.Sprintf("v%d (retard : -%d)", appliedMigration, drift)
		alerts = append(alerts, PlatformAlert{
			ID:             "alert-migration-drift",
			Severity:       AlertCritical,
			Surface:        "migration",
			Title:          "Dérive de schéma détectée",
			Message:        fmt.Sprintf("Version appliquée en base : v%d, alors que le binaire attend la v%d.", appliedMigration, ExpectedMigrationVersion),
			Recommendation: "Appliquer les migrations SQL manquantes (goose up) pour rétablir la conformité de schéma.",
			TriggeredAt:    now.Format(time.RFC3339),
		})
	}

	surfaces = append(surfaces, SLOSurface{
		ID:                   "migration",
		Name:                 "Schéma & Migrations",
		Target:               fmt.Sprintf("0 dérive (v%d attendue)", ExpectedMigrationVersion),
		CurrentValue:         migVal,
		Status:               migStatus,
		ErrorBudgetRemaining: migBudget,
		Details: map[string]any{
			"applied":  appliedMigration,
			"expected": ExpectedMigrationVersion,
			"drift":    ExpectedMigrationVersion - appliedMigration,
		},
	})

	// ── Statut Global de la plateforme ─────────────────────────────────────────
	global := SLONominal
	for _, surf := range surfaces {
		if surf.Status == SLOCritical {
			global = SLOCritical
			break
		} else if surf.Status == SLOWarning && global != SLOCritical {
			global = SLOWarning
		}
	}

	return &PlatformSLOReport{
		GeneratedAt:  now.Format(time.RFC3339),
		GlobalStatus: global,
		Surfaces:     surfaces,
		Alerts:       alerts,
	}
}
