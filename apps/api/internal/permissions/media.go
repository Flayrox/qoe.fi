// Package permissions centralise les règles RBAC Média (miroir de @qoe/auth/media.ts).
// =====================================================================
// Un créateur peut travailler pour plusieurs médias avec des rôles et des
// permissions distincts par média. Le rôle définit des permissions de base ;
// les overrides granulaires (member.permissions) peuvent les affiner.
// =====================================================================
package permissions

import "sort"

// MediaMember est le contexte minimal pour les vérifications de permission.
type MediaMember struct {
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
	Status      string   `json:"status"`
}

// Permissions média granulaires.
const (
	PermManageMembers    = "media:manage_members"
	PermManageSettings   = "media:manage_settings"
	PermManageBilling    = "media:manage_billing"
	PermManageCategories = "media:manage_categories"
	PermManageNewsletter = "media:manage_newsletter"
	PermPublishAny       = "media:publish:any"
	PermEditAny          = "media:edit:any"
	PermDeleteAny        = "media:delete:any"
	PermReview           = "media:review"
	PermViewAnalytics    = "media:view_analytics"
	PermCreateArticles   = "media:create_articles"
	PermEditOwn          = "media:edit_own"
	PermManageApiKeys    = "api_keys:manage"
	// PermImportSubscribers autorise à **déposer** une liste d'abonnés pour
	// revue. Volontairement absente des rôles editor/writer/viewer : publier ou
	// gérer les clés d'API ne doit pas suffire implicitement à faire entrer des
	// milliers d'adresses dans le périmètre d'envoi d'une publication (fiche 03
	// §2). Seul le propriétaire l'a par défaut ; elle peut être accordée ou
	// retirée explicitement par override sur un membre.
	PermImportSubscribers = "subscribers:import_request"
)

var allMediaPermissions = []string{
	PermManageMembers, PermManageSettings, PermManageBilling, PermManageCategories,
	PermManageNewsletter, PermPublishAny, PermEditAny, PermDeleteAny, PermReview,
	PermViewAnalytics, PermCreateArticles, PermEditOwn, PermManageApiKeys,
	PermImportSubscribers,
}

// rolePermissions définit les permissions de base par rôle.
var rolePermissions = map[string][]string{
	"owner":  allMediaPermissions,
	"editor": {PermManageCategories, PermManageNewsletter, PermPublishAny, PermEditAny, PermDeleteAny, PermReview, PermViewAnalytics, PermCreateArticles, PermEditOwn},
	"writer": {PermCreateArticles, PermEditOwn},
	// Le rôle viewer est en lecture seule : les analytics (métriques financières
	// et audience) sont réservés aux rôles de gestion (owner/editor). Un viewer
	// peut recevoir la permission par override explicite.
	"viewer": {},
}

var roleOrder = map[string]int{"owner": 4, "editor": 3, "writer": 2, "viewer": 1}

// AllMediaPermissions retourne la liste complète des permissions média (copie
// défensive : un appelant ne peut pas muter l'allowlist du package).
func AllMediaPermissions() []string {
	out := make([]string, len(allMediaPermissions))
	copy(out, allMediaPermissions)
	return out
}

// EffectivePermissions calcule les permissions réellement exercées par un
// membre : permissions de base du rôle + overrides explicites ("perm" ajoute,
// "-perm" retire). Un membre non actif n'a aucune permission.
func EffectivePermissions(m *MediaMember) []string {
	if m == nil || (m.Status != "" && m.Status != "active") {
		return []string{}
	}
	// `seen` est l'unique source de vérité : un retrait doit disparaître de la
	// sortie, y compris s'il portait sur une permission du rôle. Construire la
	// sortie depuis une liste séparée ré-ajoutait les permissions retirées.
	seen := make(map[string]bool, len(allMediaPermissions))
	set := func(p string, on bool) {
		if p == "" {
			return
		}
		if on {
			seen[p] = true
			return
		}
		delete(seen, p)
	}
	for _, p := range rolePermissions[m.Role] {
		set(p, true)
	}
	// Overrides explicites, appliqués dans l'ordre : le dernier gagne.
	for _, o := range m.Permissions {
		if len(o) > 0 && o[0] == '-' {
			set(o[1:], false)
			continue
		}
		set(o, true)
	}
	// Ordre déterministe : allowlist d'abord, puis les overrides inconnus
	// (triés) pour que l'affichage ne dépende pas de l'itération d'une map.
	ordered := make([]string, 0, len(seen))
	for _, p := range allMediaPermissions {
		if seen[p] {
			ordered = append(ordered, p)
		}
	}
	extra := make([]string, 0, len(seen))
	for p := range seen {
		if !contains(allMediaPermissions, p) {
			extra = append(extra, p)
		}
	}
	sort.Strings(extra)
	return append(ordered, extra...)
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

// CanMedia vérifie si un membre d'un média possède une permission.
//
// La décision est calculée par EffectivePermissions : une seule sémantique
// d'overrides pour l'application et pour l'interface. Auparavant CanMedia
// retenait le **premier** override rencontré alors qu'EffectivePermissions
// appliquait le dernier : `["-x", "x"]` autorisait côté interface et refusait
// côté garde. Une divergence entre l'affichage des droits et leur exercice est
// une source de contournement (on croit avoir le droit, ou l'inverse).
func CanMedia(m *MediaMember, permission string) bool {
	if m == nil || permission == "" {
		return false
	}
	// Seul un membre actif exerce des droits (fiche 05 §6) : une invitation en
	// attente (`invited`) ne publie ni ne gère l'équipe — elle doit d'abord
	// être acceptée avec MFA vérifiée. Le statut vide reste autorisé pour
	// compatibilité des appelants qui ne résolvent pas le statut.
	if m.Status != "" && m.Status != "active" {
		return false
	}
	return contains(EffectivePermissions(m), permission)
}

// CanEditMediaArticle vérifie si un membre peut éditer un article donné du média.
func CanEditMediaArticle(m *MediaMember, articleAuthorID, memberUserID string) bool {
	if m == nil {
		return false
	}
	if CanMedia(m, PermEditAny) {
		return true
	}
	if CanMedia(m, PermEditOwn) && articleAuthorID == memberUserID {
		return true
	}
	return false
}

// IsMediaAdmin vérifie si le membre est owner ou a un rôle ≥ editor.
//
// Un membre non actif ne l'est jamais : renvoyer « admin » pour une invitation
// en attente ou un compte suspendu ferait de ce helper un piège pour le
// prochain appelant. Il n'est aujourd'hui utilisé que par les tests, ce qui
// est précisément la raison de le rendre sûr avant qu'il ne serve.
func IsMediaAdmin(m *MediaMember) bool {
	if m == nil {
		return false
	}
	if m.Status != "" && m.Status != "active" {
		return false
	}
	return roleOrder[m.Role] >= roleOrder["editor"]
}
