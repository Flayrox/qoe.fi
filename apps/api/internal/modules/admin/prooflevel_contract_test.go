package admin

// =====================================================================
// 🔐 Contrat « capacité × niveau de preuve » de la console (plan, Phase 3)
// =====================================================================
// Le niveau de preuve n'est pas décoratif : ce fichier le vérifie SUR LES
// ROUTES RÉELLEMENT MONTÉES (admin, légal, placements, imports, campagnes).
//
//   - chaque route sensible refuse une session `aal2` ouverte le matin
//     (`needs_step_up`) et accepte une preuve forte de moins de dix minutes ;
//   - chaque route d'écriture de la console est CLASSÉE : soit elle exige une
//     preuve forte, soit sa capacité figure dans la liste assumée N0 avec un
//     motif écrit. Ajouter une route d'écriture sans trancher fait échouer la
//     CI — c'est le pendant du manifeste de couverture (Phase 5) côté preuve.
// =====================================================================

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/adminauthz"
	"github.com/qoefi/api/internal/authz"
	"github.com/qoefi/api/internal/middleware"
)

// claimsSession fabrique les claims Supabase d'une session : `aal`, `iat`, et
// la méthode forte réellement utilisée. Les tests ne peuvent PAS se contenter
// d'un identifiant : le garde relit la preuve dans le jeton.
func claimsSession(iat time.Time, method string) map[string]any {
	return map[string]any{
		"sub":        adminReaderID,
		"session_id": "sess-phase3",
		"aal":        "aal2",
		"iat":        float64(iat.Unix()),
		"amr": []any{
			map[string]any{"method": method, "timestamp": float64(iat.Unix())},
		},
	}
}

// morningSession : `aal2` obtenu ce matin, aucune preuve récente — le cas
// exact du critère de sortie de la Phase 3.
func morningSession() map[string]any {
	return claimsSession(time.Now().Add(-4*time.Hour), "totp")
}

// freshSession : facteur fort vérifié il y a deux minutes (step-up à l'instant).
func freshSession() map[string]any {
	return claimsSession(time.Now().Add(-2*time.Minute), "totp")
}

// doClaims joue une requête avec une session complète (identité + claims).
func doClaims(r http.Handler, method, path, userID string, claims map[string]any, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
	if claims != nil {
		ctx = context.WithValue(ctx, middleware.ClaimsKey, claims)
	}
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// superadminEnforcingConsole monte la console partagée en mode refus avec un
// superadmin qui détient TOUTES les capacités : tout refus observé vient donc
// du contrôle de preuve, jamais d'une capacité manquante. Le motif est rempli
// d'une valeur paramétrable pour que chaque route soit atteinte.
func superadminEnforcingConsole(t *testing.T) func(method, path string, claims map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	lookup := &enforcingLookup{access: adminauthz.Access{
		UserID:       adminReaderID,
		Roles:        []string{adminauthz.RoleSuperadmin},
		Capabilities: adminauthz.AllCapabilities(),
	}}
	r, _, _ := testConsole(t, lookup)
	return func(method, path string, claims map[string]any) *httptest.ResponseRecorder {
		return doClaims(r, method, path, adminReaderID, claims, "{}")
	}
}

// stepUpCapabilities : capacités dont TOUTE mutation exige une preuve forte
// récente, où qu'elle soit déclarée. Le niveau suit la capacité quand celle-ci
// ne couvre que des actes lourds.
var stepUpCapabilities = map[adminauthz.Capability]string{
	adminauthz.ImportsReview:  "juger l'origine d'un fichier d'abonnés, déclencher des envois encadrés",
	adminauthz.CampaignsWrite: "écrire à des milliers d'adresses au nom de la plateforme",
	adminauthz.AbuseDecide:    "verdict humain sur un compte (mesure confirmée ou levée)",
	adminauthz.AppealsDecide:  "recours : un prononcé peut lever la mesure",
	adminauthz.LegalWrite:     "éditer le corpus juridique : une édition peut devenir opposable, et publier, planifier ou archiver l'est immédiatement",
}

// extraStepUpRoutes : routes à preuve forte qui ne se déduisent pas de leur
// capacité — le niveau est décidé route par route (une même capacité peut
// couvrir de la lecture fine et un acte lourd).
var extraStepUpRoutes = []string{
	"POST /v1/admin/legal/consent-exports",
}

// assumedN0 : capacités d'écriture qui restent volontairement sans preuve
// renforcée, avec le motif. Une entrée périmée (capacité qui exige désormais un
// step-up) fait échouer le test.
var assumedN0 = map[adminauthz.Capability]string{
	adminauthz.WidgetsWrite:    "mise en avant éditoriale (widgets, promos) : contenu de page, réversible en un clic",
	adminauthz.SupportWrite:    "suivi d'un dossier support : n'accorde ni ne retire aucun droit",
	adminauthz.ContentWrite:    "articles du centre d'aide : publication éditoriale, réversible",
	adminauthz.ReportsWrite:    "qualifier et clore un signalement : n'applique aucune mesure — la mesure passe par users.moderate ou abuse.decide, déjà N2",
	adminauthz.IncidentsWrite:  "tenue du registre d'incidents : dossier documenté, aucun effet sur les comptes",
	adminauthz.DeliveriesRetry: "relancer une livraison en échec : acte d'exploitation, sans effet d'autorité",
}

// expectedStepUpRoutes rassemble les routes qui doivent refuser une preuve
// ancienne : déduites de la capacité, déclarées dans la table du module, ou
// listées explicitement.
func expectedStepUpRoutes(t *testing.T, console *adminauthz.Console) map[string]string {
	t.Helper()
	expected := map[string]string{}
	for _, rt := range console.Registry().Routes() {
		if rt.Capability.IsReadOnly() {
			continue
		}
		if reason, ok := stepUpCapabilities[rt.Capability]; ok {
			expected[rt.Key()] = reason
		}
	}
	for key, level := range stepUpRoutes {
		if level < authz.Level2 {
			t.Fatalf("stepUpRoutes déclare %s en %s : une route de cette table exige au moins N2", key, level)
		}
		expected[key] = "déclarée route par route (table du module)"
	}
	for _, key := range extraStepUpRoutes {
		expected[key] = "déclarée explicitement"
	}
	return expected
}

// TestStepUpRoutesAreDeclared — une clé mal orthographiée dans la table des
// routes à preuve forte ne doit pas dégrader silencieusement la route en N0 :
// chaque clé doit correspondre à une route réellement déclarée.
func TestStepUpRoutesAreDeclared(t *testing.T) {
	_, console, _ := testConsole(t, nil)
	for key := range expectedStepUpRoutes(t, console) {
		method, pattern, _ := strings.Cut(key, " ")
		if _, ok := console.Registry().Lookup(method, pattern); !ok {
			t.Errorf("%s : route déclarée en preuve forte mais absente du registre (faute de frappe ?)", key)
		}
	}
}

// TestStepUpRoutesRefuseMorningSession — le critère de sortie, route par route,
// en mode refus : une session `aal2` du matin ne peut pas expédier ces actes,
// et le refus porte le code et le niveau que l'écran attend pour proposer un
// step-up.
func TestStepUpRoutesRefuseMorningSession(t *testing.T) {
	_, console, _ := testConsole(t, nil)
	call := superadminEnforcingConsole(t)
	expected := expectedStepUpRoutes(t, console)
	if len(expected) == 0 {
		t.Fatal("aucune route sensible examinée")
	}

	for key := range expected {
		t.Run(key, func(t *testing.T) {
			method, pattern, _ := strings.Cut(key, " ")
			w := call(method, fillPath(pattern), morningSession())
			if w.Code != http.StatusForbidden {
				t.Fatalf("session du matin = %d, attendu 403 (%s)", w.Code, w.Body.String())
			}
			if got := w.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeNeedsStepUp) {
				t.Fatalf("X-Qoe-Authz-Code = %q, attendu %q", got, authz.CodeNeedsStepUp)
			}
			if !strings.Contains(w.Body.String(), `"level"`) {
				t.Fatalf("le refus ne dit pas le niveau exigé : %s", w.Body.String())
			}
		})
	}
}

// stubConsole reproduit la politique déclarée (capacité + niveau + acte soumis
// à quorum) sur des handlers inertes : le niveau vient du REGISTRE, pas d'une
// seconde table de test qui pourrait diverger de la production. Les handlers ne
// sont pas exercés ici (ils le sont par leurs propres tests, avec une base) ; ce
// qu'on vérifie, c'est que le garde laisse passer une preuve légitime.
func stubConsole(t *testing.T, source *adminauthz.Console, approval adminauthz.ApprovalCheck) http.Handler {
	t.Helper()
	r := chi.NewRouter()
	c := adminauthz.NewConsole(r, &enforcingLookup{access: adminauthz.Access{
		UserID:       adminReaderID,
		Roles:        []string{adminauthz.RoleSuperadmin},
		Capabilities: adminauthz.AllCapabilities(),
	}}, nil)
	stub := func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"stub":true}`))
	}
	for _, rt := range source.Registry().Routes() {
		opts := []adminauthz.Option{adminauthz.WithProofLevel(rt.Level)}
		if rt.ApprovalAct != "" {
			opts = append(opts, adminauthz.WithApprovalAct(rt.ApprovalAct))
			if approval != nil {
				opts = append(opts, adminauthz.WithApproval(approval))
			}
		}
		c.Mount(rt.Method, rt.Pattern, rt.Capability, stub, opts...)
	}
	return r
}

// TestStepUpRoutesAcceptFreshProof — une preuve forte de deux minutes ouvre
// l'acte : le garde ne bloque pas un step-up légitime. Les routes N3 restent
// fermées tant que le quorum n'est pas branché (`needs_review`) : une double
// validation qu'on ne sait pas vérifier n'est pas une double validation.
func TestStepUpRoutesAcceptFreshProof(t *testing.T) {
	_, console, _ := testConsole(t, nil)
	stub := stubConsole(t, console, nil)

	for _, rt := range console.Registry().Routes() {
		if rt.Level < authz.Level2 {
			continue
		}
		t.Run(rt.Key(), func(t *testing.T) {
			w := doClaims(stub, rt.Method, fillPath(rt.Pattern), adminReaderID, freshSession(), "{}")
			if rt.Level >= authz.Level3 {
				if w.Code != http.StatusForbidden || w.Header().Get("X-Qoe-Authz-Code") != string(authz.CodeNeedsReview) {
					t.Fatalf("N3 sans quorum = %d %s, attendu 403 needs_review", w.Code, w.Body.String())
				}
				return
			}
			if w.Code != http.StatusOK {
				t.Fatalf("preuve fraîche refusée : %d %s", w.Code, w.Body.String())
			}
		})
	}
}

// TestStepUpRoutesAcceptFreshProofWithQuorum — quorum branché (Phase 8), les
// mêmes routes N3 s'ouvrent à une preuve fraîche approuvée : le garde ne
// s'oppose alors plus à l'acte.
func TestStepUpRoutesAcceptFreshProofWithQuorum(t *testing.T) {
	_, console, _ := testConsole(t, nil)
	stub := stubConsole(t, console, func(context.Context, string, authz.Action) bool { return true })

	checked := 0
	for _, rt := range console.Registry().Routes() {
		if rt.Level < authz.Level2 {
			continue
		}
		checked++
		w := doClaims(stub, rt.Method, fillPath(rt.Pattern), adminReaderID, freshSession(), "{}")
		if w.Code != http.StatusOK {
			t.Fatalf("%s = %d %s, attendu 200 avec quorum", rt.Key(), w.Code, w.Body.String())
		}
	}
	if checked == 0 {
		t.Fatal("aucune route à preuve renforcée examinée")
	}
}

// TestEveryWriteRouteIsClassified — aucune zone grise : toute route d'écriture
// montée sur la console exige une preuve forte OU appartient à une capacité
// dont l'absence de preuve renforcée est assumée et écrite ici. Une nouvelle
// route d'écriture non classée échoue à la CI, comme une route orpheline.
func TestEveryWriteRouteIsClassified(t *testing.T) {
	_, console, _ := testConsole(t, nil)
	expected := expectedStepUpRoutes(t, console)

	for _, rt := range console.Registry().Routes() {
		if rt.Capability.IsReadOnly() {
			continue
		}
		if _, ok := expected[rt.Key()]; ok {
			continue
		}
		if _, ok := assumedN0[rt.Capability]; ok {
			continue
		}
		t.Errorf("%s (%s) : écriture ni soumise à preuve forte ni déclarée N0 assumée", rt.Key(), rt.Capability)
	}

	// Réciproque : une capacité déclarée N0 assumée ne doit porter AUCUNE route
	// déjà soumise à preuve forte — la réserve serait périmée et trompeuse.
	// Le contrôle lit le niveau RÉELLEMENT déclaré dans le registre : c'est lui
	// qui fait foi, pas la table d'attente du test.
	for cap, reason := range assumedN0 {
		if _, ok := stepUpCapabilities[cap]; ok {
			t.Errorf("capacité %s : déclarée N0 assumée (%s) et soumise à preuve forte", cap, reason)
		}
		for _, rt := range console.Registry().Routes() {
			if rt.Capability != cap {
				continue
			}
			if lvl, ok := console.Registry().Level(rt.Method, rt.Pattern); ok && lvl >= authz.Level2 {
				t.Errorf("capacité %s déclarée N0 assumée (%s) mais %s exige %s", cap, reason, rt.Key(), lvl)
			}
		}
	}
}
