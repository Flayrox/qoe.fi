package workers

import (
	"context"
	"encoding/json"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/moderation"
	"github.com/qoefi/api/internal/queue"
)

// ModerationWorker traite les tâches asynchrones TaskModerationScreen.
type ModerationWorker struct {
	svc *moderation.Service
}

func NewModerationWorker(pool *pgxpool.Pool, ac *asynq.Client) *ModerationWorker {
	return &ModerationWorker{svc: moderation.NewService(pool, ac)}
}

// HandleModerationScreen exécute le dépistage IA asynchrone du contenu signalé.
func (w *ModerationWorker) HandleModerationScreen(ctx context.Context, t *asynq.Task) error {
	var p queue.ModerationScreenPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_, err := w.svc.ScreenAsync(ctx, p)
	return err
}
