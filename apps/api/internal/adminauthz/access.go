package adminauthz

import "sort"

// Set est un ensemble de capacités détenues. Un ensemble vide n'accorde rien
// (refus par défaut) — jamais « pas d'information donc on laisse passer ».
type Set map[Capability]bool

// Has dit si la capacité est détenue.
func (s Set) Has(c Capability) bool { return s != nil && s[c] }

// Empty dit si l'ensemble n'accorde aucune capacité.
func (s Set) Empty() bool { return len(s) == 0 }

// List retourne les capacités détenues, triées. Toujours non nil — une liste
// vide doit se sérialiser en `[]`, jamais en `null` (leçon du crash
// « This page couldn't load » : une slice Go nil devient `null` en JSON).
func (s Set) List() []Capability {
	out := make([]Capability, 0, len(s))
	for c, on := range s {
		if on {
			out = append(out, c)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// Keys retourne les capacités détenues sous forme de chaînes, triées et non
// nil (contrat JSON de la console).
func (s Set) Keys() []string {
	caps := s.List()
	out := make([]string, 0, len(caps))
	for _, c := range caps {
		out = append(out, string(c))
	}
	return out
}

// Union fusionne deux ensembles (l'ensemble d'origine n'est pas modifié).
func (s Set) Union(other Set) Set {
	out := Set{}
	for c := range s {
		out[c] = true
	}
	for c := range other {
		out[c] = true
	}
	return out
}

// Access est l'autorisation résolue d'une personne : ses rôles et l'ensemble
// des capacités qui en découlent, échéances déjà appliquées.
type Access struct {
	UserID       string
	Roles        []string
	Capabilities Set
}

// Has dit si la personne détient la capacité.
func (a Access) Has(c Capability) bool { return a.Capabilities.Has(c) }

// IsStaff dit si l'accès ouvre la console : au moins une capacité détenue.
//
// Un rôle ÉCHU ne compte pas : ses capacités sont retirées (visibles mais
// inertes), donc l'accès n'ouvre plus rien. C'est cette question — « cette
// personne est-elle du personnel ? » — que le garde tranche avant tout le
// reste : l'observation existe pour ne pas verrouiller un personnel légitime
// pendant la bascule, pas pour ouvrir les routes de la console à quiconque
// possède un jeton.
func (a Access) IsStaff() bool { return len(a.Capabilities) > 0 }

// IsSuperadmin dit si l'accès vient du rôle superadmin (ou de la promotion
// historique `User."role" = 'superadmin'`). Raccourci d'affichage : le code de
// décision ne doit pas court-circuiter sur ce booléen, il teste la capacité.
func (a Access) IsSuperadmin() bool {
	for _, r := range a.Roles {
		if r == RoleSuperadmin {
			return true
		}
	}
	return false
}

// RoleKeys retourne les rôles, non nil et triés (contrat JSON de la console).
func (a Access) RoleKeys() []string {
	out := make([]string, 0, len(a.Roles))
	out = append(out, a.Roles...)
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// CapabilityKeys retourne les capacités détenues, non nil et triées.
func (a Access) CapabilityKeys() []string { return a.Capabilities.Keys() }
