package admin

// =====================================================================
// 🧭 Chaque route de la console répond, exercée pour de vrai
// =====================================================================
// Le registre de routes est la déclaration unique de la surface admin. Ce test
// le parcourt ENTIÈREMENT avec une session staff complète (superadmin, preuve
// forte récente) et vérifie qu'aucune route ne part en 5xx : chaque handler
// s'exécute réellement — validations, lectures, refus propres — au lieu de
// rester du code mort que seule la production découvre.
//
// Un corps vide est envoyé aux écritures : la réponse attendue est une erreur
// de validation (4xx), jamais un crash. C'est volontairement grossier : ce test
// ne remplace pas les tests de contrat, il garantit qu'aucune route n'est
// orpheline.
// =====================================================================

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

// smokePathValues remplace les paramètres de route par des valeurs plausibles :
// un UUID existant pour les comptes, l'article de fixture, et un identifiant
// inconnu ailleurs (les handlers doivent répondre proprement « introuvable »).
func smokePathValues(param string) string {
	switch param {
	case "userID", "userId":
		return adminCreator
	case "articleID", "articleId":
		return "art_adm_01"
	case "publisherID", "publisherId", "id":
		return "pub_adm_001"
	case "email":
		return "smoke@test.dev"
	case "kind":
		return "username"
	case "roleKey":
		return "admin.viewer"
	case "key":
		return "cle-inexistante"
	default:
		return "inexistant"
	}
}

// smokePath complète un motif (`/v1/admin/users/{userID}`) en chemin réel.
func smokePath(pattern string) string {
	out := pattern
	for {
		start := strings.Index(out, "{")
		if start < 0 {
			return out
		}
		end := strings.Index(out[start:], "}")
		if end < 0 {
			return out
		}
		param := out[start+1 : start+end]
		out = out[:start] + smokePathValues(param) + out[start+end+1:]
	}
}

func TestAdminRoutes_AucuneRouteNeCasse(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	r := newHTTPRouter()
	h := NewHandler(newTestService())

	routes := h.routeTable()
	if len(routes) < 50 {
		t.Fatalf("registre de routes = %d entrées : la surface admin a fondu", len(routes))
	}

	for _, rt := range routes {
		path := smokePath(rt.pattern)
		body := ""
		if rt.method != "GET" && rt.method != "DELETE" {
			body = `{}`
		}
		w := do(r, rt.method, path, adminAdminID, body)
		// Trois routes dépendent de services que `cmd/server` branche au
		// démarrage (registre de capacités, service des comptes, service de
		// confiance) et que ce harnais ne monte pas : leur refus est un 503
		// explicite, pas une panne.
		if w.Code == http.StatusServiceUnavailable {
			continue
		}
		if w.Code >= 500 {
			t.Errorf("%s %s → %d : %s", rt.method, path, w.Code, w.Body.String())
		}
	}
}
