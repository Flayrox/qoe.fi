package adminauthz

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/qoefi/api/internal/authz"
	"github.com/qoefi/api/internal/middleware"
)

// Mode dit si un refus est réellement produit ou seulement journalisé.
type Mode int

const (
	// ModeObserve journalise le refus mais laisse passer. Défaut : on câble
	// largement, on mesure, puis on bascule — sans jamais verrouiller une
	// console existante le jour du déploiement.
	ModeObserve Mode = iota
	// ModeEnforce refuse réellement (403 + code).
	ModeEnforce
)

func (m Mode) String() string {
	if m == ModeEnforce {
		return "enforce"
	}
	return "observe"
}

// Decision est la trace d'un passage dans le garde (supervision, audit).
type Decision struct {
	Capability Capability
	// Allowed dit si la capacité a été prouvée.
	Allowed bool
	// Code porte le motif (authz.CodeAllow quand la capacité est détenue).
	Code authz.Code
	// Mode est le mode effectif au moment de la décision.
	Mode Mode
}

// Lookup résout l'accès d'une personne. Un *Service le satisfait ; les tests
// fournissent une implémentation en mémoire.
type Lookup interface {
	Access(ctx context.Context, userID string) (Access, error)
}

// ModeResolver est implémenté par un Lookup qui porte lui-même la politique
// d'application (le *Service le fait, branché sur le flag `authz-enforce`).
// Un seul interrupteur pour toute la console, jamais un par route.
type ModeResolver interface {
	Enforce(ctx context.Context) bool
}

// Observer est appelé pour chaque décision, y compris en mode observation :
// à brancher sur les métriques pour suivre la bascule.
type Observer func(d Decision, userID string)

type guard struct {
	lookup     Lookup
	capability Capability
	mode       Mode
	modeFn     func(ctx context.Context) bool
	observer   Observer
}

// Option configure le garde.
type Option func(*guard)

// WithMode fige le mode pour ce garde (prioritaire sur le resolver porté par
// le Lookup, sauf WithModeResolver qui reste prioritaire).
func WithMode(m Mode) Option { return func(g *guard) { g.mode = m } }

// WithModeResolver décide du mode par requête pour ce garde précis.
func WithModeResolver(f func(ctx context.Context) bool) Option {
	return func(g *guard) { g.modeFn = f }
}

// WithObserver branche la supervision des décisions.
func WithObserver(o Observer) Option { return func(g *guard) { g.observer = o } }

// resolveMode rend le mode effectif : resolver du garde, puis résolver porté
// par le Lookup (le flag de la console), puis mode statique du garde.
func (g *guard) resolveMode(ctx context.Context) Mode {
	if g.modeFn != nil {
		if g.modeFn(ctx) {
			return ModeEnforce
		}
		return ModeObserve
	}
	if r, ok := g.lookup.(ModeResolver); ok && r != nil {
		if r.Enforce(ctx) {
			return ModeEnforce
		}
		return ModeObserve
	}
	return g.mode
}

// observe transmet la décision à l'observateur branché, s'il y en a un.
func (g *guard) observe(d Decision, userID string, mode Mode) {
	if g.observer == nil {
		return
	}
	d.Mode = mode
	g.observer(d, userID)
}

// Require monte le garde de capacité sur une route.
//
// Le refus est le défaut : une route qui exige une capacité et dont la preuve
// est absente est refusée — l'absence de preuve n'est pas une autorisation.
// Deux garde-fous volontaires :
//
//   - un Lookup nil (service non branché) ne refuse JAMAIS. Une console ne se
//     verrouille pas sur une erreur de câblage : elle retombe sur la garde
//     superadmin des services, qui reste en place (défense en profondeur), et
//     le garde le journalise à chaque requête ;
//   - la session absente est toujours refusée (401), quel que soit le mode :
//     il n'y a rien à observer quand aucune identité n'existe, et la garde
//     d'authentification en amont garantit qu'un admin en a toujours une. Un
//     admin légitime ne peut donc pas être bloqué par cette branche.
//
// Le mode par défaut est l'observation ; il suit le flag `authz-enforce` porté
// par le service (voir ModeResolver), donc la bascule est unique pour toute la
// console et réversible sans redéploiement.
func Require(lookup Lookup, capability Capability, opts ...Option) func(http.Handler) http.Handler {
	g := &guard{lookup: lookup, capability: capability, mode: ModeObserve}
	for _, o := range opts {
		o(g)
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, _ := middleware.UserID(r.Context())
			if userID == "" {
				// Ni capacité ni identité : rien à observer, refus immédiat.
				g.observe(Decision{Capability: capability, Code: authz.CodeDenyNoSession}, "", ModeEnforce)
				writeDenied(w, http.StatusUnauthorized, capability,
					authz.CodeDenyNoSession, "Authentification requise.")
				return
			}

			mode := g.resolveMode(r.Context())

			if g.lookup == nil {
				log.Printf("[adminauthz] service de capacités non branché : %s non vérifiée (%s %s)",
					capability, r.Method, r.URL.Path)
				g.observe(Decision{Capability: capability, Code: authz.CodeDenyCapabilityLookup}, userID, mode)
				next.ServeHTTP(w, r)
				return
			}

			access, err := g.lookup.Access(r.Context(), userID)
			if err != nil {
				// Erreur de résolution : on ne peut rien affirmer. En mode
				// refus, on refuse (un droit non prouvé n'est pas accordé) ;
				// en observation, on trace et on laisse passer.
				log.Printf("[adminauthz] capacités indisponibles (user=%s, capacité=%s) : %v",
					userID, capability, err)
				g.observe(Decision{Capability: capability, Code: authz.CodeDenyCapabilityLookup}, userID, mode)
				if mode == ModeEnforce {
					writeDenied(w, http.StatusForbidden, capability,
						authz.CodeDenyCapabilityLookup, "Vérification des droits indisponible.")
					return
				}
				next.ServeHTTP(w, r)
				return
			}

			if access.Has(capability) {
				g.observe(Decision{Capability: capability, Allowed: true, Code: authz.CodeAllow}, userID, mode)
				next.ServeHTTP(w, r)
				return
			}

			if mode == ModeObserve {
				log.Printf("[adminauthz:observe] %s %s refusé (user=%s, capacité=%s, rôles=%v)",
					r.Method, r.URL.Path, userID, capability, access.Roles)
				g.observe(Decision{Capability: capability, Code: authz.CodeDenyMissingCapability}, userID, mode)
				next.ServeHTTP(w, r)
				return
			}

			log.Printf("[adminauthz:deny] %s %s (user=%s, capacité=%s, rôles=%v)",
				r.Method, r.URL.Path, userID, capability, access.Roles)
			g.observe(Decision{Capability: capability, Code: authz.CodeDenyMissingCapability}, userID, mode)
			writeDenied(w, http.StatusForbidden, capability,
				authz.CodeDenyMissingCapability, "Capacité requise absente.")
		})
	}
}

// writeDenied répond avec un code exploitable par le client : `goFetch`
// transporte `body.code` jusqu'à l'interface, qui peut alors expliquer le
// refus (« il vous manque telle capacité ») au lieu d'un « accès refusé » muet.
// L'en-tête X-Qoe-Authz-Code porte le même code pour les proxys qui
// réécriraient le corps.
func writeDenied(w http.ResponseWriter, status int, capability Capability, code authz.Code, reason string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Qoe-Authz-Code", string(code))
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error":      reason,
		"code":       string(code),
		"capability": string(capability),
	})
}
