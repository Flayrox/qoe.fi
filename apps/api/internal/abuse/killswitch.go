package abuse

// Coupe-feu des inscriptions (fiche 06 §10 : bouton d'arrêt par type de
// capacité). Quand une ferme de comptes est en cours, le staff bascule
// `abuse.signup-kill` (registre de flags, console existante) et les trois
// voies d'inscription refusent AVANT toute écriture — sans toucher aux
// confirmations de clics en cours (on ne punit pas les légitimes en attente)
// ni aux autres capacités (les envois ont leur propre kill global).
//
// Lecture DIRECTE de feature_flags (pas de cache TTL) : un coupe-feu doit
// prendre effet immédiatement, pas « en quelques secondes ». Une requête
// QueryRow par inscription, best-effort : clé absente ou DB en panne →
// autorisé + log (un coupe-feu illisible ne doit pas bloquer le service ;
// le rate-limit Redis reste la première barrière).
//
// La clé du flag est dupliquée ici en constante (même valeur que
// flags.AbuseSignupKill) : abuse ne doit pas importer flags si flags venait
// un jour à dépendre d'un module — le test de parité ci-dessous verrouille
// l'égalité des deux chaînes.

import (
	"context"
	"errors"
	"log"
	"sync"
)

// logSignupKillOnce évite de noyer les logs : pendant une panne DB, chaque
// inscription échouerait sa lecture du flag — un seul avertissement suffit,
// l'effet (autorisé par dégradation) restant constant.
var logSignupKillOnce sync.Once

func logOnceSignupKill(err error) {
	logSignupKillOnce.Do(func() {
		log.Printf("[abuse] lecture coupe-feu inscriptions: %v (autorisé par dégradation)", err)
	})
}

// SignupKillFlag est la clé du coupe-feu inscriptions. DOIT rester égale à
// flags.AbuseSignupKill (test TestSignupKillFlagParity, faute de quoi la
// console afficherait un flag que le coupe-feu ne lit pas).
const SignupKillFlag = "abuse.signup-kill"

// ErrSignupSuspended : inscriptions temporairement suspendues (coupe-feu
// engagé). Les handlers la mappent en 503 explicite — pas de furtivité :
// c'est une urgence assumée, pas de l'anti-abus silencieux.
var ErrSignupSuspended = errors.New("inscriptions temporairement suspendues (maintenance anti-abus)")

// SignupKillEngaged dit si le coupe-feu inscriptions est engagé. Pool nil :
// false (dégradation ouverte — tests purs, environnements sans base).
func SignupKillEngaged(ctx context.Context, pool BudgetDB) bool {
	if pool == nil {
		return false
	}
	var on bool
	err := pool.QueryRow(ctx, `SELECT "is_enabled" FROM "feature_flags" WHERE "key" = $1`, SignupKillFlag).Scan(&on)
	if err != nil {
		// Clé absente (flag jamais basculé) ou DB en panne : autorisé.
		// On ne logue qu'une fois par processus pour ne pas noyer les logs
		// à chaque inscription pendant une panne.
		logOnceSignupKill(err)
		return false
	}
	return on
}
