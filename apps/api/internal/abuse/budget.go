// Package abuse — noyau anti-abus Go (fiche 06 §9) : budgets atomiques par
// capacité, décisions explicables, jamais de bouton universel qui mêle
// « manque de qualité », « danger » et « défaut de consentement ». Ce fichier
// ne porte que les budgets ; les décisions graduées (allow/slow/challenge/
// needs_review/...) et la détection coordonnée vivent dans les fichiers
// voisins du même package.
package abuse

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BudgetDB est la surface SQL minimale pour les budgets : les poolers des
// modules (home, creator) la satisfont déjà, sans importer pgxpool dans leur
// API. *pgxpool.Pool la satisfait aussi.
type BudgetDB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

var _ BudgetDB = (*pgxpool.Pool)(nil)

// Actions coûteuses suivies. Noms stables, journalisés : ce sont des codes de
// raison pour le support, pas des libellés d'interface.
const (
	// ActionConfirmRequest : demande d'e-mail de confirmation d'abonnement
	// (double opt-in). Cible du harcèlement par confirmations : chaque demande
	// coûte un e-mail au destinataire, pas au demandeur.
	ActionConfirmRequest = "confirm.request"
)

// Fenêtres de budget : instants tronqués, jamais de durées glissantes
// approximatives (deux workers doivent voir la même fenêtre).
func DailyWindow(now time.Time) time.Time {
	// Conversion UTC d'abord : Year/Month/Day lus dans le fuseau local
	// donneraient une fenêtre différente selon le serveur (minuit à Paris ≠
	// minuit UTC) — deux workers doivent voir la même fenêtre.
	now = now.UTC()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}

// ConsumeBudget consomme n unités d'un budget (périmètre, action, fenêtre),
// en le créant au plafond donné s'il n'existe pas. Retourne true si la
// consommation est accordée, false si le plafond est atteint — jamais d'erreur
// pour un plafond atteint (ce n'est pas une panne, c'est la protection qui
// fonctionne). Une seule requête conditionnelle : deux appelants concurrents
// ne dépassent jamais, même en course, quelle que soit la voie d'entrée
// (route publique, clé API, reconfirmation).
//
// Exemple : 3 demandes de confirmation par (adresse, publication, jour) et
// 2000 par (publication, jour) — une adresse harcelée ne reçoit que 3 mails,
// et une publication compromise ne peut pas arroser au-delà du plafond.
func ConsumeBudget(ctx context.Context, pool BudgetDB, scopeType, scopeID, action string, window time.Time, n, cap int) (bool, error) {
	if pool == nil {
		return true, nil // sans base, pas de budget : dégradation ouverte documentée (tests purs)
	}
	window = window.UTC() // TIMESTAMP sans fuseau : la fenêtre est UTC (DailyWindow déjà, robustesse si appel direct).
	// Création paresseuse (idempotente), puis consommation atomique
	// conditionnée au plafond : deux requêtes séparées (pgx n'exécute pas de
	// multi-statements dans QueryRow), mais la seconde seule décide — une
	// course à la création ne crée qu'une ligne (contrainte unique) et la
	// consommation reste atomique.
	if _, err := pool.Exec(ctx, `
		INSERT INTO "CapabilityBudget" ("id", "scopeType", "scopeId", "action", "window", "cap", "consumed", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 0, now(), now())
		ON CONFLICT ("scopeType", "scopeId", "action", "window") DO NOTHING`,
		scopeType, scopeID, action, window, cap); err != nil {
		return false, err
	}
	var granted bool
	err := pool.QueryRow(ctx, `
		UPDATE "CapabilityBudget"
		SET "consumed" = "consumed" + $5, "updatedAt" = now()
		WHERE "scopeType" = $1 AND "scopeId" = $2 AND "action" = $3 AND "window" = $4
		  AND "consumed" + $5 <= "cap"
		RETURNING true`,
		scopeType, scopeID, action, window, n).Scan(&granted)
	if err != nil {
		// Zéro ligne = plafond atteint (pas d'erreur, c'est la protection
		// qui fonctionne) ; toute autre erreur remonte.
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return granted, nil
}

// ConfirmBudgetScopes retourne les deux périmètres à consommer pour une
// demande de confirmation : (adresse+publication) et (publication). Les deux
// doivent être accordés pour envoyer ; si l'un est épuisé, la demande est
// enregistrée en attente mais aucun e-mail ne part (réponse neutre, pas de
// fuite sur la limite atteinte).
func ConfirmBudgetScopes(email, publicationID string) [][2]string {
	return [][2]string{
		{"email_publication", email + "|" + publicationID},
		{"publication", publicationID},
	}
}

// ConfirmAllowed consomme les deux budgets d'une demande de confirmation
// (adresse+publication : 3/jour ; publication : 2000/jour) et retourne si
// l'e-mail peut partir. False sans erreur = plafond atteint : l'appelant
// enregistre la demande mais n'envoie rien, en réponse neutre — sans jamais
// révéler quelle limite a cédé (pas de fuite permettant de calibrer une
// attaque). Une erreur DB, elle, est journalisée et traitée en autorisation
// (dégradation ouverte : une panne de budget ne doit pas bloquer une
// inscription légitime — le rate-limit Redis reste la première barrière).
func ConfirmAllowed(ctx context.Context, pool BudgetDB, email, publicationID string, now time.Time) bool {
	if pool == nil {
		return true
	}
	window := DailyWindow(now)
	for _, scope := range ConfirmBudgetScopes(email, publicationID) {
		cap := ConfirmCapPerPublication
		if scope[0] == "email_publication" {
			cap = ConfirmCapPerEmailPublication
		}
		ok, err := ConsumeBudget(ctx, pool, scope[0], scope[1], ActionConfirmRequest, window, 1, cap)
		if err != nil {
			log.Printf("[abuse] budget %s: %v (autorisé par dégradation)", scope[0], err)
			continue
		}
		if !ok {
			log.Printf("[abuse] plafond confirmations atteint (%s)", scope[0])
			return false
		}
	}
	return true
}

// Caps par défaut des confirmations (documentés, pas arbitraires) : 3
// demandes par adresse et par jour (demande + 2 relances légitimes), 2000 par
// publication et par jour (une liste légitime ne redemande jamais autant en
// 24 h ; au-delà, c'est une attaque ou un bug d'intégration à examiner).
const (
	ConfirmCapPerEmailPublication = 3
	ConfirmCapPerPublication      = 2000
)
