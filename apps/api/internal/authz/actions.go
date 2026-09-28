package authz

import (
	"sort"
	"time"

	"github.com/qoefi/api/internal/permissions"
)

// StepUpMaxAge est la fenêtre pendant laquelle une preuve forte récente reste
// valable pour une action N2/N3. Au-delà, la personne doit repasser son
// facteur : une session `aal2` de ce matin ne suffit pas à exporter la liste
// d'abonnés ou à changer le propriétaire d'un média.
const StepUpMaxAge = 10 * time.Minute

// Action identifie une opération sensible. Les valeurs sont stables et
// journalisées : elles servent de code de motif pour l'audit et le support.
type Action string

const (
	// N0 — compte normal.
	ActionReadContent    Action = "read_content"
	ActionReaderInteract Action = "reader_interact" // commenter, aimer, s'abonner
	// Brouillon éditorial : la fiche 05 laisse le choix entre N0 et N1. Choix
	// produit retenu ici : N0, pour ne pas exiger un step-up à chaque session
	// d'un rédacteur ; le brouillon ne publie rien et ne sort pas du média.
	// Passage à N1 possible sans changer d'autre code qu'ici.
	ActionMediaDraftWrite Action = "media_draft_write"

	// N1 — MFA forte active et session fortement vérifiée.
	ActionMediaCreate          Action = "media_create"
	ActionInvitationAccept     Action = "invitation_accept"
	ActionMediaPublish         Action = "media_publish"
	ActionMediaSettingsWrite   Action = "media_settings_write"
	ActionMediaMembersWrite    Action = "media_members_write"
	ActionMediaNewsletterWrite Action = "media_newsletter_write"

	// N2 — preuve forte récente (step-up).
	ActionOwnerTransfer       Action = "owner_transfer"
	ActionMediaDelete         Action = "media_delete"
	ActionSubscribersExport   Action = "subscribers_export"
	ActionSendingDomainChange Action = "sending_domain_change"
	ActionImportRequest       Action = "import_request"
	ActionBulkCampaignSend    Action = "bulk_campaign_send"
	ActionApiKeyCreate        Action = "api_key_create"
	ActionApiKeyRotate        Action = "api_key_rotate"
	ActionApiKeyRevoke        Action = "api_key_revoke"
	ActionApiKeyScopeChange   Action = "api_key_scope_change"
	// Clés API personnelles (/v1/settings/api-keys) : elles appartiennent à
	// l'utilisateur, pas à un média — aucune permission média n'est requise,
	// mais la preuve forte reste exigée.
	ActionPersonalApiKeyManage Action = "personal_api_key_manage"
	ActionFactorRemove         Action = "factor_remove"
	ActionAccountEmailChange   Action = "account_email_change"

	// N3 — double validation organisationnelle.
	ActionStaffHighImpact Action = "staff_high_impact"
	ActionLegalPublish    Action = "legal_publish"
)

// Rule décrit ce qu'exige une action. Les champs sont volontairement
// déclaratifs : le registre est la source de vérité, pas une suite de
// conditions dispersées dans les handlers.
type Rule struct {
	// Level est le niveau de protection minimum (N0–N3).
	Level Level
	// Freshness borne l'âge de la preuve forte. 0 = la preuve est valable
	// tant que la session l'est (pertinent pour N0/N1) ; N2/N3 utilisent
	// StepUpMaxAge.
	Freshness time.Duration
	// RequirePhone exige `phone_verified`. C'est un prérequis anti-abus
	// **indépendant** de la MFA forte — jamais un substitut.
	RequirePhone bool
	// MediaPermission est la permission média requise, vide si l'action n'est
	// pas rattachée à un média. La permission ne remplace pas le niveau.
	MediaPermission string
	// DoubleApproval exige l'accord d'une seconde personne autorisée : à
	// réserver aux actions dont l'impact le justifie et dont le modèle
	// organisationnel permet réellement la double validation (un média solo
	// n'a personne pour approuver).
	DoubleApproval bool
	// Note documente l'intention produit, pour la matrice et la revue.
	Note string
}

// registry est le registre des actions. Toute action absente est refusée.
//
// « Créer un média » exige la MFA forte (N1) mais PAS de téléphone : le
// numéro est une exigence indépendante et motivée, pas un prérequis mécanique
// à la sécurité du compte.
var registry = map[Action]Rule{
	ActionReadContent:    {Level: Level0, Note: "lecture publique, paywall par entitlement"},
	ActionReaderInteract: {Level: Level0, Note: "commentaire, réaction, abonnement lecteur"},
	ActionMediaDraftWrite: {
		Level: Level0,
		Note:  "brouillon isolé du média : ne publie pas, n'élargit pas les droits",
	},

	ActionMediaCreate: {
		Level: Level1,
		Note:  "onboarding MFA avant activation du rôle propriétaire",
	},
	ActionInvitationAccept: {
		Level: Level1,
		Note:  "l'invitation reste en attente tant que la MFA n'est pas satisfaite",
	},
	ActionMediaPublish: {
		Level:           Level1,
		MediaPermission: permissions.PermPublishAny,
		Note:            "publier au nom du média",
	},
	ActionMediaSettingsWrite: {
		Level:           Level1,
		MediaPermission: permissions.PermManageSettings,
		Note:            "configuration du média hors domaine d'envoi (N2)",
	},
	ActionMediaMembersWrite: {
		Level:           Level1,
		MediaPermission: permissions.PermManageMembers,
		Note:            "membres, rôles et permissions du média",
	},
	ActionMediaNewsletterWrite: {
		Level:           Level1,
		MediaPermission: permissions.PermManageNewsletter,
		Note:            "réglages newsletter du média (envoi de masse = N2)",
	},

	ActionOwnerTransfer: {
		Level:           Level2,
		Freshness:       StepUpMaxAge,
		MediaPermission: permissions.PermManageMembers,
		Note:            "transfert de propriété : confirmation récente des deux parties",
	},
	ActionMediaDelete: {
		Level:           Level2,
		Freshness:       StepUpMaxAge,
		MediaPermission: permissions.PermManageBilling,
		Note:            "suppression du média, journal d'audit et notification",
	},
	ActionSubscribersExport: {
		Level:           Level2,
		Freshness:       StepUpMaxAge,
		MediaPermission: permissions.PermManageNewsletter,
		Note:            "export des abonnés : donnée personnelle à accès restreint",
	},
	ActionSendingDomainChange: {
		Level:           Level2,
		Freshness:       StepUpMaxAge,
		MediaPermission: permissions.PermManageSettings,
		Note:            "domaine expéditeur créateur : identité d'envoi et DNS",
	},
	ActionImportRequest: {
		Level:           Level2,
		Freshness:       StepUpMaxAge,
		RequirePhone:    true,
		MediaPermission: permissions.PermManageNewsletter,
		Note:            "prérequis email_verified && phone_verified, puis revue staff",
	},
	ActionBulkCampaignSend: {
		Level:           Level2,
		Freshness:       StepUpMaxAge,
		MediaPermission: permissions.PermManageNewsletter,
		Note:            "campagne de masse : budgets et décision staff en plus",
	},
	ActionApiKeyCreate: {
		Level:           Level2,
		Freshness:       StepUpMaxAge,
		MediaPermission: permissions.PermManageApiKeys,
		Note:            "le gestionnaire humain prouve sa session, pas le bot",
	},
	ActionApiKeyRotate: {
		Level:           Level2,
		Freshness:       StepUpMaxAge,
		MediaPermission: permissions.PermManageApiKeys,
		Note:            "rotation de clé : invalide l'ancien secret",
	},
	ActionApiKeyRevoke: {
		Level:           Level2,
		Freshness:       StepUpMaxAge,
		MediaPermission: permissions.PermManageApiKeys,
		Note:            "révocation : une clé média survit au départ de son créateur",
	},
	ActionApiKeyScopeChange: {
		Level:           Level2,
		Freshness:       StepUpMaxAge,
		MediaPermission: permissions.PermManageApiKeys,
		Note:            "élévation de scopes : ne pas contourner la MFA manquante",
	},
	ActionPersonalApiKeyManage: {
		Level:     Level2,
		Freshness: StepUpMaxAge,
		Note:      "clés API personnelles : créer, faire tourner, révoquer",
	},
	ActionFactorRemove: {
		Level:     Level2,
		Freshness: StepUpMaxAge,
		Note:      "retrait du dernier facteur : anticiper le verrouillage de compte",
	},
	ActionAccountEmailChange: {
		Level:     Level2,
		Freshness: StepUpMaxAge,
		Note:      "changement d'e-mail d'un compte privilégié",
	},

	ActionStaffHighImpact: {
		Level:          Level3,
		Freshness:      StepUpMaxAge,
		DoubleApproval: true,
		Note:           "droits plateforme indépendants des rôles média",
	},
	ActionLegalPublish: {
		Level:          Level3,
		Freshness:      StepUpMaxAge,
		DoubleApproval: true,
		Note:           "avis légal : rédaction, approbation et publication séparées",
	},
}

// Lookup retourne la règle d'une action. ok=false → action inconnue, donc
// refusée par défaut.
func Lookup(action Action) (Rule, bool) {
	r, ok := registry[action]
	return r, ok
}

// KnownAction indique si l'action est enregistrée.
func KnownAction(action Action) bool {
	_, ok := registry[action]
	return ok
}

// Actions liste les actions enregistrées, triées, pour la matrice et les tests
// d'exhaustivité.
func Actions() []Action {
	out := make([]Action, 0, len(registry))
	for a := range registry {
		out = append(out, a)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// MatrixRow est une ligne lisible de la matrice action → exigences, destinée
// à la documentation staff et à l'inventaire de la tranche 0.
type MatrixRow struct {
	Action          Action
	Level           Level
	Freshness       time.Duration
	RequirePhone    bool
	MediaPermission string
	DoubleApproval  bool
	Note            string
}

// Matrix retourne la matrice complète, triée par action.
func Matrix() []MatrixRow {
	out := make([]MatrixRow, 0, len(registry))
	for _, a := range Actions() {
		r := registry[a]
		out = append(out, MatrixRow{
			Action:          a,
			Level:           r.Level,
			Freshness:       r.Freshness,
			RequirePhone:    r.RequirePhone,
			MediaPermission: r.MediaPermission,
			DoubleApproval:  r.DoubleApproval,
			Note:            r.Note,
		})
	}
	return out
}
