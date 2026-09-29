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
// RÈGLE (piège Go) : ne jamais y passer un *pgxpool.Pool NIL — une fois
// wrappé en interface, `pool == nil` est faux et les gardes ne tiennent
// plus (panic au premier QueryRow). Passer nil littéral (détecté) ou un
// pool garanti non-nil. Même règle sur toutes les interfaces DB du projet
// (support.DB, subscriptions.DB/SignalDB-like).
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

// MonthlyWindow tronque au 1er du mois UTC (fenêtres mensuelles — quotas IA
// de la fiche Plus : quota mensuel transparent, pas journalier).
func MonthlyWindow(now time.Time) time.Time {
	now = now.UTC()
	return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
}

// UtcMs normalise un instant en UTC tronqué à la milliseconde : les colonnes
// TIMESTAMP(3) ARRONDISSENT (pas tronquent) — un instant à 12:00:00.0006
// stocké devient 12:00:00.001, soit ~1 ms DANS LE FUTUR. Pour les comparaisons
// d'échéance (fin de grant, révocation immédiate), cette ms fantôme rend un
// droit expiré encore « effectif ». Tronquer AVANT stockage supprime la
// classe entière de bugs (même racine que FutureTolerance côté lecture des
// signaux — ici on corrige à l'écriture, sans tolérance sémantique).
func UtcMs(t time.Time) time.Time {
	return t.UTC().Truncate(time.Millisecond)
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
	// Création paresseuse + consommation atomique conditionnée, en UNE
	// requête (UPSERT — lot 3 : 1 aller-retour au lieu de 2). Surtout : PAS
	// de CTE (WITH … + UPDATE séparé) — toutes les branches d'un CTE voient
	// le MÊME snapshot, donc l'UPDATE ne voit jamais la ligne que l'INSERT
	// vient de créer : le premier appel du jour de chaque périmètre échouait
	// silencieusement (attrapé par le smoke dev du 29/09, pas par le test de
	// course qui le masquait). L'UPSERT ci-dessous est correct au 1er appel :
	//   - création : consumed = n (si n <= cap, sinon 0 ligne) ;
	//   - conflit : consumed += n (si <= cap de la ligne, sinon 0 ligne) ;
	//   - 0 ligne → ErrNoRows → plafond (pas une erreur).
	// Mieux qu'avant sur un point : n > cap est refusé même à la création
	// (avant : consumed=n > cap persisté).
	var granted bool
	err := pool.QueryRow(ctx, `
		INSERT INTO "CapabilityBudget" ("id", "scopeType", "scopeId", "action", "window", "cap", "consumed", "createdAt", "updatedAt")
		SELECT gen_random_uuid()::text, $1, $2, $3, $4, $5::integer, $6::integer, now(), now()
		WHERE $6::integer <= $5::integer
		ON CONFLICT ("scopeType", "scopeId", "action", "window") DO UPDATE
		SET "consumed" = "CapabilityBudget"."consumed" + EXCLUDED."consumed",
		    "updatedAt" = now()
		WHERE "CapabilityBudget"."consumed" + EXCLUDED."consumed" <= "CapabilityBudget"."cap"
		RETURNING true`,
		scopeType, scopeID, action, window, cap, n).Scan(&granted)
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

// RefundBudget rembourse n unités (jamais sous zéro) : quand une action
// budgétée ÉCHOUE après consommation (provider en panne, erreur distante),
// on ne facture pas l'échec. Non atomique par design (un remboursement
// perdu sous-estime au pire de n — jamais bloquant) : seul le REFUS est
// atomique (ConsumeBudget), le remboursement est best-effort.
func RefundBudget(ctx context.Context, pool BudgetDB, scopeType, scopeID, action string, window time.Time, n int) {
	if pool == nil {
		return
	}
	window = window.UTC()
	_, _ = pool.Exec(ctx, `
		UPDATE "CapabilityBudget"
		SET "consumed" = GREATEST("consumed" - $5, 0), "updatedAt" = now()
		WHERE "scopeType" = $1 AND "scopeId" = $2 AND "action" = $3 AND "window" = $4`,
		scopeType, scopeID, action, window, n)
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
