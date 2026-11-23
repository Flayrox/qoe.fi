# Mise en prod Netcup + feuille de route tests — plan vivant

> **Mémoire du chantier de reprise.** Lire avant de reprendre, journaliser après
> chaque étape (section 8). Chaque chiffre publié ici est mesuré, avec sa commande
> et sa date.
>
> Dernière mise à jour : 2026-11-16 · branche `dev` · commit de départ `f031ab67`.

---

## 1. Instructions utilisateur (prioritaires sur le reste de ce fichier)

1. **Déployer sur Netcup** : pousser la prod sur le VPS `159.195.110.239`
   (`/var/www/qoe.fi`) via `bash scripts/deploy-prod.sh`, une fois la CI verte.
2. **Stripe n'est pas configuré** : aucune clé `STRIPE_*` en prod, et l'utilisateur
   n'a rien configuré côté Stripe. Le déploiement doit rester sûr dans cet état —
   vérifier, ne pas supposer. Ne jamais demander la clé en clair.
3. **Feuille de route des tests** : l'utilisateur ajoutera les tests **plus tard**.
   Le livrable attendu est donc une liste précise (fichiers, contrats à couvrir),
   pas une implémentation — section 5.
4. **`.md` périmés** : suppression autorisée quand un fichier ne sert plus de
   mémoire (voir section 7 pour ce qui a été supprimé et ce qui est conservé).
5. **Commit à chaque étape, sans footer Codebuff** (pas d'attribution, pas de
   `Co-Authored-By`).
6. **Ne jamais contourner un guard CI** (couverture, `ui:audit`, `guard:*`,
   audit de sécurité) : on corrige la cause.
7. **Pas de Docker en local** : les suites Testcontainers ne se vérifient que par
   la CI (ou sur une base distante explicite).

---

## 2. État vérifié au 2026-11-16

| Élément                         | Valeur mesurée                                          | Preuve                               |
| ------------------------------- | ------------------------------------------------------- | ------------------------------------ |
| Branche locale                  | `dev`, arbre **propre**                                 | `git status --short --branch`        |
| `dev` ↔ `origin/dev`            | 0 / 0                                                   | `git rev-list --left-right --count`  |
| `main` ↔ `origin/main`          | 0 / 0 (`origin/main` = `f031ab67`)                      | idem                                 |
| Images Docker                   | **succès**                                              | run `43884256587` (6 min 45)         |
| CI du commit `f031ab67`         | **échec** (2 causes réelles, section 3)                 | run `43884256529`                    |
| VPS Netcup                      | joignable, 24 conteneurs `Up`                           | `ssh root@159.195.110.239 docker ps` |
| Stack prod (avant)              | déployée ~37 h plus tôt → **antérieure** à `f031ab67`   | `docker ps`                          |
| Stack prod (après, 16/11 16:35) | `e859e4e3` déployé, **13/13 smoke tests**, goose **93** | `bash scripts/deploy-prod.sh`        |

Conséquence : les images du dernier commit existent sur GHCR, mais la prod tournait
encore l'image précédente. Le déploiement n'était donc pas un simple redémarrage.

---

## 3. Étape 1 — CI rouge : corriger la cause (fait)

Deux échecs distincts sur `f031ab67`, tous deux côté tests :

1. **`@qoe/config` — `getSidebarSurfaces`** (`src/__tests__/surfaces.test.ts`).
   Les surfaces `studio.books`, `studio.community` et `studio.monetization` sont
   entrées dans la sidebar (commits `feat(books)`, `feat(community)`,
   `feat(billing)`) sans mettre à jour le verrou d'ordre : 13 entrées attendues
   par le code, 10 déclarées par le test.
   → **Correctif** : le test verrouille désormais l'ordre réel (13 entrées), et la
   liste du rôle _viewer_ passe à 8 (livres + communauté visibles, monétisation
   masquée faute de `media:manage_billing`). Aucune assertion affaiblie : c'est un
   verrou d'inventaire qui redevient exact.
2. **Go `TestExtendPlanGrant_ProlongeSansDoublon`** (`internal/subscriptions`).
   `HasPlus` joint `"User"` avec `u.id = $1::uuid` : un `subjectId` non-UUID (le
   test utilisait `test-extend-150405.000000`) fait **échouer la requête**, et
   `HasPlus` avale l'erreur en `false`. Le test échouait donc sur son propre
   fixture, pas sur la logique de prolongation (la ligne était bien mise à jour).
   → **Correctif** : le sujet du test est un vrai `uuid.NewString()`, comme tout
   identifiant utilisateur en production (commentaire inline ajouté).

Vérification : `pnpm --filter @qoe/config test` (local) et le job Go en CI (la
suite exige Testcontainers, donc Docker → CI uniquement).

### 3.b Échecs préexistants révélés ensuite (masqués par le premier rouge)

Trois jobs étaient rouges avant cette reprise, sans rapport avec le commit :

1. **`@qoe/studio` — `article-list-row.test.tsx`** : le test cherchait le titre
   « Publisher automatique programmée » alors que la pastille affiche (en bon
   français) « Publication automatique programmée ». Correctif : le test suit le
   libellé réel, les assertions restent identiques.
2. **Go — `TestStripe_PaymentSucceeded_CreditsOwnerWallet`** : le test attendait
   5 % parce que le compte était _creator_. Le barème a changé (commit billing) :
   la commission suit désormais le **droit Pro** (`SubscriptionGrant`), pas le
   rôle. Correctif : le test vérifie les deux cas — 10 % sans octroi (1800), puis
   octroi Pro + second paiement → 5 % (1800 + 1900 = 3700).
3. **Go — `TestDevtoolsHandler_Reindex_NoMeili`** : le test ne passait que si un
   autre paquet avait laissé des articles en base partagée ; base vide, la boucle
   d'upsert n'était jamais atteinte et le reindex répondait 200 sans Meili.
   Correctif côté **code** (pas côté test) : `ReindexAll` sonde désormais
   `GET /health` et échoue explicitement si Meili est injoignable — un reindex ne
   doit pas « réussir » sur un index absent.
4. **`E2E Apps (studio)`** : `e2e/studio-editor-fixtures.spec.ts` vise
   `/dev/editor-check`, que `page.tsx` renvoyait en `notFound()` quand
   `NODE_ENV === 'production'`… or le job sert un **build** (`next start`).
   Correctif : la route s'ouvre hors dev uniquement si `QOE_E2E_DEV_ROUTES=1`,
   variable posée **au build** et **au rendu** (middleware + serveur Playwright),
   jamais dans l'image de prod.
5. **`arch:audit` rouge et absent de la CI** — le guard est pourtant cité par
   `AGENTS.md`. Il refusait `00090`–`00093` : `ALTER TABLE` sans `lock_timeout`
   et `CREATE INDEX` sans `CONCURRENTLY` sur des tables existantes. Correctif :
   `SET lock_timeout = '3s'` + `CREATE INDEX CONCURRENTLY` (+ `-- +goose NO
TRANSACTION`, style de `00089`), et **branchement du guard** dans le job
   `Static Checks & Guards` pour qu'il ne puisse plus pourrir.
   Vérifié sur base neuve : 94 migrations rejouées, goose **93**, les deux index
   créés, `go test ./internal/subscriptions/` vert. En prod ces migrations sont
   déjà appliquées (goose 93) : le changement de DDL y est inerte.
6. **Catalogues Lingui incomplets** : `Libellé de la source {0}` (et ~900 autres
   messages récents) n'avaient jamais été extraits. En build de production la
   macro rend l'identifiant brut, donc les `aria-label` des champs de
   `SourcesDialog` devenaient « Libellé de la source {0} » — un vrai défaut
   d'accessibilité, pas seulement un test capricieux. Correctif :
   `pnpm intl:extract` + `pnpm intl:compile` (`messages/*.po|js`).

---

## 4. Étape 2 — Déploiement production Netcup

Pré-requis : CI **verte** sur `main` (pas seulement les images).

```bash
gh run list --workflow=ci.yml --limit 3          # doit être "success" sur main
gh run list --workflow=build-images.yml --limit 3
bash scripts/deploy-prod.sh                      # transfert + pull + backup + goose + up + smoke
```

Le script, dans l'ordre : transfert `git ls-files` → purge des packages morts →
clé OTA → nettoyage `?schema=public` → `docker compose pull` (GHCR) → **backup
Postgres + `.env.docker`** dans `/root/migration/pre-<stamp>/` → `up -d migrate`
(goose) → `up -d` → reload Caddy → firewall tailnet → 13 smoke tests.

Migrations en attente depuis la prod actuelle : `00091_user_stripe_customer.sql`,
`00092_article_cover_alt.sql`, `00093_subscription_grant_dedupe.sql`. La 00093
crée un index unique partiel sur les octrois Stripe : sans elle, un rejeu de
webhook pourrait empiler des droits Plus.

À surveiller après coup :

- `docker logs qoefi-migrate` → `goose: successfully migrated database to version: 93` ;
- `https://api.qoe.fi/health` et `/readyz` ;
- 13/13 smoke tests du script (`CORS mono-valeur`, `admin tailnet`, `auth kong`) ;
- `docker logs qoefi-worker` (boucle e-mail).

Rollback si besoin : restaurer `/root/migration/pre-<stamp>/postgres.dump.gz` et
remettre les images précédentes (`qoefi-<service>:<sha>` est publié à chaque build).

---

## 5. Feuille de route tests

**Mesure du 2026-11-16** (poste, `pnpm test:coverage` puis
`pnpm test:coverage:front`) — plus aucun fichier non instrumentable :

| Périmètre             | Lignes  | Fichiers / tests | Ratchet lignes |
| --------------------- | ------- | ---------------- | -------------- |
| `packages/ui`         | 56,50 % | 84 / 554         | 55 %           |
| `apps/tenants`        | 24,00 % | 11 / 39          | 23 %           |
| `apps/studio`         | 32,85 % | 63 / 571         | 31 %           |
| `apps/admin`          | 10,88 % | 14 / 88          | 9 %            |
| **Agrégé TypeScript** | 27,39 % | 87 / 761         | —              |

Les ratchets sont des planchers, jamais à la baisse : une baisse doit
s'accompagner de nouveaux tests, pas d'un seuil abaissé.

**Ratchets remontés le 16/11** au niveau mesuré moins un point, sur les quatre
métriques (lignes, statements, fonctions, branches) :

| Zone                          | Avant             | Après             |
| ----------------------------- | ----------------- | ----------------- |
| `packages/sdk/**`             | 23 / 22           | 48 / 46 / 43 / 38 |
| `packages/auth/**`            | 15 / 14           | 41 / 41 / 41 / 30 |
| `packages/utils/**`           | 44 / 41           | 78 / 76 / 78 / 68 |
| `packages/flags/**`           | 65 / 65           | 73 / 74 / 54 / 85 |
| `packages/moderation/**`      | 80 / 80           | 88 / 85 / 91 / 80 |
| `apps/core/src/app/**`        | _aucun_           | 24 / 23 / 17 / 19 |
| `apps/core/src/components/**` | _aucun_           | 12 / 11 / 7 / 7   |
| `apps/mobile/**`              | _aucun_           | 11 / 12 / 7 / 10  |
| `apps/studio`                 | 9 % partout       | 31 / 31 / 30 / 30 |
| `packages/ui`                 | 55 / 53 / 48 / 48 | 55 / 53 / 48 / 49 |
| `apps/admin`                  | 4 / 4 / 3 / 3     | 9 / 9 / 6 / 8     |
| `apps/tenants`                | 23 / 22 / 17 / 24 | 23 / 22 / 18 / 24 |

Une marge d'environ un point est conservée sous la mesure : les seuils
verrouillent les gains sans rendre la CI dépendante de variations d'arrondi.

**Seuils relevés une seconde fois le 16/11** après les tests de cette passe
(mesures : sdk 49,03 · core/app 17,76 · studio 13,95/13,73/13,51/13,92 ·
admin 10,88/10,66/7,94/9,48). Chaque gate est au niveau mesuré moins un point.

**Seuils relevés une troisième fois le 16/11** après la passe éditeur
(mesures : studio 21,21/21,12/18,74/17,81 ; core/app 25,04/24,51/18,17/20,61).
La progression studio vient du moteur de scène (`StageEngineContext`, 1 019
lignes) et des tests d'interface de l'éditeur ; celle de core/app du
composeur de pensées (2 499 lignes).

**Seuils relevés une quatrième fois le 16/11** après la passe « zone éditeur
laissée hors périmètre » (mesures : studio 26,01/25,85/24,04/23,45 ; core/app
inchangé). La progression vient du tiroir de paramètres, de la barre d'outils,
du menu de sélection, de l'aperçu lecteur, de la comparaison de versions, de la
récupération d'article et de la session de co-édition (transport simulé).

**Seuils relevés une cinquième fois le 16/11** après la passe « en-tête et
dialogues d'éditeur » (mesures : studio 26,61/26,43/24,82/25,29 ; core/app
inchangé) : en-tête d'éditeur, couverture, suggestions IA, annotations collées.

**Seuils relevés une sixième fois le 16/11** après la passe « actions groupées
sur les articles » (mesures : studio 27,91/27,82/26,15/26,66 ; core/app
inchangé) : dialogues de paramètres groupés et de transfert vers une publication.

**Seuils relevés une septième fois le 16/11** après la passe « studio Média »
(mesures : studio 32,11/31,85/30,79/30,51 ; core/app inchangé) : logique pure du
studio Média extraite et testée, plus un parcours complet du composant
(membres, permissions, invitations, journal d'audit, création, réglages).

### Fait le 16/11 (passe éditeur)

- **`apps/studio` — `StageEngineContext`** (27 tests) : harnais `Probe` +
  `useStageEngine()` qui exerce les vraies opérations — historique
  annuler/rétablir, blocs (ajout, duplication, suppression, déplacement),
  nœuds et slots de page, scopes accueil/article/rubrique, archétypes et
  variantes, enregistrement/publication/restauration de version, zoom et
  réglages d'interface indépendants du layout.
- **`apps/studio` — `features/editor`** : `schedule-draft` (10 tests : fuseau
  local, bornes de calendrier, préservation date/heure, raccourcis),
  `useArticleSettings` (15 tests : chargement, brouillon sale, enregistrement,
  programmation passée/absente, annulation, dépublication, téléchargement,
  transfert, rollback du crosspost, réponse obsolète ignorée),
  `ArticleHistoryModal` (10 tests : versions, restauration, échec partiel,
  journal) et `EditorStatusBar` (10 tests contre un vrai éditeur Tiptap :
  mots/caractères/temps de lecture, images sans alt, annotation, raccourcis).
- **`apps/core` — `ThoughtComposer`** (10 tests) : garde de session, brouillon
  local (écriture/restauration), limite de 500 caractères avec URL externe
  pondérée à 20, contrat d'envoi (tags, visibilité, fil), refus serveur qui
  conserve le texte, nœud de fil vide qui ne rend pas le bouton actif.

### Fait le 16/11

- **`apps/admin` — `/admin/imports/[id]`** : test de non-régression des `params`
  asynchrones (id résolu, garde avant lecture, 404 si le lot est inconnu).
- **`apps/admin` — RBAC** : `lib/__tests__/admin-screen-guards.test.ts`
  vérifiait **déjà** que les 39 pages appellent `requireCapability` avant tout
  chargement de données. La ligne « aucune preuve » de la version précédente de
  ce document était fausse ; rien à ajouter.
- **`apps/studio` — `monetization-client.tsx`** : 7 tests (portail indisponible,
  `NO_CUSTOMER`, prix nul, nom vide, euros→centimes, erreur backend, formule non
  payable).
- **`apps/studio` — `api/export/route.ts`** : 5 tests (401 sans session, 503 sans
  `QOE_API_URL`, relais du statut amont, `Content-Disposition` + `no-store`, nom
  de fichier de repli).
- **`apps/core` — `MessagesApp.tsx` / `LibraryClient.tsx`** : sortis de
  l'exclusion de couverture. La cause n'était pas le parseur : les deux modules
  importaient `@qoe/sdk/actions/{messages,highlights}`, deux sous-chemins absents
  des `exports` du paquet SDK, donc jamais chargeables dans un test (et rolldown
  ne remappe pas un fichier non couvert). Sous-chemins déclarés + 6 tests de
  rendu, exclusion supprimée.

### Fait le 16/11 (seconde passe)

- **Lecteur audio (`packages/ui/reader`)** : 9 tests sur le lecteur flottant
  (pause/reprise, bordures de paragraphe, ±15 s, vitesse, scrubber, fermeture,
  chrono). Trois défauts corrigés au passage : « pause » annulait l'utterance
  (reprendre relisait le paragraphe depuis le début), le chrono cumulait les
  articles, et changer la vitesse relançait le paragraphe à l'ancienne vitesse
  (closure périmée → `rateRef`). Garde `MediaMetadata` pour les navigateurs qui
  exposent `mediaSession` sans l'API de métadonnées.
- **`apps/admin` — `DataGrid`** : **la grille partagée plantait au rendu**.
  react-aria refuse une table sans colonne `isRowHeader` ; 13 écrans
  (signalements, users, travail, support, abuse, approvals, imports, rétention,
  sécurité, réglages, conformité, notifications, tableau de bord) affichaient
  une erreur. La première colonne visible porte désormais l'en-tête de ligne.
  6 tests verrouillent tri, colonnes masquées, état vide, clavier et menu.
- **`apps/admin` — file de modération** : 4 tests (résolution + statut audité,
  refus explicable sans mise à jour locale, suspension exigeant un motif).
- **`apps/admin` — `admin-aux-actions`** : 12 tests de normalisation/validation
  (hashtag, config en majuscules, allowlist, endpoints coupés, JSON frontend).
  Corrigés : un titre de promo fait d'espaces passait la validation ; un refus
  du garde (`403`) sortait en exception au lieu d'un `{ success: false, code }`
  (aucun retour à l'écran) ; un JSON invalide levait hors du `try`.
- **`apps/studio` — actions média** : 16 tests (session requise, conservation du
  `code` de refus pour le step-up, requête d'audit, défauts, échappement).
- **`apps/studio` — analytics** : 8 tests (sans site Umami, attribution des
  vues, parts de trafic). Corrigé : les séries journalières avançaient en heure
  locale, donc le jour courant disparaissait dès qu'une période traversait un
  changement d'heure (désormais jours UTC, bornes incluses).
- **`apps/studio` — réglages** : 6 tests MFA (facteur non vérifié, retrait
  confirmé/annulé, échec explicite) et 5 tests d'aperçu SEO (replis, domaine
  personnalisé, indexation coupée, carte de partage).
- **`apps/studio` — comparatif d'offres** : 4 tests, dont le verrou « aucun
  faux bouton d'achat » tant que Stripe n'est pas configuré.
- **`apps/core`** : 10 tests sitemap (bornes de shards, URLs encodées, pages
  légales vers la vitrine, échappement XML) et 15 tests d'actions de compte
  (mot de passe, email, username, suppression, export). Corrigé : après mise à
  jour du profil, le cache invalidait `/@nom` — une route inexistante — au lieu
  de `/[username]`.
- **`packages/utils`** : 10 tests `slugify`/`shortId`/`uuid` (accents, tirets,
  repli sans `crypto.randomUUID`).

### Fait le 16/11 (zone éditeur laissée hors périmètre)

- **`EditorSettingsDrawer`** (19 tests) : état éditorial (publié/programmé/en
  revue/brouillon), chargement interne des espaces et de l'éditeur courant,
  transfert filtré par rôle et refusé sur l'espace courant, payload de
  transfert, rollback du crosspost, normalisation du slug, copie d'URL avec
  sous-domaine, aperçu SEO et champs avancés, bascules d'accès, sections
  destructives conditionnelles, programmation réservée à `canPublish`.
- **`EditorToolbar`** (16 tests) : groupes ARIA, annuler/rétablir selon
  l'historique, marques et titres réellement appliqués, désactivation hors
  paragraphe et dans un bloc de code, imbrication de liste hors liste, limite
  Paywall unique, actions médias, avancement d'envoi et annulation, légende
  d'image seulement sur une image sélectionnée, navigation clavier.
- **`SelectionToolbar`** (9 tests) : ouverture seulement sur une sélection de
  texte dans un paragraphe/titre (pas sur un nœud, pas dans un bloc de code),
  état des marques, alinéa/lettrine hors titre, délégation lien et annotation.
- **`PublishModal`** (3 tests ajoutés) : refus de publication affiché sans
  fermer la boîte, « Continuer d'éditer » qui n'envoie rien.
- **`RecoverArticleModal`** (10 tests) : chargement, erreur, présélection de la
  version de l'auteur, absence de version personnelle, choix d'une version
  précise, aperçu et diff, import réussi avec redirection, refus serveur,
  blocage pendant l'envoi.
- **`ReaderPreviewDialog`** (10 tests) : titre de repli, temps de lecture,
  largeur par appareil, alt de couverture (dont décorative), coupe Premium
  réelle via la limite posée dans l'éditeur, révélation auteur, article non
  Premium intact.
- **`ArticleDiffModal`** (13 tests) : statistiques, absence de différence,
  changement de titre, vues côte à côte/unifiée, garde `canReview` et statut
  `SUBMITTED`, approbation, retouches avec commentaire nettoyé, abandon
  confirmé, édition, échec d'approbation.
- **`useCollaborationSession`** (14 tests) : transport Hocuspocus et auth
  Supabase remplacés par des doubles — aucun réseau, aucun timer réel. Statuts,
  pairs, changements non synchronisés, refus d'authentification, reconnexion,
  jeton rafraîchi ou de repli, identité et couleur stables, destruction au
  démontage.

### Fait le 16/11 (en-tête et dialogues d'éditeur)

- **`EditorHeader`** (23 tests) : titre nouvel écrit/édition, retour
  conditionnel, statut (en ligne / en revue / programmé daté / brouillon),
  états de sauvegarde (en cours, erreur + réessai, enregistré, modifications,
  horodatage), barre d'actions, lien public conditionnel, bouton primaire selon
  rôle (`Publier`, `Mettre à jour`, `Version en ligne`, `Soumettre`, masqué en
  relecture), bouton « Comparer » conditionnel, états de co-édition, compteur de
  changements non synchronisés, bannière d'indisponibilité et reconnexion.
- **`CoverUploader`** (6 tests ajoutés, 12 au total) : recadrage ouvert sur le
  blob local puis envoi du fichier recadré, annulation qui libère le blob,
  sélection dans la médiathèque, alt manquant puis résolu, actions bloquées
  pendant un envoi, dépôt d'un fichier sur une couverture existante.
- **`AiSuggestionDialog`** (9 tests) : fermé, attente, erreur avec et sans
  réessai, aucune suggestion, liste numérotée, application + fermeture, fermeture
  sans application.
- **`PastedAnnotationsDialog`** (12 tests) : fermé/sans annotation, progression,
  contexte et passage, note préremplie puis éditée, repli sur la note d'origine,
  nettoyage des espaces, validation Cmd/Ctrl+Entrée, refus, actions de masse
  selon le reste, note commune, réinitialisation au changement d'annotation,
  fermeture valant refus global.

### Fait le 16/11 (actions groupées sur les articles)

- **`ArticleBulkSettingsDialog`** (19 tests) : formulaire vierge par défaut,
  garde « choisissez au moins un paramètre » sans appel serveur, catégories
  hiérarchisées (parent, `↳` enfant, repli sur le slug), mappage tri-état →
  booléens sur les cinq réglages, `Non catégorisé` → `categoryId: null`,
  publication/dépublication jamais appliquées sans confirmation (libellé,
  description, caractère destructif), confirmation qui exécute le payload,
  avertissements contextuels, succès au pluriel et au singulier, échecs
  partiels comptés, refus serveur et panne réseau qui laissent le dialogue
  ouvert et le bouton réactivable, blocage total pendant l'envoi, sélection
  vide ignorée, brouillon réinitialisé à la réouverture.
- **`ArticleBulkTransferDialog`** (16 tests) : chargement, erreur serveur et
  rejet réseau, destinations filtrées par rôle d'écriture (le profil personnel
  reste toujours disponible), bouton inactif sans destination, libellé portant
  la destination choisie, transfert article par article avec le bon payload,
  progression `0/N` → `1/N`, succès au singulier, échecs partiels (réponse
  négative et exception) sans masquer les réussites, aucun succès annoncé si
  tout échoue, fermeture et clics bloqués pendant le transfert, destination
  oubliée et liste rechargée à la réouverture.
- **Défaut corrigé** : quand le rafraîchissement de liste échouait après une
  action réussie, le dialogue de paramètres affichait « Échec de la modification
  groupée » et celui de transfert laissait une promesse rejetée non gérée. Les
  deux distinguent désormais l'action (réussie) du rafraîchissement (échoué) :
  message dédié « … la liste n'a pas pu être rafraîchie », succès conservé.

### Fait le 16/11 (studio Média)

- **`media-studio-logic`** (27 tests) : logique pure extraite de
  `MediaStudioClient` pour être testable sans DOM — traduction du journal
  d'audit (création du Média, réglages avec champs traduits ou nom technique,
  actions éditoriales avec titre, programmation datée ou illisible, approbation
  et refus avec commentaire, transferts entrants/sortants, mouvements d'équipe,
  liens d'invitation, clés API, action inconnue), statut d'un lien (révoqué >
  expiré > épuisé > actif), permissions effectives (défauts du rôle,
  overrides explicites, rôle inconnu) et bascule d'une permission.
- **`MediaStudioClient`** (33 tests) : chargement et échec de chargement avec
  motif serveur, formulaire de création quand aucun Média n'existe (validation
  nom/permalien, création qui pose le cookie d'espace et redirige, échec qui ne
  redirige pas), identité de la publication (domaine, rôle, compteurs, bio),
  bascule vers un autre Média et bouton « Ouvrir cet espace » (cookie + push),
  membres triés par rang de rôle et propriétaire sans action, changement de
  rôle avec rechargement, retrait avec confirmation (annulée puis acceptée),
  bascule de permission envoyant la liste complète, rédacteur qui ne gère pas
  l'équipe, onglets Clés API/Activité masqués sans droits, liens d'invitation
  (statuts actif/expiré/épuisé/révoqué, génération avec rôle + durée +
  utilisations, copie confirmée, presse-papiers indisponible, révocation),
  recherche de créateur debouncée puis invitation, journal d'audit (entrées
  décrites, acteur supprimé, pagination, filtre par catégorie, états vides
  différenciés, erreur de chargement, recherche debouncée) et réglages du Média
  (enregistrement du payload).
- **Défaut corrigé** : après un clic sur « Copier », le bouton restait sur
  « Copier » — la collection du tableau react-aria est mémoïsée sur l'identité
  d'`items`, donc la ligne ne voyait jamais le nouvel état. L'état de copie
  fait désormais partie des items ; la confirmation « Copié » s'affiche.

### Fait le 17/11 (passe 4 — autorisation prouvée + injections fermées)

Le suivi fichier par fichier vit désormais dans
[`docs/AUDIT-CHECKLIST.md`](./AUDIT-CHECKLIST.md) (lot `@qoe/utils` : premier
lot audité et corrigé).

- **T4 — autorisation Go prouvée** : `media_matrix_test.go` (rôle × permission,
  statuts, overrides, édition par auteur), `action_matrix_test.go` (toutes les
  actions du registre × tous les rôles), `authz_matrix_test.go` (11 motifs de
  refus → 403, handler jamais atteint), `roles_matrix_test.go`. **Rouge
  démontré** : `CanMedia → true` casse 128 sous-tests, `if decision.Allowed`
  rendu vrai casse 11/11 refus.
- **Bug d'autorisation corrigé** : `EffectivePermissions` ré-ajoutait une
  permission retirée par override `-perm` alors que `CanMedia` gardait le
  premier override — une source unique (`EffectivePermissions`) désormais.
- **Injections fermées** : module partagé `@qoe/ui/security`
  (`sanitizeArticleHtml`, `sanitizeInlineSvg`) consommé par l'admin (QR TOTP),
  `EbookReader` (chapitre), `ArticleAnnotatorView`, `ArticleContentBlock`,
  `AboutPageContent` et l'aperçu du CMS juridique ; 25 tests d'attaque et de
  non-régression.
- **Garde CI** : `pnpm guard:dangerous-html` (aucun `dangerouslySetInnerHTML`
  sans assainisseur ou exemption motivée).
- **Dépendances** : override `dompurify ^3.4.17` (avis critique → 3.4.18) et
  `shell-quote ^1.11.0` ; cliquet `pnpm audit:guard` branché en CI.
- **Server actions** : `isCrossOriginServerAction` en tête des middlewares
  `core`/`admin`/`studio` (403 avant lecture de session), 10 tests.
- **Journal** : plus d'e-mail d'abonné dans les logs Go.

### Fait le 16/11 (durcissement sécurité du studio)

Le suivi est repris par [`docs/AUDIT-CHECKLIST.md`](./AUDIT-CHECKLIST.md) : un
lot par package, une ligne par fichier ou fonction, avec verdict et preuve.

- **Aperçu lecteur** : le HTML de l'article est assaini (liste blanche
  DOMPurify, `data-type` du paywall conservé) avant d'être injecté dans la
  session authentifiée du studio ; scripts, iframes, formulaires, gestionnaires
  inline et URL `javascript:` sont retirés.
- **QR TOTP** : `sanitizeInlineSvg` refuse tout fragment contenant un script,
  un gestionnaire inline, `foreignObject`, une ressource distante ou une entité
  XML ; le secret et le lien `otpauth://` restent disponibles en repli.
- **Cookie d'espace actif** : `workspaceCookie()` centralise Path/Max-Age/
  SameSite et pose `Secure` en production ; le middleware s'en sert pour les
  liens profonds `?ws=`.
- **En-têtes de sécurité** : `studioSecurityHeaders()` (nosniff, X-Frame-Options,
  COOP `same-origin-allow-popups`, XPCDP, CSP toujours en `Report-Only`) est
  consommé par `next.config.ts` et couvert par des tests.
- **Locale** : `safeLocale()` n'autorise que les langues supportées avant de
  recopier `x-locale` dans un en-tête.

### Reste à faire

- **`apps/admin`** : octrois `SubscriptionGrant` depuis la console, écrans de
  traduction/frontend (CMS volumineux, surtout du rendu).
- **`apps/studio`** : compilation EPUB ; le monolithe `Editor.tsx` (2 807
  lignes, orchestration Tiptap/collaboration) reste couvert seulement par ses
  modules extraits (`lib/`, hooks, extensions) et par les composants qu'il
  assemble. Restent `EditorHeader`, `CoverUploader` (extensions déjà testées),
  `CollaborationInviteLinks` (déjà testé), `AiSuggestionDialog`,
  `PastedAnnotationsDialog`, `ArticleAttributionEditor` (déjà testé) et le banc
  `/dev/editor-check`.
- **`apps/core`** : `FeedDashboard`, lecteur EPUB, bascule lecture hors ligne,
  dialogues de partage/citation du composeur.
- **Go `internal/modules/billing`** : signature HMAC **déjà couverte** (absente,
  falsifiée, timestamp décalé, sans secret, `v1` manquant). Restent le rejeu
  (`checkout.session.completed` ×2 → **un seul** grant, garanti par l'index 00093) et `account.updated` (Connect) : les deux exigent la base, donc
  `scripts/test-api.sh`.
- **`internal/workers`** : `bulk_import.go`, `collab_cleanup.go`, `embedding.go`,
  `import_reconfirm.go`, `import_send.go`, `staff_campaign.go` (base/Redis
  requis).

### Lancer les suites Go en local (Docker requis, jamais Hetzner)

Deux modes, tous deux **strictement locaux** — les tests ne lisent jamais
`DATABASE_URL` (base de dev Hetzner), seulement `TEST_DATABASE_URL` :

| Mode                      | Commande                           | Ce qui tourne                                                          |
| ------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| Testcontainers (défaut)   | `cd apps/api && go test ./...`     | un conteneur Postgres jetable **par paquet**, détruit ensuite          |
| Base unique (plus rapide) | `bash scripts/test-api.sh [pkgs…]` | `docker-compose.test.yml` → `127.0.0.1:55432`, base `qoe_test`, `-p 1` |

Garde-fou : `testutil.validateTestDatabaseURL` refuse toute URL dont la base ne
finit pas par `_test` (« la base dev est protegee »). Indispensable : les
fixtures font des `TRUNCATE` massifs. L'app Go ne tourne pas dans Docker — seul
Postgres est conteneurisé.

Prérequis poste : daemon Docker actif (OrbStack installé mais arrêté au 16/11 :
`orb start`). Sans lui, les suites DB **skippent** silencieusement et la
couverture Go locale est fausse (ex. `newsletters` 13,6 % au lieu de 76 %+).

**Première mesure locale réelle (16/11, OrbStack + `qoefi-test-db`, `-p 1`) :**

```bash
bash scripts/test-api.sh -cover ./internal/subscriptions/... ./internal/workers/... \
  ./internal/modules/newsletters/... ./internal/modules/devtools/...
# ok subscriptions 84,7 % · workers 62,1 % · newsletters 82,8 % · devtools 84,4 %  → exit 0
```

Les seuils CI (workers 60, newsletters 80) sont donc tenus **aussi** en local dès
que Docker tourne. Durée : ~1 min 45 pour les quatre paquets (dont `go vet` +
`go build` du module).

### ⚪ Priorité 5 — Workers asynchrones (`internal/workers`)

Sans test dédié aujourd'hui : `bulk_import.go`, `collab_cleanup.go`,
`embedding.go`, `import_reconfirm.go`, `import_send.go`, `search.go`,
`staff_campaign.go`. Tous exigent une base/Redis → CI avec Docker.

---

## 6. Stripe non configuré : ce qui se passe vraiment

Vérifié dans le code, pas supposé :

- `billing.StripeClient.Configured()` renvoie faux sans `STRIPE_SECRET_KEY` ;
  `checkout`, `connect` et `portal` répondent alors **503** (« paiement non
  configuré »), l'API démarre normalement.
- **Aucun écran n'appelle `startSubscriptionCheckoutAction`** aujourd'hui
  (grep sur `apps/**`) : il n'y a pas de bouton d'achat mort en prod.
- Seule entrée vivante : « Portail de facturation » dans
  `studio/(creator)/monetization`, qui affiche déjà une bannière
  « Portail indisponible pour le moment. » sur erreur — pas de 500, pas d'écran blanc.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` est vide au build CI (valeur publique).

Conclusion : déployer sans Stripe est **sans risque fonctionnel**. La vente de
formules reste inactive tant qu'aucune clé n'existe ; c'est un état assumé, à
documenter côté produit (pas de faux CTA).

---

## 7. Nettoyage de la documentation

Supprimé (artefacts de runs d'agents, aucune valeur de mémoire) :
`.agents/ORIGINAL_REQUEST.md`, `.agents/{auditor_*,challenger_*,explorer_*,orchestrator,reviewer_*,worker_*,sentinel,e2e_test_writer}/`.

Conservé volontairement : `.agents/rules/engineering-excellence.md` (règles de
code encore valables), `.agents/skills/**` (skills de l'outillage), les plans
vivants cités par `AGENTS.md` (`ADMIN-PLAN`, `EDITOR-PLAN`, `ANALYTICS-PLAN`),
`.reference/**` (dépôts de référence externes, non de la documentation projet).

Supprimés le 16/11 (documents temporaires, chiffres périmés) :
`docs/TEST-COVERAGE.md` (mesure du 13/11, méthode et chiffres désormais dans le
§5 ci-dessus) et `docs/UI-PASS-2026-11-16.md` (compte rendu d'une passe
terminée).

---

## 8. Journal (append-only)

| Date       | Étape                                               | Résultat mesuré                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Commit        |
| ---------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 2026-11-16 | Reprise, état des lieux                             | `dev` = `origin/dev` = `origin/main` = `f031ab67`, arbre propre ; images GHCR OK (run `43884256587`) ; CI rouge (run `43884256529`) ; VPS joignable, stack vieille de 37 h                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —             |
| 2026-11-16 | Étape 1 — CI rouge corrigée                         | `@qoe/config` : ordre sidebar 13 entrées (viewer 8) ; Go : sujet UUID réaliste dans `TestExtendPlanGrant_ProlongeSansDoublon`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `e4a5ecc2`    |
| 2026-11-16 | Étape 1bis — échecs préexistants                    | studio : libellé « Publication automatique programmée » ; Go : barème 10 %/5 % selon le droit Pro ; `ReindexAll` sonde Meili ; banc `/dev/editor-check` ouvert au job E2E via `QOE_E2E_DEV_ROUTES=1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `1c784bf2`    |
| 2026-11-16 | Étape 1ter — gate + banc                            | gate TS : `MessagesApp`/`LibraryClient` exclus de la mesure (PARSE_ERROR rolldown) ; gate Go `newsletters` : `CreateDigestDraft` couvert sans base (76,3 % → seuil 80 retrouvé) ; middleware studio : `/dev` ouvert au drapeau E2E                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `52521ecb`    |
| 2026-11-16 | Étape 1quater — i18n                                | `pnpm intl:extract` + `intl:compile` : ~900 messages jamais extraits (dont les `aria-label` du dialogue Sources). Aucun seuil abaissé, aucune assertion supprimée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `be744d2e`    |
| 2026-11-16 | Tests manquants (feuille de route §5)               | admin `/admin/imports/[id]` (3) ; studio `monetization-client` (7) + `api/export` (5) ; core `MessagesApp` (3) + `LibraryClient` (3) ; sous-chemins `@qoe/sdk/actions/{messages,highlights}` déclarés → exclusions de couverture supprimées ; mesure : ui 56,03 % · tenants 24,00 % · studio 11,18 % · admin 4,56 % · agrégé 24,42 %                                                                                                                                                                                                                                                                                                                                                                                                                                                                | _(ce commit)_ |
| 2026-11-16 | Seuils de couverture remontés partout               | sdk 23→47 · auth 15→41 · utils 44→78 · flags 65→73 · moderation 80→88 · studio 9→10 · admin branches 3→4 · tenants fonctions 17→18 · ui branches 48→49 ; nouveaux planchers core/app 13 % · core/components 12 % · mobile 11 % ; `pnpm test:coverage` et `test:coverage:front` verts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | _(ce commit)_ |
| 2026-11-16 | Docs temporaires supprimées                         | `TEST-COVERAGE.md`, `UI-PASS-2026-11-16.md` (chiffres et renvois rapatriés au §5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | _(ce commit)_ |
| 2026-11-16 | Guard `arch:audit` réparé + branché                 | 00090–00093 alignées (lock_timeout, CONCURRENTLY, NO TRANSACTION) ; step ajouté à `Static Checks & Guards` ; replay complet sur base neuve (goose 93, index présents, tests verts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | _(ce commit)_ |
| 2026-11-16 | Mesure Go locale                                    | OrbStack + `qoefi-test-db` (127.0.0.1:55432) : subscriptions **84,7 %**, workers **62,1 %**, newsletters **82,8 %**, devtools **84,4 %**, exit 0. Aucune connexion à Hetzner (garde `_test`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | —             |
| 2026-11-16 | Tests + bugs (2ᵉ passe)                             | 91 nouveaux tests : lecteur audio (9), grille admin (6), modération (4), actions auxiliaires (12), actions média (16), analytics (8), MFA (6), SEO (5), offres (4), sitemap (10), compte (15), slugify (10). Corrigés : `DataGrid` sans `isRowHeader` (13 écrans plantaient), pause audio qui relançait le paragraphe, chrono cumulé, vitesse périmée, `MediaMetadata` absent, séries analytics décalées (DST), `/@nom` invalidé, promo au titre vide, refus de garde en exception. Seuils relevés : sdk 48, core/app 16/16/13/13, studio 12, admin 9/9/6/8. `test:coverage` et `test:coverage:front` verts                                                                                                                                                                                         | _(ce commit)_ |
| 2026-11-16 | Étape 2 — CI verte + déploiement prod               | Run `43895715146` : **tous les jobs verts** (8/8) sur `e859e4e3` ; images GHCR run `43895715138` OK. `deploy-prod.sh` : **13/13 smoke tests**, goose **93** (00091–00093 appliquées), backup dans `/root/migration/pre-20261116T163321Z/`, conteneurs recréés et _healthy_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `e859e4e3`    |
| 2026-11-16 | Tests + bugs (passe éditeur)                        | 82 nouveaux tests : `StageEngineContext` (27), `ThoughtComposer` (10), `useArticleSettings` (15), `ArticleHistoryModal` (10), `EditorStatusBar` (10), `schedule-draft` (10). Corrigés : ids de blocs dupliqués dans la même milliseconde (sélection/suppression visaient le mauvais bloc), mutations sans cible qui salissaient le brouillon et empilaient l'historique, échec d'enregistrement/publication silencieux (aucun message), « Tout publier » actif sur un fil vide (clic sans effet), onglet Versions blanc quand seul l'API des versions échoue, anneau de caractères calculé sur la longueur brute au lieu de la longueur pondérée. Seuils relevés : studio 12 → 20/20/17/16, core/app 16/16/13/13 → 24/23/17/19. `test:coverage`, `test:coverage:front`, `typecheck` et `lint` verts | _(ce commit)_ |
| 2026-11-16 | Flake CI du rendu de fil                            | `thought-thread-nested-hidden-parent` dépassait 5 s de timeout sur le runner partagé (jamais en local) : `apps/core` et `vitest.coverage.config.ts` passent au plancher de 20 s déjà utilisé par studio/tenants. Assertions inchangées.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | _(ce commit)_ |
| 2026-11-16 | Tests + bugs (zone éditeur restée hors périmètre)   | 96 tests : `EditorSettingsDrawer` (19), `EditorToolbar` (16), `SelectionToolbar` (9), `RecoverArticleModal` (10), `ReaderPreviewDialog` (10), `ArticleDiffModal` (13), `useCollaborationSession` (14, transport et auth simulés), `PublishModal` (+3). Corrigés : approbation/retouche/abandon dans le diff et publication qui rejetaient une promesse non gérée (aucun message, modale apparemment figée) — `catch` + `toast.error`, modal maintenue ouverte et bouton réactivé. Seuils studio 20/20/17/16 → 25/24/23/22 (mesure 26,01/25,85/24,04/23,45). `test:coverage`, `test:coverage:front`, `typecheck`, `lint` verts.                                                                                                                                                                      | _(ce commit)_ |
| 2026-11-16 | Tests + bug (en-tête et dialogues d'éditeur)        | 56 tests : `EditorHeader` (23), `PastedAnnotationsDialog` (12), `AiSuggestionDialog` (9), `CoverUploader` (+6, recadrage et médiathèque simulés). Corrigé : une date de programmation illisible affichait « Programmé · » suivi de rien — repli sur « Programmé ». Seuils studio 25/24/23/22 → 25/25/23/24 (mesure 26,61/26,43/24,82/25,29).                                                                                                                                                                                                                                                                                                                                                                                                                                                        | _(ce commit)_ |
| 2026-11-16 | Tests + bug (actions groupées sur les articles)     | 37 tests : `ArticleBulkSettingsDialog` (19), `ArticleBulkTransferDialog` (16, progression pilotée par promesses différées). Corrigé : un rafraîchissement de liste raté après une action réussie passait pour un échec de la modification groupée/du transfert et laissait une promesse rejetée non gérée ; l'action et le rafraîchissement sont désormais distingués. Seuils studio 25/25/23/24 → 26/26/25/25 (mesure 27,91/27,82/26,15/26,66).                                                                                                                                                                                                                                                                                                                                                    | _(ce commit)_ |
| 2026-11-16 | Tests + bug (studio Média)                          | 60 tests : `media-studio-logic` (27, logique pure extraite de `MediaStudioClient`) et `MediaStudioClient` (33). Corrigé : le bouton « Copier » d'un lien d'invitation restait bloqué sur « Copier » — la collection du tableau react-aria, mémoïsée sur l'identité d'`items`, ne voyait pas l'état de copie ; il fait désormais partie des items. Seuils studio 26/26/25/25 → 31/30/29/29 (mesure 32,11/31,85/30,79/30,51).                                                                                                                                                                                                                                                                                                                                                                         | _(ce commit)_ |
| 2026-11-16 | Flake CI du rendu admin                             | `moderation-queue.test.tsx` (« résout un signalement… ») a dépassé 5 s sur le runner `main` du commit `26ea3b93` alors que le run `dev` du même commit était vert : `apps/admin` passe au plancher de 20 s déjà utilisé par core/studio/tenants. Assertions inchangées.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | _(ce commit)_ |
| 2026-11-17 | Passe 4 — autorisation prouvée + injections fermées | Go : 4 fichiers de table (permissions, authz, middleware, adminauthz), 128 + 11 échecs observés en mutation ; TS : 25 tests d'assainissement partagé, 10 tests d'origine de server actions ; gardes `guard:dangerous-html` et `audit:guard` en CI ; `dompurify` 3.4.13→3.4.18 ; `pnpm test:coverage` 88 fichiers / 27,49 % lignes, `test:coverage:front` studio 63 fichiers / 32,76 % lignes (seuils tenus), typecheck 25/25, lint 25/25                                                                                                                                                                                                                                                                                                                                                            | _(ce commit)_ |
| 2026-11-16 | Durcissement sécurité (studio) + plan dédié         | 34 tests : `security-hardening` (24 : en-têtes, cookie d'espace `Secure`, locale, HTML d'aperçu, SVG inline) et `totp-enrollment` (10). Corrigés : HTML d'aperçu injecté sans assainissement, QR TOTP injecté brut, cookie d'espace sans `Secure` en prod, en-têtes app incomplets, `x-locale` recopié sans liste blanche. Plan sécurité alors créé (document supprimé le 18/11 ; suivi repris par `docs/AUDIT-CHECKLIST.md`). Seuils studio 31/30/29/29 → 31/31/30/30 (mesure 32,85/32,60/31,26/31,02).                                                                                                                                                                                                                                                                                            | _(ce commit)_ |
