# Garde d'autorisation (internal/authz)

Noyau de décision **serveur**, refus par défaut, pour les actions sensibles :
registre `action → niveau de preuve`, évaluateur, et adaptateur HTTP monté sur
les routes concernées.

## Pourquoi

Avant ce module, les routes média vérifiaient bien les rôles (`CanMedia`), mais
**rien côté Go ne regardait la force d'authentification de la session** : les
routes `/v1/me/mfa*` ne font que relayer GoTrue, et aucun code ne lisait `aal`,
`amr` ni de preuve de téléphone. Concrètement, un second facteur SMS valait
autant qu'une passkey.

Invariants désormais encodés dans le code (et testés) :

- **Un numéro vérifié n'est pas une MFA forte.** `webauthn` et `totp` sont les
  seules méthodes fortes ; `otp`/`sms`/`phone`/`password`/`oauth`/`magiclink`
  n'élèvent jamais une session.
- **`aal2` ne suffit pas** : si le `aal2` a été obtenu par une méthode non
  autorisée, la décision est `deny_weak_auth` (et non « il faut se connecter »).
- **Une passkey enregistrée n'est pas une passkey utilisée** : c'est la session
  courante qui est évaluée, pas le compte.
- **Une permission média se lit sur le média visé**, jamais sur un autre média
  de l'acteur.
- **Une action absente du registre est refusée**, et une permission exigée mais
  non résolue par l'appelant aussi.

## Niveaux

| | Signification |
| --- | --- |
| N0 | Compte normal : authentification de base. |
| N1 | MFA forte active et session fortement vérifiée. |
| N2 | Preuve forte **récente** (step-up, fenêtre de 10 min). |
| N3 | N2 + double validation organisationnelle. |

Ce sont des niveaux **produit qoe.fi**, pas les niveaux d'assurance NIST AAL :
la correspondance dépend de la pile GoTrue réellement déployée et doit être
vérifiée côté Go, pas déduite de l'interface.

## Registre actuel

Généré depuis `authz.Matrix()` — la source de vérité est le code, pas ce tableau.

| Action | Niveau | Fraîcheur | Téléphone | Permission média | Double validation |
| --- | --- | --- | --- | --- | --- |
| `account_email_change` | N2 | 10m | — | — | — |
| `api_key_create` | N2 | 10m | — | `api_keys:manage` | — |
| `api_key_revoke` | N2 | 10m | — | `api_keys:manage` | — |
| `api_key_rotate` | N2 | 10m | — | `api_keys:manage` | — |
| `api_key_scope_change` | N2 | 10m | — | `api_keys:manage` | — |
| `bulk_campaign_send` | N2 | 10m | — | `media:manage_newsletter` | — |
| `factor_remove` | N2 | 10m | — | — | — |
| `import_request` | N2 | 10m | **oui** | `media:manage_newsletter` | — |
| `invitation_accept` | N1 | — | — | — | — |
| `legal_publish` | N3 | 10m | — | — | **oui** |
| `media_create` | N1 | — | — | — | — |
| `media_delete` | N2 | 10m | — | `media:manage_billing` | — |
| `media_draft_write` | N0 | — | — | — | — |
| `media_members_write` | N1 | — | — | `media:manage_members` | — |
| `media_newsletter_write` | N1 | — | — | `media:manage_newsletter` | — |
| `media_publish` | N1 | — | — | `media:publish:any` | — |
| `media_settings_write` | N1 | — | — | `media:manage_settings` | — |
| `owner_transfer` | N2 | 10m | — | `media:manage_members` | — |
| `personal_api_key_manage` | N2 | 10m | — | — | — |
| `read_content` | N0 | — | — | — | — |
| `reader_interact` | N0 | — | — | — | — |
| `sending_domain_change` | N2 | 10m | — | `media:manage_settings` | — |
| `staff_high_impact` | N3 | 10m | — | — | **oui** |
| `subscribers_export` | N2 | 10m | — | `media:manage_newsletter` | — |

Note produit : `media_draft_write` est laissé en N0 (la fiche laisse le choix
N0/N1). Un brouillon ne publie rien et ne sort pas du média ; le mettre en N1
imposerait un step-up à chaque session d'un rédacteur.

## Modes : observation d'abord, refus ensuite

Le garde a deux modes :

- **`AuthzObserve`** : la décision est calculée, journalisée
  (`[authz:observe]`), puis la requête **passe**.
- **`AuthzEnforce`** : la requête est refusée par un `403` portant le motif.

Le mode est piloté **par le flag `authz-enforce`**, relu à chaque requête :

| `authz-enforce` | Effet |
| --- | --- |
| `false` (**défaut**) | Observation — aucune régression possible pour les comptes existants. |
| `true` | Refus réel. |

En l'absence de resolver de mode (tests unitaires, outillage), le mode par
défaut d'un garde est **l'observation**. Monter un garde ne change donc jamais
le comportement d'une route tant que le refus n'est pas activé explicitement,
ni par le flag, ni par l'option `WithAuthzMode(AuthzEnforce)` — ce que les
tests qui attendent un `403` font volontairement.

Bascule depuis la console admin, sans redéploiement : c'est un flag de la table
`feature_flags`, lu par `internal/flags` (miroir TS `@qoe/flags`). Activer le
refus avant que la MFA forte ne soit réellement disponible verrouillerait des
propriétaires de médias : l'ordre correct est d'observer, de mesurer les faux
positifs, puis d'accompagner les comptes existants avant de basculer.

## Réponse de refus

```json
{ "error": "…", "code": "needs_step_up", "action": "api_key_create", "level": "N2" }
```

Plus les en-têtes `X-Qoe-Authz-Code` et `X-Qoe-Authz-Level`. Codes exploitables
par le front : `needs_step_up` (proposer une re-vérification), `deny_weak_auth`
(SMS/e-mail OTP ne comptent pas — proposer TOTP/passkey),
`deny_no_resource_permission` (droits), `deny_phone_not_verified` (numéro
requis), `needs_review` (seconde validation), `deny_actor_suspended`,
`deny_no_session`, `deny_unknown_action`.

## Monter un garde sur une nouvelle route

```go
r.With(middleware.RequireAction(authz.ActionMediaMembersWrite,
    middleware.WithAuthzResource(middleware.AuthzResourceMedia, "id"))).
    Patch("/v1/media/{id}/members/{userId}", h.updateMemberRole)
```

`WithAuthzResource` est **obligatoire** dès que l'action exige une permission
média : sans déclaration, aucune appartenance n'est résolue et le garde refuse.
Trois types existent :

- `AuthzResourceMedia` — le paramètre porte l'identifiant du média ;
- `AuthzResourcePublication` — il porte une publication (résolution via
  `GetMediaByPublicationID`) ;
- `AuthzResourceNewsletter` — il porte une édition (chaîne édition → publication
  → média).

Résoudre explicitement le type évite qu'un `{id}` de newsletter soit interprété
comme un identifiant de média, et donc qu'un `403` silencieux remplace un vrai
contrôle.

## Routes déjà montées

- **Média** : création (N1), réglages par média et par publication (N1 +
  `manage_settings`), invitations, rôles, permissions, retrait de membre, liens
  d'invitation (N1 + `manage_members`), acceptation d'un lien d'invitation (N1),
  clés API média créer/éditer/faire tourner/révoquer (N2 + `api_keys:manage`).
- **Settings** : clés API personnelles créer/faire tourner/révoquer (N2).
- **Newsletters** : envoi d'une campagne (N2 + `manage_newsletter`).

## Ce qui reste à monter

- **Export d'abonnés** (`subscribers_export`) : aucune route d'export dédiée
  n'existe encore. Les lectures par clé API (`/v1/creator/subscribers`) relèvent
  des **scopes de la clé**, pas d'une session : la protection se joue donc à la
  création de la clé, déjà gardée en N2.
- **Transfert de propriété, suppression de média, changement de domaine
  expéditeur** : actions enregistrées, à monter quand les parcours existent.
- **`import_request`** : la route d'import d'abonnés n'existe pas (le module
  `imports` ne gère que l'import d'articles). Le prérequis téléphone restera
  inopérant tant qu'aucun fournisseur SMS n'est branché — c'est volontaire : le
  garde refuse honnêtement plutôt que d'autoriser sans preuve. En observation,
  rien n'est bloqué.
- **`staff_high_impact` / `legal_publish`** : volontairement non montés — ils
  exigent une double validation dont le mécanisme (seconde approbation staff)
  n'existe pas encore. Les monter maintenant créerait des actions impossibles à
  satisfaire une fois le refus activé.

## Tests

Les décisions sont couvertes sans base de données :

```bash
cd apps/api
go test ./internal/authz/ ./internal/middleware/
```

Les tests d'intégration (testcontainers) ne couvrent pas encore la migration
`00030_account_phone_verification.sql` : Docker doit être disponible.
