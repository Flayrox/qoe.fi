package admin

// =====================================================================
// 🧾 Audit lisible et journal des refus (plan console, Phase 4)
// =====================================================================
// Deux lectures, deux questions :
//   - « qui a fait quoi ? » → le journal d'audit, filtré par acteur, capacité,
//     cible, action et période, avec le MOTIF et le diff avant/après quand ils
//     existent ;
//   - « qui a été refusé, et le serait-on encore ? » → les décisions du garde
//     (table "AdminAuthzDecision" alimentée par internal/adminauthz), groupées
//     par capacité : c'est la donnée qui décide du passage en `authz-enforce`.
//
// L'autorité de ces lectures est la CAPACITÉ de la route (`admin.audit.read`),
// pas un test de rôle enfoui : un analyste doit pouvoir lire l'audit sans être
// superadmin. Les services correspondants ne rappellent donc PAS
// checkSuperadmin — le garde HTTP est le seul juge, et l'interface ajoute sa
// propre couche.
//
// SQL écrit à la main : les colonnes ajoutées par 00057 (capacité, motif, diff)
// n'existent pas dans le sqlc généré, et une relecture d'audit supporte mal un
// schéma intermédiaire. Les filtres sont tous optionnels ; aucune entrée n'est
// devinée.
// =====================================================================

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// AuditFilter borne une lecture du journal d'audit. Tous les champs sont
// optionnels ; une période vide = tout l'historique (dans la limite de la
// fenêtre rendue).
type AuditFilter struct {
	// Actor : identifiant exact, email, nom ou pseudonyme (sous-chaîne).
	Actor string
	// Capability : capacité exacte (`admin.users.moderate`).
	Capability string
	// Action : sous-chaîne de l'action (`access.grant`, `moderation.`).
	Action string
	// Target : sous-chaîne de la cible (identifiant, email du sujet).
	Target string
	// Since / Until : bornes RFC3339 ou AAAA-MM-JJ, optionnelles.
	Since string
	Until string
	Limit int32
}

const auditEntriesQuery = `
	SELECT l."id", l."actorId", u."name", COALESCE(u."email", ''), l."action",
	       l."targetType", l."targetId", l."metadata",
	       l."capability", l."proofLevel", l."requestId", l."ip", l."reason",
	       l."before", l."after", l."createdAt"
	  FROM "AdminAuditLog" l
	  LEFT JOIN "User" u ON u."id" = l."actorId"
	 WHERE ($1::text = '' OR u."email" ILIKE $2 OR COALESCE(u."name", '') ILIKE $2
	        OR COALESCE(u."username", '') ILIKE $2 OR l."actorId"::text = $1)
	   AND ($3::text = '' OR l."capability" = $3)
	   AND ($4::text = '' OR l."action" ILIKE $5)
	   AND ($6::text = '' OR COALESCE(l."targetId", '') ILIKE $7)
	   AND ($8::timestamp IS NULL OR l."createdAt" >= $8::timestamp)
	   AND ($9::timestamp IS NULL OR l."createdAt" <= $9::timestamp)
	 ORDER BY l."createdAt" DESC
	 LIMIT $10`

const auditDecisionSummaryQuery = `
	SELECT "capability", "allowed", "mode", "code", COUNT(*) AS total,
	       MAX("createdAt") AS last_at
	  FROM "AdminAuthzDecision"
	 WHERE ($1::timestamp IS NULL OR "createdAt" >= $1::timestamp)
	 GROUP BY "capability", "allowed", "mode", "code"
	 ORDER BY total DESC`

const auditDecisionsQuery = `
	SELECT d."id", d."userId", COALESCE(u."email", ''), d."capability", d."allowed",
	       d."code", d."mode", d."proofLevel", d."method", d."path", d."ip",
	       d."requestId", d."createdAt"
	  FROM "AdminAuthzDecision" d
	  LEFT JOIN "User" u ON u."id" = d."userId"
	 WHERE ($1::text = '' OR d."capability" = $1)
	   AND (NOT $2::boolean OR d."allowed" = false)
	   AND ($3::text = '' OR d."userId"::text = $3)
	   AND ($4::timestamp IS NULL OR d."createdAt" >= $4::timestamp)
	 ORDER BY d."createdAt" DESC
	 LIMIT $5`

// AdminAuditEntry est une ligne du journal, enrichie des colonnes de 00057.
// Les ajouts sont nullables : une action qui ne déclare pas sa capacité ne
// prétend pas en avoir une.
type AdminAuditEntry struct {
	ID         string          `json:"id"`
	ActorID    string          `json:"actorId"`
	ActorName  *string         `json:"actorName"`
	ActorEmail string          `json:"actorEmail"`
	Action     string          `json:"action"`
	TargetType string          `json:"targetType"`
	TargetID   *string         `json:"targetId"`
	Metadata   json.RawMessage `json:"metadata"`
	Capability *string         `json:"capability"`
	ProofLevel *string         `json:"proofLevel"`
	RequestID  *string         `json:"requestId"`
	IP         *string         `json:"ip"`
	Reason     *string         `json:"reason"`
	Before     json.RawMessage `json:"before"`
	After      json.RawMessage `json:"after"`
	CreatedAt  string          `json:"createdAt"`
}

// AuthzDecisionEntry est une décision du garde, telle qu'elle est écrite.
type AuthzDecisionEntry struct {
	ID         string  `json:"id"`
	UserID     *string `json:"userId"`
	Email      string  `json:"email"`
	Capability string  `json:"capability"`
	Allowed    bool    `json:"allowed"`
	Code       string  `json:"code"`
	Mode       string  `json:"mode"`
	ProofLevel *string `json:"proofLevel"`
	Method     string  `json:"method"`
	Path       string  `json:"path"`
	IP         *string `json:"ip"`
	RequestID  *string `json:"requestId"`
	CreatedAt  string  `json:"createdAt"`
}

// AuthzDecisionGroup agrège les décisions d'une capacité : ce qu'il faut savoir
// avant d'armer le mode refus (combien d'accords, combien de refus, quand).
type AuthzDecisionGroup struct {
	Capability string `json:"capability"`
	Allowed    bool   `json:"allowed"`
	Mode       string `json:"mode"`
	Code       string `json:"code"`
	Total      int64  `json:"total"`
	LastAt     string `json:"lastAt"`
}

// parseAuditTime lit une borne RFC3339 ou AAAA-MM-JJ. Vide → NULL (pas de
// borne). Illisible → erreur explicite : on ne devine jamais une période.
func parseAuditTime(raw string) (pgtype.Timestamp, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return pgtype.Timestamp{}, nil
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return pgtype.Timestamp{Time: t.UTC(), Valid: true}, nil
	}
	if t, err := time.Parse("2006-01-02", raw); err == nil {
		return pgtype.Timestamp{Time: t.UTC(), Valid: true}, nil
	}
	return pgtype.Timestamp{}, fmt.Errorf("%w : période illisible (RFC3339 ou AAAA-MM-JJ attendu)", errInvalidAccess)
}

// ListAuditEntries lit le journal d'audit filtré. La capacité `admin.audit.read`
// est vérifiée par le garde de route ; ce service ne réintroduit pas de test de
// rôle.
func (s *Service) ListAuditEntries(ctx context.Context, f AuditFilter) ([]AdminAuditEntry, error) {
	pool, err := s.requirePool()
	if err != nil {
		return nil, err
	}
	if f.Limit <= 0 || f.Limit > 500 {
		f.Limit = 100
	}
	since, err := parseAuditTime(f.Since)
	if err != nil {
		return nil, err
	}
	until, err := parseAuditTime(f.Until)
	if err != nil {
		return nil, err
	}
	rows, err := pool.Query(ctx, auditEntriesQuery,
		strings.TrimSpace(f.Actor), "%"+strings.TrimSpace(f.Actor)+"%",
		strings.TrimSpace(f.Capability),
		strings.TrimSpace(f.Action), "%"+strings.TrimSpace(f.Action)+"%",
		strings.TrimSpace(f.Target), "%"+strings.TrimSpace(f.Target)+"%",
		since, until, f.Limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]AdminAuditEntry, 0, f.Limit)
	for rows.Next() {
		var (
			entry      AdminAuditEntry
			actorID    pgtype.UUID
			actorName  pgtype.Text
			targetID   pgtype.Text
			metadata   []byte
			capability pgtype.Text
			proofLevel pgtype.Text
			requestID  pgtype.Text
			ip         pgtype.Text
			reason     pgtype.Text
			before     []byte
			after      []byte
			createdAt  pgtype.Timestamp
		)
		if err := rows.Scan(&entry.ID, &actorID, &actorName, &entry.ActorEmail, &entry.Action,
			&entry.TargetType, &targetID, &metadata,
			&capability, &proofLevel, &requestID, &ip, &reason,
			&before, &after, &createdAt); err != nil {
			return nil, err
		}
		entry.ActorID = uuidString(actorID)
		entry.ActorName = textPtr(actorName)
		entry.TargetID = textPtr(targetID)
		if len(metadata) > 0 {
			entry.Metadata = json.RawMessage(metadata)
		}
		entry.Capability = textPtr(capability)
		entry.ProofLevel = textPtr(proofLevel)
		entry.RequestID = textPtr(requestID)
		entry.IP = textPtr(ip)
		entry.Reason = textPtr(reason)
		if len(before) > 0 {
			entry.Before = json.RawMessage(before)
		}
		if len(after) > 0 {
			entry.After = json.RawMessage(after)
		}
		if createdAt.Valid {
			entry.CreatedAt = createdAt.Time.UTC().Format(time.RFC3339)
		}
		out = append(out, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// AuditCSV rend le journal en CSV : c'est la forme qu'on joint à un dossier ou
// qu'on ouvre dans un tableur, et elle doit sortir du serveur (pas d'export
// navigateur qui perdrait les colonnes). Les champs sont échappés par
// encoding/csv, jamais concaténés à la main.
func AuditCSV(entries []AdminAuditEntry) (string, error) {
	var buf strings.Builder
	writer := csv.NewWriter(&buf)
	writer.Comma = ';'
	header := []string{"createdAt", "actorId", "actorEmail", "action", "targetType", "targetId",
		"capability", "proofLevel", "reason", "requestId", "ip", "metadata", "before", "after"}
	if err := writer.Write(header); err != nil {
		return "", err
	}
	for _, entry := range entries {
		row := []string{
			entry.CreatedAt, entry.ActorID, entry.ActorEmail, entry.Action, entry.TargetType,
			deref(entry.TargetID), deref(entry.Capability), deref(entry.ProofLevel), deref(entry.Reason),
			deref(entry.RequestID), deref(entry.IP), string(entry.Metadata), string(entry.Before), string(entry.After),
		}
		if err := writer.Write(row); err != nil {
			return "", err
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// AuthzDecisionFilter borne la lecture du journal des décisions.
type AuthzDecisionFilter struct {
	Capability string
	// OnlyDenied : ne garder que les refus (le cas d'usage « préparer le
	// passage en enforce »).
	OnlyDenied bool
	// UserID : décisions visant une personne précise.
	UserID string
	// Window : fenêtre glissante en heures (0 = tout).
	Window time.Duration
	Limit  int32
}

// ListAuthzDecisionGroups agrège les décisions par (capacité, issue, mode, code),
// du plus fréquent au moins fréquent : la lecture « qu'est-ce qui serait bloqué »
// avant le passage en refus.
func (s *Service) ListAuthzDecisionGroups(ctx context.Context, window time.Duration) ([]AuthzDecisionGroup, error) {
	pool, err := s.requirePool()
	if err != nil {
		return nil, err
	}
	since := pgtype.Timestamp{}
	if window > 0 {
		since = pgtype.Timestamp{Time: time.Now().Add(-window).UTC(), Valid: true}
	}
	rows, err := pool.Query(ctx, auditDecisionSummaryQuery, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]AuthzDecisionGroup, 0, 32)
	for rows.Next() {
		var (
			group  AuthzDecisionGroup
			lastAt pgtype.Timestamp
		)
		if err := rows.Scan(&group.Capability, &group.Allowed, &group.Mode, &group.Code, &group.Total, &lastAt); err != nil {
			return nil, err
		}
		if lastAt.Valid {
			group.LastAt = lastAt.Time.UTC().Format(time.RFC3339)
		}
		out = append(out, group)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// ListAuthzDecisions lit les décisions individuelles (les plus récentes).
func (s *Service) ListAuthzDecisions(ctx context.Context, f AuthzDecisionFilter) ([]AuthzDecisionEntry, error) {
	pool, err := s.requirePool()
	if err != nil {
		return nil, err
	}
	if f.Limit <= 0 || f.Limit > 500 {
		f.Limit = 100
	}
	since := pgtype.Timestamp{}
	if f.Window > 0 {
		since = pgtype.Timestamp{Time: time.Now().Add(-f.Window).UTC(), Valid: true}
	}
	rows, err := pool.Query(ctx, auditDecisionsQuery,
		strings.TrimSpace(f.Capability), f.OnlyDenied, strings.TrimSpace(f.UserID), since, f.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]AuthzDecisionEntry, 0, f.Limit)
	for rows.Next() {
		var (
			entry      AuthzDecisionEntry
			userID     pgtype.UUID
			email      string
			proofLevel pgtype.Text
			ip         pgtype.Text
			requestID  pgtype.Text
			createdAt  pgtype.Timestamp
		)
		if err := rows.Scan(&entry.ID, &userID, &email, &entry.Capability, &entry.Allowed,
			&entry.Code, &entry.Mode, &proofLevel, &entry.Method, &entry.Path, &ip,
			&requestID, &createdAt); err != nil {
			return nil, err
		}
		if userID.Valid {
			v := uuidString(userID)
			entry.UserID = &v
		}
		entry.Email = email
		entry.ProofLevel = textPtr(proofLevel)
		entry.IP = textPtr(ip)
		entry.RequestID = textPtr(requestID)
		if createdAt.Valid {
			entry.CreatedAt = createdAt.Time.UTC().Format(time.RFC3339)
		}
		out = append(out, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}
