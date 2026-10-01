package imports

// ── Envoi encadré approved_direct (fiche 03 §7) ───────────────────────
// Un lot `approved_direct` autorise une campagne initiale plafonnée vers des
// contacts qui n'ont PAS cliqué individuellement. C'est l'opération la plus
// dangereuse du plan : elle n'existe que parce que la quarantaine, la décision
// immuable et la reconfirmation existent déjà.
//
// Invariants structurels (pas documentaires) :
//   • budget atomique : le plafond est consommé par UPDATE conditionnel
//     (`consumed + n <= cap`) en une seule requête — deux workers concurrents
//     ne dépassent jamais, même en course ;
//   • `confirmedAt` n'est jamais écrit par ce chemin : l'approbation staff est
//     une preuve **séparée** (lot + décision), jamais un clic. Le lien
//     « confirmer » de l'e-mail, cliqué par le destinataire, reste la seule
//     voie vers `confirmedAt` via le chemin normal ;
//   • une seule vague active par lot (unicité partielle), comme pour la
//     reconfirmation : pas de doubles envois concurrents ;
//   • suspension automatique sur seuils (rejets durs, plaintes) : les compteurs
//     vivent sur la vague, la suspension est une décision système tracée ;
//   • quotas et compteurs séparés des campagnes créateur normales
//     (`NewsletterDelivery`) : une liste fraîche ne mélange jamais ses chiffres
//     avec ceux des abonnés acquis et confirmés directement.
//
// Ce que ce fichier ne fait pas : écrire dans `Subscriber` autre chose qu'un
// abonné inactif porteur d'un jeton (comme la reconfirmation), ni promettre
// une boîte principale — l'état reste honnête si l'issue est inconnue.

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/comms"
	"github.com/qoefi/api/internal/queue"
)

const (
	// defaultSendCap borne une vague créée sans plafond décidé.
	defaultSendCap = 1000
	// maxSendCap borne toute vague, même décidée plus grande : au-delà, c'est
	// une seconde décision explicite, pas un chiffre glissé dans les limits.
	maxSendCap = 10000
	// sendChunkSize borne les envois d'une exécution de tâche.
	sendChunkSize = 100
	// sendChunkDelay espace deux tranches d'une même vague.
	sendChunkDelay = 60 * time.Second
	// sendClaimLease : bail d'une livraison réclamée (`claimed`, issue
	// inconnue). Passé ce délai, le worker qui l'avait réclamée est considéré
	// disparu (crash, tâche tuée) et la tranche suivante la reprend. Assez long
	// pour qu'un envoi normal (quelques secondes) aboutisse à son marquage,
	// assez court pour qu'un crash ne fige pas la vague. Compromis assumé :
	// dans cette fenêtre de crash, la reprise peut produire un doublon —
	// préférable à un contact perdu en silence.
	sendClaimLease = 15 * time.Minute
	// Seuils de suspension automatique (surchargés par la décision).
	defaultMaxHardBounceRate = 0.10
	defaultMaxComplaints     = 5
	defaultMaxFailedRate     = 0.20
	defaultMinSample         = 50
)

var (
	// errSendNotApproved : le lot n'est pas en `approved_direct`.
	errSendNotApproved = errors.New("le lot n'est pas approuvé en envoi encadré")
	// errSendExpired : la décision d'approbation a expiré.
	errSendExpired = errors.New("l'approbation d'envoi encadré a expiré")
	// errSendNothingEligible : aucune adresse éligible dans ce lot.
	errSendNothingEligible = errors.New("aucune adresse éligible dans ce lot")
)

// Exportées pour la façade admin (même pattern que les autres sentinelles).
var (
	// ErrSendNotApproved : lot non approuvé en envoi encadré.
	ErrSendNotApproved = errSendNotApproved
	// ErrSendExpired : approbation expirée.
	ErrSendExpired = errSendExpired
	// ErrSendNothingEligible : rien à envoyer.
	ErrSendNothingEligible = errSendNothingEligible
)

// SendWaveDTO est la vue API d'une vague d'envoi encadré.
type SendWaveDTO struct {
	ID               string `json:"id"`
	BatchID          string `json:"batchId"`
	Status           string `json:"status"`
	BudgetCap        int    `json:"budgetCap"`
	BudgetConsumed   int    `json:"budgetConsumed"`
	SentCount        int    `json:"sentCount"`
	SkippedCount     int    `json:"skippedCount"`
	FailedCount      int    `json:"failedCount"`
	HardBounceCount  int    `json:"hardBounceCount"`
	ComplaintCount   int    `json:"complaintCount"`
	UnsubscribeCount int    `json:"unsubscribeCount"`
	CompletedAt      string `json:"completedAt,omitempty"`
	CreatedAt        string `json:"createdAt"`
	UpdatedAt        string `json:"updatedAt"`
}

// ensureInactiveImportSubscriber crée un abonné inactif porteur d'un jeton
// frais, ou signale que l'adresse est déjà connue. Partagé avec la
// reconfirmation : un seul endroit où cette règle vit.
//
// Règle : on ne réécrit jamais un abonné existant (ni son token, ni son
// état). L'envoi encadré ne s'adresse qu'aux inconnus : si l'adresse s'est
// inscrite ou confirmée entre-temps par un autre chemin, elle sort de la
// vague au lieu de voir son parcours écrasé.
func ensureInactiveImportSubscriber(ctx context.Context, tx pgx.Tx, publicationID, email, token string) (created bool, err error) {
	var ensured bool
	err = tx.QueryRow(ctx, `
		INSERT INTO "Subscriber" ("id", "email", "publicationId", "locale",
		                          "isActive", "receiveArticles", "confirmedAt",
		                          "confirmationToken", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2, 'fr', true, false, NULL, $3, now(), now())
		ON CONFLICT ("email", "publicationId") DO NOTHING
		RETURNING true`, email, publicationID, token).Scan(&ensured)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}
	return ensured, nil
}

// StartSendWave ouvre une vague d'envoi encadré pour un lot approuvé.
// Idempotent par lot : une vague active existante est renvoyée (et relancée
// si elle était en pause après une suspension levée) au lieu d'en créer une
// seconde qui doublerait les envois.
func (s *Service) StartSendWave(ctx context.Context, staffID, batchID string, capOverride int) (SendWaveDTO, error) {
	var (
		status, publicationID string
	)
	err := s.pool.QueryRow(ctx, `
		SELECT "status", "publicationId"
		FROM "SubscriberImportBatch" WHERE "id" = $1`, batchID).Scan(&status, &publicationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return SendWaveDTO{}, errNotFound
	}
	if err != nil {
		return SendWaveDTO{}, err
	}
	if status != BatchApprovedDirect && status != BatchRunning {
		return SendWaveDTO{}, errSendNotApproved
	}

	var (
		decisionID      string
		decisionExpires *time.Time
		limitsRaw       []byte
	)
	err = s.pool.QueryRow(ctx, `
		SELECT "id", "expiresAt", "limits"
		FROM "SubscriberImportDecision"
		WHERE "batchId" = $1 AND "decision" = 'approved_direct'
		ORDER BY "createdAt" DESC LIMIT 1`,
		batchID).Scan(&decisionID, &decisionExpires, &limitsRaw)
	if errors.Is(err, pgx.ErrNoRows) {
		return SendWaveDTO{}, errSendNotApproved
	}
	if err != nil {
		return SendWaveDTO{}, err
	}
	if decisionExpires != nil && !decisionExpires.IsZero() && time.Now().UTC().After(*decisionExpires) {
		return SendWaveDTO{}, errSendExpired
	}

	if existing, err := s.activeSendWave(ctx, batchID); err != nil {
		return SendWaveDTO{}, err
	} else if existing.ID != "" {
		if existing.Status == "paused" {
			if _, err := s.pool.Exec(ctx, `
				UPDATE "ImportSendWave"
				SET "status" = 'queued', "updatedAt" = now()
				WHERE "id" = $1 AND "status" = 'paused'`, existing.ID); err != nil {
				return SendWaveDTO{}, err
			}
			existing.Status = "queued"
			if err := queue.PublishImportSendWave(s.asynq, queue.SubscriberImportSendPayload{WaveID: existing.ID}, 0); err != nil {
				log.Printf("[imports] re-enqueue vague d'envoi %s: %v", existing.ID, err)
			}
		}
		return existing, nil
	}

	cap := capOverride
	if cap <= 0 {
		cap = decisionSendCap(limitsRaw)
	}
	if cap <= 0 {
		cap = defaultSendCap
	}
	if cap > maxSendCap {
		cap = maxSendCap
	}
	thresholds := decisionSendThresholds(limitsRaw)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SendWaveDTO{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Budget du lot : un seul par lot (unicité), créé ici s'il n'existe pas.
	// Une seconde vague réutilise le même compteur : le plafond est global au
	// lot, pas par vague.
	var budgetID string
	err = tx.QueryRow(ctx, `
		INSERT INTO "ImportSendBudget" ("id", "batchId", "publicationId", "decisionId", "cap", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, $5, now(), now())
		ON CONFLICT ("batchId") DO UPDATE SET "updatedAt" = now()
		RETURNING "id"`,
		uuid.NewString(), batchID, publicationID, decisionID, cap).Scan(&budgetID)
	if err != nil {
		return SendWaveDTO{}, err
	}

	waveID := uuid.NewString()
	if _, err := tx.Exec(ctx, `
		INSERT INTO "ImportSendWave"
		    ("id", "batchId", "publicationId", "decisionId", "budgetId", "status",
		     "maxHardBounceRate", "maxComplaints", "maxFailedRate", "minSample",
		     "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7, $8, $9, now(), now())`,
		waveID, batchID, publicationID, decisionID, budgetID,
		thresholds.maxHardBounceRate, thresholds.maxComplaints,
		thresholds.maxFailedRate, thresholds.minSample); err != nil {
		return SendWaveDTO{}, err
	}

	// Snapshot du segment : seules les lignes encore `eligible_direct`,
	// dédupliquées par la contrainte (waveId, email).
	var snapshotted int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO "ImportSendDelivery" ("id", "waveId", "batchId", "publicationId", "email", "status", "createdAt", "updatedAt")
		SELECT gen_random_uuid()::text, $1, $2, $3, r."email", 'queued', now(), now()
		FROM "SubscriberImportRow" r
		WHERE r."batchId" = $2 AND r."status" = 'eligible_direct'
		ON CONFLICT ("waveId", "email") DO NOTHING
		RETURNING 1`,
		waveID, batchID, publicationID).Scan(&snapshotted); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return SendWaveDTO{}, err
	}
	// Compte réel (l'INSERT...RETURNING 1 ne rend qu'une ligne en pgx).
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM "ImportSendDelivery" WHERE "waveId" = $1`, waveID).Scan(&snapshotted); err != nil {
		return SendWaveDTO{}, err
	}
	if snapshotted == 0 {
		return SendWaveDTO{}, errSendNothingEligible
	}

	if _, err := tx.Exec(ctx, `
		UPDATE "SubscriberImportBatch"
		SET "status" = 'running', "updatedAt" = now()
		WHERE "id" = $1 AND "status" = $2`, batchID, BatchApprovedDirect); err != nil {
		return SendWaveDTO{}, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO "SubscriberImportEvent" ("id", "batchId", "type", "actorId", "actorKind", "detail")
		VALUES ($1, $2, 'send_wave_started', $3, 'staff', $4)`,
		uuid.NewString(), batchID, toUUID(staffID),
		mustJSON(map[string]any{"waveId": waveID, "cap": cap, "deliveries": snapshotted})); err != nil {
		return SendWaveDTO{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SendWaveDTO{}, err
	}

	if err := queue.PublishImportSendWave(s.asynq, queue.SubscriberImportSendPayload{WaveID: waveID}, 0); err != nil {
		log.Printf("[imports] enqueue vague d'envoi %s: %v", waveID, err)
	}
	return s.getSendWave(ctx, waveID)
}

// sendThresholds porte les seuils de suspension d'une vague.
type sendThresholds struct {
	maxHardBounceRate float64
	maxComplaints     int
	maxFailedRate     float64
	minSample         int
}

// defaultSendThresholds : valeurs prudentes quand la décision n'en pose pas.
func defaultSendThresholds() sendThresholds {
	return sendThresholds{
		maxHardBounceRate: defaultMaxHardBounceRate,
		maxComplaints:     defaultMaxComplaints,
		maxFailedRate:     defaultMaxFailedRate,
		minSample:         defaultMinSample,
	}
}

// decisionSendCap lit un plafond de destinataires posé par le staff dans les
// limites de la décision (`limits.maxRecipients`). Absent ou invalide : 0,
// et c'est l'appelant qui applique le défaut.
func decisionSendCap(limitsRaw []byte) int {
	if len(limitsRaw) == 0 {
		return 0
	}
	var limits map[string]any
	if err := unmarshalLimits(limitsRaw, &limits); err != nil {
		return 0
	}
	switch v := limits["maxRecipients"].(type) {
	case float64:
		if v > 0 {
			return int(v)
		}
	}
	return 0
}

// decisionSendThresholds lit les seuils de suspension posés par le staff
// (`limits.maxHardBounceRate`, `limits.maxComplaints`, `limits.maxFailedRate`,
// `limits.minSample`). Chaque valeur absente ou invalide retombe sur le défaut
// prudent : on ne laisse jamais un seuil à zéro par erreur de saisie.
func decisionSendThresholds(limitsRaw []byte) sendThresholds {
	out := defaultSendThresholds()
	if len(limitsRaw) == 0 {
		return out
	}
	var limits map[string]any
	if err := unmarshalLimits(limitsRaw, &limits); err != nil {
		return out
	}
	if v, ok := limits["maxHardBounceRate"].(float64); ok && v > 0 && v <= 1 {
		out.maxHardBounceRate = v
	}
	if v, ok := limits["maxComplaints"].(float64); ok && v >= 0 {
		out.maxComplaints = int(v)
	}
	if v, ok := limits["maxFailedRate"].(float64); ok && v > 0 && v <= 1 {
		out.maxFailedRate = v
	}
	if v, ok := limits["minSample"].(float64); ok && v >= 10 {
		out.minSample = int(v)
	}
	return out
}

// SendChunkSize expose la taille de tranche au worker (le worker lit, le
// service décide).
func SendChunkSize() int { return sendChunkSize }

// SendChunkDelay expose le délai inter-tranches au worker.
func SendChunkDelay() time.Duration { return sendChunkDelay }

// SendClaim est une livraison réclamée avec son jeton frais : tout ce que le
// worker doit savoir pour envoyer, sans accès direct aux tables.
type SendClaim struct {
	DeliveryID string
	Email      string
	Token      string
}

// RecipientContext est le contexte d'envoi d'un destinataire : publication
// d'origine (nom pour l'expéditeur et le contenu).
type RecipientContext struct {
	PublicationID   string
	PublicationName string
}

// SendRecipientContext résout le contexte d'envoi d'une livraison : la vague
// doit exister et la livraison lui appartenir, sinon refus — un worker ne doit
// jamais envoyer pour une vague inconnue.
func (s *Service) SendRecipientContext(ctx context.Context, waveID, email string) (RecipientContext, error) {
	var out RecipientContext
	err := s.pool.QueryRow(ctx, `
		SELECT d."publicationId", COALESCE(p."name", d."publicationId")
		FROM "ImportSendDelivery" d
		JOIN "ImportSendWave" w ON w."id" = d."waveId"
		LEFT JOIN "Publication" p ON p."id" = d."publicationId"
		WHERE d."waveId" = $1 AND d."email" = $2`, waveID, email).Scan(&out.PublicationID, &out.PublicationName)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, errNotFound
	}
	return out, err
}

// IsHardBounce expose la classification des rejets durables (voir isHardBounce).
func IsHardBounce(errText string) bool { return isHardBounce(errText) }

// ClaimSendChunk réclame une tranche bornée : vérifie vague et lot, réserve le
// budget atomiquement, crée les abonnés inactifs porteurs d'un jeton frais.
//
// L'ordre compte : on réserve d'abord (le budget est la ressource rare), puis
// on prépare. Un essai réservé mais non envoyé reste consommé — un essai, même
// raté, coûte en réputation et en transport, et le budget doit le refléter.
func (s *Service) ClaimSendChunk(ctx context.Context, waveID string, limit int) ([]SendClaim, error) {
	if limit <= 0 || limit > sendChunkSize {
		limit = sendChunkSize
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var waveStatus, batchStatus, publicationID string
	if err := tx.QueryRow(ctx, `
		SELECT w."status", bb."status", w."publicationId"
		FROM "ImportSendWave" w
		JOIN "SubscriberImportBatch" bb ON bb."id" = w."batchId"
		WHERE w."id" = $1`, waveID).Scan(&waveStatus, &batchStatus, &publicationID); err != nil {
		return nil, err
	}
	if waveStatus != "queued" && waveStatus != "sending" {
		return nil, nil
	}
	if batchStatus != BatchApprovedDirect && batchStatus != BatchRunning {
		return nil, nil
	}

	// Budget restant, verrouillé AVANT la sélection : la tranche est bornée à
	// ce qu'il reste à dépenser. Sans ce plafond, un lot de 6 adresses avec un
	// plafond de 4 tentait de réserver 6 d'un coup et rendait « plafond
	// atteint » sans jamais envoyer les 4 premiers — le plafond doit limiter
	// la tranche, pas l'annuler. Zéro restant n'est pas une panne : la vague
	// reste ouverte et ses livraisons en attente, jamais envoyées ni perdues
	// (une nouvelle décision du staff peut les reprendre). Le verrou sérialise
	// deux workers concurrents : jamais plus que le plafond, même en course.
	var remaining int
	if err := tx.QueryRow(ctx, `
		SELECT GREATEST(b."cap" - b."consumed", 0)
		FROM "ImportSendBudget" b
		JOIN "ImportSendWave" w ON w."budgetId" = b."id"
		WHERE w."id" = $1
		FOR UPDATE OF b`, waveID).Scan(&remaining); err != nil {
		return nil, err
	}
	if remaining == 0 {
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return nil, nil
	}
	if limit > remaining {
		limit = remaining
	}

	rows, err := tx.Query(ctx, `
		SELECT "id", "email" FROM "ImportSendDelivery"
		WHERE "waveId" = $1
		  AND ("status" = 'queued'
		       OR ("status" = 'claimed'
		           AND "updatedAt" <= now() - ($3::int * interval '1 second')))
		ORDER BY "email" ASC
		LIMIT $2
		FOR UPDATE SKIP LOCKED`, waveID, limit, int(sendClaimLease.Seconds()))
	if err != nil {
		return nil, err
	}
	claimedRows := []claimedSendRow{}
	for rows.Next() {
		var c claimedSendRow
		if err := rows.Scan(&c.id, &c.email); err != nil {
			rows.Close()
			return nil, err
		}
		claimedRows = append(claimedRows, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(claimedRows) == 0 {
		return nil, nil
	}

	// Opposition revérifiée au moment du claim (fiche 04 §3.5) : une
	// désinscription, plainte ou exclusion survenue entre le snapshot du
	// segment et cette tranche ne doit jamais partir. Les adresses concernées
	// sont écartées avec motif et comptées comme ignorées — la tranche ne les
	// réserve même pas au budget.
	claimedRows, err = s.excludeSuppressedClaim(ctx, tx, waveID, publicationID, claimedRows)
	if err != nil {
		return nil, err
	}
	if len(claimedRows) == 0 {
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return nil, nil
	}

	// Réservation atomique : une seule requête, conditionnée au plafond —
	// seconde barrière après le verrou ci-dessus. Si elle échoue malgré tout
	// (course improbable), on ne renvoie AUCUNE réclamation plutôt qu'une
	// erreur : rien n'est réservé, rien n'est envoyé, les livraisons restent
	// en attente pour la tranche suivante (jamais de dépassement de plafond).
	var reserved int
	err = tx.QueryRow(ctx, `
		UPDATE "ImportSendBudget" b
		SET "consumed" = b."consumed" + $2,
		    "version" = b."version" + 1,
		    "updatedAt" = now()
		FROM "ImportSendWave" w
		WHERE b."id" = w."budgetId" AND w."id" = $1
		  AND b."consumed" + $2 <= b."cap"
		RETURNING b."consumed"`, waveID, len(claimedRows)).Scan(&reserved)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	out := make([]SendClaim, 0, len(claimedRows))
	for _, c := range claimedRows {
		token, _, err := newReconfirmToken()
		if err != nil {
			return nil, err
		}
		created, err := ensureInactiveImportSubscriber(ctx, tx, publicationID, c.email, token)
		if err != nil {
			return nil, err
		}
		if !created {
			// Adresse devenue connue entre-temps (inscrite ou confirmée par un
			// autre chemin) : on ne l'écrase pas, on l'écarte de la vague.
			if _, err := tx.Exec(ctx, `
				UPDATE "ImportSendDelivery"
				SET "status" = 'skipped', "error" = 'contact devenu connu avant envoi', "updatedAt" = now()
				WHERE "id" = $1 AND "status" IN ('queued', 'claimed')`, c.id); err != nil {
				return nil, err
			}
			if _, err := tx.Exec(ctx, `
				UPDATE "ImportSendWave"
				SET "skippedCount" = "skippedCount" + 1, "updatedAt" = now()
				WHERE "id" = $1`, waveID); err != nil {
				return nil, err
			}
			continue
		}
		out = append(out, SendClaim{DeliveryID: c.id, Email: c.email, Token: token})
	}

	// Réservation matérialisée dans la MÊME transaction que le budget : les
	// livraisons préparées sortent de la file (`claimed`). Sans ce marquage,
	// elles restaient `queued` après le commit — `FOR UPDATE SKIP LOCKED` ne
	// protège que le temps de la transaction — et un second worker, ou un
	// simple retry après crash, réclamait la même adresse et envoyait deux
	// fois. `claimed` n'est pas « envoyée » : seul MarkSendResult tranche.
	if len(out) > 0 {
		ids := make([]string, 0, len(out))
		for _, c := range out {
			ids = append(ids, c.DeliveryID)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE "ImportSendDelivery"
			SET "status" = 'claimed', "updatedAt" = now()
			WHERE "id" = ANY($1::text[]) AND "status" IN ('queued', 'claimed')`, ids); err != nil {
			return nil, err
		}
	}

	if _, err := tx.Exec(ctx, `
		UPDATE "ImportSendWave"
		SET "status" = 'sending', "updatedAt" = now()
		WHERE "id" = $1 AND "status" = 'queued'`, waveID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return out, nil
}

// claimedSendRow est une livraison réclamée en attente de filtrage.
type claimedSendRow struct {
	id, email string
}

// excludeSuppressedClaim écarte de la tranche les adresses passées en
// opposition depuis le snapshot (désinscription, plainte, exclusion staff) :
// statut `suppressed` avec motif, compteur d'ignorées avancé. Ne renvoie que
// les adresses encore envoyables. Une erreur de lecture est propagée : la
// transaction est annulée et la tâche retentée avec backoff asynq — on ne
// tranche jamais une opposition qu'on n'a pas pu lire.
func (s *Service) excludeSuppressedClaim(
	ctx context.Context, tx pgx.Tx, waveID, publicationID string, rows []claimedSendRow,
) ([]claimedSendRow, error) {
	if len(rows) == 0 {
		return rows, nil
	}
	emails := make([]string, 0, len(rows))
	for _, r := range rows {
		emails = append(emails, r.email)
	}
	suppressed := map[string]bool{}
	srows, err := tx.Query(ctx, `
		SELECT e.email FROM unnest($2::text[]) AS e(email)
		WHERE EXISTS(
		    SELECT 1 FROM "EmailSuppression" x
		    WHERE x.email = e.email
		      AND (x."scope" = 'global'
		           OR (x."scope" = 'publication' AND x."publicationId" = $1))
		)`, publicationID, emails)
	if err != nil {
		return nil, err
	}
	for srows.Next() {
		var email string
		if err := srows.Scan(&email); err != nil {
			srows.Close()
			return nil, err
		}
		suppressed[email] = true
	}
	srows.Close()
	if err := srows.Err(); err != nil {
		return nil, err
	}
	if len(suppressed) == 0 {
		return rows, nil
	}
	kept := make([]claimedSendRow, 0, len(rows))
	skipped := make([]string, 0, len(suppressed))
	for _, r := range rows {
		if suppressed[r.email] {
			skipped = append(skipped, r.id)
		} else {
			kept = append(kept, r)
		}
	}
	if len(skipped) > 0 {
		if _, err := tx.Exec(ctx, `
			UPDATE "ImportSendDelivery"
			SET "status" = 'suppressed', "error" = 'opposition survenue avant envoi', "updatedAt" = now()
			WHERE "id" = ANY($1::text[]) AND "status" IN ('queued', 'claimed')`, skipped); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE "ImportSendWave"
			SET "skippedCount" = "skippedCount" + $2, "updatedAt" = now()
			WHERE "id" = $1`, waveID, len(skipped)); err != nil {
			return nil, err
		}
	}
	return kept, nil
}

// MarkSendResult enregistre l'issue d'un envoi et avance les compteurs.
// `hardBounce` distingue un rejet durable (5xx, boîte inexistante) d'un échec
// transitoire : seuls les premiers alimentent la suspension automatique — un
// incident transport ne doit pas punir le lot.
func (s *Service) MarkSendResult(ctx context.Context, waveID, deliveryID string, ok bool, errText string, hardBounce bool) error {
	status := "sent"
	if !ok {
		status = "failed"
	}
	if _, err := s.pool.Exec(ctx, `
		UPDATE "ImportSendDelivery"
		SET "status" = $2, "error" = NULLIF($3, ''), "sentAt" = CASE WHEN $2 = 'sent' THEN now() ELSE NULL END, "updatedAt" = now()
		WHERE "id" = $1 AND "waveId" = $4 AND "status" IN ('queued', 'claimed')`,
		deliveryID, status, errText, waveID); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx, `
		UPDATE "ImportSendWave"
		SET "sentCount" = "sentCount" + CASE WHEN $2 = 'sent' THEN 1 ELSE 0 END,
		    "failedCount" = "failedCount" + CASE WHEN $2 = 'failed' THEN 1 ELSE 0 END,
		    "hardBounceCount" = "hardBounceCount" + CASE WHEN $3 THEN 1 ELSE 0 END,
		    "updatedAt" = now()
		WHERE "id" = $1`, waveID, status, ok && hardBounce)
	return err
}

// isHardBounce classifie une erreur d'envoi synchrone. Heuristique documentée
// comme telle : sans ingest de retours async (DSN/plaintes, fiche 04), le code
// SMTP synchrone est le seul signal de rejet durable disponible. Un 5xx, une
// boîte inexistante ou un message infaillible de rejet valent rejet durable ;
// tout le reste (timeout, 4xx, panne provider) reste un simple échec.
func isHardBounce(errText string) bool {
	lowered := strings.ToLower(strings.TrimSpace(errText))
	if lowered == "" {
		return false
	}
	for _, marker := range []string{
		"550", "551", "552", "553", "554",
		"user unknown", "mailbox unavailable", "mailbox not found",
		"undeliverable", "undelivered", "rejected",
		"address rejected", "recipient rejected", "no such user",
		"account disabled", "account inactive", "blocked due to bounce",
	} {
		if strings.Contains(lowered, marker) {
			return true
		}
	}
	return false
}

// EvaluateSendSuspension compare les compteurs de la vague à ses seuils et,
// en cas de dépassement, suspend : vague en pause, lot suspendu, décision
// système tracée, événement. Retourne true si la vague vient d'être suspendue.
//
// La suspension est conservatoire et réversible (reprise staff explicite) ;
// elle n'efface rien et ne punit personne — elle stoppe l'hémorragie.
func (s *Service) EvaluateSendSuspension(ctx context.Context, waveID string) (bool, error) {
	var (
		batchID, publicationID                string
		sent, failed, hardBounces, complaints int
		maxHardBounceRate                     float64
		maxComplaints, minSample              int
		maxFailedRate                         float64
	)
	err := s.pool.QueryRow(ctx, `
		SELECT "batchId", "publicationId", "sentCount", "failedCount",
		       "hardBounceCount", "complaintCount",
		       "maxHardBounceRate", "maxComplaints", "maxFailedRate", "minSample"
		FROM "ImportSendWave" WHERE "id" = $1`, waveID).Scan(
		&batchID, &publicationID, &sent, &failed, &hardBounces, &complaints,
		&maxHardBounceRate, &maxComplaints, &maxFailedRate, &minSample)
	if err != nil {
		return false, err
	}
	tried := sent + failed
	if tried < minSample {
		return false, nil
	}
	hardRate := float64(hardBounces) / float64(tried)
	failedRate := float64(failed) / float64(tried)
	if hardRate <= maxHardBounceRate && complaints < maxComplaints && failedRate <= maxFailedRate {
		return false, nil
	}

	reason := map[string]any{
		"tried": tried, "hardBounces": hardBounces, "complaints": complaints, "failed": failed,
		"hardRate": hardRate, "failedRate": failedRate,
		"thresholds": map[string]any{
			"maxHardBounceRate": maxHardBounceRate, "maxComplaints": maxComplaints,
			"maxFailedRate": maxFailedRate, "minSample": minSample,
		},
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	decisionID := uuid.NewString()
	if _, err := tx.Exec(ctx, `
		INSERT INTO "SubscriberImportDecision" (
			"id", "batchId", "decision", "actorKind",
			"internalReason", "publicReason", "limits",
			"fileVersion", "fileFingerprint"
		)
		SELECT $1, $2, 'suspended', 'system',
		       'suspension automatique : seuils de qualité dépassés', 'Envois suspendus par sécurité : qualité insuffisante détectée pendant la vague.',
		       '{}'::jsonb, "fileVersion", "fileFingerprint"
		FROM "SubscriberImportBatch" WHERE "id" = $2`, decisionID, batchID); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE "ImportSendWave"
		SET "status" = 'paused', "updatedAt" = now()
		WHERE "id" = $1 AND "status" IN ('queued', 'sending')`, waveID); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE "SubscriberImportBatch"
		SET "status" = 'suspended', "suspendedAt" = now(), "updatedAt" = now()
		WHERE "id" = $1`, batchID); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO "SubscriberImportEvent" ("id", "batchId", "type", "actorId", "actorKind", "detail")
		VALUES ($1, $2, 'auto_suspended', NULL, 'system', $3)`,
		uuid.NewString(), batchID, mustJSON(map[string]any{
			"waveId": waveID, "decisionId": decisionID, "signals": reason,
		})); err != nil {
		return false, err
	}
	_ = publicationID
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	log.Printf("[imports] vague %s suspendue automatiquement : %+v", waveID, reason)
	return true, nil
}

// FinishSendWaveIfDrained clôt la vague et le lot quand il ne reste ni
// livraisons en attente ni vagues actives.
func (s *Service) FinishSendWaveIfDrained(ctx context.Context, waveID string) (bool, error) {
	var batchID string
	var queued int
	err := s.pool.QueryRow(ctx, `
		SELECT w."batchId",
		       (SELECT COUNT(*) FROM "ImportSendDelivery" d
		         WHERE d."waveId" = $1 AND d."status" IN ('queued', 'claimed'))
		FROM "ImportSendWave" w WHERE w."id" = $1`, waveID).Scan(&batchID, &queued)
	if err != nil {
		return false, err
	}
	if queued > 0 {
		return false, nil
	}
	if _, err := s.pool.Exec(ctx, `
		UPDATE "ImportSendWave"
		SET "status" = 'completed', "completedAt" = now(), "updatedAt" = now()
		WHERE "id" = $1 AND "status" IN ('queued', 'sending')`, waveID); err != nil {
		return false, err
	}
	var activeWaves int
	if err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM "ImportSendWave"
		WHERE "batchId" = $1 AND "status" IN ('queued', 'sending', 'paused')`, batchID).Scan(&activeWaves); err != nil {
		return false, err
	}
	if activeWaves > 0 {
		return true, nil
	}
	if _, err := s.pool.Exec(ctx, `
		UPDATE "SubscriberImportBatch"
		SET "status" = 'completed', "updatedAt" = now()
		WHERE "id" = $1 AND "status" = 'running'`, batchID); err != nil {
		return false, err
	}
	if err := s.recordEvent(ctx, batchID, "completed", "", "system", map[string]any{
		"reason": "vagues d'envoi épuisées",
	}); err != nil {
		log.Printf("[imports] événement lot %s: %v", batchID, err)
	}
	return true, nil
}

// CancelSendWave annule une vague (staff) : les livraisons en attente sont
// écartées avec motif, jamais envoyées plus tard par reprise.
func (s *Service) CancelSendWave(ctx context.Context, staffID, waveID string) error {
	var batchID string
	if err := s.pool.QueryRow(ctx, `
		SELECT "batchId" FROM "ImportSendWave" WHERE "id" = $1`, waveID).Scan(&batchID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errNotFound
		}
		return err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `
		UPDATE "ImportSendDelivery"
		SET "status" = 'skipped', "error" = 'vague annulée par le staff', "updatedAt" = now()
		WHERE "waveId" = $1 AND "status" IN ('queued', 'claimed')`, waveID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE "ImportSendWave"
		SET "status" = 'cancelled', "updatedAt" = now()
		WHERE "id" = $1`, waveID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO "SubscriberImportEvent" ("id", "batchId", "type", "actorId", "actorKind", "detail")
		VALUES ($1, $2, 'send_wave_cancelled', $3, 'staff', $4)`,
		uuid.NewString(), batchID, toUUID(staffID), mustJSON(map[string]any{"waveId": waveID})); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// PauseSendWaveForKill met une vague en pause quand l'arrêt d'urgence global
// est actif. Retourne true si la vague a été (ou était déjà) mise en pause —
// le worker s'arrête alors sans envoyer ni ré-enfiler. La reprise est
// manuelle staff (l'ouverture rouvre une paused existante). Les livraisons en
// attente restent en attente, le budget consommé reste consommé (un essai
// réservé est un coût, même non envoyé — voir ClaimSendChunk).
func (s *Service) PauseSendWaveForKill(ctx context.Context, waveID string) (bool, error) {
	if !comms.EmailKillEngaged(ctx, s.pool) {
		return false, nil
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE "ImportSendWave"
		SET "status" = 'paused', "updatedAt" = now()
		WHERE "id" = $1 AND "status" IN ('queued', 'sending')`, waveID)
	if err != nil {
		return false, err
	}
	if tag.RowsAffected() == 0 {
		return true, nil
	}
	var batchID string
	if err := s.pool.QueryRow(ctx, `
		SELECT "batchId" FROM "ImportSendWave" WHERE "id" = $1`, waveID).Scan(&batchID); err != nil {
		return false, err
	}
	if err := s.recordEvent(ctx, batchID, "paused", "", "system", map[string]any{
		"reason": "workers-email-kill", "waveId": waveID,
	}); err != nil {
		log.Printf("[imports] event pause vague d'envoi %s: %v", waveID, err)
	}
	log.Printf("[imports] vague d'envoi %s en pause (arrêt d'urgence global)", waveID)
	return true, nil
}

// activeSendWave renvoie la vague d'envoi vivante d'un lot, ou un DTO vide.
func (s *Service) activeSendWave(ctx context.Context, batchID string) (SendWaveDTO, error) {
	var id string
	err := s.pool.QueryRow(ctx, `
		SELECT "id" FROM "ImportSendWave"
		WHERE "batchId" = $1 AND "status" IN ('queued', 'sending', 'paused')
		ORDER BY "createdAt" DESC LIMIT 1`, batchID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return SendWaveDTO{}, nil
	}
	if err != nil {
		return SendWaveDTO{}, err
	}
	return s.getSendWave(ctx, id)
}

// getSendWave charge une vague d'envoi avec son budget.
func (s *Service) getSendWave(ctx context.Context, waveID string) (SendWaveDTO, error) {
	var (
		dto              SendWaveDTO
		completed        *time.Time
		created, updated time.Time
	)
	err := s.pool.QueryRow(ctx, `
		SELECT w."id", w."batchId", w."status",
		       b."cap", b."consumed",
		       w."sentCount", w."skippedCount", w."failedCount",
		       w."hardBounceCount", w."complaintCount", w."unsubscribeCount",
		       w."completedAt", w."createdAt", w."updatedAt"
		FROM "ImportSendWave" w
		JOIN "ImportSendBudget" b ON b."id" = w."budgetId"
		WHERE w."id" = $1`, waveID).Scan(
		&dto.ID, &dto.BatchID, &dto.Status,
		&dto.BudgetCap, &dto.BudgetConsumed,
		&dto.SentCount, &dto.SkippedCount, &dto.FailedCount,
		&dto.HardBounceCount, &dto.ComplaintCount, &dto.UnsubscribeCount,
		&completed, &created, &updated)
	if errors.Is(err, pgx.ErrNoRows) {
		return SendWaveDTO{}, errNotFound
	}
	if err != nil {
		return SendWaveDTO{}, err
	}
	dto.CompletedAt = formatTimePtr(completed)
	dto.CreatedAt = created.Format(time.RFC3339)
	dto.UpdatedAt = updated.Format(time.RFC3339)
	return dto, nil
}

// ListSendWaves liste les vagues d'envoi d'un lot, la plus récente d'abord.
func (s *Service) ListSendWaves(ctx context.Context, batchID string) ([]SendWaveDTO, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT w."id", w."status",
		       b."cap", b."consumed",
		       w."sentCount", w."skippedCount", w."failedCount",
		       w."hardBounceCount", w."complaintCount", w."unsubscribeCount",
		       w."completedAt", w."createdAt", w."updatedAt"
		FROM "ImportSendWave" w
		JOIN "ImportSendBudget" b ON b."id" = w."budgetId"
		WHERE w."batchId" = $1
		ORDER BY w."createdAt" DESC`, batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SendWaveDTO{}
	for rows.Next() {
		var (
			dto              SendWaveDTO
			completed        *time.Time
			created, updated time.Time
		)
		if err := rows.Scan(&dto.ID, &dto.Status,
			&dto.BudgetCap, &dto.BudgetConsumed,
			&dto.SentCount, &dto.SkippedCount, &dto.FailedCount,
			&dto.HardBounceCount, &dto.ComplaintCount, &dto.UnsubscribeCount,
			&completed, &created, &updated); err != nil {
			return nil, err
		}
		dto.BatchID = batchID
		dto.CompletedAt = formatTimePtr(completed)
		dto.CreatedAt = created.Format(time.RFC3339)
		dto.UpdatedAt = updated.Format(time.RFC3339)
		out = append(out, dto)
	}
	return out, rows.Err()
}

// unmarshalLimits décode les limites JSONB sans jamais échouer sur du vide.
func unmarshalLimits(raw []byte, v any) error {
	if len(raw) == 0 {
		return nil
	}
	return json.Unmarshal(raw, v)
}
