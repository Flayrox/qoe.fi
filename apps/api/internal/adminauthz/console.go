package adminauthz

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// Console enregistre les routes de la console d'administration en déclarant,
// pour chacune, la capacité qu'elle exige.
//
// C'est le seul chemin d'enregistrement d'une route `/v1/admin/*` : le registre
// et le garde sont donc alimentés par construction, et une route ne peut pas
// être montée sans capacité. Un module qui enregistrerait directement sur le
// routeur échapperait au garde — le test des routes le refuse.
type Console struct {
	router chi.Router
	lookup Lookup
	reg    *Registry
	opts   []Option
}

// NewConsole lie un registre (partageable entre modules) au routeur protégé et
// au service de capacités. Un registre nil en crée un.
func NewConsole(router chi.Router, lookup Lookup, reg *Registry, opts ...Option) *Console {
	if reg == nil {
		reg = NewRegistry()
	}
	return &Console{router: router, lookup: lookup, reg: reg, opts: opts}
}

// NewStandaloneConsole crée une console autonome sans service de capacités :
// utilisée par les montages de test (et par Register quand aucune console
// partagée n'est branchée). Le garde y est inerte — la défense en profondeur
// superadmin des services reste, elle, active.
func NewStandaloneConsole(router chi.Router) *Console {
	return NewConsole(router, nil, NewRegistry())
}

// Registry rend le registre alimenté par cette console (partagé quand la
// console l'est).
func (c *Console) Registry() *Registry { return c.reg }

// Lookup rend le service de capacités branché (nil si aucun).
func (c *Console) Lookup() Lookup { return c.lookup }

// Mount déclare la capacité d'une route puis l'enregistre sous le garde.
//
// Panique si la déclaration est invalide (capacité hors vocabulaire, route en
// double, motif malformé) : une console dont une route échapperait au garde,
// ou dont deux routes se marcheraient dessus, ne doit pas servir de trafic.
// L'échec se produit au démarrage et la suite de tests le rattrape avant
// déploiement — jamais en production sur une requête.
func (c *Console) Mount(method, pattern string, capability Capability, fn http.HandlerFunc) {
	if err := c.reg.Declare(method, pattern, capability); err != nil {
		panic("adminauthz: " + err.Error())
	}
	c.router.With(Require(c.lookup, capability, c.opts...)).Method(method, pattern, fn)
}

// Get déclare et monte une route GET.
func (c *Console) Get(pattern string, capability Capability, fn http.HandlerFunc) {
	c.Mount(http.MethodGet, pattern, capability, fn)
}

// Post déclare et monte une route POST.
func (c *Console) Post(pattern string, capability Capability, fn http.HandlerFunc) {
	c.Mount(http.MethodPost, pattern, capability, fn)
}

// Put déclare et monte une route PUT.
func (c *Console) Put(pattern string, capability Capability, fn http.HandlerFunc) {
	c.Mount(http.MethodPut, pattern, capability, fn)
}

// Patch déclare et monte une route PATCH.
func (c *Console) Patch(pattern string, capability Capability, fn http.HandlerFunc) {
	c.Mount(http.MethodPatch, pattern, capability, fn)
}

// Delete déclare et monte une route DELETE.
func (c *Console) Delete(pattern string, capability Capability, fn http.HandlerFunc) {
	c.Mount(http.MethodDelete, pattern, capability, fn)
}
