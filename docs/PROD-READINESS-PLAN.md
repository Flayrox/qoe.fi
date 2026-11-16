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

| Élément | Valeur mesurée | Preuve |
| --- | --- | --- |
| Branche locale | `dev`, arbre **propre** | `git status --short --branch` |
| `dev` ↔ `origin/dev` | 0 / 0 | `git rev-list --left-right --count` |
| `main` ↔ `origin/main` | 0 / 0 (`origin/main` = `f031ab67`) | idem |
| Images Docker | **succès** | run `43884256587` (6 min 45) |
| CI du commit `f031ab67` | **échec** (2 causes réelles, section 3) | run `43884256529` |
| VPS Netcup | joignable, 24 conteneurs `Up` | `ssh root@159.195.110.239 docker ps` |
| Stack prod | déployée il y a ~37 h → **antérieure** à `f031ab67` | `docker ps` |

Conséquence : les images du dernier commit existent sur GHCR, mais la prod tourne
encore l'image précédente. Le déploiement n'est donc pas un simple redémarrage.

---

## 3. Étape 1 — CI rouge : corriger la cause (fait)

Deux échecs distincts sur `f031ab67`, tous deux côté tests :

1. **`@qoe/config` — `getSidebarSurfaces`** (`src/__tests__/surfaces.test.ts`).
   Les surfaces `studio.books`, `studio.community` et `studio.monetization` sont
   entrées dans la sidebar (commits `feat(books)`, `feat(community)`,
   `feat(billing)`) sans mettre à jour le verrou d'ordre : 13 entrées attendues
   par le code, 10 déclarées par le test.
   → **Correctif** : le test verrouille désormais l'ordre réel (13 entrées), et la
   liste du rôle *viewer* passe à 8 (livres + communauté visibles, monétisation
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
   5 % parce que le compte était *creator*. Le barème a changé (commit billing) :
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
   variable posée **au build** dans le job E2E et jamais dans l'image de prod.

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

## 5. Feuille de route tests (à implémenter plus tard)

Chiffres de référence : `docs/TEST-COVERAGE.md` (mesure du **14/11**). Attention,
ce fichier est partiellement périmé : il annonce `apps/core/src/app` à 0 %, alors
que **14 fichiers de test** y existent déjà (`find apps/core/src/app -name
"*.test.*"`). À re-mesurer avant de s'y fier.

Seuils actuels (ratchets CI, jamais à la baisse) : `packages/ui` 55 %, `tenants`
23 %, `studio` 9 %, `admin` 4 %.

### 🔴 Priorité 1 — `apps/admin` (39 pages, 10 fichiers de test)

Dossiers à couvrir en priorité, tous sans test aujourd'hui :

- **RBAC / capacités** : `lib/admin-screen-guards.test.ts` existe, mais aucune
  preuve que chaque écran appelle `requireCapability` (39 pages). Test de
  registre : pour chaque route admin, capacité requise déclarée + refus 403 quand
  elle manque (le pendant front du `security_audit_test.go` Go).
- **Modération & signalements** : files de signalements, masquage, suspension —
  actions serveur et transitions d'état.
- **Octrois d'abonnement** (`SubscriptionGrant`) : création, prolongation,
  révocation depuis la console, avec les mêmes invariants que le Go.
- **Imports d'abonnés** (`/admin/imports/[id]`) : le 500 historique (params
  asynchrones) mérite un test de non-régression.
- **Feature flags** : panneaux d'activation et audit des changements.

### 🟠 Priorité 2 — `apps/studio` (hors éditeur, ~9 %)

L'éditeur a déjà son banc (24 fichiers). Ce qui reste nu :

- `app/(creator)/monetization/monetization-client.tsx` : création de formule
  (`createCreatorTierAction`), portail (`openBillingPortalAction`) et surtout les
  **chemins d'erreur** (aucun client Stripe → message, pas d'écran blanc).
- `app/(creator)/pricing/**` : `OfferCompare` (contenu data-driven, pas de faux CTA).
- Export / portabilité : `apps/studio/src/app/api/export/route.ts`
  (`Content-Disposition`, `no-store`, relais d'erreur).
- Compilation EPUB (`feat(books)`) : génération et cas d'erreur.
- `features/settings/**` : arbre de réglages (seul `settingsTree.test.ts` existe).

### 🟡 Priorité 3 — `apps/core` (routes publiques)

14 fichiers de test existent, mais la couverture réelle n'est pas mesurée par
route. Cibles utiles :

- `app/(reader)/library/LibraryClient.tsx` : **exclu du rapport de couverture**
  (erreur de parse `@vitest/coverage-v8`, cf. `docs/TEST-COVERAGE.md`) — à
  corriger avant d'écrire des tests, sinon ils resteront invisibles.
- Lecteur audio : persistance entre navigations.
- Flux de lecture : comportement hors ligne / API indisponible (fallback).
- `MessagesApp.tsx` : même exclusion d'instrumentation que `LibraryClient`.

### 🔵 Priorité 4 — Go facturation & webhooks (`internal/modules/billing`)

- Signature HMAC Stripe : rejet d'un webhook sans `Stripe-Signature` ou avec une
  signature falsifiée (401/400, jamais 200).
- Rejeu d'événements : `customer.subscription.deleted`, `invoice.payment_failed`,
  `checkout.session.completed` ×2 → **un seul** grant (l'index 00093 le garantit
  en base, il faut le prouver).
- `account.updated` (Connect) : passage `charges_enabled` et conséquences.

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
`docs/TEST-COVERAGE.md`, `docs/TEST-BUNKER-PLAN.md`, `.reference/**` (dépôts de
référence externes, non de la documentation projet).

À re-mesurer / réécrire plus tard : `docs/TEST-COVERAGE.md` (chiffres du 14/11,
`apps/core/src/app` annoncé à 0 % alors que 14 tests existent),
`docs/UI-PASS-2026-11-16.md` (état d'une passe déjà terminée).

---

## 8. Journal (append-only)

| Date | Étape | Résultat mesuré | Commit |
| --- | --- | --- | --- |
| 2026-11-16 | Reprise, état des lieux | `dev` = `origin/dev` = `origin/main` = `f031ab67`, arbre propre ; images GHCR OK (run `43884256587`) ; CI rouge (run `43884256529`) ; VPS joignable, stack vieille de 37 h | — |
| 2026-11-16 | Étape 1 — CI rouge corrigée | `@qoe/config` : ordre sidebar 13 entrées (viewer 8) ; Go : sujet UUID réaliste dans `TestExtendPlanGrant_ProlongeSansDoublon` | `e4a5ecc2` |
| 2026-11-16 | Étape 1bis — 4 échecs préexistants | studio : libellé « Publication automatique programmée » ; Go : barème 10 %/5 % selon le droit Pro ; `ReindexAll` sonde Meili ; banc `/dev/editor-check` ouvert au build E2E via `QOE_E2E_DEV_ROUTES=1` | _(ce commit)_ |
