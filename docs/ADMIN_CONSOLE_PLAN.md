# Console d'administration — rendre le panel meilleur et plus complet

Plan d'évolution de `apps/admin` (Next.js) adossé à `apps/api` (`internal/adminauthz`,
`internal/modules/admin`, `internal/authz`).

Le socle serveur est prêt et testé ; c'est **l'interface qui est en retard sur le
modèle**. Ce plan comble l'écart, phase par phase, sans jamais ouvrir un droit
implicite ni réécrire le socle.

## État des lieux (mesuré dans le dépôt)

Côté API — solide :

- **39 capacités**, 5 domaines (`pilotage, moderation, communaute, produit, plateforme`),
  **7 rôles** nommés (`superadmin, ops, moderation, content, support, legal, analyst`)
  dans `internal/adminauthz/{capability.go,roles.go}`, miroir SQL de la migration
  `00053_admin_rbac.sql` verrouillé par un test de parité.
- **~103 routes `/v1/admin/*`** déclarent leur capacité (table de routes dans
  `internal/modules/admin/handler.go`, plus `staff_campaigns_http.go` et
  `subscriber_imports.go`). `Console` est le seul chemin d'enregistrement.
- **Mode OBSERVATION par défaut** : le garde journalise le refus sans le produire
  (flag partagé `authz-enforce`). `User."role" = 'superadmin'` vaut toutes les
  capacités : aucune promotion existante ne peut être verrouillée.
- **`GET /v1/admin/me`** renvoie déjà `{userId, roles, capabilities}`.
- Audit : `AdminAuditLog` (migration `00015`) — `id, actorId, action, targetType,
  targetId, metadata (JSONB), createdAt`. Pas de colonne `capability`, pas de
  niveau de preuve, pas d'`ip`/`requestId`, pas d'avant/après structuré.
- Preuve : `internal/authz` implémente **N0–N3** avec `StepUpMaxAge = 10 min`.
  `staff_high_impact` (N3) et `legal_publish` (N3) sont **déclarés dans le
  registre mais exigés nulle part** ; le garde de capacité ne regarde **pas** le
  niveau de preuve.
- Gate CI : `.github/workflows/ci.yml` impose ≥ 90 % de couverture sur
  `internal/adminauthz` (mesuré 97,5 %).

Côté UI — le retard :

- **21 écrans** sous `apps/admin/src/app/(admin)/admin/**` : abuse, api, appeals,
  audit, compliance (+ export), config, frontend, imports (+ `[id]`), incidents,
  legal, notifications, oauth, reports, subscriptions, support (+ articles),
  translations, users (+ `[id]`), widgets, overview.
- **Barre latérale en 19 entrées plates** (`components/AdminSidebar.tsx`), sans
  conscience des capacités ni des domaines.
- `layout.tsx` teste `/v1/admin/dashboard` et **pose `role: 'superadmin'` en dur** :
  la console est encore binaire. Un compte `legal`, `moderation` ou `analyst` — que
  l'API sait autoriser — ne peut pas ouvrir la console. `/v1/admin/me` n'est
  appelé nulle part dans l'app.
- **Aucun écran** pour les rôles et attributions : nommer un modérateur demande
  aujourd'hui du SQL sur `AdminUserRole` (avec `expiresAt` pourtant modélisé).
- **Aucun écran** pour les décisions d'autorisation (refus en observation
  invisibles ailleurs que dans les logs) ni pour l'état de la plateforme
  (livraisons, stockage, inscriptions, réservations d'identifiants, campagnes
  staff : présents dans l'API, sans surface).

## Phase 1 — La console se connaît elle-même (identité et capacités)

Objectif : l'interface cesse d'être binaire.

- `layout.tsx` appelle `GET /v1/admin/me` et pose `{roles, capabilities}` dans le
  contexte ; suppression du `role: 'superadmin'` en dur et du test de forme par
  `/v1/admin/dashboard`.
- `AdminSidebar` : chaque entrée déclare **la capacité qui l'ouvre** et le domaine
  qui la range ; l'entrée disparaît si la capacité est absente, les domaines
  deviennent des sections repliables.
- `AdminHeader` affiche les rôles réels et leurs échéances ; `CommandPalette` ne
  propose que les écrans atteignables.
- Nouvel écran `/admin/forbidden` : refus explicite (« il vous manque
  `admin.audit.read` »), pas de redirection silencieuse.
- Défense en profondeur côté serveur : les server-actions de
  `src/lib/admin-actions.ts` revérifient la capacité avant d'agir, en plus du Go.

Critères de sortie : un compte `analyst` ouvre la console en lecture seule ; un
compte `legal` ne voit que contenu juridique et conformité ; un compte sans aucune
capacité tombe sur `/admin/forbidden` ; le superadmin est inchangé. Un test unitaire
échoue si une entrée de navigation cite une capacité inconnue du vocabulaire.

Effort : petit (1 PR).

## Phase 2 — Accès et rôles (le trou le plus visible)

Objectif : gérer les accès depuis la console, plus jamais en SQL.

- Nouvelles capacités `admin.access.read` et `admin.access.grant` (migration
  `00056`, `AdminCapability` + `AdminRoleCapability` : superadmin seulement par
  défaut) — le test de parité existant les couvre automatiquement.
- Routes `GET/POST/DELETE /v1/admin/access/*` : lister les attributions, attribuer
  un rôle à un utilisateur (avec `expiresAt` optionnel), révoquer, expliquer une
  décision (« pourquoi cette personne détient-elle ceci ? »).
- Écrans `/admin/access` (personnes → rôles) et `/admin/access/roles` (matrice
  rôle × capacité, générée depuis le vocabulaire, en lecture).
- Garde-fous : motif obligatoire pour attribuer comme pour révoquer, interdiction
  de retirer son propre dernier rôle, audit systématique, refus de révoquer le
  dernier superadmin de la plateforme.

Critères de sortie : nommer un `moderation` et lui poser une échéance se fait en
trois clics ; chaque mouvement laisse une ligne d'audit relisible.

Effort : moyen.

## Phase 3 — Capacité **×** niveau de preuve (step-up)

Objectif : un vol de session ne suffit plus à expédier un acte lourd.

- `internal/adminauthz` accepte une exigence de niveau en plus de la capacité, et
  s'appuie sur `internal/authz` (N2 = preuve forte récente, 10 min) au lieu
  d'inventer un second modèle.
- Sous-ensemble sensible : `admin.access.grant`, `admin.flags.write`,
  `admin.config.write`, `admin.compliance.export`, `admin.users.moderate`,
  `admin.imports.review` (déclenchement d'envoi), campagnes staff. On monte enfin
  `staff_high_impact` (déclaré, jamais exigé) et `legal_publish` (N3, double
  validation) sur la publication juridique.
- UI : quand l'API répond `deny_weak_auth`, l'écran propose la mise à niveau
  (step-up) puis **rejoue l'action visée** — pas de perte de saisie.

Critères de sortie : une session `aal2` de ce matin ne peut pas exporter la
conformité ; le refus est explicite, journalisé et testé.

Effort : moyen.

## Phase 4 — Audit lisible et journal des refus

Objectif : répondre à « qui a fait quoi, qui a été refusé, pourquoi, sous quel
mode » sans fouiller les logs.

- Migration `00057` : `AdminAuditLog` s'enrichit (`capability`, `proofLevel`,
  `requestId`, `ip`, `reason`, `before`/`after` JSONB) et les décisions
  d'autorisation — y compris celles **observées** — sont écrites dans une table
  dédiée, avec rétention et échantillonnage configurables.
- Écran `/admin/audit` : filtres par acteur, capacité, domaine, cible, période,
  mode ; diff avant/après lisible ; export CSV ; bandeau permanent « mode
  OBSERVATION — les refus ne sont pas encore appliqués ».
- Écran `/admin/access/decisions` : le journal des refus, groupé par capacité, pour
  préparer le passage en `authz-enforce`.
- Les refus d'observation remontent aussi en métrique (Phase 7).

Critères de sortie : avant d'armer le mode enforce, on peut lister les personnes
et les automatisations qui seraient bloquées.

Effort : moyen.

## Phase 5 — Couverture : plus aucune route orpheline

Objectif : aucune capacité sans surface, aucune route sans propriétaire.

- Manifeste `apps/admin/src/lib/admin-coverage.ts` : chaque route `/v1/admin/*`
  est classée « écran existant » ou « API-only » **avec justification**, et un test
  va lire la table de routes Go pour exiger que rien ne manque.
- Écrans manquants à traiter : livraisons et reprises, stockage, inscriptions et
  allowlist, réservations d'identifiants, publications et freemium, campagnes
  staff, décisions d'accès (Phase 4).
- Le dashboard affiche le ratio écrans/routes et les orphelines restantes.

Critères de sortie : 0 route non classée ; le ratio apparaît dans l'interface.

Effort : moyen.

## Phase 6 — Ergonomie et dangerosité

Objectif : agir vite sans se tromper de cible.

- Un langage commun de composants « console » (tableaux, filtres, pagination,
  états vides/erreur, `loading.tsx`) partagé par tous les écrans.
- Actions dangereuses : confirmation par saisie du nom, **aperçu d'impact chiffré**
  (« 312 abonnés, 4 campagnes en cours »), idempotence, retour arrière quand il est
  possible.
- Recherche transversale depuis la palette (⌘K) : utilisateur, publication,
  import, rapport, incident — jamais une capacité qu'on ne détient pas.
- Détails qui font la différence : français partout, dates relatives, copie d'ID,
  navigation au clavier, `data-testid` sur chaque action pour les tests d'interface.

Critères de sortie : chaque écran a état vide, erreur, squelette et test id.

Effort : continu (à intégrer à chaque nouvelle phase plutôt qu'en bloc).

## Phase 7 — Observabilité de la console

Objectif : prouver que l'autorisation ne casse rien avant de l'armer.

- Compteurs de décisions par capacité (allow/deny/observation), capacités jamais
  exercées, taux de refus, latence du lookup, taux de succès du cache (TTL 30 s).
- Page `/admin/health` : Postgres, file, workers, version de migration attendue par
  le code **vs** appliquée, mode enforce en cours, dernier cycle de vie juridique.
- Tuiles correspondantes dans le dashboard.

Critères de sortie : deux semaines d'observation avec preuve chiffrée, puis
passage en `authz-enforce` décidé sur données.

Effort : petit à moyen (réutilise le callback `Observer` du garde).

## Phase 8 — Cycle de vie des accès (plus tard)

- Révision périodique : échéances visibles, rappel avant expiration, gel automatique
  d'un rôle expiré, rapport mensuel des accès.
- Quorum N3 pour les actes irréversibles : `DoubleApproval` est déjà modélisé dans
  `internal/authz`, la console doit porter la demande et la seconde validation.

Effort : moyen ; à n'ouvrir qu'après la Phase 4 (sans audit lisible, un quorum est
invérifiable).

## Ordre conseillé

| Ordre | Phase | Effort | Pourquoi maintenant |
| --- | --- | --- | --- |
| 1 | 1 — identité et capacités | petit | Débloque tous les rôles non-superadmin ; prérequis des écrans suivants |
| 2 | 2 — accès et rôles | moyen | Supprime la seule opération qui exige encore du SQL |
| 3 | 4 — audit et refus | moyen | Rend la Phase 3 vérifiable et le passage en enforce décidable |
| 4 | 5 — couverture | moyen | Empêche l'écart de se reformer |
| 5 | 3 — step-up | moyen | Vient après l'observabilité pour ne bloquer personne par surprise |
| 6 | 6 — ergonomie | continu | Se greffe sur chaque phase |
| 7 | 7 — observabilité | petit-moyen | Alimente la décision d'armer le mode enforce |
| 8 | 8 — cycle de vie | moyen | Le raffinement après la preuve |

## Mesures de réussite

- 0 route `/v1/admin/*` orpheline ; 100 % des mutations admin auditées avec leur
  capacité et leur niveau de preuve.
- Au moins trois rôles non-superadmin réellement opérationnels dans la console.
- « Qui a fait quoi » et « qui a été refusé » répondus en moins d'une minute.
- Passage en `authz-enforce` sans blocage d'autorité : 0 refus inattendu sur deux
  semaines d'observation.

## Ce que ce plan ne fait pas

- Il ne change pas le vocabulaire de capacités existant ni la matrice des rôles
  (sauf ajout des deux capacités d'accès, Phase 2).
- Il n'arme pas `authz-enforce` : c'est une décision d'exploitation, prise sur les
  chiffres de la Phase 7.
- Il ne réécrit pas l'app `apps/admin` : les écrans existants gagnent des capacités,
  des états et du test, un par un.
