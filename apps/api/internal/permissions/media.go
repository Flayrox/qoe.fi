// Package permissions centralise les règles RBAC Média (miroir de @qoe/auth/media.ts).
// =====================================================================
// Un créateur peut travailler pour plusieurs médias avec des rôles et des
// permissions distincts par média. Le rôle définit des permissions de base ;
// les overrides granulaires (member.permissions) peuvent les affiner.
// =====================================================================
package permissions

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
	out := make([]string, 0, len(allMediaPermissions))
	seen := make(map[string]bool, len(allMediaPermissions))
	add := func(p string) {
		if !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	for _, p := range rolePermissions[m.Role] {
		add(p)
	}
	for _, o := range m.Permissions {
		if len(o) > 0 && o[0] == '-' {
			delete(seen, o[1:])
			continue
		}
		if len(o) > 0 && o != "" {
			add(o)
		}
	}
	// Conserve l'ordre déterministe de l'allowlist, puis les overrides inconnus.
	ordered := make([]string, 0, len(out))
	for _, p := range allMediaPermissions {
		if seen[p] {
			ordered = append(ordered, p)
		}
	}
	for _, p := range out {
		if !contains(ordered, p) {
			ordered = append(ordered, p)
		}
	}
	return ordered
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
func CanMedia(m *MediaMember, permission string) bool {
	if m == nil {
		return false
	}
	// Seul un membre actif exerce des droits (fiche 05 §6) : une invitation en
	// attente (`invited`) ne publie ni ne gère l'équipe — elle doit d'abord
	// être acceptée avec MFA vérifiée. Le statut vide reste autorisé pour
	// compatibilité des appelants qui ne résolvent pas le statut.
	if m.Status != "" && m.Status != "active" {
		return false
	}

	base := rolePermissions[m.Role]
	// Overrides explicites : "perm" accorde, "-perm" retire.
	for _, o := range m.Permissions {
		if o == permission {
			return true
		}
		if o == "-"+permission {
			return false
		}
	}
	for _, b := range base {
		if b == permission {
			return true
		}
	}
	return false
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
func IsMediaAdmin(m *MediaMember) bool {
	if m == nil {
		return false
	}
	return roleOrder[m.Role] >= roleOrder["editor"]
}
