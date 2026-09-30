package adminauthz

import (
	"fmt"
	"sort"
	"strings"
)

// Route est une route de la console et la capacité qu'elle exige.
type Route struct {
	Method     string
	Pattern    string
	Capability Capability
}

// Key identifie la route (méthode + motif), forme utilisée par le registre.
func (r Route) Key() string { return RouteKey(r.Method, r.Pattern) }

// String rend la déclaration lisible telle quelle dans un journal d'audit.
func (r Route) String() string { return r.Key() + " → " + string(r.Capability) }

// RouteKey normalise l'identité d'une route : méthode en majuscules, motif
// tel que déclaré (chi compare les motifs, pas les chemins résolus).
func RouteKey(method, pattern string) string {
	return strings.ToUpper(strings.TrimSpace(method)) + " " + pattern
}

// Registry est la table route → capacité de la console. Elle est alimentée au
// moment de l'enregistrement des routes et fait office de source unique :
// l'interface, les tests et l'audit la lisent au lieu de redécouvrir les
// capacités route par route.
type Registry struct {
	routes []Route
	index  map[string]Capability
}

func NewRegistry() *Registry {
	return &Registry{index: map[string]Capability{}}
}

// Declare enregistre une route. Elle échoue — et l'appelant doit alors
// interrompre le démarrage — si la capacité n'appartient pas au vocabulaire
// fermé ou si la route est déclarée deux fois : une console dont une route
// échappe au garde, ou dont une route est montée deux fois avec deux
// capacités différentes, ne doit pas servir de trafic.
func (r *Registry) Declare(method, pattern string, c Capability) error {
	method = strings.ToUpper(strings.TrimSpace(method))
	if method == "" {
		return fmt.Errorf("capacité %s : méthode vide pour %q", c, pattern)
	}
	if !strings.HasPrefix(pattern, "/") {
		return fmt.Errorf("capacité %s : motif invalide %q (doit commencer par /)", c, pattern)
	}
	if !c.Valid() {
		return fmt.Errorf("route %s : capacité %q hors du vocabulaire fermé", RouteKey(method, pattern), c)
	}
	key := RouteKey(method, pattern)
	if existing, ok := r.index[key]; ok {
		return fmt.Errorf("route %s déclarée deux fois (%s puis %s)", key, existing, c)
	}
	r.index[key] = c
	r.routes = append(r.routes, Route{Method: method, Pattern: pattern, Capability: c})
	return nil
}

// Lookup rend la capacité exigée par une route ("GET /v1/admin/users" par
// exemple). ok=false signifie « route non déclarée » — donc non gardée, ce que
// le test des routes enregistrées interdit.
func (r *Registry) Lookup(method, pattern string) (Capability, bool) {
	c, ok := r.index[RouteKey(method, pattern)]
	return c, ok
}

// Routes retourne les routes déclarées, triées (motif puis méthode). La copie
// protège l'ordre interne : un appelant ne peut pas réordonner le registre.
func (r *Registry) Routes() []Route {
	out := make([]Route, len(r.routes))
	copy(out, r.routes)
	sort.Slice(out, func(i, j int) bool {
		if out[i].Pattern != out[j].Pattern {
			return out[i].Pattern < out[j].Pattern
		}
		return out[i].Method < out[j].Method
	})
	return out
}

// Len retourne le nombre de routes déclarées.
func (r *Registry) Len() int { return len(r.routes) }

// ForCapability retourne les routes qui exigent une capacité, triées.
func (r *Registry) ForCapability(c Capability) []Route {
	out := []Route{}
	for _, rt := range r.routes {
		if rt.Capability == c {
			out = append(out, rt)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key() < out[j].Key() })
	return out
}

// CapabilitiesUsed retourne les capacités effectivement exigées par au moins
// une route, triées. C'est le pont avec la matrice de rôles et le test de
// couverture des routes : une capacité du vocabulaire qu'aucune route n'exige
// est soit oubliée, soit réservée — et dans ce cas la réserve doit être
// justifiée à l'endroit du test, pas laissée implicite.
func (r *Registry) CapabilitiesUsed() []Capability {
	seen := map[Capability]bool{}
	for _, rt := range r.routes {
		seen[rt.Capability] = true
	}
	out := make([]Capability, 0, len(seen))
	for c := range seen {
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}
