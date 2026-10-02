package admin

// =====================================================================
// 🗓️ Revue périodique des accès staff (plan console, Phase 8)
// =====================================================================
// « Qui détient quoi, jusqu'à quand » n'a de valeur que si quelqu'un le
// relit régulièrement. La console applique déjà l'échéance à la lecture
// (rôle échu gelé automatiquement, qui n'accorde plus aucune capacité) ;
// ce fichier apporte la mémoire et le rythme de la revue :
//
//   1. un instantané mensuel immuable (table "AdminAccessReview") écrit
//      par le travailleur d'arrière-plan ou déclenché par un administrateur ;
//   2. la synthèse en direct (rôles actifs, expirations imminentes à 30 jours,
//      rôles échus/gelés, répartition par rôle) ;
//   3. l'idempotence stricte sur la période 'AAAA-MM' : un redémarrage
//      ou une exécution quotidienne ne fabrique aucun doublon.
// =====================================================================

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// ErrInvalidPeriod est retourné quand une période ne respecte pas le format AAAA-MM.
var ErrInvalidPeriod = fmt.Errorf("%w : période de revue invalide (format AAAA-MM attendu)", errInvalidAccess)

// ErrReviewNotFound est retourné quand une revue demandée n'existe pas en base.
var ErrReviewNotFound = errors.New("revue d'accès introuvable")

var periodRegex = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

// AccessRoleCount compte les détenteurs actifs d'un rôle dans la revue.
type AccessRoleCount struct {
	RoleKey   string `json:"roleKey"`
	RoleLabel string `json:"roleLabel"`
	Count     int    `json:"count"`
}

// AccessReviewReport est le contenu complet de l'instantané périodique des accès.
type AccessReviewReport struct {
	Period            string            `json:"period"`
	GeneratedAt       string            `json:"generatedAt"`
	TotalStaff        int               `json:"totalStaff"`
	ActiveGrants      int               `json:"activeGrants"`
	ExpiredGrants     int               `json:"expiredGrants"`
	ExpiringSoon      int               `json:"expiringSoon"`
	RolesDistribution []AccessRoleCount `json:"rolesDistribution"`
	ExpiringList      []AccessGrant     `json:"expiringList"`
	ExpiredList       []AccessGrant     `json:"expiredList"`
}

// AccessReview est une ligne archivée dans "AdminAccessReview".
type AccessReview struct {
	ID        string             `json:"id"`
	Period    string             `json:"period"`
	Report    AccessReviewReport `json:"report"`
	CreatedAt string             `json:"createdAt"`
}

const reviewTotalStaffQuery = `
	SELECT COUNT(DISTINCT u."id")
	  FROM "User" u
	  LEFT JOIN "AdminUserRole" ur ON ur."userId" = u."id"
	 WHERE u."role" = 'superadmin'
	    OR (ur."userId" IS NOT NULL AND (ur."expiresAt" IS NULL OR ur."expiresAt" > CURRENT_TIMESTAMP))`

const reviewActiveGrantsQuery = `
	SELECT COUNT(*)
	  FROM "AdminUserRole"
	 WHERE "expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP`

const reviewExpiredGrantsQuery = `
	SELECT COUNT(*)
	  FROM "AdminUserRole"
	 WHERE "expiresAt" IS NOT NULL AND "expiresAt" <= CURRENT_TIMESTAMP`

const reviewExpiringSoonQuery = `
	SELECT COUNT(*)
	  FROM "AdminUserRole"
	 WHERE "expiresAt" IS NOT NULL
	   AND "expiresAt" > CURRENT_TIMESTAMP
	   AND "expiresAt" <= CURRENT_TIMESTAMP + INTERVAL '30 days'`

const reviewRoleDistributionQuery = `
	SELECT r."key", r."label",
	       COUNT(ur."userId") FILTER (WHERE ur."expiresAt" IS NULL OR ur."expiresAt" > CURRENT_TIMESTAMP) AS active_count
	  FROM "AdminRole" r
	  LEFT JOIN "AdminUserRole" ur ON ur."roleKey" = r."key"
	 GROUP BY r."key", r."label"
	 ORDER BY active_count DESC, r."key" ASC`

const reviewExpiringListQuery = `
	SELECT ur."userId", u."email", u."name", u."username",
	       ur."roleKey", r."label", r."isSystem",
	       ur."grantedBy", ur."grantedAt", ur."expiresAt",
	       FALSE AS expired
	  FROM "AdminUserRole" ur
	  JOIN "User" u ON u."id" = ur."userId"
	  JOIN "AdminRole" r ON r."key" = ur."roleKey"
	 WHERE ur."expiresAt" IS NOT NULL
	   AND ur."expiresAt" > CURRENT_TIMESTAMP
	   AND ur."expiresAt" <= CURRENT_TIMESTAMP + INTERVAL '30 days'
	 ORDER BY ur."expiresAt" ASC
	 LIMIT 100`

const reviewExpiredListQuery = `
	SELECT ur."userId", u."email", u."name", u."username",
	       ur."roleKey", r."label", r."isSystem",
	       ur."grantedBy", ur."grantedAt", ur."expiresAt",
	       TRUE AS expired
	  FROM "AdminUserRole" ur
	  JOIN "User" u ON u."id" = ur."userId"
	  JOIN "AdminRole" r ON r."key" = ur."roleKey"
	 WHERE ur."expiresAt" IS NOT NULL
	   AND ur."expiresAt" <= CURRENT_TIMESTAMP
	 ORDER BY ur."expiresAt" DESC
	 LIMIT 100`

const reviewInsertQuery = `
	INSERT INTO "AdminAccessReview" ("id", "period", "report", "createdAt")
	VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
	ON CONFLICT ("period") DO UPDATE
	   SET "report" = EXCLUDED."report",
	       "createdAt" = CURRENT_TIMESTAMP
	RETURNING "id", "period", "report", "createdAt"`

const reviewGetByPeriodQuery = `
	SELECT "id", "period", "report", "createdAt"
	  FROM "AdminAccessReview"
	 WHERE "period" = $1`

const reviewListQuery = `
	SELECT "id", "period", "report", "createdAt"
	  FROM "AdminAccessReview"
	 ORDER BY "period" DESC
	 LIMIT $1`

// ComputeAccessReviewReport calcule l'instantané des accès en direct.
func (s *Service) ComputeAccessReviewReport(ctx context.Context, period string) (*AccessReviewReport, error) {
	pool, err := s.requirePool()
	if err != nil {
		return nil, err
	}
	if period == "" {
		period = time.Now().UTC().Format("2006-01")
	}
	if !periodRegex.MatchString(period) {
		return nil, ErrInvalidPeriod
	}

	report := &AccessReviewReport{
		Period:            period,
		GeneratedAt:       time.Now().UTC().Format(time.RFC3339),
		RolesDistribution: make([]AccessRoleCount, 0),
		ExpiringList:      make([]AccessGrant, 0),
		ExpiredList:       make([]AccessGrant, 0),
	}

	if err := pool.QueryRow(ctx, reviewTotalStaffQuery).Scan(&report.TotalStaff); err != nil {
		return nil, err
	}
	if err := pool.QueryRow(ctx, reviewActiveGrantsQuery).Scan(&report.ActiveGrants); err != nil {
		return nil, err
	}
	if err := pool.QueryRow(ctx, reviewExpiredGrantsQuery).Scan(&report.ExpiredGrants); err != nil {
		return nil, err
	}
	if err := pool.QueryRow(ctx, reviewExpiringSoonQuery).Scan(&report.ExpiringSoon); err != nil {
		return nil, err
	}

	// Répartition des rôles
	roleRows, err := pool.Query(ctx, reviewRoleDistributionQuery)
	if err != nil {
		return nil, err
	}
	defer roleRows.Close()
	for roleRows.Next() {
		var rc AccessRoleCount
		if err := roleRows.Scan(&rc.RoleKey, &rc.RoleLabel, &rc.Count); err != nil {
			return nil, err
		}
		report.RolesDistribution = append(report.RolesDistribution, rc)
	}
	if err := roleRows.Err(); err != nil {
		return nil, err
	}

	// Liste des échéances imminentes (30 jours)
	expiringRows, err := pool.Query(ctx, reviewExpiringListQuery)
	if err != nil {
		return nil, err
	}
	defer expiringRows.Close()
	expiringGrants, err := collectGrants(expiringRows, 16)
	if err != nil {
		return nil, err
	}
	report.ExpiringList = expiringGrants

	// Liste des rôles échus
	expiredRows, err := pool.Query(ctx, reviewExpiredListQuery)
	if err != nil {
		return nil, err
	}
	defer expiredRows.Close()
	expiredGrants, err := collectGrants(expiredRows, 16)
	if err != nil {
		return nil, err
	}
	report.ExpiredList = expiredGrants

	return report, nil
}

// SnapshotAccessReview génère et enregistre la revue mensuelle dans AdminAccessReview.
// Idempotente : si force est false et qu'une revue existe déjà pour cette période,
// la revue existante est retournée telle quelle sans réécriture.
func (s *Service) SnapshotAccessReview(ctx context.Context, period string, force bool) (*AccessReview, error) {
	pool, err := s.requirePool()
	if err != nil {
		return nil, err
	}
	if period == "" {
		period = time.Now().UTC().Format("2006-01")
	}
	if !periodRegex.MatchString(period) {
		return nil, ErrInvalidPeriod
	}

	if !force {
		existing, err := s.GetAccessReview(ctx, period)
		if err == nil && existing != nil {
			return existing, nil
		}
		if err != nil && !errors.Is(err, ErrReviewNotFound) {
			return nil, err
		}
	}

	report, err := s.ComputeAccessReviewReport(ctx, period)
	if err != nil {
		return nil, err
	}

	reportJSON, err := json.Marshal(report)
	if err != nil {
		return nil, fmt.Errorf("sérialisation du rapport: %w", err)
	}

	reviewID := generateReviewID(period)
	var (
		res         AccessReview
		rawReport   []byte
		createdAtTs pgtype.Timestamp
	)

	err = pool.QueryRow(ctx, reviewInsertQuery, reviewID, period, string(reportJSON)).
		Scan(&res.ID, &res.Period, &rawReport, &createdAtTs)
	if err != nil {
		return nil, fmt.Errorf("enregistrement de la revue: %w", err)
	}

	if err := json.Unmarshal(rawReport, &res.Report); err != nil {
		return nil, fmt.Errorf("désérialisation du rapport enregistré: %w", err)
	}
	if createdAtTs.Valid {
		res.CreatedAt = createdAtTs.Time.UTC().Format(time.RFC3339)
	}

	return &res, nil
}

// GetAccessReview récupère une revue mensuelle enregistrée pour la période indiquée.
func (s *Service) GetAccessReview(ctx context.Context, period string) (*AccessReview, error) {
	pool, err := s.requirePool()
	if err != nil {
		return nil, err
	}
	if !periodRegex.MatchString(period) {
		return nil, ErrInvalidPeriod
	}

	var (
		res         AccessReview
		rawReport   []byte
		createdAtTs pgtype.Timestamp
	)

	err = pool.QueryRow(ctx, reviewGetByPeriodQuery, period).
		Scan(&res.ID, &res.Period, &rawReport, &createdAtTs)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrReviewNotFound
		}
		return nil, err
	}

	if err := json.Unmarshal(rawReport, &res.Report); err != nil {
		return nil, fmt.Errorf("désérialisation du rapport: %w", err)
	}
	if createdAtTs.Valid {
		res.CreatedAt = createdAtTs.Time.UTC().Format(time.RFC3339)
	}

	return &res, nil
}

// ListAccessReviews liste les revues mensuelles enregistrées, de la plus récente à la plus ancienne.
func (s *Service) ListAccessReviews(ctx context.Context, limit int) ([]AccessReview, error) {
	pool, err := s.requirePool()
	if err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 100 {
		limit = 24
	}

	rows, err := pool.Query(ctx, reviewListQuery, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]AccessReview, 0, 12)
	for rows.Next() {
		var (
			rev         AccessReview
			rawReport   []byte
			createdAtTs pgtype.Timestamp
		)
		if err := rows.Scan(&rev.ID, &rev.Period, &rawReport, &createdAtTs); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(rawReport, &rev.Report); err != nil {
			return nil, fmt.Errorf("désérialisation du rapport pour %s: %w", rev.Period, err)
		}
		if createdAtTs.Valid {
			rev.CreatedAt = createdAtTs.Time.UTC().Format(time.RFC3339)
		}
		out = append(out, rev)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return out, nil
}

// generateReviewID produit un identifiant lisible et unique pour la revue d'accès.
func generateReviewID(period string) string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return fmt.Sprintf("rev_%s_%s", period, hex.EncodeToString(b))
}
