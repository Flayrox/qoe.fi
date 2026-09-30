package adminauthz

import (
	"net/http"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// noop est le handler de test monté sous le garde.
func noop(http.ResponseWriter, *http.Request) {}

// TestConsole_IsTheOnlyRegistrationPath — passer par la console déclare la
// capacité ET monte la route : les deux sont inséparables, c'est ce qui rend
// impossible une route /v1/admin/* sans garde.
func TestConsole_IsTheOnlyRegistrationPath(t *testing.T) {
	r := chi.NewRouter()
	c := NewStandaloneConsole(r)

	c.Get("/v1/admin/thing", UsersRead, noop)
	c.Patch("/v1/admin/thing/{id}", UsersModerate, noop)

	if _, ok := c.Registry().Lookup("GET", "/v1/admin/thing"); !ok {
		t.Fatal("route non déclarée au montage")
	}
	if c.Registry().Len() != 2 {
		t.Fatalf("registre = %d routes, attendu 2", c.Registry().Len())
	}

	// La route est bien montée sur le routeur, sous le garde.
	var found bool
	if err := chi.Walk(r, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if method == "PATCH" && route == "/v1/admin/thing/{id}" {
			found = true
		}
		return nil
	}); err != nil {
		t.Fatalf("walk: %v", err)
	}
	if !found {
		t.Fatal("route absente du routeur")
	}
}

func TestConsole_ShorthandsPickTheMethod(t *testing.T) {
	r := chi.NewRouter()
	c := NewConsole(r, nil, nil)
	c.Get("/v1/admin/a", SelfRead, noop)
	c.Post("/v1/admin/a", SelfRead, noop)
	c.Put("/v1/admin/a", SelfRead, noop)
	c.Patch("/v1/admin/a", SelfRead, noop)
	c.Delete("/v1/admin/a", SelfRead, noop)

	for _, method := range []string{"GET", "POST", "PUT", "PATCH", "DELETE"} {
		if _, ok := c.Registry().Lookup(method, "/v1/admin/a"); !ok {
			t.Errorf("%s /v1/admin/a non déclarée", method)
		}
	}
}

// TestConsole_PanicsOnBadDeclaration — une console dont une route échappe au
// garde, ou dont deux routes se marcheraient dessus, ne doit pas servir de
// trafic : l'échec se produit au démarrage, jamais sur une requête.
func TestConsole_PanicsOnBadDeclaration(t *testing.T) {
	cases := []struct {
		name    string
		declare func(c *Console)
	}{
		{
			"capacité hors vocabulaire",
			func(c *Console) { c.Get("/v1/admin/x", Capability("admin.nope.read"), noop) },
		},
		{
			"route déclarée deux fois",
			func(c *Console) {
				c.Get("/v1/admin/x", SelfRead, noop)
				c.Get("/v1/admin/x", DashboardRead, noop)
			},
		},
		{
			"motif sans slash",
			func(c *Console) { c.Get("v1/admin/x", SelfRead, noop) },
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			defer func() {
				recovered := recover()
				if recovered == nil {
					t.Fatal("aucun panic sur une déclaration invalide")
				}
				if msg, ok := recovered.(string); !ok || !strings.HasPrefix(msg, "adminauthz: ") {
					t.Fatalf("panic = %v, attendu un message adminauthz", recovered)
				}
			}()
			tc.declare(NewStandaloneConsole(chi.NewRouter()))
		})
	}
}

// TestConsole_SharedRegistry — deux modules qui montent sur la même console
// alimentent le même registre : c'est ce qui permet de vérifier d'un coup
// qu'aucune route /v1/admin/* n'échappe au garde, tous modules confondus.
func TestConsole_SharedRegistry(t *testing.T) {
	r := chi.NewRouter()
	reg := NewRegistry()
	admin := NewConsole(r, nil, reg)
	legal := NewConsole(r, nil, reg)

	admin.Get("/v1/admin/users", UsersRead, noop)
	legal.Get("/v1/admin/legal", LegalRead, noop)

	if admin.Registry() != legal.Registry() {
		t.Fatal("registres distincts")
	}
	if reg.Len() != 2 {
		t.Fatalf("registre partagé = %d routes, attendu 2", reg.Len())
	}
	// Une collision entre modules est un bug de câblage : la console panique.
	func() {
		defer func() {
			if recover() == nil {
				t.Fatal("collision entre modules acceptée")
			}
		}()
		legal.Get("/v1/admin/users", AuditRead, noop)
	}()
}
