package adminauthz

// =====================================================================
// 🧾 Recorder — le garde laisse une trace interrogeable (plan, Phase 4)
// =====================================================================
// En mode OBSERVATION, un refus n'existe que dans les logs : impossible de
// répondre à « qui serait bloqué si on armait `authz-enforce` ? ». Le Recorder
// est l'`Observer` du garde : il écrit chaque décision (accord, refus appliqué,
// refus seulement observé) dans `AdminAuthzDecision`.
//
// Trois choix d'ingénierie, parce que c'est un chemin chaud :
//   - tampon borné + envoi NON bloquant : une base lente ne ralentit jamais la
//     requête de l'utilisateur, et un tampon plein perd la trace au lieu de
//     faire tomber la console (le compteur `Dropped` dit combien) ;
//   - écriture par lots courts, dans une goroutine dédiée, avec vidage
//     périodique (une décision seule n'attend pas un second événement) ;
//   - fermeture explicite (`Close`) pour que l'arrêt du serveur vide le tampon.
//
// Ce qui est enregistré est AUSSI la donnée de la Phase 7 : les compteurs par
// capacité se calculent sur la même table, sans second chemin d'écriture.
// =====================================================================

import (
	"context"
	"log"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

// Execer est la surface SQL nécessaire : un pool pgx la satisfait. Interface
// étroite — l'enregistreur ne lit rien, il écrit.
type Execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// decisionBuffer : 4096 décisions absorbent une rafale sans bloquer, et bornent
// la mémoire à quelques centaines de kilo-octets.
const decisionBuffer = 4096

// L'identifiant est généré par la base : l'enregistreur n'a pas besoin de
// connaître le format d'identifiant des autres tables.
const insertDecisionQuery = `
	INSERT INTO "AdminAuthzDecision"
	    ("id", "userId", "capability", "allowed", "code", "mode", "proofLevel",
	     "method", "path", "ip", "requestId")
	VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`

// DecisionRecord est une décision enrichie du contexte HTTP : ce qui est écrit.
type DecisionRecord struct {
	UserID     string
	Capability string
	Allowed    bool
	Code       string
	Mode       string
	ProofLevel string
	Method     string
	Path       string
	IP         string
	RequestID  string
}

// Recorder écrit les décisions dans une table, sans jamais bloquer le garde.
type Recorder struct {
	db Execer

	ch      chan DecisionRecord
	done    chan struct{}
	closed  atomic.Bool
	dropped atomic.Int64
	written atomic.Int64

	// flushInterval borne l'attente d'un lot ; batchSize borne sa taille.
	flushInterval time.Duration
	batchSize     int
}

// NewRecorder démarre l'enregistreur. Un db nil rend un enregistreur inerte
// (aucune goroutine, aucune écriture) : le garde peut l'appeler sans branche.
func NewRecorder(db Execer) *Recorder {
	r := &Recorder{
		db:            db,
		flushInterval: 500 * time.Millisecond,
		batchSize:     64,
	}
	if db == nil {
		return r
	}
	r.ch = make(chan DecisionRecord, decisionBuffer)
	r.done = make(chan struct{})
	go r.run()
	return r
}

// Observe est l'Observer du garde : signature exacte, donc branchable
// directement (`adminauthz.WithObserver(recorder.Observe)`), et jamais bloquant.
func (r *Recorder) Observe(d Decision, userID string) {
	if r == nil || r.ch == nil || r.closed.Load() {
		return
	}
	select {
	case r.ch <- DecisionRecord{
		UserID:     userID,
		Capability: string(d.Capability),
		Allowed:    d.Allowed,
		Code:       string(d.Code),
		Mode:       d.Mode.String(),
		ProofLevel: d.ProofLevel,
		Method:     d.Method,
		Path:       d.Path,
		IP:         d.IP,
		RequestID:  d.RequestID,
	}:
	default:
		// Tampon plein : on perd la trace plutôt que de bloquer la requête.
		r.dropped.Add(1)
	}
}

// run consomme le tampon et écrit par lots.
func (r *Recorder) run() {
	defer close(r.done)
	batch := make([]DecisionRecord, 0, r.batchSize)
	ticker := time.NewTicker(r.flushInterval)
	defer ticker.Stop()

	for {
		select {
		case record, ok := <-r.ch:
			if !ok {
				r.flush(batch)
				return
			}
			batch = append(batch, record)
			if len(batch) >= r.batchSize {
				r.flush(batch)
				batch = batch[:0]
			}
		case <-ticker.C:
			if len(batch) > 0 {
				r.flush(batch)
				batch = batch[:0]
			}
		}
	}
}

// flush écrit un lot. Un échec est journalisé sans interrompre le service : une
// table de supervision indisponible ne doit pas devenir une panne de la console
// (l'autorité reste le garde, pas son journal).
func (r *Recorder) flush(batch []DecisionRecord) {
	if len(batch) == 0 || r.db == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for _, record := range batch {
		var uid pgtype.UUID
		if record.UserID != "" {
			_ = uid.Scan(record.UserID)
		}
		if _, err := r.db.Exec(ctx, insertDecisionQuery,
			uid, record.Capability, record.Allowed, record.Code,
			record.Mode, nullableText(record.ProofLevel), record.Method, record.Path,
			nullableText(record.IP), nullableText(record.RequestID),
		); err != nil {
			log.Printf("[adminauthz:recorder] décision non enregistrée (%s %s, %s) : %v",
				record.Method, record.Path, record.Capability, err)
			return
		}
		r.written.Add(1)
	}
}

func nullableText(value string) any {
	if value == "" {
		return nil
	}
	return value
}

// Close vide le tampon puis arrête la goroutine. Idempotent.
func (r *Recorder) Close() {
	if r == nil || r.ch == nil || !r.closed.CompareAndSwap(false, true) {
		return
	}
	close(r.ch)
	<-r.done
}

// Dropped dit combien de décisions ont été perdues faute de place : la
// supervision (Phase 7) le publie, une perte silencieuse serait un mensonge.
func (r *Recorder) Dropped() int64 {
	if r == nil {
		return 0
	}
	return r.dropped.Load()
}

// Written dit combien de décisions ont été écrites (compteur de succès).
func (r *Recorder) Written() int64 {
	if r == nil {
		return 0
	}
	return r.written.Load()
}

// Queued est la jauge de saturation du tampon (supervision, Phase 7).
func (r *Recorder) Queued() int {
	if r == nil || r.ch == nil {
		return 0
	}
	return len(r.ch)
}
