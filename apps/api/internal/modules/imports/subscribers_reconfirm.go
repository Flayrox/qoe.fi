package imports

// ── Branche de reconfirmation individuelle (fiche 03 §7–8) ─────────────
// Un lot `approved_reconfirm` ne rend aucun contact destinataire : chaque
// adresse doit confirmer elle-même, une par une, via le lien de confirmation
// existant (`/v1/newsletters/confirm`). Ce fichier porte les demandes en
// attente et les vagues d'envoi plafonnées qui les portent.
//
// Invariants structurels (pas documentaires) :
//   • jeton à usage unique rattaché à (publication, email) : le lien vérifie
//     déjà ce triplet (email + publicationId + token, plus signature HMAC) et
//     consomme le jeton (`confirmationToken = NULL`). Ici on ajoute l'unicité
//     du jeton entre demandes (index unique sur l'empreinte) pour qu'un même
//     jeton ne serve jamais deux adresses, et on ne stocke que l'empreinte —
//     le jeton en clair ne vit que dans `Subscriber.confirmationToken`, comme
//     pour le double opt-in historique ;
//   • activation uniquement au clic : la vague crée des abonnés **inactifs**
//     (`receiveArticles = false`, `confirmedAt NULL`). Seul le clic individuel
//     franchit `confirmedAt`, via le chemin `ConfirmSubscriber` existant —
//     jamais le staff, jamais la vague ;
//   • une demande expirée ne confirme plus rien : la purge efface le token des
//     abonnés restés non confirmés au lieu de laisser un lien éternel. La
//     non-confirmation n'est PAS une opposition (pas de suppression) : ne pas
//     répondre n'est pas refuser.
//
// Vagues plafonnées, deux niveaux : taille de vague bornée à la création, puis
// tranches bornées par exécution avec délai entre tranches, sur la file dédiée
// `reconfirm` (jamais `default` : ni affamer ni être affamé par le bulk).

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/comms"
	"github.com/qoefi/api/internal/queue"
)

const (
	// defaultReconfirmWaveSize borne une vague créée sans taille demandée.
	defaultReconfirmWaveSize = 500
	// maxReconfirmWaveSize borne toute vague, même demandée plus grande.
	maxReconfirmWaveSize = 2000
	// reconfirmChunkSize borne les demandes traitées par exécution de tâche.
	reconfirmChunkSize = 100
	// reconfirmChunkDelay espace deux tranches d'une même vague.
	reconfirmChunkDelay = 60 * time.Second
	// reconfirmExpiryDays : durée de vie d'une demande sans expiration de décision.
	reconfirmExpiryDays = 30
)

// ReconfirmChunkDelay expose le délai inter-tranches au worker (le worker
// lit, le service décide).
func ReconfirmChunkDelay() time.Duration { return reconfirmChunkDelay }

var (
	// errReconfirmNotApproved : le lot n'est pas en `approved_reconfirm`.
	errReconfirmNotApproved = errors.New("le lot n'est pas approuvé en reconfirmation")
	// errReconfirmExpired : la décision d'approbation a expiré.
	errReconfirmExpired = errors.New("l'approbation de reconfirmation a expiré")
	// errReconfirmNothingPending : aucune adresse à reconfirmer dans ce lot.
	errReconfirmNothingPending = errors.New("aucune adresse à reconfirmer dans ce lot")
)

// Exportées pour la façade admin (même pattern que les autres sentinelles).
var (
	// ErrReconfirmNotApproved : lot non approuvé en reconfirmation.
	ErrReconfirmNotApproved = errReconfirmNotApproved
	// ErrReconfirmExpired : approbation expirée.
	ErrReconfirmExpired = errReconfirmExpired
	// ErrReconfirmNothingPending : rien à reconfirmer.
	ErrReconfirmNothingPending = errReconfirmNothingPending
)

// ReconfirmWaveDTO est la vue API d'une vague.
type ReconfirmWaveDTO struct {
	ID             string `json:"id"`
	BatchID        string `json:"batchId"`
	Status         string `json:"status"`
	WaveSize       int    `json:"waveSize"`
	SentCount      int    `json:"sentCount"`
	ConfirmedCount int    `json:"confirmedCount"`
	ExpiredCount   int    `json:"expiredCount"`
	SkippedCount   int    `json:"skippedCount"`
	ExpiresAt      string `json:"expiresAt,omitempty"`
	CompletedAt    string `json:"completedAt,omitempty"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

// newReconfirmToken tire un jeton opaque (256 bits) et son empreinte. Seule
// l'empreinte est stockée côté demandes ; le jeton en clair n'existe que dans
// `Subscriber.confirmationToken`, comme pour le double opt-in historique.
func newReconfirmToken() (token, hash string, err error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", "", err
	}
	token = hex.EncodeToString(raw[:])
	sum := sha256.Sum256([]byte(token))
	return token, hex.EncodeToString(sum[:]), nil
}

// StartReconfirmWave ouvre une vague de reconfirmation pour un lot approuvé.
// Idempotent par lot : une seule vague active à la fois (contrainte unique) ;
// si une vague active existe déjà, elle est renvoyée (et relancée si elle
// était en pause après une suspension levée) au lieu d'en créer une seconde.
func (s *Service) StartReconfirmWave(ctx context.Context, staffID, batchID string, waveSize int) (ReconfirmWaveDTO, error) {
	var (
		status, publicationID, decisionID string
		fileVersion                       int
		fileFingerprint                   string
	)
	err := s.pool.QueryRow(ctx, `
		SELECT "status", "publicationId", "fileVersion", "fileFingerprint"
		FROM "SubscriberImportBatch" WHERE "id" = $1`,
		batchID).Scan(&status, &publicationID, &fileVersion, &fileFingerprint)
	if errors.Is(err, pgx.ErrNoRows) {
		return ReconfirmWaveDTO{}, errNotFound
	}
	if err != nil {
		return ReconfirmWaveDTO{}, err
	}
	if status != BatchApprovedReconfirm && status != BatchRunning {
		return ReconfirmWaveDTO{}, errReconfirmNotApproved
	}

	// La vague se rattache à la dernière décision `approved_reconfirm` : c'est
	// elle qui porte les limites (plafond, expiration).
	var (
		decisionExpires *time.Time
		limitsRaw       []byte
	)
	err = s.pool.QueryRow(ctx, `
		SELECT "id", "expiresAt", "limits"
		FROM "SubscriberImportDecision"
		WHERE "batchId" = $1 AND "decision" = 'approved_reconfirm'
		ORDER BY "createdAt" DESC LIMIT 1`,
		batchID).Scan(&decisionID, &decisionExpires, &limitsRaw)
	if errors.Is(err, pgx.ErrNoRows) {
		return ReconfirmWaveDTO{}, errReconfirmNotApproved
	}
	if err != nil {
		return ReconfirmWaveDTO{}, err
	}
	if decisionExpires != nil && !decisionExpires.IsZero() && time.Now().UTC().After(*decisionExpires) {
		return ReconfirmWaveDTO{}, errReconfirmExpired
	}

	if existing, err := s.activeReconfirmWave(ctx, batchID); err != nil {
		return ReconfirmWaveDTO{}, err
	} else if existing.ID != "" {
		// Reprise d'une vague en pause (suspension levée) : on la remet en
		// file au lieu d'en ouvrir une seconde qui doublerait les envois.
		if existing.Status == "paused" {
			if _, err := s.pool.Exec(ctx, `
				UPDATE "SubscriberImportReconfirmWave"
				SET "status" = 'queued', "updatedAt" = now()
				WHERE "id" = $1 AND "status" = 'paused'`, existing.ID); err != nil {
				return ReconfirmWaveDTO{}, err
			}
			existing.Status = "queued"
			if err := queue.PublishImportReconfirmWave(s.asynq, queue.SubscriberImportReconfirmPayload{WaveID: existing.ID}, 0); err != nil {
				log.Printf("[imports] re-enqueue vague %s: %v", existing.ID, err)
			}
		}
		return existing, nil
	}

	size := waveSize
	if size <= 0 {
		size = defaultReconfirmWaveSize
	}
	if size > maxReconfirmWaveSize {
		size = maxReconfirmWaveSize
	}
	if cap := decisionWaveCap(limitsRaw); cap > 0 && size > cap {
		size = cap
	}
	expiresAt := time.Now().UTC().AddDate(0, 0, reconfirmExpiryDays)
	if decisionExpires != nil && !decisionExpires.IsZero() && decisionExpires.Before(expiresAt) {
		expiresAt = *decisionExpires
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ReconfirmWaveDTO{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	waveID := uuid.NewString()
	if _, err := tx.Exec(ctx, `
		INSERT INTO "SubscriberImportReconfirmWave"
		    ("id", "batchId", "publicationId", "decisionId", "status",
		     "waveSize", "expiresAt", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, 'queued', $5, $6, now(), now())`,
		waveID, batchID, publicationID, decisionID, size, expiresAt); err != nil {
		return ReconfirmWaveDTO{}, err
	}

	created, err := s.createWaveRequests(ctx, tx, waveID, batchID, publicationID, size, expiresAt)
	if err != nil {
		return ReconfirmWaveDTO{}, err
	}
	if created == 0 {
		return ReconfirmWaveDTO{}, errReconfirmNothingPending
	}

	if _, err := tx.Exec(ctx, `
		UPDATE "SubscriberImportBatch"
		SET "status" = 'running', "updatedAt" = now()
		WHERE "id" = $1 AND "status" = $2`, batchID, BatchApprovedReconfirm); err != nil {
		return ReconfirmWaveDTO{}, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO "SubscriberImportEvent" ("id", "batchId", "type", "actorId", "actorKind", "detail")
		VALUES ($1, $2, 'reconfirm_wave_started', $3, 'staff', $4)`,
		uuid.NewString(), batchID, toUUID(staffID),
		mustJSON(map[string]any{"waveId": waveID, "size": size, "requests": created})); err != nil {
		return ReconfirmWaveDTO{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ReconfirmWaveDTO{}, err
	}

	if err := queue.PublishImportReconfirmWave(s.asynq, queue.SubscriberImportReconfirmPayload{WaveID: waveID}, 0); err != nil {
		log.Printf("[imports] enqueue vague %s: %v", waveID, err)
	}
	return s.getReconfirmWave(ctx, waveID)
}

// decisionWaveCap lit un éventuel plafond de vague posé par le staff dans les
// limites de la décision (`limits.maxWave`). Absent ou invalide : aucun plafond
// autre que les bornes du service.
func decisionWaveCap(limitsRaw []byte) int {
	if len(limitsRaw) == 0 {
		return 0
	}
	var limits map[string]any
	if err := json.Unmarshal(limitsRaw, &limits); err != nil {
		return 0
	}
	switch v := limits["maxWave"].(type) {
	case float64:
		if v > 0 {
			return int(v)
		}
	}
	return 0
}

// createWaveRequests fige les demandes de la vague : abonnés inactifs porteurs
// d'un jeton frais + demandes en attente. Seules les lignes encore
// `pending_confirmation` et sans demande vivante sont prises, par ordre
// alphabétique stable (curseur de reprise déterministe).
func (s *Service) createWaveRequests(ctx context.Context, tx pgx.Tx, waveID, batchID, publicationID string, size int, expiresAt time.Time) (int, error) {
	rows, err := tx.Query(ctx, `
		SELECT r."id", r."email"
		FROM "SubscriberImportRow" r
		WHERE r."batchId" = $1
		  AND r."status" = 'pending_confirmation'
		  AND NOT EXISTS (
		      SELECT 1 FROM "SubscriberImportReconfirmRequest" q
		      WHERE q."batchId" = $1 AND q."email" = r."email"
		        AND q."status" IN ('pending', 'sent')
		  )
		ORDER BY r."email" ASC
		LIMIT $2`, batchID, size)
	if err != nil {
		return 0, err
	}
	type candidate struct {
		rowID string
		email string
	}
	candidates := []candidate{}
	for rows.Next() {
		var c candidate
		if err := rows.Scan(&c.rowID, &c.email); err != nil {
			rows.Close()
			return 0, err
		}
		candidates = append(candidates, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if len(candidates) == 0 {
		return 0, nil
	}

	created := 0
	for _, c := range candidates {
		token, hash, err := newReconfirmToken()
		if err != nil {
			return created, err
		}
		// Abonné inactif porteur du jeton : ni destinataire (`confirmedAt`
		// NULL l'exclut de la sélection d'envoi), ni actif. Si l'adresse s'est
		// inscrite ou confirmée entre-temps par un autre chemin, on ne touche
		// à rien et on la sort de la vague.
		var ensured bool
		err = tx.QueryRow(ctx, `
			INSERT INTO "Subscriber" ("id", "email", "publicationId", "locale",
			                          "isActive", "receiveArticles", "confirmedAt",
			                          "confirmationToken", "createdAt", "updatedAt")
			VALUES (gen_random_uuid()::text, $1, $2, 'fr', true, false, NULL, $3, now(), now())
			ON CONFLICT ("email", "publicationId") DO NOTHING
			RETURNING true`, c.email, publicationID, token).Scan(&ensured)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return created, err
		}
		if !ensured {
			// Adresse déjà connue : on ne réécrit jamais un abonné existant
			// (ni son token, ni son état). La ligne quitte la reconfirmation.
			if _, err := tx.Exec(ctx, `
				UPDATE "SubscriberImportRow"
				SET "status" = 'already_subscribed',
				    "reason" = 'contact devenu connu avant la vague',
				    "updatedAt" = now()
				WHERE "batchId" = $1 AND "email" = $2 AND "status" = 'pending_confirmation'`,
				batchID, c.email); err != nil {
				return created, err
			}
			continue
		}
		// Une seule demande vivante par adresse : les demandes antérieures
		// (vague précédente, liens jamais cliqués) sont périmées pour que le
		// jeton en circulation soit unique.
		if _, err := tx.Exec(ctx, `
			UPDATE "SubscriberImportReconfirmRequest"
			SET "status" = 'expired', "updatedAt" = now()
			WHERE "publicationId" = $1 AND "email" = $2
			  AND "status" IN ('pending', 'sent')
			  AND "waveId" <> $3`, publicationID, c.email, waveID); err != nil {
			return created, err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO "SubscriberImportReconfirmRequest"
			    ("id", "waveId", "batchId", "publicationId", "rowId",
			     "email", "tokenHash", "status", "expiresAt", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, now(), now())
			ON CONFLICT ("waveId", "email") DO NOTHING`,
			uuid.NewString(), waveID, batchID, publicationID, c.rowID,
			c.email, hash, expiresAt); err != nil {
			return created, err
		}
		created++
	}
	return created, nil
}

// activeReconfirmWave renvoie la vague vivante d'un lot, ou un DTO vide.
func (s *Service) activeReconfirmWave(ctx context.Context, batchID string) (ReconfirmWaveDTO, error) {
	var id string
	err := s.pool.QueryRow(ctx, `
		SELECT "id" FROM "SubscriberImportReconfirmWave"
		WHERE "batchId" = $1 AND "status" IN ('queued', 'sending', 'paused')
		ORDER BY "createdAt" DESC LIMIT 1`, batchID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ReconfirmWaveDTO{}, nil
	}
	if err != nil {
		return ReconfirmWaveDTO{}, err
	}
	return s.getReconfirmWave(ctx, id)
}

// getReconfirmWave charge une vague.
func (s *Service) getReconfirmWave(ctx context.Context, waveID string) (ReconfirmWaveDTO, error) {
	var (
		dto                ReconfirmWaveDTO
		expires, completed *time.Time
		created, updated   time.Time
	)
	err := s.pool.QueryRow(ctx, `
		SELECT "id", "batchId", "status", "waveSize", "sentCount",
		       "confirmedCount", "expiredCount", "skippedCount",
		       "expiresAt", "completedAt", "createdAt", "updatedAt"
		FROM "SubscriberImportReconfirmWave" WHERE "id" = $1`, waveID).Scan(
		&dto.ID, &dto.BatchID, &dto.Status, &dto.WaveSize, &dto.SentCount,
		&dto.ConfirmedCount, &dto.ExpiredCount, &dto.SkippedCount,
		&expires, &completed, &created, &updated)
	if errors.Is(err, pgx.ErrNoRows) {
		return ReconfirmWaveDTO{}, errNotFound
	}
	if err != nil {
		return ReconfirmWaveDTO{}, err
	}
	dto.ExpiresAt = formatTimePtr(expires)
	dto.CompletedAt = formatTimePtr(completed)
	dto.CreatedAt = created.Format(time.RFC3339)
	dto.UpdatedAt = updated.Format(time.RFC3339)
	return dto, nil
}

// ListReconfirmWaves liste les vagues d'un lot (la plus récente d'abord).
func (s *Service) ListReconfirmWaves(ctx context.Context, batchID string) ([]ReconfirmWaveDTO, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT "id", "status", "waveSize", "sentCount",
		       "confirmedCount", "expiredCount", "skippedCount",
		       "expiresAt", "completedAt", "createdAt", "updatedAt"
		FROM "SubscriberImportReconfirmWave"
		WHERE "batchId" = $1
		ORDER BY "createdAt" DESC`, batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ReconfirmWaveDTO{}
	for rows.Next() {
		var (
			dto                ReconfirmWaveDTO
			expires, completed *time.Time
			created, updated   time.Time
		)
		if err := rows.Scan(&dto.ID, &dto.Status, &dto.WaveSize, &dto.SentCount,
			&dto.ConfirmedCount, &dto.ExpiredCount, &dto.SkippedCount,
			&expires, &completed, &created, &updated); err != nil {
			return nil, err
		}
		dto.BatchID = batchID
		dto.ExpiresAt = formatTimePtr(expires)
		dto.CompletedAt = formatTimePtr(completed)
		dto.CreatedAt = created.Format(time.RFC3339)
		dto.UpdatedAt = updated.Format(time.RFC3339)
		out = append(out, dto)
	}
	return out, rows.Err()
}

// ProcessReconfirmWave traite une tranche plafonnée d'une vague : réclame des
// demandes en attente (verrou sauté, pas d'attente entre workers), revérifie
// l'opposition et l'état de l'abonné au moment de l'envoi, enfile l'email de
// confirmation existant, puis rend la main. Retourne true quand la vague est
// terminée (rien à re-enfiler), false quand une tranche suivante est due.
//
// La tranche est le second plafond après la taille de vague : même un worker
// relancé en boucle ne peut pas dépasser `reconfirmChunkSize` envois par
// exécution, et la suite repart avec un délai.
func (s *Service) ProcessReconfirmWave(ctx context.Context, waveID string) (bool, error) {
	// Lecture des deux statuts (vague + lot) : un lot suspendu ou rejeté met
	// la vague en pause au lieu de continuer à envoyer.
	var waveStatus, batchStatus, batchID, publicationID string
	if err := s.pool.QueryRow(ctx, `
		SELECT w."status", b."status", w."batchId", w."publicationId"
		FROM "SubscriberImportReconfirmWave" w
		JOIN "SubscriberImportBatch" b ON b."id" = w."batchId"
		WHERE w."id" = $1`, waveID).Scan(&waveStatus, &batchStatus, &batchID, &publicationID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return true, nil // vague supprimée entre-temps : rien à faire.
		}
		return false, err
	}
	if waveStatus == "completed" || waveStatus == "cancelled" {
		return true, nil
	}
	if batchStatus == BatchSuspended || batchStatus == BatchRejected || batchStatus == BatchCancelled {
		if _, err := s.pool.Exec(ctx, `
			UPDATE "SubscriberImportReconfirmWave"
			SET "status" = 'paused', "updatedAt" = now()
			WHERE "id" = $1 AND "status" IN ('queued', 'sending')`, waveID); err != nil {
			return false, err
		}
		return true, nil
	}
	if waveStatus == "paused" {
		return true, nil
	}
	// Arrêt d'urgence global (workers-email-kill) : la vague passe en pause
	// avec événement, sans rien envoyer. Reprise manuelle staff (l'endpoint
	// de démarrage rouvre une paused existante au lieu d'en créer une
	// seconde). Les demandes restent en attente, tokens intacts.
	if comms.EmailKillEngaged(ctx, s.pool) {
		if _, err := s.pool.Exec(ctx, `
			UPDATE "SubscriberImportReconfirmWave"
			SET "status" = 'paused', "updatedAt" = now()
			WHERE "id" = $1 AND "status" IN ('queued', 'sending')`, waveID); err != nil {
			return false, err
		}
		if err := s.recordEvent(ctx, batchID, "paused", "", "system", map[string]any{
			"reason": "workers-email-kill",
		}); err != nil {
			log.Printf("[imports] event pause vague %s: %v", waveID, err)
		}
		log.Printf("[imports] vague %s en pause (arrêt d'urgence global)", waveID)
		return true, nil
	}
	if _, err := s.pool.Exec(ctx, `
		UPDATE "SubscriberImportReconfirmWave"
		SET "status" = 'sending', "updatedAt" = now()
		WHERE "id" = $1 AND "status" = 'queued'`, waveID); err != nil {
		return false, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	claimed, err := s.claimReconfirmChunk(ctx, tx, waveID, publicationID)
	if err != nil {
		return false, err
	}
	sent, skipped, expired := 0, 0, 0
	for _, c := range claimed {
		switch s.sendReconfirmOne(ctx, tx, waveID, publicationID, c) {
		case reconfirmSent:
			sent++
		case reconfirmSkipped:
			skipped++
		case reconfirmExpired:
			expired++
		}
	}
	// Curseur de reprise : dernier email traité, ordre stable.
	cursor := ""
	if len(claimed) > 0 {
		cursor = claimed[len(claimed)-1].email
	}
	var remaining int
	err = tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM "SubscriberImportReconfirmRequest"
		WHERE "waveId" = $1 AND "status" = 'pending'`, waveID).Scan(&remaining)
	if err != nil {
		return false, err
	}
	finished := remaining == 0
	if _, err := tx.Exec(ctx, `
		UPDATE "SubscriberImportReconfirmWave"
		SET "sentCount" = "sentCount" + $2,
		    "skippedCount" = "skippedCount" + $3,
		    "expiredCount" = "expiredCount" + $4,
		    "cursor" = COALESCE(NULLIF($5, ''), "cursor"),
		    "status" = CASE WHEN $6 THEN 'completed' ELSE 'sending' END,
		    "completedAt" = CASE WHEN $6 THEN now() ELSE "completedAt" END,
		    "updatedAt" = now()
		WHERE "id" = $1`,
		waveID, sent, skipped, expired, cursor, finished); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}

	if finished {
		s.finishBatchIfDrained(ctx, batchID)
	}
	return finished, nil
}

type reconfirmClaim struct {
	id    string
	email string
}

type reconfirmOutcome int

const (
	reconfirmSent reconfirmOutcome = iota
	reconfirmSkipped
	reconfirmExpired
)

// claimReconfirmChunk réclame une tranche de demandes (verrou sauté : deux
// workers ne se disputent jamais la même adresse).
func (s *Service) claimReconfirmChunk(ctx context.Context, tx pgx.Tx, waveID, publicationID string) ([]reconfirmClaim, error) {
	_ = publicationID
	rows, err := tx.Query(ctx, `
		SELECT "id", "email" FROM "SubscriberImportReconfirmRequest"
		WHERE "waveId" = $1 AND "status" = 'pending'
		ORDER BY "email" ASC
		LIMIT $2
		FOR UPDATE SKIP LOCKED`, waveID, reconfirmChunkSize)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []reconfirmClaim{}
	for rows.Next() {
		var c reconfirmClaim
		if err := rows.Scan(&c.id, &c.email); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// sendReconfirmOne envoie (ou écarte) une demande : opposition et état de
// l'abonné sont revérifiés **au moment de l'envoi**, pas au moment de la
// création de la vague — un désabonnement ou une plainte entre-temps doit
// gagner contre la vague.
func (s *Service) sendReconfirmOne(ctx context.Context, tx pgx.Tx, waveID, publicationID string, c reconfirmClaim) reconfirmOutcome {
	var (
		expiresAt                 *time.Time
		isActive, receiveArticles bool
		confirmed                 bool
		hasSubscriber             bool
		suppressed                bool
	)
	err := tx.QueryRow(ctx, `
		SELECT q."expiresAt",
		       COALESCE(s."isActive", false),
		       COALESCE(s."receiveArticles", false),
		       s."confirmedAt" IS NOT NULL,
		       s."id" IS NOT NULL,
		       EXISTS(
		           SELECT 1 FROM "EmailSuppression" x
		           WHERE x.email = q."email"
		             AND (x."scope" = 'global'
		                  OR (x."scope" = 'publication' AND x."publicationId" = $1))
		       )
		FROM "SubscriberImportReconfirmRequest" q
		LEFT JOIN "Subscriber" s
		       ON s."publicationId" = $1 AND s.email = q."email"
		WHERE q."id" = $2`, publicationID, c.id).Scan(
		&expiresAt, &isActive, &receiveArticles, &confirmed, &hasSubscriber, &suppressed)
	if err != nil {
		log.Printf("[imports] vague %s demande %s: %v", waveID, c.id, err)
		return reconfirmSkipped
	}
	now := time.Now().UTC()
	if (expiresAt != nil && !expiresAt.IsZero() && now.After(*expiresAt)) || !hasSubscriber {
		return s.expireReconfirmRequest(ctx, tx, waveID, publicationID, c)
	}
	// Opposition survenue entre la création de la vague et l'envoi. Le signal
	// est la DÉSACTIVATION (`isActive` faux : c'est ce que pose toute
	// désinscription) ou un abonné confirmé qui ne reçoit plus rien. Le seul
	// `receiveArticles` faux ne prouve RIEN : la vague provisionne elle-même
	// ses abonnés en `receiveArticles = false, confirmedAt NULL` (elle ne rend
	// personne destinataire), et lire ce champ comme une opposition écartait
	// la totalité de ses propres adresses — zéro envoi, zéro clic possible.
	if suppressed || (hasSubscriber && (!isActive || (confirmed && !receiveArticles))) {
		// Opposition avérée : la demande est écartée et l'opposition rendue
		// durable. La vague ne réessaiera jamais cette adresse.
		if _, err := tx.Exec(ctx, `
			UPDATE "SubscriberImportReconfirmRequest"
			SET "status" = 'skipped', "updatedAt" = now()
			WHERE "id" = $1 AND "status" = 'pending'`, c.id); err != nil {
			log.Printf("[imports] vague %s demande %s: %v", waveID, c.id, err)
			return reconfirmSkipped
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO "EmailSuppression" ("id", "email", "scope", "publicationId", "reason", "source")
			SELECT gen_random_uuid()::text, $2, 'publication', $1, 'unsubscribe', $3
			WHERE NOT EXISTS (
			    SELECT 1 FROM "EmailSuppression" x WHERE x.email = $2
			      AND (x."scope" = 'global' OR (x."scope" = 'publication' AND x."publicationId" = $1))
			)`, publicationID, c.email, waveID); err != nil {
			log.Printf("[imports] vague %s suppression %s: %v", waveID, c.email, err)
		}
		return reconfirmSkipped
	}
	if confirmed {
		// Confirmé par un autre chemin entre-temps : on constate, on n'écrase rien.
		if _, err := tx.Exec(ctx, `
			UPDATE "SubscriberImportReconfirmRequest"
			SET "status" = 'confirmed', "confirmedAt" = now(), "updatedAt" = now()
			WHERE "id" = $1 AND "status" = 'pending'`, c.id); err != nil {
			log.Printf("[imports] vague %s demande %s: %v", waveID, c.id, err)
			return reconfirmSkipped
		}
		if _, err := tx.Exec(ctx, `
			UPDATE "SubscriberImportReconfirmWave"
			SET "confirmedCount" = "confirmedCount" + 1, "updatedAt" = now()
			WHERE "id" = $1`, waveID); err != nil {
			log.Printf("[imports] vague %s compteur: %v", waveID, err)
		}
		return reconfirmSent
	}
	if err := queue.PublishSubscriberConfirm(s.asynq, queue.SubscriberConfirmPayload{
		Email:         c.email,
		PublicationID: publicationID,
	}); err != nil {
		log.Printf("[imports] vague %s envoi %s: %v", waveID, c.email, err)
		return reconfirmSkipped
	}
	if _, err := tx.Exec(ctx, `
		UPDATE "SubscriberImportReconfirmRequest"
		SET "status" = 'sent', "sentAt" = now(), "attempts" = "attempts" + 1, "updatedAt" = now()
		WHERE "id" = $1 AND "status" = 'pending'`, c.id); err != nil {
		log.Printf("[imports] vague %s demande %s: %v", waveID, c.id, err)
		return reconfirmSkipped
	}
	return reconfirmSent
}

// expireReconfirmRequest périme une demande et efface le token de l'abonné
// resté non confirmé : un lien expiré ne doit plus rien activer.
func (s *Service) expireReconfirmRequest(ctx context.Context, tx pgx.Tx, waveID, publicationID string, c reconfirmClaim) reconfirmOutcome {
	if _, err := tx.Exec(ctx, `
		UPDATE "SubscriberImportReconfirmRequest"
		SET "status" = 'expired', "updatedAt" = now()
		WHERE "id" = $1 AND "status" IN ('pending', 'sent')`, c.id); err != nil {
		log.Printf("[imports] vague %s demande %s: %v", waveID, c.id, err)
		return reconfirmExpired
	}
	if _, err := tx.Exec(ctx, `
		UPDATE "Subscriber"
		SET "confirmationToken" = NULL, "updatedAt" = now()
		WHERE "publicationId" = $1 AND "email" = $2
		  AND "confirmedAt" IS NULL AND "confirmationToken" IS NOT NULL`, publicationID, c.email); err != nil {
		log.Printf("[imports] vague %s purge token %s: %v", waveID, c.email, err)
	}
	return reconfirmExpired
}

// finishBatchIfDrained clôt le lot quand plus aucune vague n'est active et
// qu'il ne reste aucune demande vivante : `running` → `completed`.
func (s *Service) finishBatchIfDrained(ctx context.Context, batchID string) {
	var activeWaves, liveRequests int
	err := s.pool.QueryRow(ctx, `
		SELECT
		  (SELECT COUNT(*) FROM "SubscriberImportReconfirmWave"
		    WHERE "batchId" = $1 AND "status" IN ('queued', 'sending', 'paused')),
		  -- Seules les demandes ENCORE À ENVOYER retiennent le lot ouvert. Une
		  -- demande envoyée est partie : ce qui reste dépend du clic du
		  -- destinataire, enregistré plus tard par MarkReconfirmConfirmed —
		  -- compter ces demandes comme vivantes gardait le lot ouvert pour
		  -- toujours (le clic du destinataire n'est pas une étape du lot).
		  (SELECT COUNT(*) FROM "SubscriberImportReconfirmRequest"
		    WHERE "batchId" = $1 AND "status" = 'pending')`,
		batchID).Scan(&activeWaves, &liveRequests)
	if err != nil {
		log.Printf("[imports] clôture lot %s: %v", batchID, err)
		return
	}
	if activeWaves > 0 || liveRequests > 0 {
		return
	}
	if _, err := s.pool.Exec(ctx, `
		UPDATE "SubscriberImportBatch"
		SET "status" = 'completed', "updatedAt" = now()
		WHERE "id" = $1 AND "status" = 'running'`, batchID); err != nil {
		log.Printf("[imports] clôture lot %s: %v", batchID, err)
		return
	}
	if err := s.recordEvent(ctx, batchID, "completed", "", "system", map[string]any{
		"reason": "vagues épuisées, aucune demande vivante",
	}); err != nil {
		log.Printf("[imports] événement lot %s: %v", batchID, err)
	}
}

// MarkReconfirmConfirmed constate une confirmation individuelle : appelée
// après un clic sur le lien (chemin `ConfirmSubscriber` existant). On ne
// fabrique rien ici — on constate que `confirmedAt` a été franchi par le
// chemin normal, et on l'impute à la demande pour les compteurs.
func (s *Service) MarkReconfirmConfirmed(ctx context.Context, publicationID, email string) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE "SubscriberImportReconfirmRequest"
		SET "status" = 'confirmed', "confirmedAt" = now(), "updatedAt" = now()
		WHERE "publicationId" = $1 AND "email" = $2
		  AND "status" IN ('pending', 'sent')`, publicationID, email)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return nil
	}
	_, err = s.pool.Exec(ctx, `
		UPDATE "SubscriberImportReconfirmWave" w
		SET "confirmedCount" = "confirmedCount" + $3, "updatedAt" = now()
		FROM "SubscriberImportReconfirmRequest" q
		WHERE q."waveId" = w."id" AND q."publicationId" = $1 AND q."email" = $2
		  AND q."status" = 'confirmed'`, publicationID, email, tag.RowsAffected())
	return err
}

// PurgeExpiredReconfirms périme les demandes échues d'un lot et efface les
// jetons des abonnés restés non confirmés. La non-confirmation n'est pas une
// opposition : aucune suppression n'est créée. À appeler depuis la console
// staff (et rejouable sans effet : une demande expirée reste expirée).
func (s *Service) PurgeExpiredReconfirms(ctx context.Context, actorID, batchID string) (int, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT "id", "email", "publicationId", "waveId"
		FROM "SubscriberImportReconfirmRequest"
		WHERE "batchId" = $1 AND "status" IN ('pending', 'sent')
		  AND "expiresAt" IS NOT NULL AND "expiresAt" < now()
		ORDER BY "email" ASC
		LIMIT 5000`, batchID)
	if err != nil {
		return 0, err
	}
	type expired struct {
		id, email, publicationID, waveID string
	}
	out := []expired{}
	for rows.Next() {
		var e expired
		if err := rows.Scan(&e.id, &e.email, &e.publicationID, &e.waveID); err != nil {
			rows.Close()
			return 0, err
		}
		out = append(out, e)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if len(out) == 0 {
		return 0, nil
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	ids := make([]string, 0, len(out))
	waves := map[string]int{}
	for _, e := range out {
		ids = append(ids, e.id)
		waves[e.waveID]++
	}
	if _, err := tx.Exec(ctx, `
		UPDATE "SubscriberImportReconfirmRequest"
		SET "status" = 'expired', "updatedAt" = now()
		WHERE "id" = ANY($1::text[]) AND "status" IN ('pending', 'sent')`, ids); err != nil {
		return 0, err
	}
	// On n'efface le token que des abonnés jamais confirmés : un confirmé garde
	// son historique (token déjà consommé par le chemin normal).
	if _, err := tx.Exec(ctx, `
		UPDATE "Subscriber" s
		SET "confirmationToken" = NULL, "updatedAt" = now()
		FROM "SubscriberImportReconfirmRequest" q
		WHERE q."id" = ANY($1::text[])
		  AND s."publicationId" = q."publicationId"
		  AND s."email" = q."email"
		  AND s."confirmedAt" IS NULL
		  AND s."confirmationToken" IS NOT NULL`, ids); err != nil {
		return 0, err
	}
	for waveID, n := range waves {
		if _, err := tx.Exec(ctx, `
			UPDATE "SubscriberImportReconfirmWave"
			SET "expiredCount" = "expiredCount" + $2, "updatedAt" = now()
			WHERE "id" = $1`, waveID, n); err != nil {
			return 0, err
		}
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO "SubscriberImportEvent" ("id", "batchId", "type", "actorId", "actorKind", "detail")
		VALUES ($1, $2, 'reconfirm_purged', $3, 'staff', $4)`,
		uuid.NewString(), batchID, toUUID(actorID),
		mustJSON(map[string]any{"expired": len(out)})); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return len(out), nil
}
