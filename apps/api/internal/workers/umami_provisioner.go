package workers

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	db "github.com/qoefi/api/internal/database"
)

// websiteCreator est l'interface minimale requise pour provisionner un
// website Umami (satisfaite par *umami.Client, mockable en test).
type websiteCreator interface {
	CreateWebsite(ctx context.Context, name, domain string) (string, error)
}

// RunUmamiProvisioner garantit que CHAQUE publication a son propre website
// Umami : scan périodique des publications sans "umamiWebsiteId", création du
// website via l'API Umami (nom + domaine = sous-domaine du blog), puis
// stockage de l'id dans la table Publication.
//
// Résultat : le créateur voit automatiquement ses stats dans le studio
// (visites, sources, pages, temps passé) — aucun lien manuel à faire.
// Le premier tick s'exécute au démarrage (rattrape les publications créées
// pendant une coupure), puis toutes les 5 minutes.
func RunUmamiProvisioner(ctx context.Context, pool *pgxpool.Pool, umamiCli websiteCreator, interval time.Duration) {
	if umamiCli == nil {
		log.Println("[umami-provisioner] désactivé (pas de client Umami)")
		return
	}
	runOnce := func() {
		if err := runUmamiProvisionOnce(ctx, pool, umamiCli); err != nil {
			log.Printf("[umami-provisioner] %v", err)
		}
	}
	runOnce()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			runOnce()
		}
	}
}

// runUmamiProvisionOnce traite jusqu'à 50 publications par cycle.
func runUmamiProvisionOnce(ctx context.Context, pool *pgxpool.Pool, umamiCli websiteCreator) error {
	q := db.New(pool)

	rows, err := q.ListPublicationsWithoutUmami(ctx, 50)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}

	for _, r := range rows {
		domain := r.TenantDomain
		if domain == "" {
			domain = r.Slug
		}
		websiteID, err := umamiCli.CreateWebsite(ctx, r.Name, domain+".qoe.fi")
		if err != nil {
			log.Printf("[umami-provisioner] création website pour %q (slug %s): %v", r.Name, r.Slug, err)
			continue // on retentera au prochain tick
		}
		if err := q.SetPublicationUmamiWebsite(ctx, db.SetPublicationUmamiWebsiteParams{
			ID:             r.ID,
			UmamiWebsiteId: pgtype.Text{String: websiteID, Valid: true},
		}); err != nil {
			log.Printf("[umami-provisioner] stockage websiteId %s pour %s: %v", websiteID, r.ID, err)
			continue
		}
		log.Printf("[umami-provisioner] publication %s (%s) → website Umami %s", r.Name, domain, websiteID)
	}
	return nil
}
