package settings

import (
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/secguard"
)

// errUnauthenticated : handler atteint sans identité dans le contexte.
var errUnauthenticated = errors.New("authentification requise")

// ValidationError signale une requête invalide (400). Distinct des pannes :
// sans ce type, un handler ne peut pas différencier « entrée refusée » d'une
// base indisponible et répond 400 à une panne (cf. writeSettingsError).
type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string { return e.Message }

// PolicyError est un refus métier explicite (403) dont le message est destiné
// au client : « demande API non approuvée », « aucun scope accordé »… Distinct
// d'errForbidden (publication d'autrui) pour ne pas aplatir tous les refus.
type PolicyError struct {
	Message string
}

func (e *PolicyError) Error() string { return e.Message }

func policy(format string, args ...any) error {
	if len(args) == 0 {
		return &PolicyError{Message: format}
	}
	return &PolicyError{Message: fmt.Sprintf(format, args...)}
}

// writeSettingsError traduit une erreur du service en réponse HTTP. Un refus
// explicite reste 403/404, une entrée refusée reste 400, et tout le reste est
// une panne : 500, avec le détail uniquement dans les logs. Avant, chaque
// handler mappait « tout ce qui n'est pas 403 » en 400 et une base
// indisponible devenait une erreur de validation trompeuse.
func writeSettingsError(w http.ResponseWriter, err error, action string) {
	var invalidErr *ValidationError
	var policyErr *PolicyError
	switch {
	case errors.Is(err, errForbidden):
		response.Forbidden(w, "Accès refusé à cette publication.")
	case errors.Is(err, errNotFound):
		response.NotFound(w, "Ressource introuvable.")
	case errors.Is(err, errUnauthenticated):
		response.Unauthorized(w, "Authentification requise")
	case errors.As(err, &invalidErr):
		response.BadRequest(w, invalidErr.Message)
	case errors.As(err, &policyErr):
		response.Forbidden(w, policyErr.Message)
	case secguard.WriteRejection(w, err):
		// rejet antispam déjà écrit (message public, statut porté par l'erreur).
	default:
		log.Printf("[settings] %s: %v", action, err)
		response.Internal(w)
	}
}

// invalid construit une ValidationError (400).
func invalid(format string, args ...any) error {
	if len(args) == 0 {
		return &ValidationError{Message: format}
	}
	return &ValidationError{Message: fmt.Sprintf(format, args...)}
}
