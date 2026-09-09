package workers

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
	"github.com/qoefi/api/internal/modules/imports"
	"github.com/qoefi/api/internal/queue"
)

// BulkImportWorker exécute les imports bulk d'articles (TaskBulkImport). Le
// traitement détaillé (dédup, compteurs, rapport d'erreurs) vit dans le
// module imports — ici un simple adaptateur asynq.
type BulkImportWorker struct {
	svc *imports.Service
}

func NewBulkImportWorker(svc *imports.Service) *BulkImportWorker {
	return &BulkImportWorker{svc: svc}
}

// HandleBulkImport traite un job : met à jour la progression et le rapport
// d'erreurs dans ArticleImportJob. Idempotent (no-op si job déjà traité/supprimé).
func (w *BulkImportWorker) HandleBulkImport(ctx context.Context, t *asynq.Task) error {
	var p queue.BulkImportPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("payload bulk import: %w", err)
	}
	if p.JobID == "" {
		return fmt.Errorf("jobId manquant")
	}
	return w.svc.ProcessImportJob(ctx, p.JobID)
}
