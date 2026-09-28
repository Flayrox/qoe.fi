package imports

// ── Revue staff des imports d'abonnés (fiche 03 §5) ─────────────────────
// Le staff voit un **dossier**, pas un fichier : identité et historique du
// demandeur, provenance déclarée, preuves, statistiques de qualité, exclusions
// automatiques, historique des lots de la même publication, et un échantillon
// de lignes dont les cellules sont neutralisées. Il peut approuver selon deux
// modes, demander un complément, refuser, suspendre ou réexaminer.
//
// Deux invariants rendus structurels plutôt que documentaires :
//   • **aucune décision n'est modifiable** : la table porte un trigger qui
//     refuse UPDATE et DELETE. Changer d'avis ajoute une décision — c'est ce
//     qui rend une approbation traçable et contestable.
//   • **une décision ne vaut que pour une version du fichier** : elle porte
//     `fileVersion` et `fileFingerprint`, et le service refuse toute décision
//     qui ne correspond pas exactement à la version courante. Modifier le CSV
//     après approbation réexamine donc le lot au lieu d'hériter de l'accord.
//
// Ce que ce fichier ne fait **pas** : envoyer. Aucun chemin d'envoi n'existe
// encore pour un lot approuvé, et c'est volontaire — l'ordre de migration de la
// fiche 03 §10 est (1) fermer l'accès direct d'un import non revu à l'envoi,
// (2) staging + décisions staff, (3) reconfirmation puis envoi encadré. À ce
// stade, `approved_reconfirm` et `approved_direct` sont des décisions
// enregistrées et **sans effet d'envoi** : le modèle d'éligibilité existant
// (`confirmedAt IS NOT NULL`) n'est pas touché.

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// allowedTransitions décrit la machine à états du lot. Elle est fermée : une
// transition absente de cette table est refusée, y compris depuis l'API.
//
//	draft ──▶ submitted ──▶ reviewing ─┬─▶ needs_info ──▶ submitted (nouvelle version)
//	                                  ├─▶ rejected
//	                                  ├─▶ approved_reconfirm ─┐
//	                                  └─▶ approved_direct ────┴─▶ running ──▶ completed
//	tout lot approuvé ──▶ suspended ──▶ resumed (retour à l'état approuvé)
//
// `cancelled` est accessible tant que rien n'a été décidé.
var allowedTransitions = map[string]map[string]bool{
	BatchDraft:             {BatchSubmitted: true, BatchCancelled: true},
	BatchSubmitted:         {BatchReviewing: true, BatchRejected: true, BatchNeedsInfo: true, BatchApprovedReconfirm: true, BatchApprovedDirect: true, BatchCancelled: true},
	BatchReviewing:         {BatchNeedsInfo: true, BatchRejected: true, BatchApprovedReconfirm: true, BatchApprovedDirect: true, BatchCancelled: true},
	BatchNeedsInfo:         {BatchSubmitted: true, BatchRejected: true, BatchCancelled: true},
	BatchApprovedReconfirm: {BatchRunning: true, BatchSuspended: true, BatchCancelled: true},
	BatchApprovedDirect:    {BatchRunning: true, BatchSuspended: true, BatchCancelled: true},
	BatchRunning:           {BatchCompleted: true, BatchSuspended: true},
	BatchSuspended:         {BatchApprovedReconfirm: true, BatchApprovedDirect: true, BatchRejected: true},
	BatchCompleted:         {},
	BatchRejected:          {},
	BatchCancelled:         {},
}

// canTransition indique si le passage d'un état à un autre est autorisé.
func canTransition(from, to string) bool {
	return allowedTransitions[from][to]
}

// SubscriberImportDecisionInput est le corps d'une décision staff.
type SubscriberImportDecisionInput struct {
	Decision string `json:"decision"`
	// Deux motifs séparés : l'un interne (analyse, soupçons), l'autre
	// communiqué au demandeur. Le motif interne ne doit jamais fuiter.
	InternalReason string `json:"internalReason"`
	PublicReason   string `json:"publicReason"`
	// La décision doit désigner la version exacte du fichier examiné.
	FileVersion     int            `json:"fileVersion"`
	FileFingerprint string         `json:"fileFingerprint"`
	Limits          map[string]any `json:"limits"`
	ExpiresAt       *time.Time     `json:"expiresAt"`
	// Exclusions : adresses retirées du lot par le staff. Elles deviennent une
	// opposition durable pour la publication, pour qu'un autre import ne
	// puisse pas les réintroduire aussitôt.
	ExcludeEmails []string `json:"excludeEmails"`
}

// SubscriberImportRowDTO est une ligne exposée à la revue. La cellule a été
// neutralisée : les exports de prestataires contiennent parfois des valeurs
// commençant par `=` ou `@`, qui deviennent des formules dans un tableur.
type SubscriberImportRowDTO struct {
	Email  string `json:"email"`
	Status string `json:"status"`
	Reason string `json:"reason,omitempty"`
}

// SubscriberImportDecisionDTO est une décision, telle qu'archivée.
type SubscriberImportDecisionDTO struct {
	ID             string         `json:"id"`
	Decision       string         `json:"decision"`
	ActorKind      string         `json:"actorKind"`
	InternalReason string         `json:"internalReason,omitempty"`
	PublicReason   string         `json:"publicReason,omitempty"`
	Limits         map[string]any `json:"limits,omitempty"`
	FileVersion    int            `json:"fileVersion"`
	ExpiresAt      string         `json:"expiresAt,omitempty"`
	CreatedAt      string         `json:"createdAt"`
}

// SubscriberImportEventDTO est une entrée du journal d'audit du lot.
type SubscriberImportEventDTO struct {
	Type      string         `json:"type"`
	ActorKind string         `json:"actorKind"`
	Detail    map[string]any `json:"detail,omitempty"`
	CreatedAt string         `json:"createdAt"`
}

// SubscriberImportSignals regroupent les éléments qui aident la décision :
// historique de la publication, réimport du même fichier, doublons entre lots,
// et vérifications du demandeur. Ce sont des facteurs de risque, pas un
// verdict — un historique vierge n'est pas une preuve de consentement.
type SubscriberImportSignals struct {
	PreviousBatches       int    `json:"previousBatches"`
	PreviousRejected      int    `json:"previousRejected"`
	PreviousSuspended     int    `json:"previousSuspended"`
	SameFileFingerprint   bool   `json:"sameFileFingerprint"`
	CrossBatchDuplicates  int    `json:"crossBatchDuplicates"`
	PublicationName       string `json:"publicationName"`
	PublicationType       string `json:"publicationType"`
	RequesterUsername     string `json:"requesterUsername"`
	RequesterEmail        string `json:"requesterEmail"`
	RequesterPhoneChecked bool   `json:"requesterPhoneVerified"`
}

// SubscriberImportReviewDTO est le dossier complet présenté au staff.
type SubscriberImportReviewDTO struct {
	Batch        SubscriberImportBatchDTO      `json:"batch"`
	Declarations map[string]any                `json:"declarations"`
	ProofRefs    []string                      `json:"proofRefs"`
	SourceDetail string                        `json:"sourceDetail,omitempty"`
	OptInMethod  string                        `json:"optInMethod,omitempty"`
	Stats        SubscriberImportStats         `json:"stats"`
	Rows         []SubscriberImportRowDTO      `json:"rows"`
	RowCounts    map[string]int                `json:"rowCounts"`
	Decisions    []SubscriberImportDecisionDTO `json:"decisions"`
	Events       []SubscriberImportEventDTO    `json:"events"`
	Signals      SubscriberImportSignals       `json:"signals"`
}

// ReviewSubscriberImport construit le dossier de revue d'un lot.
func (s *Service) ReviewSubscriberImport(ctx context.Context, batchID string) (SubscriberImportReviewDTO, error) {
	return s.buildReview(ctx, batchID, false)
}

// ReviewSubscriberImportForRequester construit le dossier filtré sur le
// demandeur : il ne voit que ses propres lots, et la vue publique d'une
// décision (motif communicable, jamais le motif interne).
func (s *Service) ReviewSubscriberImportForRequester(ctx context.Context, userID, batchID string) (SubscriberImportReviewDTO, error) {
	owner := toUUID(userID)
	batch, err := s.getBatch(ctx, batchID, owner, false)
	if err != nil {
		return SubscriberImportReviewDTO{}, err
	}
	if batch.ID == "" {
		return SubscriberImportReviewDTO{}, errNotFound
	}
	return s.buildReview(ctx, batchID, true)
}

func (s *Service) buildReview(ctx context.Context, batchID string, redactInternal bool) (SubscriberImportReviewDTO, error) {
	out := SubscriberImportReviewDTO{Rows: []SubscriberImportRowDTO{}, RowCounts: map[string]int{}}

	var (
		declarationsRaw, proofRefsRaw, statsRaw  []byte
		sourceDetail, optInMethod, publicationID string
	)
	err := s.pool.QueryRow(ctx, `
		SELECT "declarations", "proofRefs", "stats", COALESCE("sourceDetail", ''),
		       COALESCE("optInMethod", ''), "publicationId"
		FROM "SubscriberImportBatch"
		WHERE "id" = $1`, batchID).Scan(&declarationsRaw, &proofRefsRaw, &statsRaw, &sourceDetail, &optInMethod, &publicationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, errNotFound
	}
	if err != nil {
		return out, err
	}

	batch, err := s.getBatch(ctx, batchID, pgtypeZero(), true)
	if err != nil {
		return out, err
	}
	out.Batch = batch
	out.SourceDetail = sourceDetail
	out.OptInMethod = optInMethod
	if len(declarationsRaw) > 0 {
		_ = json.Unmarshal(declarationsRaw, &out.Declarations)
	}
	if len(proofRefsRaw) > 0 {
		_ = json.Unmarshal(proofRefsRaw, &out.ProofRefs)
	}
	if len(statsRaw) > 0 {
		_ = json.Unmarshal(statsRaw, &out.Stats)
	}
	if out.Declarations == nil {
		out.Declarations = map[string]any{}
	}
	if out.ProofRefs == nil {
		out.ProofRefs = []string{}
	}

	if out.Rows, err = s.reviewRows(ctx, batchID); err != nil {
		return out, err
	}
	if out.RowCounts, err = s.rowCounts(ctx, batchID); err != nil {
		return out, err
	}
	if out.Decisions, err = s.listDecisions(ctx, batchID, redactInternal); err != nil {
		return out, err
	}
	if out.Events, err = s.listEvents(ctx, batchID); err != nil {
		return out, err
	}
	if out.Signals, err = s.importSignals(ctx, batchID, publicationID); err != nil {
		// Les signaux sont un confort de revue : leur absence ne doit pas
		// empêcher le staff de traiter un dossier.
		log.Printf("[imports] signals lot %s: %v", batchID, err)
	}
	return out, nil
}

// reviewRows renvoie un échantillon borné de lignes, cellules neutralisées.
func (s *Service) reviewRows(ctx context.Context, batchID string) ([]SubscriberImportRowDTO, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT email, status, COALESCE(reason, '')
		FROM "SubscriberImportRow"
		WHERE "batchId" = $1
		ORDER BY status, email
		LIMIT $2`, batchID, maxReviewRowsPreview)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SubscriberImportRowDTO{}
	for rows.Next() {
		var email, status, reason string
		if err := rows.Scan(&email, &status, &reason); err != nil {
			return nil, err
		}
		out = append(out, SubscriberImportRowDTO{
			Email:  sanitizeImportCell(email),
			Status: status,
			Reason: sanitizeImportCell(reason),
		})
	}
	return out, rows.Err()
}

// rowCounts agrège les lignes par verdict (la revue raisonne par segments).
func (s *Service) rowCounts(ctx context.Context, batchID string) (map[string]int, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT status, COUNT(*) FROM "SubscriberImportRow"
		WHERE "batchId" = $1 GROUP BY status`, batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var status string
		var n int
		if err := rows.Scan(&status, &n); err != nil {
			return nil, err
		}
		out[status] = n
	}
	return out, rows.Err()
}

// listDecisions liste les décisions d'un lot, dans l'ordre chronologique.
// `redactInternal` retire le motif interne (vue demandeur).
func (s *Service) listDecisions(ctx context.Context, batchID string, redactInternal bool) ([]SubscriberImportDecisionDTO, error) {
	internal := `COALESCE("internalReason", '')`
	if redactInternal {
		internal = `''`
	}
	rows, err := s.pool.Query(ctx, `
		SELECT "id", "decision", "actorKind", `+internal+`, COALESCE("publicReason", ''),
		       "limits", "fileVersion", "expiresAt", "createdAt"
		FROM "SubscriberImportDecision"
		WHERE "batchId" = $1
		ORDER BY "createdAt" ASC`, batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SubscriberImportDecisionDTO{}
	for rows.Next() {
		var (
			dto       SubscriberImportDecisionDTO
			limitsRaw []byte
			expires   *time.Time
			created   time.Time
		)
		if err := rows.Scan(&dto.ID, &dto.Decision, &dto.ActorKind, &dto.InternalReason,
			&dto.PublicReason, &limitsRaw, &dto.FileVersion, &expires, &created); err != nil {
			return nil, err
		}
		if len(limitsRaw) > 0 {
			_ = json.Unmarshal(limitsRaw, &dto.Limits)
		}
		dto.ExpiresAt = formatTimePtr(expires)
		dto.CreatedAt = created.Format(time.RFC3339)
		out = append(out, dto)
	}
	return out, rows.Err()
}

// listEvents renvoie le journal du lot (base du futur chantier de recours).
func (s *Service) listEvents(ctx context.Context, batchID string) ([]SubscriberImportEventDTO, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT "type", "actorKind", "detail", "createdAt"
		FROM "SubscriberImportEvent"
		WHERE "batchId" = $1
		ORDER BY "createdAt" ASC`, batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SubscriberImportEventDTO{}
	for rows.Next() {
		var (
			dto       SubscriberImportEventDTO
			detailRaw []byte
			created   time.Time
		)
		if err := rows.Scan(&dto.Type, &dto.ActorKind, &detailRaw, &created); err != nil {
			return nil, err
		}
		if len(detailRaw) > 0 {
			_ = json.Unmarshal(detailRaw, &dto.Detail)
		}
		dto.CreatedAt = created.Format(time.RFC3339)
		out = append(out, dto)
	}
	return out, rows.Err()
}

// importSignals rassemble les éléments de contexte de la décision.
func (s *Service) importSignals(ctx context.Context, batchID, publicationID string) (SubscriberImportSignals, error) {
	var out SubscriberImportSignals
	err := s.pool.QueryRow(ctx, `
		SELECT
		  (SELECT COUNT(*) FROM "SubscriberImportBatch" b2
		    WHERE b2."publicationId" = $2 AND b2."id" <> $1),
		  (SELECT COUNT(*) FROM "SubscriberImportBatch" b3
		    WHERE b3."publicationId" = $2 AND b3."status" = 'rejected'),
		  (SELECT COUNT(*) FROM "SubscriberImportBatch" b4
		    WHERE b4."publicationId" = $2 AND b4."status" = 'suspended'),
		  EXISTS(
		    SELECT 1 FROM "SubscriberImportBatch" b5
		    JOIN "SubscriberImportBatch" b6 ON b6."fileFingerprint" = b5."fileFingerprint"
		    WHERE b6."id" = $1 AND b5."id" <> b6."id" AND b5."publicationId" = $2
		  ),
		  (SELECT COUNT(*) FROM "SubscriberImportRow" r1
		    JOIN "SubscriberImportRow" r2 ON r2.email = r1.email
		    JOIN "SubscriberImportBatch" b7 ON b7."id" = r2."batchId" AND b7."publicationId" = $2
		    WHERE r1."batchId" = $1 AND r2."batchId" <> $1),
		  COALESCE(p.name, ''), COALESCE(p.type::text, ''),
		  COALESCE(u.username, ''), COALESCE(u.email, ''),
		  (u."phoneVerifiedAt" IS NOT NULL)`,
		batchID, publicationID).Scan(
		&out.PreviousBatches, &out.PreviousRejected, &out.PreviousSuspended,
		&out.SameFileFingerprint, &out.CrossBatchDuplicates,
		&out.PublicationName, &out.PublicationType,
		&out.RequesterUsername, &out.RequesterEmail, &out.RequesterPhoneChecked,
	)
	if err != nil {
		return out, err
	}
	return out, nil
}

// ListSubscriberImportQueue liste la file de revue (lots ouverts, plus anciens
// d'abord : le premier déposé est le premier examiné).
func (s *Service) ListSubscriberImportQueue(ctx context.Context) ([]SubscriberImportBatchDTO, error) {
	rows, err := s.pool.Query(ctx, batchSelect+`
		WHERE b."status" IN ('submitted', 'reviewing', 'needs_info')
		ORDER BY b."submittedAt" ASC NULLS LAST
		LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanBatches(rows)
}

// ClaimSubscriberImportReview marque un lot comme « en cours d'examen ».
// Idempotent : un lot déjà en examen reste en examen.
func (s *Service) ClaimSubscriberImportReview(ctx context.Context, staffID, batchID string) (SubscriberImportBatchDTO, error) {
	var status string
	err := s.pool.QueryRow(ctx, `SELECT "status" FROM "SubscriberImportBatch" WHERE "id" = $1`, batchID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return SubscriberImportBatchDTO{}, errNotFound
	}
	if err != nil {
		return SubscriberImportBatchDTO{}, err
	}
	if status == BatchSubmitted {
		if _, err := s.pool.Exec(ctx, `
			UPDATE "SubscriberImportBatch" SET "status" = 'reviewing', "updatedAt" = now()
			WHERE "id" = $1 AND "status" = 'submitted'`, batchID); err != nil {
			return SubscriberImportBatchDTO{}, err
		}
		if err := s.recordEvent(ctx, batchID, "reviewing", staffID, "staff", nil); err != nil {
			log.Printf("[imports] event reviewing %s: %v", batchID, err)
		}
	}
	return s.getBatch(ctx, batchID, pgtypeZero(), true)
}

// DecideSubscriberImport enregistre une décision staff et applique la
// transition correspondante.
//
// La décision est append-only : elle n'écrase jamais une décision antérieure.
// Les effets sur les lignes sont volontairement **limités à l'exclusion** : une
// approbation ne rend aucun contact destinataire, parce qu'aucun chemin
// d'envoi n'existe encore pour un lot importé (voir l'en-tête du fichier).
func (s *Service) DecideSubscriberImport(ctx context.Context, staffID, batchID string, in SubscriberImportDecisionInput) (SubscriberImportBatchDTO, error) {
	if !validStaffDecision(in.Decision) {
		return SubscriberImportBatchDTO{}, errors.New("décision inconnue")
	}
	var (
		status          string
		fileVersion     int
		fileFingerprint string
		publicationID   string
	)
	err := s.pool.QueryRow(ctx, `
		SELECT "status", "fileVersion", "fileFingerprint", "publicationId"
		FROM "SubscriberImportBatch" WHERE "id" = $1`, batchID).Scan(&status, &fileVersion, &fileFingerprint, &publicationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return SubscriberImportBatchDTO{}, errNotFound
	}
	if err != nil {
		return SubscriberImportBatchDTO{}, err
	}

	// Une décision porte sur une version précise du fichier : approuver « le
	// dernier fichier reçu » laisserait un créateur remplacer le contenu après
	// approbation et hériter de l'accord.
	if in.FileVersion != 0 || in.FileFingerprint != "" {
		if in.FileVersion != fileVersion || (in.FileFingerprint != "" && in.FileFingerprint != fileFingerprint) {
			return SubscriberImportBatchDTO{}, errImportStaleDecision
		}
	}

	next := in.Decision
	if in.Decision == "resumed" {
		// La reprise ramène le lot à l'état approuvé précédent.
		previous, err := s.lastApproval(ctx, batchID)
		if err != nil {
			return SubscriberImportBatchDTO{}, err
		}
		if previous == "" {
			return SubscriberImportBatchDTO{}, errImportTransition
		}
		next = previous
	}
	targetStatus := statusForDecision(next, status)
	if !canTransition(status, targetStatus) {
		return SubscriberImportBatchDTO{}, errImportTransition
	}
	if len(in.ExcludeEmails) > maxImportExclusions {
		return SubscriberImportBatchDTO{}, errors.New("trop d'exclusions dans une même décision")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SubscriberImportBatchDTO{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	decisionID := uuid.NewString()
	limits := in.Limits
	if limits == nil {
		limits = map[string]any{}
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO "SubscriberImportDecision" (
			"id", "batchId", "decision", "actorId", "actorKind", "internalReason",
			"publicReason", "limits", "fileVersion", "fileFingerprint", "expiresAt"
		) VALUES ($1, $2, $3, $4, 'staff', NULLIF($5, ''), NULLIF($6, ''), $7, $8, $9, $10)`,
		decisionID, batchID, in.Decision, toUUID(staffID),
		clip(in.InternalReason, 2000), clip(in.PublicReason, 2000),
		mustJSON(limits), fileVersion, fileFingerprint, in.ExpiresAt,
	); err != nil {
		return SubscriberImportBatchDTO{}, err
	}

	excluded, err := s.applyExclusions(ctx, tx, batchID, publicationID, decisionID, in.ExcludeEmails)
	if err != nil {
		return SubscriberImportBatchDTO{}, err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE "SubscriberImportBatch"
		SET "status" = $2,
		    "reviewDueAt" = CASE WHEN $2 = 'needs_info' THEN $3 ELSE "reviewDueAt" END,
		    "suspendedAt" = CASE WHEN $2 = 'suspended' THEN now() ELSE NULL END,
		    "updatedAt" = now()
		WHERE "id" = $1`, batchID, targetStatus, in.ExpiresAt); err != nil {
		return SubscriberImportBatchDTO{}, err
	}

	detail := map[string]any{
		"decision": in.Decision, "status": targetStatus,
		"excluded": excluded, "decisionId": decisionID,
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO "SubscriberImportEvent" ("id", "batchId", "type", "actorId", "actorKind", "detail")
		VALUES ($1, $2, 'decision', $3, 'staff', $4)`,
		uuid.NewString(), batchID, toUUID(staffID), mustJSON(detail)); err != nil {
		return SubscriberImportBatchDTO{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return SubscriberImportBatchDTO{}, err
	}
	return s.getBatch(ctx, batchID, pgtypeZero(), true)
}

// statusForDecision traduit une décision en état de lot.
func statusForDecision(decision, fallback string) string {
	switch decision {
	case "needs_info":
		return BatchNeedsInfo
	case "rejected":
		return BatchRejected
	case "approved_reconfirm":
		return BatchApprovedReconfirm
	case "approved_direct":
		return BatchApprovedDirect
	case "suspended":
		return BatchSuspended
	case "cancelled":
		return BatchCancelled
	case "resumed":
		return fallback
	default:
		return ""
	}
}

func validStaffDecision(decision string) bool {
	switch decision {
	case "needs_info", "rejected", "approved_reconfirm", "approved_direct", "suspended", "cancelled", "resumed":
		return true
	default:
		return false
	}
}

// lastApproval retrouve l'état approuvé précédent d'un lot suspendu.
func (s *Service) lastApproval(ctx context.Context, batchID string) (string, error) {
	var decision string
	err := s.pool.QueryRow(ctx, `
		SELECT "decision" FROM "SubscriberImportDecision"
		WHERE "batchId" = $1 AND "decision" IN ('approved_reconfirm', 'approved_direct')
		ORDER BY "createdAt" DESC LIMIT 1`, batchID).Scan(&decision)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return statusForDecision(decision, ""), err
}

// applyExclusions retire des adresses du lot et rend l'exclusion durable.
//
// Une exclusion n'est pas qu'un retrait du fichier : elle devient une
// opposition pour la publication. Sans cela, un créateur « réintroduirait par
// un autre import une adresse déjà exclue » (fiche 03 §5) — ce qui viderait
// l'exclusion de son sens.
func (s *Service) applyExclusions(
	ctx context.Context, tx pgx.Tx, batchID, publicationID, decisionID string, emails []string,
) (int, error) {
	if len(emails) == 0 {
		return 0, nil
	}
	cleaned := make([]string, 0, len(emails))
	for _, raw := range emails {
		email := normalizeImportEmail(raw)
		if validImportEmail(email) {
			cleaned = append(cleaned, email)
		}
	}
	if len(cleaned) == 0 {
		return 0, nil
	}

	tag, err := tx.Exec(ctx, `
		UPDATE "SubscriberImportRow"
		SET "status" = 'excluded', "reason" = 'exclu par décision staff',
		    "excludedBy" = $2, "updatedAt" = now()
		WHERE "batchId" = $1 AND email = ANY($3::text[])`,
		batchID, decisionID, cleaned)
	if err != nil {
		return 0, err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO "EmailSuppression" ("id", "email", "scope", "publicationId", "reason", "source")
		SELECT gen_random_uuid()::text, e.email, 'publication', $1, 'import_exclusion', $2
		FROM unnest($3::text[]) AS e(email)
		ON CONFLICT DO NOTHING`,
		publicationID, decisionID, cleaned); err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

// recordEvent ajoute une entrée au journal du lot.
func (s *Service) recordEvent(ctx context.Context, batchID, eventType, actorID, actorKind string, detail map[string]any) error {
	if detail == nil {
		detail = map[string]any{}
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO "SubscriberImportEvent" ("id", "batchId", "type", "actorId", "actorKind", "detail")
		VALUES ($1, $2, $3, $4, $5, $6)`,
		uuid.NewString(), batchID, eventType, toUUID(actorID), actorKind, mustJSON(detail))
	return err
}

// SubscriberImportEligibilityDocumented expose, pour la documentation et les
// tests, l'invariant de sûreté de cette tranche : un lot importé n'a aucun
// effet d'envoi. L'éligibilité d'envoi reste `confirmedAt IS NOT NULL`, donc
// un contact importé n'est jamais destinataire tant qu'il n'a pas confirmé, et
// aucune décision staff ne peut fabriquer cette confirmation.
func SubscriberImportEligibilityDocumented() string {
	return strings.Join([]string{
		"une approbation staff autorise un mode de traitement, pas un envoi",
		"confirmedAt ne peut être franchi que par une confirmation individuelle",
	}, "; ")
}
