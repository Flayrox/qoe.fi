package middleware

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/qoefi/api/internal/authz"
)

// RequireAction monte le garde Go refus-par-défaut sur une route sensible.
//
// Le middleware ne fait aucune hypothèse rassurante : la session vient des
// claims JWT vérifiés (jamais d'un en-tête client), et tout ce qu'il ne peut
// pas prouver par lui-même (droit effectif sur la ressource, statut bloquant,
// téléphone vérifié) doit être fourni par un AuthzResolver. En l'absence de
// résolution, l'action est refusée — l'absence de preuve n'est pas une
// autorisation.
//
// La politique (niveau, fraîcheur, permission média, prérequis téléphone) vit
// dans internal/authz : ce middleware n'est qu'un adaptateur HTTP.
type AuthzMode int

const (
	// AuthzObserve journalise la décision mais laisse passer. Mode de
	// déploiement progressif : il permet de mesurer les faux positifs avant
	// d'imposer un step-up à des propriétaires de médias existants.
	AuthzObserve AuthzMode = iota
	// AuthzEnforce refuse réellement.
	AuthzEnforce
)

// AuthzResolver rassemble les preuves propres à la requête et à l'action. Il
// doit interroger la base pour la ressource **visée** (le média de l'URL), pas
// un média quelconque où l'acteur aurait un rôle : une preuve MFA ne transfère
// jamais les droits d'un média à un autre.
type AuthzResolver func(ctx context.Context, r *http.Request, s authz.Session, action authz.Action) authz.Inputs

// AuthzObserver est appelé pour chaque décision, y compris en mode observe :
// à brancher sur les métriques ou l'audit pour suivre le passage à l'enforcement.
type AuthzObserver func(action authz.Action, d authz.Decision, s authz.Session)

// AuthzResource décrit comment la route désigne le média concerné. Les routes
// le déclarent explicitement : un paramètre « id » désigne un média dans le
// module média et une édition de newsletter ailleurs — deviner serait un
// chemin de contournement silencieux.
type AuthzResource int

const (
	// AuthzResourceNone — la route ne se rattache à aucun média (création d'un
	// média, clés API personnelles, acceptation d'un lien d'invitation).
	AuthzResourceNone AuthzResource = iota
	// AuthzResourceMedia — le paramètre d'URL porte l'identifiant du média.
	AuthzResourceMedia
	// AuthzResourcePublication — le paramètre porte une publication.
	AuthzResourcePublication
	// AuthzResourceNewsletter — le paramètre porte une édition de newsletter.
	AuthzResourceNewsletter
)

// authzResourceRef est la référence posée dans le contexte de la requête par
// le garde, relue par le resolver.
type authzResourceRef struct {
	kind AuthzResource
	// param est le nom du paramètre d'URL portant l'identifiant.
	param string
}

type authzResourceCtxKey struct{}

// AuthzResourceOf relit la référence de ressource déclarée par la route. Un
// resolver personnalisé peut s'en servir pour résoudre le média visé.
func AuthzResourceOf(ctx context.Context) (AuthzResource, string) {
	if ref, ok := ctx.Value(authzResourceCtxKey{}).(authzResourceRef); ok {
		return ref.kind, ref.param
	}
	return AuthzResourceNone, ""
}

// WithAuthzResource déclare comment la route désigne le média concerné.
// Sans cette option, aucune permission média n'est résolue et le garde refuse
// toute action qui en exige une (refus par défaut).
func WithAuthzResource(kind AuthzResource, param string) AuthzOption {
	return func(g *authzGuard) { g.resource = authzResourceRef{kind: kind, param: param} }
}

// authzModeResolver décide, requête par requête, si le garde refuse ou observe.
// Il est posé une seule fois au démarrage par SetAuthzModeResolver et lit
// typiquement un feature flag : le passage à l'enforcement se pilote depuis la
// console admin, sans redéploiement.
//
// Défaut (aucun resolver posé) : chaque garde suit son propre mode, donc
// AuthzEnforce — un garde monté explicitement fait ce que dit son nom.
var authzModeResolver func(ctx context.Context) bool

// SetAuthzModeResolver branche la décision d'enforcement par requête.
func SetAuthzModeResolver(f func(ctx context.Context) bool) { authzModeResolver = f }

// authzDefaultResolver est le resolver par défaut, branché une fois au
// démarrage : les modules n'ont alors qu'à déclarer l'action à protéger.
var authzDefaultResolver AuthzResolver

// SetAuthzResolver branche le resolver par défaut des gardes qui n'en
// définissent pas explicitement (typiquement NewDBInputsResolver).
func SetAuthzResolver(r AuthzResolver) { authzDefaultResolver = r }

type authzGuard struct {
	mode         AuthzMode
	modeResolver func(ctx context.Context) bool
	resolve      AuthzResolver
	observe      AuthzObserver
	resource     authzResourceRef
	now          func() time.Time
}

// AuthzOption configure le garde.
type AuthzOption func(*authzGuard)

// WithAuthzMode fige le mode pour ce garde (prioritaire sur le resolver global).
func WithAuthzMode(m AuthzMode) AuthzOption {
	return func(g *authzGuard) { g.mode = m }
}

// WithAuthzModeResolver décide du mode par requête pour ce garde précis.
func WithAuthzModeResolver(f func(ctx context.Context) bool) AuthzOption {
	return func(g *authzGuard) { g.modeResolver = f }
}

// WithAuthzResolver branche la résolution des preuves liées à la ressource.
func WithAuthzResolver(r AuthzResolver) AuthzOption {
	return func(g *authzGuard) { g.resolve = r }
}

// WithAuthzObserver branche la supervision des décisions.
func WithAuthzObserver(o AuthzObserver) AuthzOption {
	return func(g *authzGuard) { g.observe = o }
}

// WithAuthzClock remplace l'horloge (tests de fraîcheur).
func WithAuthzClock(now func() time.Time) AuthzOption {
	return func(g *authzGuard) { g.now = now }
}

// resolver retourne le resolver du garde, ou celui branché globalement.
func (g *authzGuard) resolver() AuthzResolver {
	if g.resolve != nil {
		return g.resolve
	}
	return authzDefaultResolver
}

// enforce indique si ce garde doit refuser ou seulement observer. Ordre :
// resolver local, resolver global (flag), puis mode statique du garde.
func (g *authzGuard) enforce(ctx context.Context) bool {
	if g.modeResolver != nil {
		return g.modeResolver(ctx)
	}
	if authzModeResolver != nil {
		return authzModeResolver(ctx)
	}
	return g.mode == AuthzEnforce
}

// RequireAction retourne le middleware pour une action du registre.
//
// Le mode par défaut est l'**observation** : monter un garde ne change jamais
// le comportement d'une route tant que le refus n'est pas explicitement activé
// (flag `authz-enforce` via SetAuthzModeResolver, ou option WithAuthzMode).
// C'est ce qui permet de câbler largement, mesurer, puis basculer — sans
// verrouiller des comptes existants qui n'ont pas encore de MFA forte.
func RequireAction(action authz.Action, opts ...AuthzOption) func(http.Handler) http.Handler {
	g := &authzGuard{mode: AuthzObserve, now: func() time.Time { return time.Now().UTC() }}
	for _, o := range opts {
		o(g)
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if g.resource.kind != AuthzResourceNone {
				r = r.WithContext(context.WithValue(r.Context(), authzResourceCtxKey{}, g.resource))
			}
			session := authz.FromClaims(Claims(r.Context()))
			var inputs authz.Inputs
			if resolve := g.resolver(); resolve != nil {
				inputs = resolve(r.Context(), r, session, action)
			}
			decision := authz.Evaluate(session, action, inputs, g.now())
			if g.observe != nil {
				g.observe(action, decision, session)
			}
			if decision.Allowed {
				next.ServeHTTP(w, r)
				return
			}
			if !g.enforce(r.Context()) {
				// On ne bloque pas encore : on trace pour calibrer avant
				// d'imposer le refus.
				log.Printf("[authz:observe] %s %s → %s (%s)",
					r.Method, r.URL.Path, decision.Code, decision.Reason)
				next.ServeHTTP(w, r)
				return
			}
			log.Printf("[authz:deny] user=%s action=%s code=%s",
				session.UserID, action, decision.Code)
			writeAuthzDenied(w, decision)
		})
	}
}

// writeAuthzDenied répond 403 avec un code exploitable par le client : le
// Studio/core peut ainsi proposer un step-up (`needs_step_up`), un enrôlement
// de facteur (`deny_weak_auth`) ou un message de droits
// (`deny_no_resource_permission`) plutôt qu'un « accès refusé » muet.
func writeAuthzDenied(w http.ResponseWriter, d authz.Decision) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Qoe-Authz-Code", string(d.Code))
	w.Header().Set("X-Qoe-Authz-Level", d.Level.String())
	w.WriteHeader(http.StatusForbidden)
	body, err := json.Marshal(map[string]any{
		"error":  d.Reason,
		"code":   d.Code,
		"action": d.Action,
		"level":  d.Level.String(),
	})
	if err != nil {
		_, _ = w.Write([]byte(`{"error":"Accès refusé"}`))
		return
	}
	_, _ = w.Write(body)
}
