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
)

var allMediaPermissions = []string{
	PermManageMembers, PermManageSettings, PermManageBilling, PermManageCategories,
	PermManageNewsletter, PermPublishAny, PermEditAny, PermDeleteAny, PermReview,
	PermViewAnalytics, PermCreateArticles, PermEditOwn,
}

// rolePermissions définit les permissions de base par rôle.
var rolePermissions = map[string][]string{
	"owner":  allMediaPermissions,
	"editor": {PermManageCategories, PermManageNewsletter, PermPublishAny, PermEditAny, PermDeleteAny, PermReview, PermViewAnalytics, PermCreateArticles, PermEditOwn},
	"writer": {PermCreateArticles, PermEditOwn},
	"viewer": {PermViewAnalytics},
}

var roleOrder = map[string]int{"owner": 4, "editor": 3, "writer": 2, "viewer": 1}

// CanMedia vérifie si un membre d'un média possède une permission.
func CanMedia(m *MediaMember, permission string) bool {
	if m == nil {
		return false
	}
	if m.Status != "" && m.Status != "active" && m.Status != "invited" {
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
