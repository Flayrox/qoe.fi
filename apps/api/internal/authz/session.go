package authz

import (
	"encoding/json"
	"strconv"
	"time"
)

// AMREntry est une entrée du claim `amr` : la méthode utilisée et l'instant
// où elle a été utilisée. GoTrue n'horodate pas toujours les entrées ; dans
// ce cas Timestamp est zéro et l'évaluateur retombe sur `iat`.
type AMREntry struct {
	Method    string
	Timestamp time.Time
}

// Session décrit la session authentifiée telle que **prouvée par le JWT**.
// Elle est reconstruite à chaque requête : rien n'est mis en cache côté client
// et aucun en-tête « MFA=true » envoyé par le navigateur n'est accepté.
type Session struct {
	UserID    string
	SessionID string
	// AAL est le niveau annoncé par le fournisseur (« aal1 » / « aal2 »). Il
	// ne sert pas à autoriser : il distingue seulement un « aal2 » insuffisant
	// (élevé par une méthode non autorisée) d'une session simplement
	// partiellement authentifiée, pour produire un refus explicable.
	AAL      string
	Methods  []AMREntry
	IssuedAt time.Time
}

// FromClaims construit la session depuis les claims JWT Supabase posés dans
// le contexte par internal/middleware (middleware.Claims(ctx)). Une carte nil
// ou vide produit une session sans utilisateur — donc refusée par l'évaluateur.
func FromClaims(claims map[string]any) Session {
	s := Session{}
	if claims == nil {
		return s
	}
	s.UserID, _ = claims["sub"].(string)
	s.SessionID, _ = claims["session_id"].(string)
	if aal, ok := claims["aal"].(string); ok {
		s.AAL = NormalizeAAL(aal)
	}
	s.IssuedAt = claimTime(claims["iat"])
	s.Methods = parseAMR(claims["amr"])
	return s
}

// NormalizeAAL met le niveau annoncé sous forme canonique (« aal2 »).
func NormalizeAAL(raw string) string {
	switch raw {
	case "aal1", "aal2", "aal3":
		return raw
	default:
		return ""
	}
}

// StrongMethodAt retourne la méthode forte autorisée la plus récente et son
// horodatage. ok=false si la session n'a été élevée par aucune méthode forte
// permise — y compris lorsque le fournisseur annonce `aal2` (cas d'un second
// facteur SMS).
func (s Session) StrongMethodAt() (method string, at time.Time, ok bool) {
	for _, e := range s.Methods {
		if !IsStrongMethod(e.Method) {
			continue
		}
		ok = true
		if method == "" {
			method = NormalizeMethod(e.Method)
		}
		if !e.Timestamp.IsZero() && e.Timestamp.After(at) {
			method = NormalizeMethod(e.Method)
			at = e.Timestamp
		}
	}
	if ok && at.IsZero() {
		// Pas d'horodatage dans `amr` : la fraîcheur se mesure au plus tôt à
		// l'émission du jeton, jamais « maintenant ».
		at = s.IssuedAt
	}
	return method, at, ok
}

// ActiveStrongMethod indique si la session porte une preuve forte valide et
// assez récente pour le délai demandé (0 = valable tant que la session vit).
func (s Session) ActiveStrongMethod(now time.Time, maxAge time.Duration) bool {
	_, at, ok := s.StrongMethodAt()
	if !ok {
		return false
	}
	if maxAge <= 0 {
		return true
	}
	if at.IsZero() {
		return false
	}
	return now.Sub(at) <= maxAge
}

// parseAMR tolère les formes rencontrées selon les versions de GoTrue :
// []any de map[string]any, []map[string]any, ou une entrée unique.
func parseAMR(raw any) []AMREntry {
	switch v := raw.(type) {
	case nil:
		return nil
	case []any:
		out := make([]AMREntry, 0, len(v))
		for _, item := range v {
			if e, ok := amrEntry(item); ok {
				out = append(out, e)
			}
		}
		return out
	case []map[string]any:
		out := make([]AMREntry, 0, len(v))
		for _, item := range v {
			if e, ok := amrEntry(item); ok {
				out = append(out, e)
			}
		}
		return out
	default:
		if e, ok := amrEntry(raw); ok {
			return []AMREntry{e}
		}
		return nil
	}
}

func amrEntry(raw any) (AMREntry, bool) {
	var m map[string]any
	switch v := raw.(type) {
	case map[string]any:
		m = v
	case map[string]string:
		m = make(map[string]any, len(v))
		for k, val := range v {
			m[k] = val
		}
	default:
		return AMREntry{}, false
	}
	method, _ := m["method"].(string)
	if method == "" {
		return AMREntry{}, false
	}
	return AMREntry{Method: method, Timestamp: claimTime(m["timestamp"])}, true
}

// claimTime lit un horodatage de claim JWT (secondes Unix) sous les formes
// possibles : float64 (JSON), int64/int, json.Number, string numérique.
func claimTime(raw any) time.Time {
	switch v := raw.(type) {
	case nil:
		return time.Time{}
	case float64:
		if v <= 0 {
			return time.Time{}
		}
		return time.Unix(int64(v), 0).UTC()
	case int64:
		if v <= 0 {
			return time.Time{}
		}
		return time.Unix(v, 0).UTC()
	case int:
		if v <= 0 {
			return time.Time{}
		}
		return time.Unix(int64(v), 0).UTC()
	case json.Number:
		n, err := v.Int64()
		if err != nil || n <= 0 {
			return time.Time{}
		}
		return time.Unix(n, 0).UTC()
	case string:
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n <= 0 {
			return time.Time{}
		}
		return time.Unix(n, 0).UTC()
	case time.Time:
		return v.UTC()
	default:
		return time.Time{}
	}
}
