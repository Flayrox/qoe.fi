package oauth

import (
	"context"
	"time"
)

// Cleanup lance une boucle de purge périodique des artefacts OAuth (codes
// d'autorisation usés/expirés, tokens révoqués anciens). Best-effort : les
// erreurs de purge ne remontent pas (réessayées à l'itération suivante).
func Cleanup(ctx context.Context, svc *Service, interval time.Duration) {
	if interval <= 0 {
		interval = time.Hour
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			svc.Purge(ctx)
		}
	}
}
