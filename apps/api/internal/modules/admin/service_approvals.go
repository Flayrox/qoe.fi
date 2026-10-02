package admin

// =====================================================================
// 🤝 Quorum N3 — la double validation, portée par la console (Phase 8)
// =====================================================================
// `internal/authz` déclare depuis le début que `legal_publish` et
// `staff_high_impact` exigent N3 + DOUBLE VALIDATION ; le garde sait exiger un
// acte nommé sur une cible précise. Ce service tient le dossier qui manquait :
//
//   1. une personne autorisée DEMANDE la validation d'un acte (motif
//      obligatoire) : la demande nomme l'acte, sa cible et la capacité requise ;
//   2. une SECONDE personne autorisée approuve ou rejette. L'auto-validation est
//      refusée — sans cela, le quorum ne serait qu'un clic de plus ;
//   3. l'approbation expire (72 h) et se consomme quand l'acte est exercé :
//      elle vaut pour un acte, une cible, une fois.
//
// Le service ne décide PAS à la place du garde : il répond à la seule question
// que le garde pose — « cette personne a-t-elle, pour cet acte et cette cible,
// une approbation valide ? » — et refuse par défaut (aucune ligne, aucune
// approbation). Les écritures sont en SQL direct : la table vient d'être créée
// et n'existe pas dans le sqlc généré.
// =====================================================================

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/adminauthz"
	"github.com/qoefi/api/internal/authz"
)

// approvalLifetime : une approbation vaut pour un acte récent. Au-delà, la
// personne qui approuve n'a pas vu la même situation que celle qui agit.
const approvalLifetime = 72 * time.Hour

// Les motifs de refus du quorum vivent dans le paquet de protocole
// (internal/adminauthz) : le module légal — qui produit l'acte — doit pouvoir
// dire POURQUOI une demande ne passe pas, sans importer cette console. Ces
// alias gardent les noms courts dans le module qui écrit en base.
var (
	ErrApprovalForbidden  = adminauthz.ErrApprovalForbidden
	ErrApprovalSelf       = adminauthz.ErrApprovalSelf
	ErrApprovalClosed     = adminauthz.ErrApprovalClosed
	ErrApprovalReason     = adminauthz.ErrApprovalReason
	ErrApprovalUnknownAct = adminauthz.ErrApprovalUnknownAct
)

// n3Approvals : les actes du noyau qui exigent une double validation, avec la
// capacité que le DEMANDEUR doit détenir — la même que celle de l'APPROBATEUR :
// valider à la place de quelqu'un qui n'a pas le droit n'est pas un quorum.
// Ajouter un acte ici sans le déclarer sur sa route (WithApprovalAct) ne suffit
// pas : la route reste N2 — la table dit qui valide, la route dit ce qu'il faut
// pour agir.
var n3Approvals = map[authz.Action]adminauthz.Capability{
	authz.ActionLegalPublish:    adminauthz.LegalWrite,
	authz.ActionStaffHighImpact: adminauthz.ImportsReview,
}

const approvalColumns = `
	"id", "act", "target", "capability", "requestedBy", "reason", "status",
	"decidedBy", "note", "expiresAt", "createdAt", "decidedAt"`

// scanApproval lit une ligne de "AdminApproval" (colonnes ci-dessus).
func scanApproval(row interface {
	Scan(dest ...any) error
}) (adminauthz.ApprovalRequest, error) {
	var (
		out         adminauthz.ApprovalRequest
		decidedBy   *string
		note        *string
		decidedAt   *time.Time
		expiresAt   time.Time
		createdAt   time.Time
		requestedBy string
	)
	if err := row.Scan(&out.ID, &out.Act, &out.Target, &out.Capability, &requestedBy,
		&out.Reason, &out.Status, &decidedBy, &note, &expiresAt, &createdAt, &decidedAt); err != nil {
		return adminauthz.ApprovalRequest{}, err
	}
	out.RequestedBy = requestedBy
	out.ExpiresAt = expiresAt.UTC().Format(time.RFC3339)
	out.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	if decidedBy != nil {
		out.DecidedBy = *decidedBy
	}
	if note != nil {
		out.Note = *note
	}
	if decidedAt != nil {
		out.DecidedAt = decidedAt.UTC().Format(time.RFC3339)
	}
	return out, nil
}

// accessOf résout les capacités à la source UNIQUE de la console
// (adminauthz.Service, le même que celui du garde). Refus par défaut : sans
// source branchée, rien n'est vérifiable — donc rien n'est autorisé.
func (s *Service) accessOf(ctx context.Context, userID string) (adminauthz.Access, error) {
	if s.access == nil || userID == "" {
		return adminauthz.Access{}, ErrApprovalForbidden
	}
	access, err := s.access.Access(ctx, userID)
	if err != nil {
		log.Printf("[admin] quorum : capacités indisponibles (user=%s) : %v", userID, err)
		return adminauthz.Access{}, err
	}
	return access, nil
}

// authorized vérifie que la personne détient la capacité de l'acte : la double
// validation ne remplace pas le droit de commettre l'acte, elle s'y ajoute.
func (s *Service) authorized(ctx context.Context, userID string, c adminauthz.Capability) error {
	access, err := s.accessOf(ctx, userID)
	if err != nil {
		return err
	}
	if !access.Has(c) {
		return ErrApprovalForbidden
	}
	return nil
}

// RequestApproval crée (ou retrouve) la demande de validation d'un acte.
//
// Idempotent par (demandeur, acte, cible) : recharger l'écran et recliquer ne
// doit pas remplir la file de doublons que personne ne saurait départager.
func (s *Service) RequestApproval(ctx context.Context, actorID string, act authz.Action, target, reason string) (adminauthz.ApprovalRequest, error) {
	if s == nil || s.pool == nil {
		return adminauthz.ApprovalRequest{}, ErrApprovalForbidden
	}
	spec, ok := n3Approvals[act]
	if !ok {
		return adminauthz.ApprovalRequest{}, ErrApprovalUnknownAct
	}
	if err := s.authorized(ctx, actorID, spec); err != nil {
		return adminauthz.ApprovalRequest{}, err
	}
	reason = strings.TrimSpace(reason)
	if len([]rune(reason)) < 5 {
		return adminauthz.ApprovalRequest{}, ErrApprovalReason
	}
	target = strings.TrimSpace(target)

	row := s.pool.QueryRow(ctx, `
		SELECT `+approvalColumns+` FROM "AdminApproval"
		 WHERE "requestedBy" = $1::uuid AND "act" = $2 AND "target" = $3
		   AND "status" = 'pending' AND "expiresAt" > CURRENT_TIMESTAMP
		 ORDER BY "createdAt" DESC LIMIT 1`, actorID, string(act), target)
	if got, err := scanApproval(row); err == nil {
		return got, nil
	}

	row = s.pool.QueryRow(ctx, `
		INSERT INTO "AdminApproval"
		    ("id", "act", "target", "capability", "requestedBy", "reason", "status", "expiresAt")
		VALUES (gen_random_uuid()::text, $1, $2, $3, $4::uuid, $5, 'pending',
		        CURRENT_TIMESTAMP + $6::interval)
		RETURNING `+approvalColumns,
		string(act), target, string(spec), actorID, reason, approvalLifetime.String())
	created, err := scanApproval(row)
	if err != nil {
		return adminauthz.ApprovalRequest{}, err
	}

	s.logApprovalAudit(ctx, actorID, "approval.request", string(spec), created.ID,
		reason, nil, map[string]any{"act": string(act), "target": target, "status": "pending"})
	return created, nil
}

// DecideApproval approuve ou rejette une demande. Une SECONDE personne
// AUTORISÉE seulement : le demandeur ne peut pas se valider lui-même, et un
// compte qui n'a pas la capacité de l'acte ne peut pas valider celui d'un autre.
func (s *Service) DecideApproval(ctx context.Context, approverID, id, decision, note string) (adminauthz.ApprovalRequest, error) {
	if s == nil || s.pool == nil {
		return adminauthz.ApprovalRequest{}, ErrApprovalForbidden
	}
	decision = strings.TrimSpace(decision)
	if decision != "approved" && decision != "rejected" {
		return adminauthz.ApprovalRequest{}, errInvalidAction
	}
	note = strings.TrimSpace(note)

	// Relecture de l'état AVANT l'écriture : elle sert à dire POURQUOI la
	// décision est refusée (« vous avez demandé cette validation » n'est pas
	// « cette demande est close »). L'écriture reste gardée par son WHERE :
	// c'est lui qui tranche si deux approbateurs cliquent en même temps, et la
	// seule autorité sur l'échéance — une demande périmée échoue sur ce WHERE
	// comme sur cette relecture, donc on ne la lit qu'une fois.
	var state struct {
		Act         string
		RequestedBy string
		Status      string
	}
	err := s.pool.QueryRow(ctx, `
		SELECT "act", "requestedBy"::text, "status"
		  FROM "AdminApproval" WHERE "id" = $1`, id).
		Scan(&state.Act, &state.RequestedBy, &state.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return adminauthz.ApprovalRequest{}, ErrApprovalClosed
	}
	if err != nil {
		return adminauthz.ApprovalRequest{}, err
	}
	if state.RequestedBy == approverID {
		return adminauthz.ApprovalRequest{}, ErrApprovalSelf
	}
	if state.Status != "pending" {
		return adminauthz.ApprovalRequest{}, ErrApprovalClosed
	}
	spec, ok := n3Approvals[authz.Action(state.Act)]
	if !ok {
		return adminauthz.ApprovalRequest{}, ErrApprovalUnknownAct
	}
	if err := s.authorized(ctx, approverID, spec); err != nil {
		return adminauthz.ApprovalRequest{}, err
	}

	row := s.pool.QueryRow(ctx, `
		UPDATE "AdminApproval"
		   SET "status" = $2, "decidedBy" = $3::uuid, "decidedAt" = CURRENT_TIMESTAMP,
		       "note" = NULLIF($4, '')
		 WHERE "id" = $1
		   AND "status" = 'pending'
		   AND "expiresAt" > CURRENT_TIMESTAMP
		   AND "requestedBy" <> $3::uuid
		 RETURNING `+approvalColumns, id, decision, approverID, note)
	decided, err := scanApproval(row)
	if err != nil {
		// La demande a bougé entre la relecture et l'écriture (décidée ou
		// expirée à l'instant) : close, sans écraser la décision déjà prise.
		return adminauthz.ApprovalRequest{}, ErrApprovalClosed
	}

	s.logApprovalAudit(ctx, approverID, "approval."+decision, decided.Capability, decided.ID,
		note, map[string]any{"status": "pending"}, map[string]any{"status": decision})
	return decided, nil
}

// PendingApprovals liste les demandes récentes (les plus récentes d'abord) :
// ce qui attend une seconde validation, et ce qui a été décidé (pour relire).
// Réservé au personnel de la console : la file nomme des cibles et des motifs.
func (s *Service) PendingApprovals(ctx context.Context, actorID string, limit int32) ([]adminauthz.ApprovalRequest, error) {
	if s == nil || s.pool == nil {
		return nil, ErrApprovalForbidden
	}
	access, err := s.accessOf(ctx, actorID)
	if err != nil {
		return nil, err
	}
	if !access.IsStaff() {
		return nil, ErrApprovalForbidden
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		SELECT `+approvalColumns+` FROM "AdminApproval"
		 ORDER BY ("status" = 'pending' AND "expiresAt" > CURRENT_TIMESTAMP) DESC,
		          "createdAt" DESC
		 LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []adminauthz.ApprovalRequest{}
	for rows.Next() {
		item, err := scanApproval(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// CheckApproval est le contrôle que le garde appelle à chaque acte N3 : cette
// personne a-t-elle, pour CET acte et CETTE cible, une approbation approuvée et
// non expirée ? Refus par défaut, et jamais une approbation « en gros ».
func (s *Service) CheckApproval(ctx context.Context, actorID string, act authz.Action, target string) bool {
	if s == nil || s.pool == nil || actorID == "" {
		return false
	}
	if _, ok := n3Approvals[act]; !ok {
		return false
	}
	var exists bool
	if err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (
		    SELECT 1 FROM "AdminApproval"
		     WHERE "requestedBy" = $1::uuid
		       AND "act" = $2
		       AND "target" = $3
		       AND "status" = 'approved'
		       AND "expiresAt" > CURRENT_TIMESTAMP
		)`, actorID, string(act), target).Scan(&exists); err != nil {
		log.Printf("[admin] CheckApproval: %v", err)
		return false
	}
	return exists
}

// ConsumeApproval marque l'approbation comme exercée : elle ne se rejoue pas.
// Appelé APRÈS le succès de l'acte — une approbation ne se consomme pas sur un
// échec, sinon il faudrait en demander une seconde pour rien.
func (s *Service) ConsumeApproval(ctx context.Context, actorID string, act authz.Action, target string) error {
	if s == nil || s.pool == nil {
		return ErrApprovalForbidden
	}
	_, err := s.pool.Exec(ctx, `
		UPDATE "AdminApproval"
		   SET "status" = 'consumed'
		 WHERE "requestedBy" = $1::uuid AND "act" = $2 AND "target" = $3
		   AND "status" = 'approved' AND "expiresAt" > CURRENT_TIMESTAMP`,
		actorID, string(act), target)
	if err != nil {
		return err
	}
	s.logApprovalAudit(ctx, actorID, "approval.consume", "", "",
		"", map[string]any{"status": "approved"},
		map[string]any{"act": string(act), "target": target, "status": "consumed"})
	return nil
}

// logApprovalAudit trace le cycle de vie d'une approbation. Comme pour les
// mouvements de droits, la trace ne dépend pas du flag d'audit générique : une
// validation à deux qui ne laisse pas de trace n'est pas une validation.
func (s *Service) logApprovalAudit(ctx context.Context, actorID, action, capability, targetID, reason string, before, after any) {
	if s == nil || s.pool == nil {
		return
	}
	var actorUUID pgtype.UUID
	if err := actorUUID.Scan(actorID); err != nil {
		return
	}
	metadata, err := json.Marshal(map[string]any{"reason": reason})
	if err != nil {
		return
	}
	beforeRaw := marshalOrNil(before)
	afterRaw := marshalOrNil(after)
	var target pgtype.Text
	if targetID != "" {
		_ = target.Scan(targetID)
	}
	if _, err := s.pool.Exec(ctx, `
		INSERT INTO "AdminAuditLog"
		    ("id", "actorId", "action", "targetType", "targetId", "metadata",
		     "capability", "reason", "before", "after")
		VALUES (gen_random_uuid()::text, $1::uuid, $2, 'admin_approval', $3, $4,
		        NULLIF($5, ''), NULLIF($6, ''), $7, $8)`,
		actorUUID, action, target, string(metadata),
		capability, reason, nullableJSON(beforeRaw), nullableJSON(afterRaw)); err != nil {
		// Un audit manqué est une panne d'exploitation : on la voit.
		log.Printf("[admin-approval-audit] %s : %v", action, err)
	}
}

// marshalOrNil sérialise un diff, ou rend nil s'il n'y en a pas (une colonne
// vide serait un diff, pas une absence de diff).
func marshalOrNil(value any) []byte {
	if value == nil {
		return nil
	}
	raw, err := json.Marshal(value)
	if err != nil || string(raw) == "null" {
		return nil
	}
	return raw
}
