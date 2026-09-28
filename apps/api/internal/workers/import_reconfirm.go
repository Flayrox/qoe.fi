package workers

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
	"github.com/qoefi/api/internal/modules/imports"
	"github.com/qoefi/api/internal/queue"
)

// ImportReconfirmWorker exécute les vagues de reconfirmation
// (TaskSubscriberImportReconfirm, file `reconfirm`). Une exécution traite une
// tranche plafonnée puis rend la main : si la vague continue, elle ré-enfile
// elle-même la tranche suivante avec un délai — c'est le plafonnement côté
// file, en plus du plafond de taille de vague. Le traitement détaillé
// (revérification d'opposition au moment de l'envoi, envoi via le chemin de
// confirmation existant) vit dans le module imports.
type ImportReconfirmWorker struct {
	svc *imports.Service
	ac  *asynq.Client
}

func NewImportReconfirmWorker(svc *imports.Service) *ImportReconfirmWorker {
	return &ImportReconfirmWorker{svc: svc}
}

// SetAsynqClient branche le client pour ré-enfiler la tranche suivante.
// Sans lui, chaque exécution traite une tranche et s'arrête (dégradation
// sûre : pas d'envoi groupé, juste une vague qui avance par à-coups manuels).
func (w *ImportReconfirmWorker) SetAsynqClient(ac *asynq.Client) { w.ac = ac }

// HandleImportReconfirmWave traite une tranche de vague. Idempotent : rejouer
// la tâche ne réenvoie jamais deux fois à la même adresse (réclamation
// `FOR UPDATE SKIP LOCKED`, demandes déjà `sent` ignorées).
func (w *ImportReconfirmWorker) HandleImportReconfirmWave(ctx context.Context, t *asynq.Task) error {
	var p queue.SubscriberImportReconfirmPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("payload reconfirmation: %w", err)
	}
	if p.WaveID == "" {
		return fmt.Errorf("waveId manquant")
	}
	done, err := w.svc.ProcessReconfirmWave(ctx, p.WaveID)
	if err != nil {
		return err
	}
	if !done && w.ac != nil {
		// La vague continue : tranche suivante avec délai (vagues plafonnées).
		if err := queue.PublishImportReconfirmWave(w.ac,
			queue.SubscriberImportReconfirmPayload{WaveID: p.WaveID},
			imports.ReconfirmChunkDelay()); err != nil {
			return fmt.Errorf("ré-enfilement vague %s: %w", p.WaveID, err)
		}
	}
	return nil
}
