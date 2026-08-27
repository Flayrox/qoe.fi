package devtools

import (
	"context"
	"crypto/subtle"
	"net/http"

	"github.com/qoefi/api/internal/middleware"
)

// DevSecretUserID est l'UID sentinelle injecté lorsqu'une requête du panneau
// devtools est authentifiée par le secret partagé de dev (mode dev uniquement).
// Via checkSuperadmin/Schema, ce sentinel est accepté sans lookup DB ni rôle
// « superadmin » en base : le panneau de dev reste utilisable sans session
// utilisateur ni enregistrement superadmin, ce qui est le but d'un outillage
// DB local.
const DevSecretUserID = "devtools-dev-secret-uid"

// DevOnlyAuth autorise une requête devtools soit via un JWT utilisateur valide
// (CombinedAuth : JWT Supabase OU clé API qoe_live_), soit — quand devOnly est
// vrai et le secret partagé correspond — via le header x-qoe-internal-secret.
//
// ⚠️ Le bypass par secret n'est honoré QUE si devOnly est vrai (cas des
// environnements de dev). En production (QOE_DEVTOOLS_DEV_ONLY absent), ce
// middleware se comporte exactement comme CombinedAuth : superadmin JWT seul.
func DevOnlyAuth(
	combined func(http.Handler) http.Handler,
	internalSecret string,
	devOnly bool,
) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if devOnly && internalSecret != "" {
				got := r.Header.Get("x-qoe-internal-secret")
				if subtle.ConstantTimeCompare([]byte(got), []byte(internalSecret)) == 1 {
					ctx := context.WithValue(r.Context(), middleware.UserIDKey, DevSecretUserID)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
			combined(next).ServeHTTP(w, r)
		})
	}
}