# Checklist d'audit — un lot par package

> **Rôle de ce fichier.** Ce n'est pas un plan thématique : c'est la liste de
> contrôle du code, découpée en **lots** (un lot = un package partagé, une app,
> ou un sous-ensemble logique de `apps/api`). Dans chaque lot, l'audit descend
> au **fichier / à la fonction exportée**. Chaque ligne porte un verdict et une
> preuve ; ce qui n'est pas au niveau attendu est corrigé, testé, ou remplacé
> par une solution plus moderne.
>
> Un lot se traite de bout en bout avant de passer au suivant. Le fichier est
> mis à jour dans le même changement que le code : une ligne « durci » sans
> preuve de commande n'a pas sa place ici.

## Rythme imposé

- **Un lot = un commit.** Le lot se termine par un commit dédié (`audit(<lot>): …`)
  qui embarque le code, les tests et la mise à jour de ce fichier. Un lot clos ne
  laisse rien en travail non commité.
- **Un changement = un commit.** Tout correctif cohérent et vert est commité
  immédiatement, même transverse et même s'il ne clôt pas le lot en cours
  (`fix(...)`, `chore(...)`, `docs(...)`). Le rythme est : on corrige, on
  vérifie, on commit ; on n'empile pas des corrections vérifiées dans l'ombre.
- **Profondeur maximale.** On ne lit pas seulement le package : on lit ses
  appelants, ses colonnes SQL et les validations Go qui doublonnent, puis on
  remplace ce qui peut l'être par une primitive native, une API plus récente ou
  un garde CI.
- **Aucun bug laissé ouvert.** Un défaut constaté est corrigé dans le lot, même
  hors du périmètre initial (test rouge d'abord, correctif, preuve recollée ici).
  Si la correction exige une décision produit, la ligne passe `bloqué` avec la
  question écrite.

## Méthode (grille appliquée à chaque entrée)

| Axe                  | Question posée                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1. Surface d'attaque | Quelles entrées viennent de l'extérieur (HTTP, HTML, markdown, URL, env) ? Sont-elles validées avant usage ?              |
| 2. Autorisation      | L'entrée protégée l'est-elle au bon niveau, par la bonne capacité ? En Go, la règle vit côté serveur, jamais côté client. |
| 3. Données           | Requêtes paramétrées, portée par utilisateur/tenant, PII, secrets, ce qui finit dans un journal.                          |
| 4. Erreurs           | Un échec est-il explicite ? Fuit-il un détail interne, ou pire, avale-t-il l'erreur ?                                     |
| 5. Tests             | Ce qui est prouvé, ce qui ne l'est pas. Le test manquant est écrit **avant** le correctif (rouge observé), puis conservé. |
| 6. Garde             | Existe-t-il un garde CI qui empêche la régression ? Sinon, en ajouter un.                                                 |
| 7. Doc               | La ligne du lot est mise à jour : finding, correctif, preuve, reste à faire.                                              |
| 8. Portabilité/scale | Aucun hôte (Supabase, CDN, stockage) codé en dur : tout passe par une variable d'environnement, avec défaut déterministe, idempotence et test du rewrite. Voir « Portabilité d'infra » dans `AGENTS.md`. |

**Conventions d'identifiants.** `L<n>` = lot. `U<n>` = entrée du lot `@qoe/utils`.
Les tâches restantes sont numérotées **en continu** (`R01`, `R02`, …) sur tout
le fichier : un `R` ne se réutilise jamais, même quand son lot est clos.

**Statuts.** `à auditer` · `en cours` · `durci le AAAA-MM-JJ` · `bloqué`
(`bloqué` = décision produit ou contrainte externe, jamais « pas eu le temps »).

---

## 0. Index des lots

| Lot     | Périmètre (chemins réels)                                                                                    | Volume                      | Statut                  |
| ------- | ------------------------------------------------------------------------------------------------------------ | --------------------------- | ----------------------- |
| **L01** | `packages/utils/src/**`                                                                                      | 29 fichiers src, 50 exports | **durci le 2026-11-18** |
| **L02** | `packages/schemas/src/**`                                                                                    | 8 fichiers                  | **durci le 2026-11-18** |
| **L03** | `packages/flags/src/**`                                                                                      | 8 fichiers                  | **durci le 2026-11-18** |
| **L04** | `packages/auth/src/**`                                                                                       | 11 fichiers                 | **durci le 2026-11-18** |
| **L05** | `packages/supabase/src/**`                                                                                 | 13 fichiers                 | **durci le 2026-11-18** |
| **L06a** | `packages/sdk/src/{client,index,mobile,query-keys,embed}`, `actions/utils/{go-client,safe-action,authz}`, `utils/authError` | 15 fichiers           | **durci le 2026-11-18** |
| **L06b** | `packages/sdk/src/{shadow,entity-actions}.ts` + `hooks/**` + `lib/**`                                         | 24 fichiers                 | **durci le 2026-11-18** |
| **L06c** | `packages/sdk/src/actions/{feed,articles,tenant,search,dashboard}` + `lib/shareUrl.ts`                      | 5 fichiers / 2 700 lignes   | **durci le 2026-11-18** |
| **L06d** | `packages/sdk/src/actions/**` restants (admin, legal, billing, highlights, ebooks, appeals, support, workspace…) | 38 fichiers | **durci le 2026-11-18** |
| L07a     | `packages/ui/src/primitives/**`, `ui/**`, `tokens.ts`                                                                       | 310 fichiers (global)       | **durci le 2026-11-18** |
| L07b    | `packages/ui/src/{reader,annotations,cards}/**`                                                              | 31 fichiers src             | **durci le 2026-11-18** |
| L07c    | `packages/ui/src/{auth,forms,providers}/**`                                                                  | 4 fichiers src (et 3 composants via barrel) | **durci le 2026-11-18** |
| L07d    | `packages/ui/src/{security,seo,legal}/**`                                                                    | 13 fichiers src             | **durci le 2026-11-19** |
| L07e    | `packages/ui/src/{notifications,onboarding,profile,social,cmdk,templates,sidebar.tsx}`                       | 86 fichiers (src + tests)   | **durci le 2026-11-19** |
| L08     | `packages/theme/src/**`                                                                                      | 19 fichiers                 | **durci le 2026-11-19** |
| L09     | `packages/brand/src/**`                                                                                      | 10 fichiers                 | **durci le 2026-11-19** |
| L10     | `packages/content/src/**`                                                                                    | 25 fichiers                 | **durci le 2026-11-19** |
| L11     | `packages/config/src/**`                                                                                     | 17 fichiers                 | **durci le 2026-11-19** |
| L12     | `packages/formatters/src/**`                                                                                 | 5 fichiers                  | **durci le 2026-11-19** |
| L13     | `packages/i18n/src/**` + `messages/`                                                                         | 12 fichiers                 | **durci le 2026-11-19** |
| L14     | `packages/moderation/src/**`                                                                                 | 16 fichiers src + 2 suites  | **durci le 2026-11-19** |
| L15     | `packages/analytics/src/**`                                                                                  | 8 fichiers src + 6 suites   | **durci le 2026-11-19** |
| L16     | `packages/observability/src/**`                                                                              | 7 fichiers                  | à auditer               |
| L17     | `packages/devtools/src/**`                                                                                   | 2 fichiers                  | à auditer               |
| L18     | `packages/social/src/**`                                                                                     | 6 fichiers                  | à auditer               |
| L19     | `packages/tsconfig/**`                                                                                       | 0 fichier src               | à auditer               |
| L20     | `apps/core/src/**`                                                                                           | 211 fichiers                | à auditer               |
| L21     | `apps/studio/src/**`                                                                                         | 509 fichiers                | à auditer               |
| L22     | `apps/admin/src/**`                                                                                          | 178 fichiers                | à auditer               |
| L23     | `apps/tenants/src/**`                                                                                        | 85 fichiers                 | à auditer               |
| L24     | `apps/hi/src/**`                                                                                             | 40 fichiers                 | à auditer               |
| L25     | `apps/collab-server/src/**`                                                                                  | 15 fichiers                 | à auditer               |
| L26     | `apps/mobile/src/**` + `modules/`                                                                            | 220 fichiers                | à auditer               |
| L27     | `apps/api/internal/{middleware,authz,permissions,adminauthz,identity,apiaccess,secguard}`                    | Go                          | à auditer               |
| L28     | `apps/api/internal/{antispam,abuse,netguard,pow,trust,eligibility}`                                          | Go                          | en cours (garde média)  |
| L29     | `apps/api/internal/modules/**`                                                                               | Go                          | en cours (garde média)  |
| L30     | `apps/api/internal/{workers,queue,resilience,cache}`                                                         | Go                          | à auditer               |
| L31     | `apps/api/sql/**`, `internal/{database,dbpool,migrations}`                                                   | Go + SQL                    | à auditer               |
| L32     | `apps/api/cmd/**`, `internal/{config,response,logging,observability,auditlog}`                               | Go                          | à auditer               |
| L33     | `.github/workflows/**`                                                                                       | 2 workflows                 | à auditer               |
| L34     | `scripts/**`                                                                                                 | 48 fichiers                 | à auditer               |
| L35     | `Dockerfile`, `docker-compose*.yml`, `docker/**`, `infra/monitoring/**`, `Caddyfile.dev`                     | infra                       | à auditer               |
| L36     | `e2e/**`, `playwright*.config.ts`, `e2e/lib/**`                                                              | 65 fichiers                 | à auditer               |
| L37     | `docs/**`, `AGENTS.md`, racine (`tsconfig`, `eslint`, `turbo`, `vitest`), `supabase/`, `patches/`, `.husky/` | transverse                  | à auditer               |
| **L38** | URLs d'article (core ↔ tenants) : `config/routes`, `utils/article-url`, `ui`, `sdk`, Go `articles`, `scripts/dev-smtp.mjs` | transverse | **durci le 2026-11-18** |
| L39     | **Produit, post-audit** : engagement e-mail (clics signés, ouvertures estimées, attribution) — cf. annexe `R49` | —                           | planifié après L37 |

**Prochain lot à traiter : L16 — `packages/observability`.**
Le lot L06 a été scindé : le noyau partagé (transport, embed, barrel) est clos
en L06a (`durci le 2026-11-18`), le store optimiste `shadow`/`entity-actions`,
les hooks et `lib/**` en L06b (`durci le 2026-11-18`), les actions à plus fort
trafic (feed, articles, tenant, recherche, dashboard) en L06c (`durci le
2026-11-18`), les 38 actions restantes en L06d. Ordre retenu : du plus partagé
au plus spécifique, parce qu'un correctif dans un package bas remonte dans
toutes les apps.

**Nettoyage 2026-11-18.** Retrait de `bullmq` et `ioredis` de
`apps/studio/package.json` (aucun import, 246 paquets retirés du lockfile) et
des commentaires « optimisations BullMQ » de `docker/redis/redis.conf` et
`packages/observability/src/sentry.ts` : le backend est Go + asynq, il ne reste
aucun client BullMQ dans le dépôt.

---

## L01 — `@qoe/utils` — durci le 2026-11-18

**Périmètre.** `packages/utils/src/**` (16 modules, 14 fichiers de tests).
**Consommateurs.** `apps/{core,studio,admin,tenants,hi}`, `packages/{ui,sdk,auth}` —
c'est la couche la plus partagée du dépôt.
**Tests.** 150 tests verts (`pnpm exec vitest run`), dont 26 nouveaux dans
`src/__tests__/hardening.test.ts`.

### Entrées auditées

| #   | Emplacement                                                                       | Standard attendu                                                                                                             | Verdict                                                 |
| --- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| U01 | `ssrf.ts` → `validateSafeExternalUrl`, `isPrivateOrReservedIPv4`                  | Refus des schémas non web, des ports non standards, des IP privées, et de toute écriture équivalente d'une même adresse IPv6 | **corrigé** (F3)                                        |
| U02 | `ssrf.ts` → `isPrivateOrReservedIPv6`                                             | Comparaison sur la forme canonique, pas sur la chaîne écrite                                                                 | **corrigé** (F3)                                        |
| U03 | `redirect.ts` → `getSafeRedirectUrl`                                              | Allowlist d'hôtes, refus `//host` et `\`, **et** aucun caractère de contrôle (injection d'en-tête)                           | **corrigé** (F4)                                        |
| U04 | `markdown.ts` → `escapeHtml`                                                      | `& < > " '` échappés                                                                                                         | conforme                                                |
| U05 | `markdown.ts` → `safeUrl` (interne)                                               | Refus `javascript:`, `data:`, **et** `//evil.com`                                                                            | **corrigé** (F1)                                        |
| U06 | `markdown.ts` → `inline` (images, liens)                                          | Valeur d'attribut neutralisée même si l'appelant n'échappe pas                                                               | **corrigé** (F2)                                        |
| U07 | `markdown.ts` → `markdownToHtml`                                                  | Aucun HTML brut, blocs fermés, tableaux, listes, code                                                                        | conforme (tests d'attaque conservés)                    |
| U08 | `markdown.ts` → `markdownHeadings`                                                | Ancre identique à celle du rendu, ignores dans les fences                                                                    | conforme                                                |
| U09 | `slugify.ts` → `slugify`                                                          | Translittération complète (ligatures, ß, ø, ł), longueur bornée                                                              | **corrigé** (F5)                                        |
| U10 | `slugify.ts` → `shortId`                                                          | Aléa cryptographique, rejet du biais modulo, longueur bornée                                                                 | **corrigé** (F6)                                        |
| U11 | `slugify.ts` → `uuid`                                                             | v4 sur `crypto`, aucun repli `Math.random()`                                                                                 | **corrigé** (F7)                                        |
| U12 | `format.ts` → `formatCurrency`, `formatNumber`                                    | `Intl` côté plateforme                                                                                                       | conforme — repli sur entrée non finie non tranché (R02) |
| U13 | `format.ts` → `formatDuration`, `formatReadingTime`                               | Sortie stable, pas de division flottante surprenante                                                                         | conforme                                                |
| U14 | `format.ts` → `formatRelativeDate`                                                | Date invalide → pas de sortie absurde                                                                                        | **corrigé** (F8)                                        |
| U15 | `format.ts` → `truncate`                                                          | Coupe sur des points de code, pas des unités UTF-16                                                                          | **corrigé** (F8)                                        |
| U16 | `format.ts` → `maskEmail`                                                         | Aucune PII brute pour une entrée malformée                                                                                   | **corrigé** (F8)                                        |
| U17 | `paywall.ts` → `sliceContentAtPaywall`                                            | Fonctionne hors Node (edge, navigateur)                                                                                      | **corrigé** (F9)                                        |
| U18 | `paywall.ts` → `checkContentAccess`                                               | Décision d'accès fail-closed                                                                                                 | **à trancher** (R01)                                    |
| U19 | `paywall.ts` → `buildPublicDescription`, `buildPublicExcerpt`                     | Jamais de contenu verrouillé dans les métadonnées                                                                            | conforme (`paywall-leak-guard`, 10 tests)               |
| U20 | `article-attribution.ts` → `normalizeArticleAttributions`                         | Ordres entiers sûrs et distincts                                                                                             | **corrigé** (F10)                                       |
| U21 | `article-attribution.ts` → `visibleArticleAttributions`                           | Consentement `ACCEPTED` requis                                                                                               | conforme                                                |
| U22 | `article-url.ts` → `resolveCategoryPath`, `buildCategoryPath`, `buildArticlePath` | Un segment d'URL ne peut pas sortir de la hiérarchie                                                                         | **corrigé** (F11)                                       |
| U23 | `action.ts` → `actionOk`, `actionErr`, `unwrapAction`, `isStaleServerActionError` | Le code structuré survit à l'erreur levée                                                                                    | **corrigé** (F12)                                       |
| U24 | `server-action-origin.ts` → `isCrossOriginServerAction`                           | Refus strict, `Origin` illisible refusée, pas de repli permissif                                                             | conforme (10 tests)                                     |
| U25 | `cookie-consent.ts` → registre, catégories, mode                                  | Le registre décrit ce que le code dépose réellement                                                                          | conforme (`guard:legal-consent`)                        |
| U26 | `legal-consent.ts`, `legal-placeholders.ts`, `cn.ts`, `validation.ts`, `index.ts` | Pur, sans effet de bord, exports cohérents                                                                                   | conforme, sauf export manquant (R09)                    |

### Findings et correctifs

| #   | Défaut                                                                                                                                                                                        | Sévérité                        | Correctif                                                                                                                           | Fichiers                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| F1  | `safeUrl` acceptait `//evil.com` (URL relative au protocole) : un lien markdown « sûr » produisait une sortie vers un hôte externe                                                            | haute                           | `//` refusé, `\` et caractères de contrôle refusés, `#` ancré explicitement                                                         | `markdown.ts`            |
| F2  | Les valeurs d'attribut (`href`, `src`, `alt`, `title`) étaient interpolées sans échappement propre ; la sûreté dépendait de l'ordre des appels (`escapeHtml` en amont)                        | moyenne (défense en profondeur) | `escapeAttr` (guillemets, `<`, `>` ; l'esperluette déjà entitée est préservée)                                                      | `markdown.ts`            |
| F3  | `isPrivateOrReservedIPv6` comparait des préfixes de chaîne : `::ffff:7f00:1` (127.0.0.1), `0:0:0:0:0:ffff:7f00:1`, `::ffff:a00:1` (10.0.0.1) et NAT64 `64:ff9b::/96` passaient pour publiques | haute                           | expansion en 8 groupes (`expandIPv6`) puis décision sur les groupes ; illisible → dangereux ; 6to4 et NAT64 couverts                | `ssrf.ts`                |
| F4  | Un CRLF (brut ou `%0d%0a`) dans un chemin relatif était renvoyé tel quel → injection d'en-tête `Location` en aval                                                                             | moyenne                         | refus de tout caractère de contrôle, **avant** `trim()`                                                                             | `redirect.ts`            |
| F5  | `slugify` supprimait les lettres non décomposables : « Cœur » → `cur`, « Straße » → `strae` ; aucune borne de longueur                                                                        | moyenne                         | table de translittération (œ, æ, ß, ø, ł, đ, ð, þ, ı, ħ, ŋ, ŧ, ĸ, ĳ, ŀ, ƒ) + `MAX_SLUG_LENGTH = 96` avec coupe sur frontière de mot | `slugify.ts`             |
| F6  | `shortId` tirait dans `Math.random()` (prédictible) et acceptait `0` ou `10 000` en bouclant                                                                                                  | haute                           | `crypto.getRandomValues` + rejet des octets ≥ 248 (pas de biais modulo) + `RangeError` hors [1, 64]                                 | `slugify.ts`             |
| F7  | `uuid()` retombait sur `Math.random()` en prétendant être un v4 « crypto-secure »                                                                                                             | moyenne                         | `randomUUID` sinon v4 construit sur `getRandomValues` ; sinon **throw**                                                             | `slugify.ts`             |
| F8  | `formatRelativeDate('date invalide')` → « il y a NaN ans » ; `truncate` coupait une paire de substitution (emoji cassé) ; `maskEmail` renvoyait l'e-mail brut si malformé                     | moyenne                         | date invalide → `''` ; coupe par points de code ; masque `***` hors email plausible                                                 | `format.ts`              |
| F9  | `Buffer.byteLength` dans `paywall.ts` : `Buffer` n'existe pas dans le navigateur alors que le module est importé par des composants clients                                                   | moyenne                         | `TextEncoder`, repli `encodeURIComponent`                                                                                           | `paywall.ts`             |
| F10 | Les ordres implicites valaient `Number.MAX_SAFE_INTEGER + index` : au-delà de 2^53 la précision est perdue, deux contributeurs pouvaient recevoir le même ordre                               | moyenne                         | base `1_000_000 + index`, ordre explicite conservé seulement s'il est un entier sûr                                                 | `article-attribution.ts` |
| F11 | Un slug contenant `/`, `\` ou `..` construisait un chemin hors hiérarchie                                                                                                                     | moyenne                         | `safeSegment` (séparateurs retirés, points compressés, 96 caractères) appliqué à chaque segment                                     | `article-url.ts`         |
| F12 | `unwrapAction` levait un `Error` nu : le `code` (`FORBIDDEN`, `RATE_LIMITED`…) était perdu par les appelants                                                                                  | faible                          | `ActionResultError` typée, `code` attaché, message inchangé                                                                         | `action.ts`              |

### Preuves exécutées

```bash
# 1. Rouge observé avant correctif (tests écrits d'abord)
cd packages/utils && pnpm exec vitest run src/__tests__/hardening.test.ts
# → 21 failed | 5 passed (26) — EXIT=1

# 2. Vert après correctif, sur tout le package
cd packages/utils && pnpm exec vitest run
# → Test Files 14 passed (14) / Tests 150 passed (150) — EXIT=0

# 3. Types et lint du package, puis du monorepo (les consommateurs compilent)
cd packages/utils && pnpm exec tsc --noEmit          # EXIT=0
cd packages/utils && pnpm exec eslint .              # EXIT=0
pnpm typecheck                                       # 25 successful, 25 total
```

Deux tests existants ont été corrigés parce qu'ils **verrouillaient le défaut** :
`article-attribution.test.ts` attendait `Number.MAX_SAFE_INTEGER + 3`, et
`slugify.test.ts` attendait un repli de `uuid()` sur `Math.random()`.

### Reste à faire (lot L01)

| #   | Tâche                                                                                                                                                        | Sévérité | Motif                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | Trancher `checkContentAccess` en `TIER_SPECIFIC` **sans** `requiredTierId` : aujourd'hui tout abonné payant passe (fail-open)                                | moyenne  | Changement de comportement produit : soit on masque (fail-closed), soit on corrige la donnée manquante. Décision requise, pas une improvisation.               |
| R02 | Repli explicite pour `formatCurrency`/`formatNumber` sur entrée non finie (`NaN`, `Infinity` affichent `NaN`)                                                | faible   | À trancher avec le design system (`—` ou `0 €`) pour rester cohérent sur toutes les surfaces.                                                                  |
| R03 | Étendre `escapeHtml` à `/` et `` ` `` si un usage en attribut non quoté apparaît                                                                             | faible   | Aucun usage non quoté aujourd'hui (vérifié) ; l'étendre changerait les sorties de test existantes sans gain immédiat.                                          |
| R04 | Retirer `lvh.me`, `localhost` et `127.0.0.1` de l'allowlist de `getSafeRedirectUrl` en production                                                            | moyenne  | Ces hôtes servent au développement ; les laisser en prod autorise une redirection interne inutile. Nécessite une injection de configuration par environnement. |
| R05 | Vérifier les appelants qui font un `fetch` **après** `validateSafeExternalUrl` : la résolution DNS peut changer entre la validation et la connexion (TOCTOU) | haute    | La règle est correcte, la propriété ne l'est pas encore : il faut épingler l'IP résolue au moment du fetch.                                                    |
| R06 | Auditer les usages de `shortId` : 62^8 ≈ 2,2 × 10^14 convient à une référence lisible, pas à un secret                                                       | moyenne  | Si un code d'invitation ou un jeton l'utilise, passer à 128 bits (`uuid`).                                                                                     |
| R07 | Vérifier le repli de `sliceContentAtPaywall` (500 caractères) : la coupe peut tomber au milieu d'un tag                                                      | faible   | Le contenu reste tronqué (pas de fuite), mais le HTML peut être malformé.                                                                                      |
| R08 | Couvrir les blocs de code non fermés et les listes imbriquées de `markdownToHtml`                                                                            | faible   | Comportement non testé ; le contenu légal actuel n'en contient pas.                                                                                            |
| R09 | Trancher l'export de `legal-consent` : sous-chemin `@qoe/utils/legal-consent` déclaré, absent de `index.ts`                                                  | faible   | Incohérence d'API : soit il est public via l'index, soit le sous-chemin est la seule porte et c'est documenté.                                                 |
| R10 | Rechercher en base les slugs contenant des ligatures perdues (`cur` pour « Cœur ») et, si présents, renommer + redirection 301                               | moyenne  | Le correctif ne réécrit pas les slugs existants (ce serait casser des URLs indexées).                                                                          |
| R11 | Vérifier que `uuid()` (qui lève désormais sans `crypto`) n'est appelé dans aucun contexte sans WebCrypto                                                     | faible   | Node 22, edge et navigateurs en ont ; la vérification est un grep + test de démarrage.                                                                         |
| R12 | Ajouter `maskEmail` au garde anti-PII des journaux quand il sera écrit (L34)                                                                                 | faible   | Suite logique de F8 : masquer à l'affichage ne suffit pas si la valeur brute est journalisée ailleurs.                                                         |

---

## L02 — `@qoe/schemas` — durci le 2026-11-18

**Périmètre.** `packages/schemas/src/**` (5 modules, `index.ts`, 2 fichiers de
tests). **Consommateurs.** `packages/config` (ré-export public), `packages/utils`
(`validation.ts`), `packages/sdk` (actions feed), `apps/core`
(`ModerationReportModal`).
**Contrat serveur.** `apps/api/internal/shared/identifier/identifier.go`
(`ValidUsername`, `NormalizeUsername`, `reserved`) et les handlers Go
(`time.Parse(time.RFC3339)` pour `scheduledAt`, `pgtype.Timestamp`).
**Tests.** 33 tests verts, dont 22 dans `src/__tests__/hardening.test.ts`.

### Entrées auditées

| #   | Emplacement                                              | Standard attendu                                                                                | Verdict          |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------- |
| S01 | `common.ts` → `emailSchema`                              | Normalisation + borne RFC 5321 (254)                                                            | **corrigé** (F21) |
| S02 | `common.ts` → `slugSchema`                               | Même borne que `slugify` (96), trim avant regex                                                 | **corrigé** (F21) |
| S03 | `common.ts` → `uuidSchema`                               | Casse normalisée ; une seule forme acceptée                                                     | **corrigé** (F21) |
| S04 | `common.ts` → `usernameSchema`                           | Règle **identique** à `identifier.ValidUsername` (Go)                                           | **corrigé** (F15) |
| S05 | `common.ts` → `normalizeUsername`                        | Trim, minuscules, `@` retiré — parité avec Go                                                   | **ajouté** (F15)  |
| S06 | `common.ts` → `idSchema`                                 | Identifiant opaque borné (64) et charset restreint                                              | **ajouté** (F18)  |
| S07 | `common.ts` → `singleLineText`, `multiLineText`          | Refus C0/DEL/bidi ; `\n` et `\t` seulement en multi-lignes                                      | **ajouté** (F17)  |
| S08 | `common.ts` → `centsSchema`                              | Entier **sûr** (pas seulement entier)                                                           | **corrigé** (F21) |
| S09 | `thought.ts` → `createThoughtSchema.imageUrl`            | `http(s)` ou chemin racine, jamais `javascript:`/`data:`/`//host` ; tableau JSON validé entrée par entrée | **corrigé** (F13) |
| S10 | `thought.ts` → `createThoughtSchema.scheduledAt`         | RFC 3339 **avec fuseau** : ce que `time.Parse` accepte                                          | **corrigé** (F14) |
| S11 | `thought.ts` → `createThoughtSchema.content`             | Défaut `''` : une pensée média/citation n'exige pas de texte                                    | **corrigé** (F19) |
| S12 | `thought.ts` → `tags`                                    | Charset borné, dédoublonnage insensible à la casse                                              | **corrigé** (F20) |
| S13 | `thought.ts` → `parentId`, `repostId`                    | `idSchema`, pas une chaîne libre                                                                | **corrigé** (F18) |
| S14 | `thought.ts` → `triggerWarning`                          | Mono-ligne, sans caractère de contrôle                                                          | **corrigé** (F17) |
| S15 | `thought.ts` → `replyToPostSchema`                       | `postId` borné, contenu multi-lignes contrôlé                                                   | **corrigé** (F18) |
| S16 | `profile.ts` → `updateProfileSchema.username`            | **Un seul** schéma username dans tout le dépôt                                                  | **corrigé** (F16) |
| S17 | `profile.ts` → `httpUrlSchema`                           | `http(s)` seulement, sans espace/antislash, **sans identifiants embarqués**                     | **corrigé** (F16) |
| S18 | `profile.ts` → `name`, `heroText`                        | Mono-ligne contrôlé / multi-lignes contrôlé                                                     | **corrigé** (F17) |
| S19 | `moderation.ts` → `createReportSchema`                   | `targetId` borné, détails vides ramenés à `undefined`                                          | **corrigé** (F18) |
| S20 | `article.ts` → `articleTitleSchema`                      | Mono-ligne, sans caractère de contrôle                                                          | **corrigé** (F17) |
| S21 | `index.ts`, `package.json`                               | Exports cohérents avec les sous-chemins déclarés                                                | conforme         |

### Findings et correctifs

| #   | Défaut                                                                                                                                                                                              | Sévérité | Correctif                                                                                                                       | Fichiers      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| F13 | `imageUrl` n'était **pas validé du tout** : `javascript:`, `data:`, `//evil.com` et un tableau JSON d'objets passaient. Or cette valeur est rendue directement dans `<img src>` (web, mobile, citations) | haute    | `isImagePayload` : URL unique ou tableau JSON (≤ 8) dont **chaque** entrée doit être `http(s)` ou un chemin racine sans `//`/`\\` | `thought.ts`  |
| F14 | `scheduledAt` était une chaîne libre : une date sans fuseau ou illisible partait jusqu'à Go et revenait en 400 après un aller-retour réseau                                    | moyenne  | `z.string().datetime({ offset: true })` — exactement la grammaire de `time.Parse(time.RFC3339)`                                 | `thought.ts`  |
| F15 | `usernameSchema` divergeait de la source de vérité Go : 3-30 caractères, tiret et majuscules autorisés, pas de `@`, pas de `trim`. Un handle accepté côté TS était refusé côté serveur (et inversement) | moyenne  | `normalizeUsername` + regex `^[a-z0-9]+(?:[._][a-z0-9]+)*$`, 3-24 caractères, comme `identifier.ValidUsername`                  | `common.ts`   |
| F16 | Deux règles de username coexistaient (30 dans `common`, 40 dans `profile`) et `httpUrlSchema` acceptait `https://user:pass@host`                                                                    | moyenne  | `updateProfileSchema.username = usernameSchema` ; identifiants embarqués et espaces/antislash refusés dans les URLs de profil   | `profile.ts`  |
| F17 | `name`, `heroText`, `articleTitle`, `content`, `triggerWarning` acceptaient NUL, CR/LF et marques bidi (U+202E) : forgeage de ligne de journal et spoofing de nom affiché                          | moyenne  | `singleLineText` / `multiLineText` (C0, DEL, U+2028/2029, U+202A-202E, U+2066-2069)                                              | `common.ts`, tous les modules |
| F18 | `parentId`, `repostId`, `postId`, `targetId` étaient des chaînes libres (charset et longueur non bornés) qui partent dans des requêtes SQL                                                         | moyenne  | `idSchema` : 1-64 caractères `[A-Za-z0-9_-]`                                                                                    | `common.ts`, `thought.ts`, `moderation.ts` |
| F19 | `content` était requis même pour une pensée média, une citation ou une réponse : les clients devaient envoyer `content: ''`                                                                        | faible   | `.default('')`, la règle « contenu OU image OU citation OU parent » restant inchangée                                          | `thought.ts`  |
| F20 | Les tags n'étaient ni dédoublonnés ni restreints (`<b>` accepté) et arrivent dans le HTML, la recherche et les URLs de tag                                                                          | faible   | `tagSchema` (`#?` + lettres/chiffres/`_`/`-`) + dédoublonnage insensible à la casse                                            | `thought.ts`  |
| F21 | Bornes manquantes sur les primitifs : email sans longueur max, slug à 100 alors que `slugify` s'arrête à 96, UUID non normalisé, centimes non « safe »                                            | faible   | `MAX_EMAIL_LENGTH`, `MAX_SLUG_LENGTH = 96`, `uuidSchema` lowercase, `centsSchema.safe()`                                        | `common.ts`   |

### Preuves exécutées

```bash
# 1. Premier passage : rouge (chaînage ZodEffects invalide, puis 1 attente fausse)
cd packages/schemas && pnpm exec vitest run            # → 2 suites en échec / 1 test en échec — EXIT=1

# 2. Vert avec couverture (seuils 90/85/90/90)
cd packages/schemas && pnpm exec vitest run --coverage
# → Test Files 2 passed / Tests 33 passed — EXIT=0 ; 96,38 % statements, 96,15 % branches

# 3. Types et lint du package, puis du monorepo entier (les consommateurs compilent)
cd packages/schemas && pnpm exec tsc --noEmit          # EXIT=0
cd packages/schemas && pnpm exec eslint .              # EXIT=0
pnpm typecheck                                         # 25 successful, 25 total
```

Un test existant a été corrigé parce qu'il **verrouillait la divergence** :
`schemas.test.ts` attendait `bob-dev` valide (tiret) alors que Go le refuse.

### Reste à faire (lot L02)

| #   | Tâche                                                                                                                                        | Sévérité | Motif                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| R13 | Vérifier en base les handles existants qui contiennent des majuscules (`SELECT username FROM "User" WHERE username <> lower(username)`)      | moyenne  | `usernameSchema` normalise en minuscules comme Go : sans cet état des lieux, un profil ancien pourrait changer de handle au premier enregistrement. |
| R14 | Miroir TS de `identifier.reserved` (admin, api, qoe, studio…)                                                                                | moyenne  | Un handle réservé passe encore la validation cliente et n'échoue qu'en Go. Le miroir doit être généré depuis la liste Go, pas recopié à la main. |
| R15 | Aligner `MAX_IMAGES_PER_POST` (8) sur la vraie limite du compositeur (4 par nœud aujourd'hui)                                                | faible   | Une borne plus large que l'UI est sûre, mais l'écart doit être assumé ou supprimé.                                   |
| R16 | Passer `@qoe/schemas` à Zod 4 (`z.email()`, `z.uuid()`, perfs)                                                                               | faible   | Migration transverse aux 4 packages qui importent `zod` : à traiter avec L37 pour ne pas fragmenter.              |
| R17 | Faire consommer `updateProfileSchema` par `EditProfileModal` (aujourd'hui il appelle l'action sans passer par le schéma)                      | faible   | Le schéma est correct mais pas branché : la validation n'a lieu qu'au test.                                         |

---

## L03 — `@qoe/flags` — durci le 2026-11-18

**Périmètre.** `packages/flags/src/**` : `flags.ts` (registre), `server.ts`
(évaluation SSR/workers), `provider.tsx` (contexte client), `gate.tsx`
(`FeatureGate`), `hooks.ts`, `index.ts` + 2 fichiers de tests.
**Consommateurs.** `apps/{core,studio,admin,tenants}` (`useFlag`, `FeatureGate`),
`packages/observability`, et le miroir serveur `apps/api/internal/flags` (Go).
**Contrat serveur.** `apps/api/internal/flags/flags.go` : registre fermé
(`Known`), mêmes clés, mêmes défauts. La parité est désormais **vérifiée en CI**
par `pnpm guard:flags-parity` (TS ↔ Go, clé par clé et défaut par défaut).
**Tests.** 33 tests verts, dont 16 dans `src/__tests__/hardening.test.ts`
(couverture 100 % statements / 97,72 % branches).

### Entrées auditées

| #   | Emplacement                          | Standard attendu                                                             | Verdict            |
| --- | ------------------------------------ | ---------------------------------------------------------------------------- | ------------------ |
| G01 | `flags.ts` → `FLAGS`                 | Registre **gelé** à l'exécution (objet partagé par tous les rendus/workers)   | **corrigé** (F26)  |
| G02 | `flags.ts` → `defaultFor`            | Clé inconnue → `false` (fail-closed), jamais `undefined`                      | **corrigé** (F23)  |
| G03 | `flags.ts` → `hasFlag`               | `hasOwnProperty`, pas `in` (les clés du prototype existent)                  | **ajouté** (F24)   |
| G04 | `flags.ts` → `PROTECTIVE_FLAGS`      | Les coupe-feux ne sont jamais court-circuités par le bypass admin             | **ajouté** (F22)   |
| G05 | `server.ts` → `loadFlags`            | Cache TTL 60 s, DB absente/down → défauts, aucune exception                   | conforme           |
| G06 | `server.ts` → `loadFlags` (lignes)   | Registre fermé + booléen strict (`'false'` ≠ `true`)                          | **corrigé** (F24, F25) |
| G07 | `server.ts` → `evaluateFeature`      | Seuls booléens et `{ defaultValue: boolean }` sont interprétés                | **corrigé** (F25)  |
| G08 | `server.ts` → `evaluateFeature`      | Une clé hors registre n'est jamais évaluée, même présente dans le payload     | **corrigé** (F24)  |
| G09 | `server.ts` → `isFlagOn`             | Bypass admin sans accès DB, **sauf** coupe-feux (lecture réelle)              | **corrigé** (F22)  |
| G10 | `server.ts` → `createFlagsContext`   | `getAll()` renvoie une copie : pas de mutation du cache                       | **corrigé** (F26)  |
| G11 | `provider.tsx` → `FlagsProvider`     | Fusion filtrée (clés connues, valeurs booléennes seulement) puis gelée        | **corrigé** (F26)  |
| G12 | `provider.tsx` → `useFlag`, `useFlags` | Fallback sur le défaut si valeur absente/non booléenne                     | **corrigé** (F26)  |
| G13 | `gate.tsx` → `FeatureGate`           | Rendu conditionnel sans état dérivé, `fallback` explicite                     | conforme           |
| G14 | `hooks.ts`, `index.ts`               | Plus d'API morte (`useGrowthBook` renvoyait `null`, reset dupliqué)           | **corrigé** (F27)  |
| G15 | `apps/api/internal/flags/flags.go`   | Même registre que TS, garde CI de parité                                      | **corrigé** (F28)  |

### Findings et correctifs

| #   | Défaut                                                                                                                                                                                    | Sévérité | Correctif                                                                                                              | Fichiers |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| F22 | Le bypass admin (`attributes.role === 'admin'` → `true`) s'appliquait à **tous** les flags : un admin évaluant `workers-email-kill` obtenait `true` (tous les e-mails stoppés) et `workers-newsletter-dispatch` contournait un envoi volontairement coupé | haute    | `PROTECTIVE_FLAGS` + `isProtectiveFlag` : le bypass est ignoré pour les coupe-feux, qui sont lus réellement en base     | `flags.ts`, `server.ts` |
| F23 | `defaultFor` d'une clé inconnue renvoyait `undefined` : un flag mal orthographié n'était ni allumé ni éteint (faux « je ne sais pas » qui se propage)                                      | moyenne  | Registre fermé : clé inconnue → `false`                                                                                | `flags.ts` |
| F24 | `row.key in FLAGS` laissait entrer les clés héritées du prototype (`toString`, `constructor`, `__proto__`) dans la carte des flags, et `key in payload` évaluait de même une propriété héritée | moyenne  | `hasFlag` (`hasOwnProperty`) côté registre et côté payload ; une clé hors registre retourne `false` sans évaluation      | `flags.ts`, `server.ts` |
| F25 | `Boolean(val)` interprétait toute valeur : `'false'`, `'0'`, `1` activaient un flag pourtant coupé (côté payload **et** côté colonne `is_enabled`)                                        | moyenne  | Booléen strict : seuls `true`/`false` (ou `{ defaultValue: boolean }`) sont retenus, sinon défaut du registre          | `server.ts` |
| F26 | Le cache (`loadFlags`) et le registre (`FLAGS`) étaient mutables : un appelant pouvait corrompre l'état partagé de tous les rendus suivants ; le provider acceptait des clés inconnues et des valeurs `undefined` | faible   | Objets gelés (`Object.freeze`), copie défensive dans `createFlagsContext.getAll`, fusion filtrée dans le provider       | `flags.ts`, `server.ts`, `provider.tsx` |
| F27 | API morte : `useGrowthBook()` exporté renvoyait `null`, `__resetGrowthBookCache` dupliquait `__resetFlagsCache`                                                                            | faible   | Suppression des deux (aucun appelant dans le dépôt)                                                                     | `hooks.ts`, `index.ts`, `server.ts` |
| F28 | Le registre Go n'exposait pas `studio-stage-editor` (17 clés TS pour 16 Go) : le flag était invisible de l'API et de la console admin                                                     | moyenne  | Constante + défaut Go, et garde CI `guard:flags-parity` (test rouge observé avant le correctif)                         | `flags.go`, `scripts/guard-flags-parity.mjs`, `ci.yml` |

### Preuves exécutées

```bash
# 1. Rouge d'abord : parité TS ↔ Go (studio-stage-editor absent côté Go)
node scripts/guard-flags-parity.mjs                     # EXIT=1

# 2. Paquet : tests + couverture, types, lint
cd packages/flags && pnpm exec vitest run --coverage
# → 3 fichiers / 33 tests passés, EXIT=0 ; 100 % statements, 97,72 % branches
cd packages/flags && pnpm exec tsc --noEmit             # EXIT=0
cd packages/flags && pnpm exec eslint .                 # EXIT=0

# 3. Monorepo : les 25 projets consommateurs compilent
pnpm typecheck                                          # 25 successful, 25 total

# 4. Parité et compilation Go
node scripts/guard-flags-parity.mjs                     # 17 flags alignés — EXIT=0
cd apps/api && gofmt -l internal/flags/ && go vet ./internal/flags/ && go build ./internal/flags/  # EXIT=0
```

Un test existant verrouillait un défaut : `flags-server.test.ts` attendait
`true` pour une chaîne (`'string-value'`) sur un flag dont le défaut est
`false` — il validait donc `Boolean(val)`. Il asserte désormais le défaut du
registre.

### Reste à faire (lot L03)

| #   | Tâche                                                                                                             | Sévérité | Motif                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| R18 | Supprimer les alias de compatibilité (`useFlagIsOn`, `GrowthBookProvider`, `getGrowthBookPayload`)                | faible   | Aucun appelant : ils entretiennent une fausse filiation GrowthBook abandonnée.                            |
| R19 | Aligner la fraîcheur du cache : 60 s côté Next vs 30 s côté Go                                                    | faible   | Une bascule d'urgence peut rester 60 s en ligne côté rendu web. À trancher avec L30 (workers).            |
| R20 | Dériver `PROTECTIVE_FLAGS` du registre Go (marqueur « kill switch ») au lieu d'une liste manuelle                  | moyenne  | Deux listes à maintenir : le garde CI vérifie les clés, pas la sémantique de protection.                  |
| R21 | Vérifier dans L20–L23 qu'aucune décision d'autorisation ne repose sur un flag lu côté client                       | haute    | Un flag client est un affichage, jamais un contrôle d'accès : à prouver app par app.                      |

---

## Correctif immédiat — garde média des URLs d'images (L28/L29) — 2026-11-18

**Contexte.** Vérification demandée : « toute image doit passer par le module de
sécurité image ». Les uploads web (`/api/upload` de `core`, `studio`,
`tenants`, `admin`) passent bien par `uploadAndProcessMedia` (magic bytes,
modération `omni-moderation-latest`, anti-bomb, stripping EXIF, ré-encodage
WebP, hash CAS). Mais l'**écriture en base** acceptait encore des URLs distantes
non contrôlées.

| #   | Défaut                                                                                                                                                                                                                                  | Sévérité | Correctif                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F29 | `POST /v1/posts` acceptait n'importe quelle URL `http(s)` pour `imageUrl` (y compris le tableau JSON multi-images) et pour `attachments[].url` : seule `ValidateSafeURL` (schéma/SSRF) s'appliquait. Un client pouvait donc publier une image NSFW, un pixel de pistage ou un fichier polyglotte **sans jamais traverser** le module de sécurité image | haute    | `antispam.MediaPolicy` (`internal/antispam/media.go`) : hôtes CDN/Supabase uniquement, chemins relatifs acceptés, fail-closed sans origine configurée ; câblée dans `newRouter` via `posts.Handler.SetMediaPolicy` | 
| F30 | `apps/mobile/src/lib/upload.ts` téléverse avatars et bannières **directement** dans le bucket Supabase, sans magic bytes, sans modération, sans ré-encodage : le pipeline est contourné par le client mobile                              | moyenne  | **ouvert** — tâche R22 (nécessite un endpoint d'ingestion ou un proxy serveur)                                                                          |
| F31 | Couvertures d'articles via l'API créateur (`isValidImageURL` dans `creator/api_articles_crud.go`) et images du corps HTML d'article : hôtes externes acceptés, donc images non screenées                                                       | moyenne  | **ouvert** — tâches R23/R24 (décision produit : imports RSS/EPUB vs origine plateforme obligatoire)                                                     |

### Preuves exécutées

```bash
cd apps/api && go test ./internal/antispam/ -run 'TestMediaPolicy|TestNewMediaPolicy' -count=1
# → ok (11 cas : URL CDN/Supabase, tableau JSON, hôte trompeur, identifiants, fail-closed)
cd apps/api && go test ./internal/modules/posts/ -run 'TestSecGuard' -count=1
# → ok (image externe, pièce jointe externe, tableau JSON mixte → 400 UNSCREENED_MEDIA)
cd apps/api && go build ./... && go vet ./internal/antispam/ ./internal/modules/posts/ ./cmd/server/
# → EXIT=0
```

### Reste à faire (garde média)

| #   | Tâche                                                                                                                                                    | Sévérité | Motif                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| R22 | Faire passer les uploads mobiles (avatar/bannière) par le pipeline de sécurité (endpoint d'ingestion + modération)                                        | moyenne  | Aujourd'hui le mobile écrit directement dans le bucket : aucune modération, aucune normalisation.          |
| R23 | Trancher le contrat des couvertures d'articles de l'API créateur : origine plateforme obligatoire, ou ingestion modérée côté serveur                      | moyenne  | Les clients API et les imports peuvent légitimement fournir une URL externe ; il faut choisir et documenter. |
| R24 | Images externes dans le HTML d'article (imports) : ré-héberger à l'ingestion ou les neutraliser au rendu                                                  | moyenne  | Le corps HTML est stocké tel quel : une image distante y échappe à toute modération et peut pister.        |

---

## L04 — `@qoe/auth` — durci le 2026-11-18

**Périmètre.** `packages/auth/src/**` : `roles.ts`, `permissions.ts`, `media.ts`,
`current-user.ts`, `go-client.ts`, `mailer.ts`, `smtp.ts`, `redirect.ts`, `index.ts`
+ 4 fichiers de tests.
**Consommateurs.** `apps/{core,studio,admin,tenants,hi}`, `packages/sdk`
(Server Actions), `packages/ui` (garde d'affichage).
**Contrat serveur.** Go est la source de vérité (`CombinedAuth`, capacités
admin, `internal/permissions` média) : ce package ne fait que refléter la
hiérarchie pour l'UI et les Server Actions.
**Tests.** 26 tests verts, dont 10 dans `src/__tests__/hardening.test.ts`.

### Entrées auditées

| #   | Emplacement                        | Standard attendu                                                                | Verdict            |
| --- | ---------------------------------- | ------------------------------------------------------------------------------- | ------------------ |
| A01 | `roles.ts` → `hasRoleLevel`        | Hiérarchie stricte `superadmin > creator > user`                                | conforme           |
| A02 | `permissions.ts` → `can`           | Hérite des rôles inférieurs (un creator peut poster/lire)                       | **corrigé** (F36)  |
| A03 | `permissions.ts` → `require`       | Erreur typée `PermissionError`, jamais un booléen ignoré                        | conforme           |
| A04 | `permissions.ts` → `canEditArticle`, `canManageTenant` | Propriété vérifiée côté serveur, superadmin inclus                | conforme           |
| A05 | `media.ts` → `canMedia`            | Statut actif obligatoire ; **refus** d'override prioritaire sur l'accord         | **corrigé** (F37)  |
| A06 | `media.ts` → `isMediaAdmin`        | Rôle inconnu → jamais admin                                                     | conforme (défensif) |
| A07 | `current-user.ts` → `getCurrentUser` | 401/403/404 → `null` ; 5xx/timeout → erreur remontée (pas de fausse déconnexion) | **corrigé** (F38)  |
| A08 | `current-user.ts` → `requireUser`  | `?redirect=` limité à l'origine courante ; `x-invoke-path` validé               | **corrigé** (F38)  |
| A09 | `current-user.ts` → `requireRole`  | Hiérarchie (superadmin satisfait tout rôle) ; erreur typée                      | **corrigé** (F36)  |
| A10 | `go-client.ts` → `goFetch`         | `QOE_API_URL` lue à l'appel, timeout borné, `no-store`                          | **corrigé** (F38)  |
| A11 | `mailer.ts` → templates            | Toute donnée client échappée ; lien de bouton `http(s)` seulement                | **corrigé** (F35)  |
| A12 | `smtp.ts` → enveloppe & en-têtes   | Pas de CR/LF dans adresses/sujet (injection SMTP)                               | **corrigé** (F32)  |
| A13 | `smtp.ts` → AUTH                   | Jamais de mot de passe sans TLS (STARTTLS ou implicite)                         | **corrigé** (F33)  |
| A14 | `smtp.ts` → STARTTLS               | Erreurs/timeout rebranchés sur le socket chiffré                                | **corrigé** (F34)  |
| A15 | `redirect.ts` → `isSafeRedirectTarget` | Même origine obligatoire, module pur testable                               | **ajouté** (F38)   |

### Findings et correctifs

| #   | Défaut                                                                                                                                                                          | Sévérité | Correctif                                                                                                       | Fichiers |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| F32 | `smtp.ts` interpolait `msg.to`, `opts.from` et `msg.subject` sans contrôle : un `\r\n` dans une adresse terminait la commande `RCPT TO` et permettait d'injecter des lignes SMTP (`Bcc:`, `DATA`) | haute    | `envelopeAddress` (adresse nue validée) + `assertNoControl` sur l'enveloppe et le sujet, **avant** toute connexion | `smtp.ts` |
| F33 | AUTH LOGIN était tenté même quand le relais n'offrait pas STARTTLS : mot de passe en clair si le relais l'accepte (downgrade silencieux)                                        | haute    | Suivi de `tlsActive` ; AUTH refusé sans TLS sauf `allowInsecureAuth` explicite (relais de test)                  | `smtp.ts` |
| F34 | Après STARTTLS, le socket était remplacé sans rebrancher `error`/`timeout` : une erreur sur le socket chiffré devenait un événement `error` non géré (crash du process) et le timeout était perdu | moyenne  | `wire(socket)` réappliqué après l'upgrade                                                                        | `smtp.ts` |
| F35 | Les e-mails de sécurité interpolaient le nom, l'appareil, l'IP et l'adresse **bruts** dans le HTML, et le `href` du bouton n'était pas validé : injection HTML dans la boîte mail, `javascript:` possible | moyenne  | `escapeHtml` sur chaque donnée client, `safeHref` (`http`/`https` seulement), `rel="noopener noreferrer"`        | `mailer.ts` |
| F36 | `can()` comparait les rôles par égalité stricte : un `creator` n'avait pas `post:create`, `post:read`, `article:read` ni `billing:read:own` — la hiérarchie documentée n'était pas appliquée | moyenne  | `can()` et `requireRole()` passent par `hasRoleLevel`                                                            | `permissions.ts`, `current-user.ts` |
| F37 | Un override média `-perm` était ignoré si `perm` figurait aussi dans la liste : le refus ne primait pas                                                                    | faible   | Le refus est testé en premier                                                                                    | `media.ts` |
| F38 | Trois défauts d'intégration : `QOE_API_URL` figée à l'import (impossible à changer en test/script), `fetch` sans timeout ni `no-store`, `getCurrentUser` avalait les 5xx (déconnexion en boucle pendant une panne), et `?redirect=` acceptait n'importe quel `Referer` (redirection ouverte) | moyenne  | Lecture de l'env à l'appel + `AbortSignal.timeout(10 s)` + `cache: 'no-store'` ; remontée des erreurs non-auth ; `isSafeRedirectTarget` + chemin d'invocation validé | `go-client.ts`, `current-user.ts`, `redirect.ts` |

### Preuves exécutées

```bash
cd packages/auth && pnpm exec vitest run --coverage   # 4 fichiers / 26 tests — EXIT=0
cd packages/auth && pnpm exec tsc --noEmit            # EXIT=0
cd packages/auth && pnpm exec eslint .                # EXIT=0
pnpm typecheck                                        # 25 successful, 25 total
```

Un test existant supposait un relais SMTP en clair avec AUTH : il déclare
désormais `allowInsecureAuth: true` — l'absence de TLS est un choix explicite au
lieu d'un comportement par défaut.

### Reste à faire (lot L04)

| #   | Tâche                                                                                                                                  | Sévérité | Motif                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| R25 | Vérifier si `sendTransactionalEmail` doit respecter le coupe-feu `workers-email-kill` (aujourd'hui : non)                              | haute    | Les e-mails de sécurité partent hors file Go : pendant un arrêt d'urgence, ils continuent.                |
| R26 | Unifier l'envoi d'e-mails : le SMTP direct depuis Next contourne la file asynq (rate-limit, budgets, journal d'envoi)                  | moyenne  | Deux chemins d'envoi, deux comportements en cas d'incident.                                               |
| R27 | Garde CI de parité pour `MEDIA_ROLE_PERMISSIONS` (TS) ↔ `internal/permissions` (Go)                                                    | moyenne  | Même classe de divergence que les flags (F28) : la matrice est écrite deux fois.                          |
| R28 | Découper les sujets RFC 2047 (ligne > 75 caractères)                                                                                   | faible   | Un sujet long accentué peut être replié/mangé par certains relais.                                        |

---

## L05 — `@qoe/supabase` — durci le 2026-11-18

**Périmètre.** `packages/supabase/src/**` : `storage.ts`, `media-engine.ts`,
`cookie-config.ts`, `client.ts`, `server.ts`, `middleware.ts`, `sso.ts`,
`broadcast.ts`, `index.ts` + 4 fichiers de tests.
**Consommateurs.** `apps/{core,studio,admin,tenants,hi}` (uploads, session,
middleware), `packages/auth`, `packages/sdk`.
**Infra.** Le package ne connaît **aucun** domaine propriétaire : il reçoit
`NEXT_PUBLIC_SUPABASE_URL` (cloud **ou** Supabase auto-hébergé) et l'origine
média `NEXT_PUBLIC_MEDIA_CDN_URL` (Caddy self-hosted, Bunny, R2, imgproxy…).
**Tests.** 42 tests verts, dont 13 dans `src/__tests__/hardening.test.ts` et 3
de modération fail-closed.

### Entrées auditées

| #   | Emplacement                          | Standard attendu                                                                 | Verdict            |
| --- | ------------------------------------ | -------------------------------------------------------------------------------- | ------------------ |
| M01 | `storage.ts` → `resolveMediaCdnBase` | Origine média **configurable**, défaut déterministe, lue à l'appel                 | **ajouté** (F39)   |
| M02 | `storage.ts` → `toPublicImageUrl`    | Rewrite d'origine idempotent (ancien CDN reconnu), chemin préservé                 | **corrigé** (F39)  |
| M03 | `storage.ts` → `uploadImage`         | Aucun chemin d'upload direct au storage (contourne la modération)                 | **supprimé** (F40) |
| M04 | `storage.ts` → `buildImagePath`, `sanitize*` | Folder en allowlist, owner/extension assainis, pas de traversal            | conforme           |
| M05 | `cookie-config.ts` → `getCookieDomain` | Correspondance bornée par un point ; jamais d'IP ni d'hôte simple               | **corrigé** (F41)  |
| M06 | `client.ts`, `server.ts` → env       | Erreur explicite si URL/clé manquantes (self-hosted ou cloud)                     | **corrigé** (F45)  |
| M07 | `server.ts` → domaine de cookie      | `x-forwarded-host` prioritaire (bind address derrière Caddy)                       | **corrigé** (F41)  |
| M08 | `middleware.ts` → canonicalisation   | `localhost → lvh.me` **dev uniquement** (sonde de prod non cassée)                | **corrigé** (F42)  |
| M09 | `middleware.ts` → purge stale cookies | Purge double cible (domaine + host-only), pas de boucle                           | conforme           |
| M10 | `sso.ts` → `signJWT`/`verifyJWT`     | Secret non vide obligatoire ; `exp` numérique obligatoire                          | **corrigé** (F43)  |
| M11 | `broadcast.ts` → messages            | Événements d'auth en allowlist, message validé avant usage                         | **corrigé** (F44)  |
| M12 | `media-engine.ts` → `moderateImageBuffer` | Indisponibilité du filtre → **refus** (fail-closed), opt-in permissif        | **corrigé** (F45)  |
| M13 | `media-engine.ts` → `processAndSecureImage` | Magic bytes, anti-bomb, strip EXIF, WebP, hash CAS                         | conforme           |
| M14 | `index.ts`                           | `media-engine` hors barrel (sharp natif), server/middleware en sous-chemins        | conforme           |

### Findings et correctifs

| #   | Défaut                                                                                                                                                                          | Sévérité | Correctif                                                                                                       | Fichiers |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| F39 | `IMAGES_CDN = 'https://cdn.qoe.fi'` était figé dans le code : migrer vers Bunny/R2/imgproxy imposait de modifier et redéployer toutes les apps ; et une URL déjà réécrite subissait un second rewrite | moyenne  | `resolveMediaCdnBase()` lit `NEXT_PUBLIC_MEDIA_CDN_URL` (défaut inchangé), rewrite idempotent, tests de surcharge/défaut/idempotence | `storage.ts` |
| F40 | `uploadImage()` écrivait **directement** dans le bucket Supabase (hors `/api/upload`), donc sans magic bytes, sans modération, sans ré-encodage — et n'était utilisé nulle part | moyenne  | Fonction supprimée : un seul chemin d'upload subsiste (`uploadImageToRoute` → route serveur)                       | `storage.ts` |
| F41 | `getCookieDomain` utilisait `endsWith('qoe.fi')` (donc `evilqoe.fi` → `.qoe.fi`), posait un `Domain=` sur des IP ou des hôtes simples (cookie rejeté → session perdue) et ne préférait pas `x-forwarded-host` | haute    | Correspondance bornée (`host === d` ou `.d`), `isIpLiteral`, hôte sans point → `undefined`, `x-forwarded-host` prioritaire | `cookie-config.ts`, `server.ts`, `middleware.ts` |
| F42 | Le middleware redirigeait `localhost`/`127.0.0.1` vers `lvh.me` **même en production** : une sonde de santé sur `http://localhost:3000` recevait un 307 vers un domaine non résolu | moyenne  | Canonicalisation limitée à `NODE_ENV !== 'production'`                                                          | `middleware.ts` |
| F43 | `verifyJWT` acceptait un jeton **sans `exp`** (valide éternellement) et un **secret vide** (HMAC avec clé vide = forgeable) ; le secret manquant était masqué en `null` (confondu avec « jeton invalide ») | moyenne  | `assertSecret` hors du `try`, `exp` numérique obligatoire                                                        | `sso.ts` |
| F44 | Le canal `BroadcastChannel` déclenchait la logique d'auth sur n'importe quel message posté par un script de la page | faible   | `isAuthBroadcastMessage` : événement en allowlist + timestamp numérique                                           | `broadcast.ts` |
| F45 | La modération image était **fail-open** : clé absente en production, HTTP 5xx ou exception → `safe: true`, donc image publiée sans filtre. Et un env Supabase manquant donnait une erreur opaque | haute    | Mode `enforce` par défaut (`MEDIA_MODERATION_MODE=permissive` en opt-in), refus explicite avec message ; erreurs d'env explicites pour URL/clé | `media-engine.ts`, `client.ts`, `server.ts` |

### Preuves exécutées

```bash
cd packages/supabase && pnpm exec vitest run     # 4 fichiers / 42 tests — EXIT=0
cd packages/supabase && pnpm exec tsc --noEmit   # EXIT=0
cd packages/supabase && pnpm exec eslint .       # EXIT=0
pnpm typecheck                                   # 25 successful, 25 total
```

### Reste à faire (lot L05)

| #   | Tâche                                                                                                                                 | Sévérité | Motif                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| R29 | Vérifier en production `OPENAI_API_KEY` **et** le mode de modération avant déploiement                                               | haute    | Sans clé, les uploads sont désormais refusés (fail-closed) : c'est voulu, mais il faut le vérifier au déploiement. |
| R30 | Factoriser le CDN mobile (`apps/mobile/src/lib/upload.ts` duplique `IMAGES_CDN` et l'upload direct)                                    | moyenne  | Même règle de portabilité que F39, plus le contournement du pipeline (R22).                                |
| R31 | Ajouter `import 'server-only'` dans `server.ts`/`middleware.ts`                                                                       | faible   | Empêche un import client accidentel (aujourd'hui seule la doc l'interdit).                                |
| R32 | Migrer les URLs absolues stockées en base vers chemin + origine configurable                                                          | moyenne  | Une URL absolue fige le CDN dans les données (règle « portabilité d'infra »).                             |
| R33 | Vérifier les appelants de `verifyJWT` qui produiraient un jeton sans `exp`                                                            | faible   | Tous passent par `signJWT` (qui pose `exp`) ; à confirmer côté Go si un jeton y est émis.                   |

---

## L06a — `@qoe/sdk` noyau partagé — durci le 2026-11-18

**Périmètre.** `packages/sdk/src/client.ts`, `index.ts`, `mobile.ts`,
`query-keys.ts`, `embed/{embed,browser,index}.ts`,
`actions/utils/{go-client,safe-action,authz}.ts`, `utils/authError.ts`.
**Consommateurs.** Toutes les apps (`core`, `studio`, `admin`, `tenants`, `hi`),
`apps/mobile`, les sites tiers (embed).
**Tests.** 181 tests verts pour le package (dont 18 ajoutés :
`__tests__/hardening.test.ts` et `__tests__/embedBrowser.test.ts`).

### Entrées auditées

| #    | Emplacement                                 | Standard attendu                                                       | Verdict           |
| ---- | ------------------------------------------- | ---------------------------------------------------------------------- | ----------------- |
| K01  | `go-client.ts` → `goApiUrl`, `isGoEnabled`  | Origine Go **lue à l'appel**, sans slash final, `null` si absente       | **corrigé** (F46) |
| K02  | `go-client.ts` → `goRequest`                | Un seul chemin réseau (JSON, multipart, binaire, texte)                | **ajouté** (F53)  |
| K03  | `go-client.ts` → `goTimeoutMs`              | Délai borné (10 s par défaut, `QOE_API_TIMEOUT_MS`), jamais infini     | **ajouté** (F47)  |
| K04  | `go-client.ts` → `goFetch`                  | Statut + `code`/`action`/`level` du garde transportés, `no-store`       | conforme          |
| K05  | `go-client.ts` → `goFetchUpload`            | Pas de `Content-Type` manuel (boundary), mêmes garanties               | conforme          |
| K06  | `go-client.ts` → `goFetchBinary`, `goFetchRaw` | Statut relayé, aucun parse destructeur sur pièce signée              | conforme          |
| K07  | `go-client.ts` → `fetchMeWithSync`          | 404 → sync → relecture, autres erreurs propageées                      | conforme          |
| K08  | `safe-action.ts` → `safeAction`             | Auth requise par défaut, `code` propagé, 404 non journalisé            | conforme (R34)    |
| K09  | `authz.ts` → `AUTHZ_CODES`, `isStepUpCode`, `authzGuidance` | Registre fermé aligné sur le Go, messages actionnables | conforme          |
| K10  | `authz.ts` → `authzSecurityHref`            | Lien croisé sans domaine en dur                                        | conforme (R35)    |
| K11  | `client.ts` → `resolveApiBaseUrl`           | Config → env web/mobile → origine navigateur → 8090, aucun hôte figé   | **ajouté** (F48)  |
| K12  | `client.ts` → `request`                     | Retry GET/HEAD uniquement, `Retry-After`/`X-Request-Id` exposés        | conforme          |
| K13  | `client.ts` → `request` (délai)             | Timeout par défaut, signal appelant prioritaire                        | **corrigé** (F49) |
| K14  | `client.ts` → contrat d'URL                 | 60+ routes vérifiées par `client-urls.test.ts`                          | conforme          |
| K15  | `utils/authError.ts` → `isUnauthorizedError`| Pas de faux positif sur un identifiant contenant « 401 »               | **corrigé** (F50) |
| K16  | `embed/embed.ts` → validation               | `apiBase` http(s) borné, e-mail RFC-borné, slug assaini, URL de retour validée | conforme  |
| K17  | `embed/embed.ts` → `parsePopupResult`       | Seules `{ok:true}` / `{cancelled:true}` nues acceptées                  | conforme          |
| K18  | `embed/browser.ts` → `openQoeSubscribePopup`| Origine **et** fenêtre émettrices vérifiées, fermeture = annulation    | **corrigé** (F51) |
| K19  | `embed/browser.ts` → `subscribeEmail`       | Délai borné, message serveur jamais brut                               | **corrigé** (F52) |
| K20  | `index.ts` / `mobile.ts`                    | Barrel sans doublon ; mobile = surface sans dépendance serveur          | **corrigé** (F53) |

### Findings et correctifs

| #   | Défaut                                                                                                                                  | Sévérité | Correctif                                                                                                                  | Fichiers |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| F46 | `GO_API_URL` était capturé à l'import : une variable posée après le chargement du module (tests, script, SSR réutilisé, bascule de déploiement) était ignorée | moyenne | `goApiUrl()` lit `QOE_API_URL` à chaque appel, normalise le slash final ; `isGoEnabled()` en dérive | `go-client.ts`, `apps/admin/src/app/(admin)/admin/audit/export/route.ts` |
| F47 | Les cinq appels Go étaient sans timeout : un backend muet laissait une Server Action pendante jusqu'au timeout de la plateforme | haute | `goRequest` pose `AbortSignal.timeout(goTimeoutMs())` (10 s, surcharge `QOE_API_TIMEOUT_MS`) | `go-client.ts` |
| F48 | `QoeApiClient` visait `http://localhost:8080` par défaut alors que le backend Go écoute **8090**, et n'offrait aucun repli d'environnement pour le mobile | moyenne | `resolveApiBaseUrl` : config → `NEXT_PUBLIC_API_URL` / `EXPO_PUBLIC_API_URL` → origine navigateur → `localhost:8090` | `client.ts` |
| F49 | Aucune requête du client universel n'était bornée dans le temps | moyenne | `DEFAULT_REQUEST_TIMEOUT_MS` (15 s), `timeoutMs` configurable, `options.signal` prioritaire | `client.ts` |
| F50 | `isUnauthorizedError` testait `msg.includes('401')` : un message parlant de l'article 401 ou d'un compteur 401 déclenchait la déconnexion globale | moyenne | Seuls `status === 401`, `UNAUTHORIZED`, `Non autorisé`, `Unauthorized`, `HTTP 401` comptent | `utils/authError.ts` |
| F51 | La popup d'abonnement vérifiait l'origine du message mais pas `event.source` : n'importe quel cadre de la même origine pouvait clore l'abonnement à la place de la popup | haute | `event.source === popup` exigé en plus de l'origine | `embed/browser.ts` |
| F52 | `subscribeEmail` n'avait aucun délai : un backend muet bloquait le site tiers indéfiniment | faible | `AbortSignal.timeout(15_000)` par défaut, signal appelant prioritaire | `embed/browser.ts` |
| F53 | Quatre wrappers `fetch` dupliquaient URL/jeton/cache, et `index.ts` ré-exportait `shadow` deux fois (nommé + wildcard) | faible | `goRequest()` unique ; barrel nettoyé | `go-client.ts`, `index.ts` |

### Preuves exécutées

```bash
cd packages/sdk && pnpm exec vitest run     # 24 fichiers / 181 tests — EXIT=0
cd packages/sdk && pnpm exec tsc --noEmit   # EXIT=0
cd packages/sdk && pnpm exec eslint .       # EXIT=0
```

### Reste à faire (lot L06a)

| #   | Tâche                                                                                                             | Sévérité | Motif                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| R34 | `safeAction` avec `requireAuth: false` passe `user!` (possiblement `null`) typé `User` aux actions publiques       | moyenne  | Un accès `user.id` planterait à l'exécution ; à typer `User \| null` action par action.        |
| R35 | `authzSecurityHref` retombe sur `https://qoe.fi/settings`                                                | faible   | Sur un autre domaine (studio/admin, auto-hébergement) le lien croisé doit venir de la config d'app. |
| R36 | `getAccessToken` utilise `getSession()` et non `getUser()`                                                        | faible   | Le jeton est vérifié par le Go, mais une session révoquée peut être rejouée jusqu'à expiration. |
| R37 | `fetchMeWithSync` existe en double (`@qoe/auth` et `@qoe/sdk`)                                                    | faible   | Deux implémentations à maintenir ; à factoriser côté auth (sans import statique de `next/headers`). |
| R38 | Auditer `shadow.ts` / `entity-actions.ts` et les hooks d'optimisme                                                 | —        | Lot L06b.                                                                                     |
| R39 | Auditer les actions serveur par domaine (contrat Go, autorisation, validation)                                     | —        | Lot L06c.                                                                                     |
| R40 | `packages/devtools/src/go-client.ts` reproduit F46 et F47 (URL figée à l'import, aucun timeout)                   | faible   | Même défaut, package différent : à corriger dans le lot L17.                                   |

---

## L06b — `@qoe/sdk` store optimiste, hooks et `lib` — durci le 2026-11-18

**Périmètre.** `src/shadow.ts`, `src/entity-actions.ts`, `src/hooks/**`,
`src/lib/{useToggleMutationQueue,optimisticFeed,actionResult}.ts`.
**Consommateurs.** `apps/core`, `apps/studio`, `apps/admin`, `apps/mobile`
(shadow store via `@qoe/sdk/mobile`).
**Tests.** 198 tests verts pour le package (dont 12 ajoutés :
`shadowStore`, `optimisticCache`, `queryHooks`, `autoSaveSignature`).

### Entrées auditées

| #    | Emplacement                                   | Standard attendu                                                     | Verdict           |
| ---- | --------------------------------------------- | -------------------------------------------------------------------- | ----------------- |
| K21  | `shadow.ts` → `createShadowStore`             | Une fabrique (carte + EventEmitter par clé) pour les trois entités    | **ajouté** (F54)  |
| K22  | `shadow.ts` → `updatePostShadow`              | Clé vide rejetée (pas d'entrée `""`, pas de notification globale)     | **corrigé** (F54) |
| K23  | `shadow.ts` → `clearAllShadows`               | Purge des trois stores au changement de compte, abonnés réveillés     | **ajouté** (F55)  |
| K24  | `shadow.ts` → `withShadowMutation`            | Verrou anti double-clic, rollback, verrou libéré en `finally`         | conforme          |
| K25  | `entity-actions.ts` → `resolveEntityActions`  | Fonction pure, auth filtrée, registre déclaratif                      | conforme          |
| K26  | `entity-actions.ts` → `executeDefaultEntityMutation` | Refus serveur → rollback (via `withShadowMutation`)            | conforme          |
| K27  | `hooks/useOptimisticLike`                     | Les deux alias de compteur restent alignés                            | **corrigé** (F56) |
| K28  | `hooks/useOptimisticRepost`                   | Idem (`repostCount` / `repostsCount`)                                 | **corrigé** (F56) |
| K29  | `hooks/useOptimisticBookmark`                 | Idem (`isBookmarked` / `bookmarked`)                                  | **corrigé** (F56) |
| K30  | `lib/optimisticFeed.ts`                       | Parcours unique infinite/flat, snapshot et restauration exacts        | **ajouté** (F56)  |
| K31  | `hooks/useDeletePostMutation`                 | Un refus serveur ne masque jamais la pensée                           | **corrigé** (F57) |
| K32  | `lib/useToggleMutationQueue`                  | Deux toggles identiques consécutifs ne laissent pas de promesse pendante | **corrigé** (F58) |
| K33  | `hooks/useNotifications`                      | Refus → état d'erreur, pas une liste vide                             | **corrigé** (F59) |
| K34  | `hooks/useConversations`                      | Idem                                                                    | **corrigé** (F59) |
| K35  | `lib/actionResult.ts`                         | Déballage `ActionResult` : succès → données, refus → `Error`          | **ajouté** (F59)  |
| K36  | `hooks/useInfiniteFeed`                       | Auto-pagination sans boucle infinie ni rejet non géré                 | **corrigé** (F61) |
| K37  | `hooks/useAutoSaveArticle`                    | Empreinte couvrant tout le payload publié                             | **corrigé** (F60) |
| K38  | `hooks/useOptimisticFollow`                   | Snapshot/rollback des deux familles                                   | conforme (R42)    |
| K39  | `hooks/useSearch`                             | Erreurs propagées, curseurs opaques, pas de retry sur 503 sémantique  | conforme          |
| K40  | `hooks/useSubscriptionStatus`, `useRecommendations` | Échec HTTP → repli sûr (refus d'accès / liste vide)            | conforme (R43)    |

### Findings et correctifs

| #   | Défaut                                                                                                                                  | Sévérité | Correctif                                                                                                       | Fichiers |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| F54 | Trois stores d'optimisme copiaient la même mécanique (carte + écouteurs) ; `updatePostShadow('')` créait une entrée `""` qui notifiait tous ses abonnés | faible | Fabrique `createShadowStore(normalize)` unique, clé vide rejetée | `shadow.ts` |
| F55 | Aucun moyen de vider l'état optimiste : après déconnexion/reconnexion dans le même onglet, les « aimés / masqués / bloqués » du compte précédent restaient affichés | moyenne | `clearAllShadows()` purge les trois cartes et réveille les composants montés (testé via le hook) | `shadow.ts` |
| F56 | Like et repost ne mettaient à jour qu'un alias de compteur (`likeCount`, `repostCount`) alors que des surfaces lisent `likesCount`/`repostsCount` : deux compteurs contradictoires sur la même carte | moyenne | Primitives partagées `patchFeedEntities` + `nextCount` qui écrivent **les deux** alias et ne descendent jamais sous zéro | `hooks/useOptimistic*.ts`, `lib/optimisticFeed.ts` |
| F57 | `deletePostAction` est une `safeAction` : elle **résout** `{ok:false}` en cas de refus, donc `onSuccess` marquait la pensée supprimée alors qu'elle était toujours en ligne | haute | `mutationFn` lève sur `!res.ok`, le tombstone n'est posé qu'après succès | `hooks/useDeletePostMutation.ts` |
| F58 | File de toggles : deux demandes identiques consécutives rejetaient la tâche **déjà terminée** puis `continue` sans résoudre la nouvelle → promesse pendante à vie et `activeTask` incohérent | moyenne | Résout la tâche avec l'état confirmé et remet `activeTask` à `null` | `lib/useToggleMutationQueue.ts` |
| F59 | Notifications, compteur non-lu et conversations transformaient un refus (401/403/500) en `[]` ou `0` : l'UI affichait « rien à voir » au lieu d'une erreur, et une session expirée passait inaperçue | moyenne | `unwrapActionResult` lève une `Error` explicite → `isError`/`error` React Query | `lib/actionResult.ts`, `hooks/useNotifications.ts`, `hooks/useConversations.ts` |
| F60 | L'empreinte d'auto-save ignorait `coverAlt` et `coverDecorative` : modifier seulement l'accessibilité de la couverture ne déclenchait aucune sauvegarde | moyenne | Les deux champs entrent dans la signature | `hooks/useAutoSaveArticle.ts` |
| F61 | Auto-pagination : `fetchNextPage()` lancé sans `catch` (rejet non géré) et sans condition de progrès — une page entièrement filtrée avec `hasMore` bouclait indéfiniment | moyenne | Garde sur la taille de la dernière page + `.catch()` explicite | `hooks/useInfiniteFeed.ts` |

### Preuves exécutées

```bash
cd packages/sdk && pnpm exec vitest run     # 28 fichiers / 198 tests — EXIT=0
cd packages/sdk && pnpm exec tsc --noEmit   # EXIT=0
cd packages/sdk && pnpm exec eslint .       # EXIT=0
```

### Reste à faire (lot L06b)

| #   | Tâche                                                                                                    | Sévérité | Motif                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| R41 | Brancher `subscribeToAuthBroadcast` (aucun consommateur aujourd'hui) et appeler `clearAllShadows()` sur `SIGNED_IN`/`SIGNED_OUT` | moyenne | La purge existe mais n'est encore déclenchée par personne : la synchronisation multi-onglets est morte. |
| R42 | `useOptimisticFollow` ne patche que les caches plats (`u.id === creatorId`)                                | faible   | Un profil imbriqué (`{ profile: … }`) n'est pas mis à jour ; élargir le prédicat.                |
| R43 | `useSubscriptionStatus` transporte l'e-mail en paramètre d'URL et `useRecommendations` avale les erreurs HTTP | faible | PII dans les journaux d'accès ; et un 500 doit être visible côté UI.                             |
| R44 | Auditer les actions serveur par domaine (`actions/**/index.ts`)                                           | —        | Lot L06c.                                                                                        |

---

## L06c — `@qoe/sdk` actions à fort trafic — durci le 2026-11-18

**Périmètre.** `actions/feed/index.ts` (1 087 l.), `actions/articles/index.ts`
(970 l.), `actions/tenant/index.ts` (290 l.), `actions/search/index.ts`
(316 l.), `actions/dashboard/index.ts` (189 l.) + `lib/shareUrl.ts`.
**Méthode.** Passe systémique sur la classe de défaut dominante de ces fichiers
(composition d'URL vers le Go), puis relecture des actions publiques
(`requireAuth: false`) et des chemins d'autorisation.
**Tests.** 204 tests verts pour le package (dont 6 ajoutés : `shareUrl`).

### Entrées auditées

| #    | Emplacement                                   | Standard attendu                                                    | Verdict           |
| ---- | --------------------------------------------- | ------------------------------------------------------------------- | ----------------- |
| K41  | `feed` → `toggleLike/Repost/Pin/Delete/Reply/Thread` | Paramètre de chemin encodé (`encodeURIComponent`)             | **corrigé** (F63) |
| K42  | `feed` → `toggleBookmarkArticleHomeAction`    | Idem                                                                | **corrigé** (F63) |
| K43  | `feed` → `removeFollowerAction`               | Déjà encodé                                                         | conforme          |
| K44  | `feed` → actions publiques (`requireAuth: false`) | Aucune mutation exposée sans session                            | conforme          |
| K45  | `articles` → `delete/review/discard`          | `id` encodé (le paramètre `activePublisherId` l'était déjà)          | **corrigé** (F63) |
| K46  | `articles` → catégories (create/update/move/delete) | `id` encodé                                                   | **corrigé** (F63) |
| K47  | `articles` → commentaires (post/delete/list)  | `articleId`/`commentId` encodés                                     | **corrigé** (F63) |
| K48  | `articles` → `searchArticleAuthorsAction`     | `URLSearchParams` (encodage natif)                                  | conforme          |
| K49  | `tenant` → `quotePassageToFeedAction`         | URL de partage = origine réelle de la publication, sans domaine en dur | **corrigé** (F62) |
| K50  | `tenant` → newsletter / follow / wallet       | Validation locale puis Go, aucune confiance au client sur l'état     | conforme          |
| K51  | `search` → `searchAllAction`                  | `q` encodé une seule fois, `limit` borné                             | **corrigé** (F64) |
| K52  | `search` → pages thoughts/articles/users      | Curseurs opaques relayés, pas de re-calcul                           | conforme          |
| K53  | `dashboard` → clés API (revoke/rotate)        | `id` encodé                                                          | **corrigé** (F63) |
| K54  | `lib/shareUrl.ts`                             | Sous-domaine vs domaine propre vs racine configurable                | **ajouté** (F62)  |

### Findings et correctifs

| #   | Défaut                                                                                                                                  | Sévérité | Correctif                                                                                                     | Fichiers |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| F62 | La citation d'un article composait `https://{customDomain}.qoe.fi/article/{slug}` : **lien mort** pour tout créateur à domaine propre, et `qoe.fi` était figé dans le code | haute | `resolveArticleShareUrl` : domaine propre servi tel quel, sous-domaine qualifié non doublé, racine via `NEXT_PUBLIC_TENANT_DOMAIN`, slug encodé, 6 tests | `lib/shareUrl.ts`, `actions/tenant/index.ts` |
| F63 | Sept actions composaient un chemin Go avec un identifiant **non encodé** (`/v1/posts/${postId}/like`, `/v1/articles/${id}`, `/v1/categories/${id}`, `/v1/articles/comments/${commentId}`, `/v1/settings/api-keys/${id}`) : un `?` ou `/` dans l'identifiant détournait la requête et ses paramètres | moyenne | `encodeURIComponent` sur chaque segment (feed, articles, catégories, commentaires, clés API) | `actions/{feed,articles,dashboard}` |
| F64 | `actions/search` transmettait `limit` brut (`NaN`, négatif ou 100 000) au backend | faible | Entier borné à `1…50`, défaut 20 sur valeur non numérique | `actions/search/index.ts` |

### Preuves exécutées

```bash
cd packages/sdk && pnpm exec vitest run     # 29 fichiers / 204 tests — EXIT=0
cd packages/sdk && pnpm exec tsc --noEmit   # EXIT=0
cd packages/sdk && pnpm exec eslint .       # EXIT=0
pnpm typecheck                              # 25 successful, 25 total
```

### Reste à faire (lot L06c)

| #   | Tâche                                                                                          | Sévérité | Motif                                                                                       |
| --- | ------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------- |
| R45 | Auditer les 38 actions restantes (admin, legal, billing, highlights, ebooks, appeals, support, workspace, entitlements, ai) | —        | Lot L06d : mêmes axes (encodage, autorisation, contrat Go) sur les domaines à moindre trafic. |

---

### L06d — actions restantes (premier passage 2026-11-18)

Ordre : d'abord les domaines où une erreur coûte cher (argent, droits,
session), puis le contenu (highlights, ebooks, workspace), puis le reste.

| #   | Trouvaille                                                                                                                                  | Sévérité | Statut |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| F72 | `actions/admin` : l'en-tête affirmait « toutes les actions vérifient `verifySuperadmin()` » — aucune vérification TS n'existe, l'autorisation est portée par le Go. Un lecteur pouvait croire qu'un garde existait et en ajouter un second, divergent. | doc     | corrigé (en-tête dit la vérité, renvoie à `adminauthz`) |
| F73 | `suspendUserAction` : ban Auth en échec ⇒ base suspendue, message anglais, aucun retour arrière. Compensation ajoutée (PATCH `isSuspended:false`) + message qui décrit l'état réel. | haute   | corrigé |
| F74 | `unsuspendUserAction` ignorait l'erreur de `updateUserById` ⇒ compte « rétabli » en base mais incapable de se connecter (ban Auth toujours actif), en silence. Erreur levée, action documentée idempotente. | haute   | corrigé |
| F75 | `revalidatePath('/admin/creators')` ×3 : cette route n'existe pas (la console expose `/admin/users`) ⇒ cache admin jamais invalidé après suspend/certif/shadowban. | moyenne  | corrigé |
| F76 | `logoutAction` ignorait l'erreur de `signOut()` ⇒ « déconnecté » affiché avec un cookie de session toujours valide. | haute   | corrigé |
| F77 | `getAdminClient()` passait `undefined` au constructeur Supabase quand l'env manquait ⇒ erreur opaque. Erreur explicite nommant les deux variables. | basse    | corrigé |
| F78 | `createHighlightAction` déclarait `isOfficial` dans son entrée sans jamais l'envoyer : paramètre fantôme qui laissait croire qu'un lecteur pouvait publier une annotation « officielle ». Retiré du contrat (l'officialité est décidée par le Go). | moyenne  | corrigé |
| F79 | `revalidatePath('/article')` ×6 : aucune route de ce nom (tenant `/{cat}/{slug}`, core `/{owner}/a/{slug}`) ⇒ invalidation fantôme. Appels retirés, remplacés par le suivi R52 (tags). | moyenne  | corrigé |
| F80 | `workspace` : le garde `!publisherId.startsWith('usr_')` testait un préfixe qui n'existe nulle part (les identifiants sont des UUID) — il laissait donc passer un `publisherId = userId` si le Go régressait. S'appuie désormais sur le contrat explicite du Go (`""` quand la publication n'existe pas), verrouillé par un test d'intégration Go. | moyenne  | corrigé |
| F81 | `appeals` et `support` construisaient `?limit=${limit}` sans borne : `limit=100000` transformait une page en export, `limit=NaN` produisait un 400 opaque. Util partagé `utils/pagination.ts` (`normalizePage` : 1…100, offset ≥ 0, rejet NaN/Infinity), 6 tests. | moyenne  | corrigé |
| F82 | `threadgates` : `revalidatePath('/post')` — route inexistante (le fil est `/post/[id]`), même classe que F79. Appel retiré, R52 étendue aux fils. | basse    | corrigé |
| F83 | `notifications` : `filter` était interpolé brut dans la query string (`filter: 'all&limit=9999'` réécrivait la requête). Validé contre la liste du Go puis encodé ; `limit` borné par `normalizePage`. | moyenne  | corrigé |
| F84 | `markNotificationsAsReadAction` poussait un tableau d'ids arbitraire (taille et doublons non bornés) dans un `UPDATE … = ANY(...)`. Déduplication + plafond 500. | basse    | corrigé |
| F85 | `apps/studio` : `workspace-cookie.test.ts` attendait encore l'ancien flux à deux appels (`/v1/workspaces/active` puis `/v1/me/publisher`) et un `publisherId: 'usr_1'` de test ⇒ **test rouge sur `dev`**. Réaligné sur le contrat actuel (un appel, confiance au Go, repli seulement si `publisherId` vide), + cas `fallbackFromMediaId`. | moyenne  | corrigé |
| F86 | `'use server'` ne peut exporter que des fonctions **async**. Les helpers purs ajoutés à `actions/notifications` (constantes + `normalizeNotificationFilter`) passaient `tsc`, `eslint` et `vitest`, mais cassaient la compilation de `apps/core` (`Export … doesn't exist in target module`). Déplacés dans `actions/utils/notification-filter.ts` ; seul le type est re-exporté. | haute    | corrigé — **règle** : tout nouvel export d'un module `'use server'` se prouve par un build (ou l'E2E), jamais par le seul typecheck |
| F87 | Suite Go : sur une base de test **persistante** (`TEST_DATABASE_URL`), le deuxième run échoue en 23505/23503 alors que le code est sain (packages à ids fixes, `SubscriptionGrant` non truncaté). `QOE_TEST_DB_RESET=1` recrée le schéma public avant migrations ; `seedNewsletterEnv` tronque `SubscriptionGrant`. | moyenne  | corrigé — preuve : `search` + `newsletters` deux fois de suite sur la même base ⇒ ok / ok |

Cinq tests (`adminActions.test.ts`) verrouillent l'ordre « Go d'abord » (aucun
ban si le Go refuse), la compensation et la remontée d'erreur d'unban ; quatre
tests (`notificationsActions.test.ts`) verrouillent le filtre, la borne de
`limit` et le plafond d'ids lus.

**Preuves exécutées le 2026-11-18** (Mac → VPS Hetzner de dev, tunnel SSH
`15409`/`6379`, base `qoe_test`) :

| Commande | Résultat |
| -------- | -------- |
| `pnpm exec vitest run` (SDK) | 221 tests / 32 fichiers, vert |
| `pnpm test` (workspace, turbo) | 22/22 tâches, exit 0 après F85 |
| `go test -p 1 -count=1 ./cmd/... ./internal/...` | suite complète sur base **vierge** (`qoe_test_full_test`, tunnel `15409`) : **82 packages ok, 0 échec, exit 0** (~35 min, packages sérialisés) |
| `pnpm exec playwright test --project=public-web --project=core-journeys` | **15/15 verts, exit 0** (9 min, `--workers=2`) — nécessite les tunnels SSH `15409` (DB) **et** `DATABASE_URL` exporté (les specs lisent la base directement), + `6379` (Redis, sinon 5 tentatives de connexion par requête) |

| #   | Tâche                                                                                                       | Sévérité | Motif |
| --- | ----------------------------------------------------------------------------------------------------------- | -------- | ----- |
| R50 | `legal` : `fetchLegalDocumentsToAccept` renvoie `[]` en cas de panne ⇒ l'inscription passe sans cases à cocher (fail-open sur le consentement). Trancher : bloquer l'inscription (fail-closed) ou accepter puis re-demander au portail, avec trace. | produit  | Décision juridique/produit, pas technique : le comportement actuel est un choix assumé mais non écrit. |
| R51 | `actions/ai`, `ebooks`, `workspace` : vérifier le contrat Go (quotas, taille, types MIME) avant d'écrire des gardes TS redondantes. | —        | Suite du lot L06d. |
| R52 | Invalidation par tag (`article:{id}`, `post:{id}`) au lieu de chemins legacy : les mutations de surlignage/annotation/réponse masquée ne rafraîchissent aujourd'hui rien côté serveur (F79, F82). | moyenne | Demande un `unstable_cache`/`cacheTag` dans les pages core et tenants ; à faire d'un bloc pour éviter les invalidations globales. |
| R54 | `playwright.visual.config.ts` : 21/26 cas échouent en `toHaveScreenshot` sur macOS (1–2 % de pixels, hauteurs 1 px différentes) alors qu'aucune primitive n'a changé — les baselines ont été générées ailleurs (rendu de police différent). Rejouer/regénérer les baselines **dans l'environnement de référence** (CI Linux, même image que le job), sinon la suite reste un faux rouge permanent. | moyenne | Bloqué sur choix d'environnement de référence — ne pas mettre à jour les snapshots depuis macOS. |
| R53 | `playwright.config.ts` accepte n'importe quel `DATABASE_URL` : quand la base n'est pas joignable depuis le poste (cas du VPS derrière un pare-feu), les parcours échouent en `ETIMEDOUT` après 2 min au lieu d'un échec immédiat et lisible. Ajouter un préflight (connexion + message « tunnel SSH requis »). | basse | Gagne du temps à chaque campagne ; découvert en lançant l'E2E sans tunnel actif. |

---

## L07a — `@qoe/ui` primitives & composants partagés — premier passage 2026-11-18

**Périmètre de ce passage.** Axe 8 (portabilité d'infra) et axe 5 (résilience
du rendu) sur `image-utils.ts`, `SafeImage`, `SafeAvatar`, `ui/**` et les
`next.config.ts` des cinq apps. Le reste des primitives est listé en R55.

| #   | Défaut | Sévérité | Statut |
| --- | ------ | -------- | ------ |
| F96 | **L'origine des médias était recopiée à la main** : les cinq `next.config.ts` listaient `cdn.qoe.fi` / `**.supabase.co`, et `canOptimizeImageSrc()` la recopiait une sixième fois. Conséquence mesurable : basculer `NEXT_PUBLIC_MEDIA_CDN_URL` vers Bunny/Cloudflare/imgproxy ne changeait **rien** au rendu — toutes les images restaient `unoptimized`, en silence, et le motif manquait dans Next (règle « CDN interchangeable » d'`AGENTS.md`). | haute | corrigé — une seule source : `mediaImageHosts`, `matchesImageHost`, `isOptimizableImageHost`, `mediaRemotePatterns` dans `@qoe/supabase/storage`, consommées par `@qoe/ui` **et** les cinq configs ; garde CI `guard:media-origin` |
| F97 | `canOptimizeImageSrc` déclarait optimisables des schémas que Next ne sait pas lire : une URL `blob:` (aperçu local d'un upload via `ImageUploader`) ou `file:` partait à l'optimiseur et l'image ne s'affichait pas du tout. Le test `!^https?://` renvoyait `true` pour **tout** le reste. | moyenne | corrigé — schéma explicite (`blob:`, `file:`, `ftp:` refusés), chemins relatifs seuls optimisés sans configuration |
| F104 | `ui/color-picker` : la surface saturation/luminosité et le curseur de teinte n'étaient que des `div` avec des handlers `pointer*` — **aucun accès clavier** à la couleur, seul le champ hexadécimal restait utilisable sans souris (les deux écrans de réglages du Studio passent par ce composant). Les deux zones sont maintenant des `role="slider"` avec bornes annoncées, flèches (±1, ±10 avec Maj) et Début/Fin ; le calcul est une fonction pure `adjustHsvFromKey` testée sans DOM. | moyenne | corrigé — 5 cas (déplacement, Maj, bornes 0–100, bouclage 360°, touches ignorées) |
| F105 | `primitives/color` : `toHex('')` renvoyait la chaîne vide, donc une valeur de formulaire initialisée à `''` partait telle quelle à react-aria (`Invalid color`) et faisait tomber l'écran. Vide ou blanc = couleur absente = valeur par défaut. | haute | corrigé — test `survit à une valeur vide` |
| F101 | `TimePickerInput` posait `preventDefault()` sur **toutes** les touches sauf Tab : ⌘/Ctrl+C, ⌘A, ⌘V, Retour arrière et **Entrée** étaient morts dans les deux champs d'heure du composeur de pensées (impossible de valider le popover au clavier depuis le champ). Le champ ne prend plus que les flèches et les chiffres. | moyenne | corrigé — `time-picker-input.test.tsx` (4 cas : raccourcis rendus, Entrée/Retour arrière rendus, flèche haut, composition de deux chiffres) |
| F102 | `ImageEditorDialog` : sur la zone de recadrage, « R » et « 0 » sont des raccourcis maison, mais ⌘R (recharger) et ⌘0 (zoom système) étaient avalés puisque `preventDefault` ne regardait pas les modificateurs. | basse | corrigé — les combinaisons ⌘/Ctrl/Alt repartent au navigateur |
| F103 | `ThemeToggle` : le libellé accessible était « Toggle theme » (anglais codé en dur dans un produit francophone), et la bascule se faisait sur `theme` — qui vaut `system` par défaut chez next-themes — donc un premier clic sur un écran déjà sombre posait « dark » : **aucun changement visible**, il fallait cliquer deux fois. Bascule désormais sur `resolvedTheme`, avec `aria-pressed`. | moyenne | corrigé — `theme-toggle.test.tsx` (3 cas, dont le cas « system + OS sombre ») |
| F99 | `useExitInterstitial()` hors provider ouvrait `window.open(url)` **sans validation** : un `javascript:` ou un `data:` passait tel quel (le dialogue, lui, validait via `parseExternalUrl`). Et `ExternalLinkInterceptor` consommait aussi les clics modifiés : Cmd/Ctrl-clic (ouvrir dans un onglet) affichait un dialogue à la place. | moyenne | corrigé — repli validé par `parseExternalUrl`, clics modifiés rendus au navigateur |
| F100 | `HoldToDeleteButton` : un maintien clavier (Espace) qui perdait le focus (Tab, changement de fenêtre) continuait son compte à rebours et supprimait pendant qu'on ne regardait plus. `onBlur` annule désormais, comme le relâchement. | moyenne | corrigé — test `annule quand le focus quitte le bouton` |
| F98 | `SafeImage` : le repli était conditionné à `fallbackSrc && !hasError` **dans la branche `hasError`** — donc jamais affiché après une erreur ; seul le cas « pas de source » l'utilisait. Une vignette morte affichait l'icône alors qu'un `fallbackSrc` était fourni. Ajout : deux échecs distincts (`primary`, `fallback`) puis icône, et remise à zéro de l'erreur quand `src`/`fallbackSrc` change (le feed réutilise les mêmes instances de carte, une image morte condamnait toutes les suivantes dans `SafeImage` **et** `SafeAvatar`). | moyenne | corrigé — `safe-image.test.tsx` (3 cas) + 1 cas dans `safe-avatar.test.tsx` |

**Deuxième passage (2026-11-18) — les 83 fichiers de `primitives/**` et
`ui/**` lus un par un.** Chaque fichier a été ouvert en entier, appelants
réels compris ; sept composants portaient un défaut observable, corrigé ici
avec son test.

| #   | Défaut | Sévérité | Statut |
| --- | ------ | -------- | ------ |
| F106 | `primitives/radio-group` (`RadioCards`) : ni `Label` ni `Text` react-aria — le groupe n'avait **aucun nom accessible** (annoncé « groupe de boutons radio » dans les formulaires d'onboarding), la `description` était du texte mort et `errorMessage` n'était jamais rendu, donc un groupe invalide ne disait pas pourquoi. | haute | corrigé — `Label` + `Text slot="description"` / `slot="errorMessage"`, `isInvalid` déduit du message, puce décorative `aria-hidden` ; 2 tests (`nomme le groupe depuis label`, `marque le groupe invalide et annonce le message d’erreur`) |
| F107 | `Switch` **et** `Checkbox` : libellé et description vivent dans le même `<label>`, donc le nom accessible valait « NotificationsUn courriel à chaque nouvel abonné » (reproduit par le message d'erreur du test). Un lecteur d'écran annonçait le paragraphe d'aide à chaque tabulation. | moyenne | corrigé — `aria-label` sur le titre + `aria-describedby` vers la description, `useId` ; 2 tests (`expose la description séparément du nom accessible`) |
| F108 | `primitives/tabs` : `role="tooltip"` posé sur l'info-bulle **visuelle** des onglets en icône seule — un rôle ARIA qui promet une relation `aria-describedby` inexistante, et une annonce « infobulle » sans contenu sur des onglets normaux. | basse | corrigé — `data-visual-hint` (indice visuel pur, plus de rôle) ; test `nomme un onglet en icône seule, sans faux role="tooltip"` |
| F109 | `ui/tooltip` : **aucune infobulle du produit ne s'ouvrait.** `TooltipTrigger` passait un `<button>` nu à `AriaTooltipTrigger`, qui ne clone que des composants acceptant ses props ; aucun gestionnaire n'était posé (vérifié sur le DOM : zéro `pointerenter`/`focus`) — l'icône « (i) » des fonctionnalités à venir et toutes les barres d'outils en icônes étaient muettes. `TooltipProvider` était par ailleurs un fragment inerte : son `delay` n'était lu par personne. | haute | corrigé — déclencheur enveloppé dans `Focusable`, `TooltipDelayContext` + `resolveTooltipDelay(delay, providerDelay)` (infobulle > provider > 300 ms) ; 2 tests de comportement (ouverture au focus + `aria-describedby`, fermeture à Échap) et 3 cas unitaires sur la résolution du délai |
| F110 | `ui/sheet` : `SheetContent` acceptait `side` et `showCloseButton` sans jamais les lire (panneau **toujours** à droite, bouton de fermeture toujours présent) et `Sheet` n'exposait pas `side` — un panneau latéral gauche était impossible à demander. | moyenne | corrigé — `side` porté par `Sheet` (défaut `right`), props mortes retirées de `SheetContent`, appelant `ThoughtComposer` réaligné ; 2 tests (`ouvre à gauche quand on le demande`) |
| F111 | `ui/craft-sidebar-drawer` : fermé, le sommaire restait dans l'ordre de tabulation (ni `inert` ni `tabIndex=-1`) — Tab traversait un panneau invisible ; un chapitre sans `href` était rendu comme un lien sans destination ; `new IntersectionObserver` sans garde plantait hors navigateur ; le chapitre actif n'était jamais mis à jour. | moyenne | corrigé — `inert`/`tabIndex=-1` quand fermé, `<button type="button">` pour les entrées sans lien, garde d'observateur, `setActiveHeadingId` réellement appelé ; 2 tests (`sort le sommaire du focus quand il est fermé`, `rend un vrai bouton pour un chapitre sans lien`) |
| F112 | `PreviewableUserAvatar` : la branche « avec carte de survol » rendait `UserAvatar` **sans** lui transmettre `onClick` — le même avatar ouvrait le profil sans `username`, et ne faisait plus rien dès qu'un `username` activait la carte. | moyenne | corrigé — `onClick` transmis dans les deux branches ; 2 tests (`transmet onClick quand la carte de survol est active` / `désactivée`) |
| F114 | `ui/popover` : `PopoverClose` était un `<span>` avec `onClick` — ni rôle, ni focus, ni Entrée/Espace : fermeture impossible au clavier ; `alignOffset` était déclaré et documenté mais jamais transmis (prop fantôme). | basse | corrigé — `AriaButton slot="close"` (vrai `<button type="button">`), `alignOffset` retiré du contrat (aucun appelant) ; test `rend un bouton atteignable au clavier` |
| F113 | `packages/sdk/actions/notifications` : `export type { NotificationFilter }` dans un module `'use server'` — **garde CI rouge** (`arch:audit` : « 1 ré-export de type dans un module use server »), la classe de bug qui casse le manifeste des Server Actions sous Turbopack. | haute | corrigé — le type reste dans `actions/utils/notification-filter`, ré-exporté par le barrel `@qoe/sdk` (module pur, pas `'use server'`), consommateur `useNotifications` réaligné ; preuve : `pnpm arch:audit` ❌ 1 ré-export → ✅ 0 anomalie |

| F115 | `primitives/date` : les quatre champs (`DateField`, `TimeField`, `DatePicker`, `DateRangePicker`) acceptent `hideLabel`, qui rendait un `<span class="sr-only">` **que rien ne référençait** — le contrôle perdait son nom accessible dès que le libellé était masqué (annoncé « groupe », sans plus). Défaut de l'API publique, **latent chez les appelants** : aucun écran ne passe aujourd'hui `hideLabel` à un champ de date (vérifié par grep sur `apps/**`), l'éditeur utilise `DatePicker`/`TimeField` avec libellé visible. | moyenne | corrigé — `aria-label` posé quand `hideLabel` ; test `garde un nom accessible quand le libellé est masqué` (échoue avant : « Unable to find an accessible element with the role \"group\" and name \"Date de publication\" ») |
| F116 | `primitives/timeline` : `<time>` était rendu même sans `dateTime`, avec un contenu (« 14 nov. 18:42 », « hier ») qui n'est pas une date machine — balisage invalide, et des lecteurs d'écran tentent d'en parser le texte. | basse | corrigé — `<time dateTime>` seulement quand la valeur machine existe, sinon `<span>` de même style ; test `n’utilise pas <time> quand aucune valeur machine n’est fournie` |

| F117 | `ui/hover-card` : le contenu est portailé dans `document.body`, donc **après la page entière** dans l'ordre du document. Tab depuis le déclencheur partait sur le voisin suivant (le focus quittait la carte, qui se refermait) : le bouton « Suivre » de `ProfileHoverCard` n'était atteignable qu'à la souris, alors que le déclencheur est focusable. Aucun Échap, et sortir par le bas ne refermait pas. | haute | corrigé — Tab entre dans le premier élément du contenu, Maj+Tab revient au déclencheur (carte ouverte), Échap referme en rendant le focus, la sortie par le bas referme ; survol différé et fermeture annulable inchangés. Test `hover-card.test.tsx` (4 cas) : **4 échecs avant** correctif, verts après, et les 11 cas de `profile-hover-card.test.tsx` restent verts |

| F118 | `ui/BentoPlateau` : `BentoItem` portait `onClick` **et** `cursor-pointer` sur un `motion.div` sans rôle, sans `tabIndex` ni activation Entrée/Espace — une affordance de clic que seul un pointeur pouvait honorer. **Aucun appelant ne passait `onClick`** (`wizard.tsx`, `LoginFormBento`) : la promesse était purement décorative. | moyenne | corrigé — affordance retirée (plus de `onClick`/`onMouseEnter`, plus de `cursor-pointer`) : l'item reste une mise en page, l'interaction se compose dans le contenu avec un vrai `<button>`. Test `bento-plateau.test.tsx` (3 cas) : `n’affiche pas de curseur de clic sans action` **échoue avant** (« expected 'relative rounded-[28px] overflow-hidden cursor-pointer…' not to contain 'cursor-pointer' »), vert après ; aucun arrêt de tabulation mort et rendu des deux états verrouillés |

**Troisième passage (2026-11-18) — statut nominatif du périmètre R55.**
Chaque ligne = fichier lu en entier, appelants réels inspectés, test de
régression exécuté (les fichiers de test cités sont nommés).

| Composant | Fichiers audités | Statut |
| --------- | ---------------- | ------ |
| combobox / autocomplete | `primitives/combobox/{combobox,autocomplete}.tsx` | sain — un seul filtre (NFD, accents ignorés) avec `defaultFilter={() => true}`, `allowsEmptyCollection`, valeur libre rendue en chaîne, croix en `<button>` nu (ne vole pas le rôle de déclencheur) ; 6 cas dans `inputs-complexes.test.tsx` |
| date / calendar | `primitives/date/{calendar,date-picker}.tsx` | **corrigé (F115)** — grille en `<table>` + `display:grid`, navigation clavier react-aria, cellules hors bornes barrées, bouton calendrier nommé ; nom accessible rétabli quand `hideLabel` ; 9 cas dans `dates.test.tsx` |
| pagination | `primitives/pagination/pagination.tsx` | sain — `paginationRange` pur (pas d'ellipse inutile, bornage), `aria-current="page"`, libellés « Page n », flèches désactivées aux extrémités ; 6 cas dans `contract-pieces.test.tsx` |
| toast | `primitives/toast/toast.tsx`, `ui/toast.tsx` | sain — région live `aria-label="Notifications"`, file bornée à 4, fermeture au clavier, action qui referme ; adaptateur `toast.*` = un seul endroit à changer ; 4 cas dans `overlays.test.tsx` |
| feature-* | `ui/{feature-catalog,feature-teaser,feature-interstitial}.tsx` | sain — catalogue typé FR/EN (aucune copie partielle ne compile), badge `<button>` ou libellé (jamais un bouton mort hors provider), contenu verrouillé `inert`, une seule vue par ouverture ; 11 cas dans `feature-announcement.test.tsx` |
| drawer | `primitives/drawer/drawer.tsx` | sain — `ModalOverlay` + `Modal` (piège de focus, Échap, restitution du focus), `aria-label` de secours, quatre largeurs seulement ; 3 cas dans `overlays.test.tsx` |
| sheet | `ui/sheet.tsx` | **corrigé (F110)** — `side` réellement porté par `Sheet` ; 2 cas dans `sheet.test.tsx` |
| hover-card | `ui/hover-card.tsx` | **corrigé (F117)** — survol différé, focus immédiat, fermeture annulable et position bornée conservés ; le contenu portailé est désormais traversable au clavier (Tab, Maj+Tab, Échap, sortie par le bas) ; 4 cas `hover-card.test.tsx` + 11 cas `profile-hover-card.test.tsx` |
| sidebar | `ui/craft-sidebar-drawer.tsx` | **corrigé (F111)** — `inert` fermé, `<button>` pour les chapitres sans lien, garde d'observateur ; 2 cas dans `craft-sidebar-drawer.test.tsx` |
| stepper | `primitives/stepper/stepper.tsx` | sain — `<ol>`, `aria-current="step"`, marques `aria-hidden`, état jamais porté par la seule couleur, `status` surchargeable ; 1 cas dans `contract-pieces.test.tsx` |
| timeline | `primitives/timeline/timeline.tsx` | **corrigé (F116)** — `<time datetime>` seulement quand la valeur machine existe ; 2 cas dans `contract-pieces.test.tsx` |

**Preuve rouge → vert.** Les correctifs de la tranche ont été retirés
(`git stash push` sur les 11 fichiers sources, tests conservés), suite
relancée : **13 tests en échec sur 8 fichiers**
(`radio-cards` ×2, `tabs-tag-group` ×1, `switch` ×1, `tooltip` ×2,
`sheet` ×1, `craft-sidebar-drawer` ×2, `user-avatar` ×1,
`tooltip-delay` ×3), puis `git stash pop` et suite verte. Idem pour
`checkbox` (+1) et `popover` (+1) : 2 échecs sans le correctif, verts avec.
Même méthode pour F115/F116 : `dates` et `contract-pieces` retirés du
correctif donnent 2 échecs (`<time>` présent sans `datetime` ; aucun groupe
nommé), puis verts après restauration.

**Preuves** :

| Commande | Résultat |
| -------- | -------- |
| `pnpm --filter @qoe/supabase test` | 49 tests verts (dont 7 nouveaux sur les hôtes d'images : défaut, surcharge Bunny, motif `**.domaine` non-sosie, hôte étranger, HTTP local seulement, patterns sans doublon) |
| `pnpm --filter @qoe/ui test` | **635 tests / 98 fichiers verts** (dont `image-utils.test.ts`, `safe-image.test.tsx`, `exit-interstitial-behaviour.test.tsx`, `time-picker-input.test.tsx`, `theme-toggle.test.tsx`, `tooltip.test.tsx`, `tooltip-delay.test.tsx`, `sheet.test.tsx`, `craft-sidebar-drawer.test.tsx`, `user-avatar.test.tsx`, `popover.test.tsx`) |
| `pnpm --filter @qoe/sdk test` · `pnpm arch:audit` | 221 tests / 32 fichiers verts · ✅ 0 anomalie (F113) |
| `pnpm typecheck` | 25/25 tâches |
| `pnpm --filter @qoe/ui lint` · `@qoe/supabase lint` | 0 erreur |
| `pnpm guard:media-origin` | vert |
| Config Next chargée avec `NEXT_PUBLIC_MEDIA_CDN_URL=https://qoe.b-cdn.net` | `remotePatterns` contient `qoe.b-cdn.net` **et** `storage.qoe.internal` (preuve que la variable suffit) |

| #   | Tâche | Sévérité | Motif |
| --- | ----- | -------- | ----- |
| R55 | ~~Finir L07a : `primitives/**` et `ui/**` restants~~ — **close le 2026-11-18** : les 83 fichiers (55 `primitives`, 28 `ui`) ont été lus en entier, plus `TextParser`, `LoginFormBento`, `safe-image`/`safe-avatar`, `image-utils`. Reste hors périmètre R55, listé ci-dessous : les doublons assumés (R56) et les baselines visuelles (R54). | — | Clos avec preuves ; voir F106–F118. |
| R56 | Deux jeux de composants pour le même besoin : `ui/select` (React Aria composé) **et** `primitives/select`, `ui/calendar` (react-day-picker) **et** `primitives/date`. Les deux sont sains et testés ; le coût est la divergence de style et deux chemins d'accessibilité à maintenir. | dette | Choix produit (les écrans existants utilisent l'un ou l'autre) — fusionner demande une décision de design, pas une correction de bug. |
| R58 | ~~`ui/hover-card` : contenu portailé hors ordre de tabulation~~ — **close par F117** : ce n'était pas un arbitrage produit mais un défaut technique (le focus entrait par le déclencheur et mourait dans le portail). Traversée au clavier complète, vérifiée par 4 tests. | — | Clos. |
| R57 | ~~`BentoPlateau` : `BentoItem` cliquable sans clavier~~ — **close par F118** : l'affordance `onClick`/`cursor-pointer` n'était utilisée par aucun appelant, elle est supprimée plutôt que rendue focusable à vide (pas d'arrêt de tabulation mort). | — | Clos. |
| R59 | `AnnotationFilterPill` : quand `allowPublicAnnotations` est faux, l'option « Toutes » disparaît alors que `filterMode` vaut `all` par défaut — le rail n'affiche aucune option cochée tout en continuant de filtrer en mode `all` (officielles + les siennes). Deux issues possibles : garder une option « Tout » même sans annotations publiques, ou normaliser `all` → `official` quand la contrainte tombe. | faible | Décision produit / design system (le mode `all` reste fonctionnel, l'affichage seul est ambigu) — voir L07b. |
| R60 | `reader/useBionicReading` : le mode bionique écrit `innerHTML` dans un conteneur possédé par React et met l'original en cache dans `data-original-html`. Un corps re-rendu après activation (annotation ajoutée, document canonique rechargé) rend donc l'ancien HTML à la désactivation. Le correctif propre est un bionic **déclaratif** au rendu des blocs, pas une mutation DOM. | moyenne | Chantier de design du lecteur (aucun écran n'active aujourd'hui le bionic sur un corps canonique, mais le chemin est armé) — voir L07b. |
| R61 | `nextUrl` de bout en bout : `AuthModalContext` le calcule (`?auth=…&next=…`, URL courante), `GlobalAuthModalProvider` le transmet, `LoginModal` l'accepte… et ne l'utilise jamais. Après connexion, `router.refresh()` garde la page courante. `setMode` n'a aucun consommateur, et `?auth=login` n'est jamais retiré de l'URL (recharger rouvre la modale). | moyenne | Décision produit (revenir à l'URL d'origine après connexion, ou rester sur place ; nettoyer le paramètre au passage) — voir L07c. |
| R63 | `deeplink.Notification` (Go) émet **`/article/{slug}`** — l'ancienne forme : 308 côté tenants, **404 côté core** — pour `LIKE`/`REPOST`/`COMMENT` sur article et pour le fan-out `MEDIA_ARTICLE_PUBLISHED`. `deeplink.Target` ne porte ni le propriétaire ni la catégorie, donc la canonique (`/{owner}/a/{slug}` ou `/{cat}/{slug}`) n'est pas constructible en l'état. Le garde `guard:article-links` ne scanne pas le Go : ce chemin lui échappe. | moyenne | Décision serveur : ajouter `OwnerUsername` (ou `CategorySlug`) au `Target` et construire la canonique, ou assumer que le client ne reçoit que des `url` déjà canoniques. Voir L07e. |
| R74 | `canonicalEmail` est calculé par `@qoe/moderation` et écrit dans les métadonnées Supabase (`options.data`) au signup, mais **aucun code ne le lit** : ni le sync Go, ni la base (aucun index unique). L'anti-multi-comptes annoncé par le module ne s'exerce donc pas au-delà du jour de l'inscription, et la suppression systématique du tag `+` (tous fournisseurs, pas seulement Gmail) n'a aucune conséquence observable. | moyenne | Arbitrage backend : colonne `canonicalEmail` + index unique dans une migration goose, puis refus de doublon côté Go (`/v1/auth/sync`), en décidant si l'on garde Gmail uniquement pour les points. Voir L14. |
| R77 | `getApiUrl()` de `@qoe/analytics/server` retombe sur `https://api.umami.is/v1` — un domaine **cloud propriétaire** en dur — quand `UMAMI_API_URL` est absent : en self-hosted mal configuré, c'est notre token Umami qui part vers le cloud d'un tiers (règle « self-hosted d'abord, aucun domaine propriétaire dans la logique »). | moyenne | Décider du défaut : rendre une valeur vide (dashboard sans données, aucune fuite) ou exiger la variable au démarrage. Changement de comportement observable → décision produit avant correctif. Voir L15. |
| R76 | `resolveReadingProvenance` accepte **n'importe quel** `?ref=<valeur>` comme username de référent (`?ref=newsletter` → `referrerUsername: 'newsletter'`), d'où des attributions de provenance erronées en base. Le contrat documenté (`?ref=simone`) rend la valeur légitime indiscernable d'un token de campagne. | faible | Décision produit : liste blanche de tokens, ou format `profile:`/`@` obligatoire (casse les liens `?ref=simone` existants). Voir L15. |
| R75 | `packages/analytics` n'a **aucune infrastructure de test React** (ni `jsdom`, ni `@testing-library/react` en devDependencies) : `client.tsx` (chargement du script, `trackEvent`, opt-out `umami.disabled`), les deux hooks et le câblage beacon ne sont couverts par **aucune** suite. Le défaut constaté dans `useTrackEvent` (dépendance à l'identité de `data` ⇒ event re-tiré à chaque rendu) n'est donc pas prouvable rouge. | moyenne | Arbitrage : ajouter jsdom + testing-library aux devDependencies du paquet (impact lockfile) puis poser un plancher sur ces fichiers, ou extraire la logique des hooks en modules purs testables. Voir L15. |
| R73 | `OpenAiModerator` est **fail-open** : sans `OPENAI_API_KEY`, avec une clé `sk-mock`/`sk-...`, en cas d'erreur HTTP, de timeout ou de réseau, le contenu est déclaré sain (`safe: true`). C'est un choix produit documenté, mais en production une clé manquante désactive silencieusement toute modération IA. | moyenne | Décision produit : conserver le fail-open avec **alerte** (métrique `moderation.fallback`) ou basculer les médias/CSAM en fail-closed avec file d'attente. Voir L14. |
| R72 | `translate`/`compileMessage` de `@qoe/i18n` avalent silencieusement toute erreur de syntaxe ICU (repli sur le message par défaut) : une clé cassée en production ne laisse aucune trace, alors qu'un avertissement hors production suffirait à la voir en CI. | faible | Décider du volume de bruit accepté en CI avant d'ajouter le `console.warn` conditionné à `NODE_ENV !== 'production'`. Voir L13. |
| R71 | Les macros Lingui (`t\`…\``) des Server Components lisent le singleton activé par `initI18n` dans chaque layout : deux requêtes SSR concurrentes en `fr` et `en` peuvent encore s'entrelacer entre l'activation et le rendu des enfants (la voie `translateKey`/`getTranslate` est isolée depuis L13). | moyenne | Arbitrage d'architecture : passer ces macros en composants clients `useLingui()`, ou stocker l'instance par requête (`AsyncLocalStorage`). Voir L13. |
| R70 | `formatDuration` était réimplémenté **deux fois** dans les apps (`apps/studio/src/app/(creator)/analytics/AnalyticsDashboardClient.tsx:54` et `apps/admin/src/app/(admin)/admin/notifications/OutboxObservabilityConsole.tsx:60`) alors que `@qoe/utils` exporte déjà `formatDuration` : trois découpages divergents sur l'arrondi et les unités. | faible | **corrigée le 2026-11-19** — les deux copies sont supprimées, les écrans consomment `@qoe/utils` (studio : « 61m 40s » → « 1 h 1 min » ; admin : « 1 min » → « 1 min 30 s »). Garde de déduplication ajouté : 2 fautifs avant, 0 après. |
| R69 | `MONTHS_FR` était exporté par le barrel `@qoe/formatters` **sans aucun consommateur** dans le dépôt (seul usage interne à `dates.ts`). | faible | **corrigée le 2026-11-19** — export retiré (constante interne) ; `DEFAULT_TIME_ZONE` exposé à la place. Aucun des 7 apps / 15 packages n'importait `MONTHS_FR`. |
| R68 | `packages/config/src/features.ts` exporte `FEATURE_FLAGS`, `isFeatureEnabled` et `getCreatorFeatureToggles` **sans aucun consommateur** dans le dépôt : le registre de flags réellement utilisé est `@qoe/flags` (+ parité Go), et `env.ts` valide des variables `FEATURE_*` que ce module seul lirait. Deux vocabulaires de flags coexistent, donc une activation peut sembler câblée sans effet. | faible | Décision produit : supprimer `features.ts` (et les `FEATURE_*` du schéma d'env) ou brancher `@qoe/flags` sur ces variables. Voir L11. |
| R67 | `@qoe/content` exporte quatre surfaces entières — `continuous` (projection, attestation, layout), `highlighter` (découpage de marques), `paywall` (métriques, teaser sémantique) et `excerpt` — **sans aucun consommateur TypeScript** : le seul import du dépôt est `apps/mobile/src/lib/highlight-queue-core.ts`, qui ne prend que `canonical`. Soit le web/HTML réimplémente ces calculs ailleurs (Go, rendu serveur), soit elles sont mortes — et rien ne détecte la dérive entre les deux. | faible | Décision produit : brancher les lecteurs (web + natif) sur ce moteur et supprimer les doublons, ou retirer les surfaces inutilisées. Voir L10. |
| R66 | `DEFAULT_AVATARS`/`getDefaultAvatar`/`isDefaultAvatarUrl` (`avatars.ts`) et `STUDIO_ENTITIES` (`studio.ts`) n'ont **aucun consommateur TypeScript** dans le dépôt : les avatars sont aussi semés côté Go et les métriques du studio sont recodées dans les pages analytics. Deux sources de vérité pour la même liste, donc dérive silencieuse possible. | faible | Décision produit : brancher le web/mobile sur ce registre (ou sur une source unique exposée par le SDK), ou le retirer. Voir L09. |
| R65 | Le registre `THEMES`/`ACCENTS` (`registry.ts`) exporte `id`, `label`, `dataTheme`, `dataAccent` sans **aucun consommateur** dans le dépôt : le mode sombre se pose par la classe `.dark` (next-themes) et l'accent par `[data-accent='vermillion']`, jamais par `data-theme`. La promesse d'un attribut DOM déclaratif n'est donc pas tenue. | faible | Décision produit/API : soit câbler `data-theme`/`data-accent` dans les feuilles et les shells, soit réduire le registre aux helpers réellement utilisés (`resolveForcedTheme`, `resolveAccentFromColor`). Voir L08. |
| R64 | `social/MediaLightbox` et `social/ZoomableLightbox` restent des `fixed inset-0` sans `role="dialog"`/focus confiné (Échap et flèches sont câblés à la main, correctement). Leur migration sur `Dialog` demande de composer avec le pan/zoom et les gestes tactiles — arbitrage design, pas correction mécanique. | moyenne | Décision design (le comportement clavier existe déjà ; c'est la modalité ARIA et le piège du focus qui manquent). Voir L07e. |
| R62 | `LocaleProvider` n'est monté que par `apps/studio` : `core` et `tenants` laissent react-aria prendre la locale du navigateur côté client et `en-US` côté serveur — exactement le désaccord d'hydratation que le provider existe pour empêcher (segments de date, calendrier, tri). | moyenne | Décision d'app (quelle source de locale : cookie, en-tête, route localisée) puis montage dans les deux layouts — voir L07c. |

---

## L07b — `@qoe/ui` reader, annotations, cards — durci le 2026-11-18

**Périmètre.** Les **34 fichiers sources** du lot — `src/reader/**` (12),
`src/annotations/**` (21) et `src/cards/index.ts` (1) — lus en entier, plus
leurs 28 fichiers de test (dont `annotations.test.ts` et
`paper-theme.test.ts`, posés à la racine de leur dossier plutôt que dans
`__tests__/`). Appelants
réels inspectés, pas seulement les composants : `apps/core`
(`ArticleAnnotatorView`, `ArticleReaderDrawer`, `DockedReaderToolbar`,
`EbookReader`, `ProfileView`, `FeedDashboard`, `ArticleOverlayProvider`,
`ReaderToolbarContext`, la page `[username]/a/[slug]`), `apps/tenants`
(`TenantReaderShell`, `TenantArticleHighlighter`, `TenantArticleRenderer`,
`ReaderActions`, `tenant-data`, `tenant-article-route`) et `apps/studio`
(`ui-lab/specimens/{17-annotation-flow,19-social-cards,03-segmented}`,
`fixtures/annotation-document`).

`src/cards/index.ts` est un **barrel pur** (`ArticleCard`,
`QuotedArticleCard`, `ThoughtCard`) : les trois composants visés vivent dans
`src/ArticleCard.tsx` et `src/social/**`, déjà audités (L07a pour le premier,
L07e pour les deux autres). Aucun défaut propre au barrel ; ses trois
exports sont bien consommés (`ProfileView`, `FeedDashboard`, lab) et
`QuotedArticleCard` sert aussi de couche d'aperçu au tiroir d'annotation
(`AnnotationCitationHeading`) — l'aperçu du tiroir est donc bien celui du
feed, pas une seconde mise en scène.

| #    | Défaut                                                                                                                                                                                                                                                                                                                                       | Sévérité | Statut                                                                                                                                                                                                                                                                                                                                                                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F119 | `reader/bionic` : `formatBionicWord` traitait une **entité HTML comme un mot**. `&nbsp;` devenait `<b>&n</b>bsp;` — l'entité n'était plus interprétée et l'article affichait « a&n bsp;b » au lieu d'une espace insécable. Guillemets français (`&laquo;`, `&raquo;`), esperluette (`&amp;`) et espaces insécables sont exactement ce qu'on rencontre dans nos articles : la lecture bionique corrompait le texte publié. | moyenne  | corrigé — les entités sont isolées (`HTML_ENTITY_SOURCE`) et rendues intactes, seuls les fragments de texte qui les entourent sont mis en gras ; 1 test (`ne coupe jamais une entité HTML`) : **échoue avant** (« expected '&<b>nb</b>sp;' to be '&nbsp;' »), vert après                                                                                                                  |
| F120 | `reader/ReadingProgressBar` : la barre ne cherchait son conteneur qu'**au montage**. Or le corps de l'article est monté après le shell (il vient d'une requête) : la barre s'accrochait à la fenêtre et restait à 0 % pendant qu'on faisait défiler le corps — et n'affichait rien de juste au premier rendu, puisqu'elle ne mesurait qu'au **premier** défilement.                                                                        | moyenne  | corrigé — écoute en phase de **capture** (un défilement d'élément ne bouillonne pas) et conteneur **résolu à chaque événement**, plus une mesure immédiate au montage ; 3 tests (`reading-progress-bar` : mesure au montage, conteneur monté après la barre, repli fenêtre) : **2 échouaient** (« expected '0%' to be '50%' »), verts après                                           |
| F121 | `reader/FloatingAudioPlayer` : la piste de progression était une `<div>` avec un `onClick` — **aucun accès clavier** (pas de `tabIndex`, pas de rôle, pas de flèches) et aucune position annoncée. Un lecteur d'écran n'apprenait pas qu'un réglage existait ; au clavier, on ne pouvait pas se déplacer dans l'article autrement qu'avec les boutons de paragraphe (qui vont d'un paragraphe à l'autre, pas au milieu).                                     | moyenne  | corrigé — `role="slider"` + `aria-valuemin/max/now/valuetext`, `tabIndex=0`, flèches (±1), Début/Fin, anneau de focus, bornage dans `seekTo` (le clic passe par la même fonction) ; 1 test (`expose la piste comme un curseur réglable au clavier`) : **échec prouvé** en restaurant la source par `git stash` (role absent), vert après |
| F122 | `annotations/TextHighlighter` : le mode de filtre est persisté dans `localStorage`, mais la whitelist de relecture était `['all','official','none']` — **`mine` manquait**. Un lecteur qui choisissait « Mes annotations » retrouvait « Toutes » à chaque rechargement, sans rien demander, et le rail affichait alors une option cochée qui n'était plus son choix.                                                                                                     | basse    | corrigé — `PERSISTED_FILTER_MODES` typé, liste unique des quatre modes ; 3 tests (`restaure le mode « mes annotations » enregistré`, `« aucune »`, `ignore une valeur inconnue`) : le premier **échouait** (`aria-checked` à `false` sur « mes annotations »), verts après                                                                                                            |
| F123 | `annotations/AnnotationSideDrawer` : le vote « Utile » était appliqué avant la réponse serveur — c'est voulu — mais **jamais annulé**. Un refus (session expirée, annotation supprimée entre-temps) laissait la puce allumée et le compteur gonflé, et le parent recevait ce faux état par `onUpdateAnnotation` : le vote inexistant survivait au passage d'annotation suivant. Une exception réseau faisait de même.                                                      | moyenne  | corrigé — état d'avant capturé, `restore()` sur refus explicite **et** sur exception (le mode sans callback reste optimiste : personne ne peut infirmer) ; 2 tests (`revient au compteur d’avant quand la réponse est un refus` — **échouait** « expected '5 Utile' to contain '4' » — et `quand l’appel lève`), verts après                                                                 |
| F124 | `annotations/TextSelectionPopover` : **Échap ne fermait pas le formulaire de note.** `clearSelection()` sort aussitôt quand `isLocked` est vrai, c'est-à-dire exactement quand le formulaire est ouvert ; le bouton de fermeture annonce pourtant « Fermer (Échap) ». Le raccourci affiché mentait et il ne restait que la souris pour abandonner une saisie.                                                                                                          | moyenne  | corrigé — `dismiss()` inconditionnel, prop `onEscape` (le parent referme sa saisie, sinon l'état resterait « formulaire ouvert » sur une barre démontée) ; 1 test (`Échap pendant la saisie d’une note`) : **échouait** (formulaire toujours monté), vert après                                                                                                                     |

**Preuve rouge → vert.** Les six correctifs ont été écrits **après** leurs
tests. Premier passage des cinq fichiers neufs/étendus, sources inchangées :
**7 tests en échec** sur 15 (`bionic` ×1, `reading-progress-bar` ×2,
`annotation-filter-persistence` ×1, `annotation-upvote-rollback` ×2,
`selection-escape` ×1), les 8 autres verts étant trois gardes de
non-régression (repli fenêtre de la barre, valeur de stockage inconnue,
vote optimiste) qui devaient rester vertes avant comme après. Le septième
correctif (F121) a été prouvé séparément : `git stash push` sur
`FloatingAudioPlayer.tsx` → `× expose la piste comme un curseur réglable au
clavier` (1 échec), `git stash pop` → vert.

**Preuves (arbre propre, après commits) :**

| Commande | Résultat |
| -------- | -------- |
| `pnpm --filter @qoe/ui test` | **646 tests / 102 fichiers verts** (635/98 avant le lot : **+11 tests, +4 fichiers**) |
| `pnpm typecheck` | 25/25 tâches |
| `pnpm --filter @qoe/ui lint` | 0 erreur, 0 avertissement |
| les 9 gardes CI (`guard:media-origin`, `audit:guard`, `ui:audit`, `arch:audit`, `guard:article-links`, `guard:dangerous-html`, `guard:flags-parity`, `guard:legal-consent`, `guard:seed-script`) | tous verts |

**Observations trouvées, volontairement non corrigées.**

- `AnnotationFilterPill` : quand `allowPublicAnnotations` est faux, l'option
  « Toutes » disparaît mais reste l'état initial possible (`filterMode`
  défaut `all`) — le rail n'affiche alors **aucune** option cochée, alors que
  le mode `all` reste fonctionnel (officielles + les siennes). Corriger
  demande de choisir : afficher « Tout » même sans publiques, ou normaliser
  le mode sur `official`. Voir **R59**.
- `reader/useBionicReading` écrit `innerHTML` dans un conteneur que React
  possède (`#article-content`) et met l'original en cache dans un attribut
  `data-original-html`. Si le corps change après activation (annotation
  ajoutée, document re-rendu), le cache est périmé et la restauration rend
  l'ancien HTML. Aucun écran n'active aujourd'hui le bionic sur un corps
  canonique, mais le chemin est armé. Rendre le bionic **déclaratif** (au
  rendu des blocs) est un chantier de design, pas un correctif ponctuel.
  Voir **R60**.
- `reader/ReadingRuler` suit `mousemove` uniquement : c'est une aide de
  lecture au pointeur, elle ne prétend rien d'autre (aucune affordance
  clavier n'est peinte) — pas un défaut, noté comme limite assumée.

**Dettes.** Aucune dette R ne visait spécifiquement `reader`,
`annotations` ou `cards` (R52 parle d'invalidation de cache côté serveur,
R46 de notifications). **R54** (baselines visuelles), **R56** (doublons
`select`/`date`) et **R01** (`checkContentAccess` fail-open) restent
**ouvertes** : elles attendent une décision utilisateur (environnement de
référence, design system, comportement produit) et ne se ferment pas dans un
lot d'audit.

---

## L07c — `@qoe/ui` auth, forms, providers — durci le 2026-11-18

**Périmètre.** Les 4 fichiers du lot lus en entier — `auth/AuthModalContext.tsx`
(141 l.), `auth/GlobalAuthModalProvider.tsx` (33 l.), `forms/index.ts` (barrel)
et `providers/locale.tsx` (28 l.) — **plus les composants que le barrel rend
publics** : `SubscribeForm` (446 l.), `RecommendationModal` (221 l.), et le
contrat qu'ils traversent (`LoginModal` 97 l., `LoginFormBento` pour
`initialMode`/`nextUrl`). Tests existants relus pour connaître les gardes en
place : `RecommendationModal.test.tsx`, `SubscribeForm.test.tsx`,
`auth-surfaces.test.tsx`, `login-form-bento.test.tsx`,
`ArticleCardShadowMutations.test.tsx`, `ui-component-stress.test.tsx`.

**Appelants réels inspectés.** `apps/core` (`app/layout.tsx` monte
`GlobalAuthModalProvider`, `FeedDashboard`, `ThoughtOverlayProvider`,
`ArticleAnnotatorView` consomment `useAuthModal`/`useRequireAuth`),
`apps/tenants` (`app/layout.tsx` — le seul autre montage du provider —,
`ReaderActions`, `ArticleCommentsSection`), `apps/studio` (`app/layout.tsx`
monte `LocaleProvider`, specimen `19-social-cards`, entrées `ui-lab`), et
les templates du paquet (`MinimalCraftShell`, `ArticleEngagementBar`) qui
lisent `AuthModalContext` directement.

`forms/index.ts` est un **barrel pur** (`SubscribeForm`,
`RecommendationModal`) : `@qoe/ui/forms` n'a aujourd'hui **aucun
consommateur** — les apps les importent par le barrel racine `@qoe/ui`. Le
sous-chemin reste utile aux fronts tiers ; noté en observation, pas en
défaut. `providers/locale.tsx` est sain (une seule responsabilité : donner
à react-aria la locale du serveur, jamais une découverte ambiante) ; son
absence dans `core` et `tenants` est une décision d'app → **R62**.

| #    | Défaut                                                                                                                                                                                                                                                                                                                                            | Sévérité | Statut                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F125 | `RecommendationModal` n'était **pas une boîte de dialogue** : deux `<div>` en `fixed inset-0`, sans `role="dialog"`, sans `aria-modal`, sans titre associé, sans Échap, sans piège du focus ni restitution. Un lecteur d'écran continuait à parcourir le blog derrière le voile ; au clavier, la fenêtre était infranchissable alors qu'elle demande une décision (s'abonner aux recommandations ou passer). | haute    | corrigé — migré sur `Dialog`/`DialogContent`/`DialogTitle` (react-aria, même primitive que `LoginModal`) : rôle, nom, focus confiné, Échap, voile cliquable, restitution du focus ; 2 tests (dialogue nommé + `aria-modal`, fermeture à Échap) : **échouaient** (« Unable to find an accessible element with the role \"dialog\" », puis « expected \"vi.fn()\" to be called at least once ») |
| F126 | `RecommendationModal` : chaque publication était une `<div onClick>` avec `cursor-pointer` et un badge rond **décoratif** — aucune case à cocher pour l'assistance technique, aucun moyen de (dé)sélectionner sans souris, alors que le libellé du bouton dépend de cette sélection (« S'abonner aux 2 publications »).                                                                                                    | moyenne  | corrigé — `role="checkbox"` + `aria-checked` + `tabIndex=0` + Espace/Entrée, nom accessible (« S'abonner à … ») et description liée, badge marqué `aria-hidden`, anneau de focus ; test `expose chaque publication comme une case à cocher manipulable au clavier` : **échouait** (« Unable to find an accessible element with the role \"checkbox\" »)                                      |
| F127 | `RecommendationModal` : la sélection était initialisée **une seule fois** depuis les props. Le formulaire d'abonnement garde ce composant monté : un second abonné confirmait donc l'**ancienne** liste — des identifiants qui n'étaient même plus affichés — et le bouton annonçait « 2 publications » pour une seule recommandation.                    | haute    | corrigé — resynchronisation sur une signature stable des ids (`useEffect` sur `recommendationIds`) ; test `repart de la nouvelle liste quand les recommandations changent` : **échouait** (bouton « S'abonner à 1 publication » introuvable, sélection périmée), vert après                                                                                                                  |
| F128 | `SubscribeForm` : pendant l'envoi, les boutons ne contenaient plus qu'un spinner — **le nom accessible disparaissait** (« bouton, vide ») et `aria-busy` manquait, donc rien n'annonçait l'attente ; le refus du serveur s'affichait sans `role="alert"`, donc un lecteur d'écran n'apprenait jamais que l'inscription avait échoué.                     | moyenne  | corrigé — libellé conservé en `sr-only` sous le spinner, `aria-busy` sur les trois boutons d'envoi, message d'erreur en `role="alert"` ; 2 tests (`garde le bouton d’envoi nommé et occupé`, `annonce le refus du serveur comme une alerte`) : **échouaient** (« Unable to find role \"button\" and name `/S'abonner/i` », « Unable to find role \"alert\" »)                             |
| F129 | `GlobalAuthModalProvider` s'importait **lui-même via `@qoe/ui`** (`AuthModalProvider`, `LoginModal`, `useAuthModal`), donc via le barrel qui est en train de le charger : cycle ESM `index.ts` → provider → `index.ts`. Il tient tant que personne ne lit les liaisons à l'initialisation, et casse (`Cannot access … before initialization`) dès qu'un bundler réordonne. | moyenne  | corrigé — imports relatifs (`./AuthModalContext`, `../LoginModal`) ; 2 tests de garde (`importe ses voisins directement, jamais via le barrel`, `aucun module du paquet ne s’importe lui-même`) : **échouaient** (le motif `from '@qoe/ui'` est trouvé, la liste des fautifs contient 1 entrée), verts après |

**Preuve rouge → vert.** Les tests ont été écrits avant les correctifs :
premier passage sur les trois fichiers → **8 tests en échec sur 8**
(`RecommendationModal` : dialogue, Échap, cases à cocher, sélection périmée ;
`SubscribeForm` : bouton nommé pendant l'envoi, alerte ;
garde d'import : deux cas), puis `3 passed (3)` après correctif, sans
aucune retouche des tests.

**Preuves (arbre propre, après commits) :**

| Commande | Résultat |
| -------- | -------- |
| `pnpm --filter @qoe/ui test` | **654 tests / 103 fichiers verts** (646/102 avant le lot : **+8 tests, +1 fichier**) |
| `pnpm typecheck` | 25/25 tâches |
| `pnpm --filter @qoe/ui lint` | 0 erreur, 0 avertissement |
| les 9 gardes CI (`guard:media-origin`, `audit:guard`, `ui:audit`, `arch:audit`, `guard:article-links`, `guard:dangerous-html`, `guard:flags-parity`, `guard:legal-consent`, `guard:seed-script`) | tous verts |

**Observations trouvées, volontairement non corrigées.**

- `LoginModalProps.nextUrl` est un **contrat mort** : `LoginModal` le reçoit,
  `GlobalAuthModalProvider` le transmet, `AuthModalContext` le calcule depuis
  `?next=`, et personne ne l'utilise — après connexion la modale se ferme et
  `router.refresh()` garde la page courante. Le réparer demande de trancher le
  comportement (revenir à l'URL d'origine ou rester sur place). Voir **R61**.
- `AuthModalContext.setMode` n'a aucun consommateur (le mode passe par
  `openAuthModal`), et le paramètre `?auth=login` n'est jamais retiré de l'URL :
  un rechargement rouvre la modale. Même décision produit (R61).
- `providers/locale.tsx` n'est monté que par `apps/studio` ; `core` et
  `tenants` laissent react-aria deviner la locale. Voir **R62**.
- `@qoe/ui/forms` n'a aucun consommateur (imports par le barrel racine) :
  sous-chemin conservé pour les fronts tiers, à supprimer seulement si cette
  surface n'est pas vendue.

**Dettes.** Aucune dette R ne visait `auth`, `forms` ou `providers`.
**R54** (baselines visuelles), **R56** (doublons `select`/`date`) et **R01**
(`checkContentAccess` fail-open) restent **ouvertes** : décision utilisateur
(environnement de référence, design system, comportement produit).

---

## L07d — `@qoe/ui` security, seo, legal — durci le 2026-11-19

**Périmètre.** Les **13 fichiers** du lot lus en entier — `security/`
(`index.ts`, `pow-worker.ts`, `article-html.ts`, `inline-svg.ts` et leurs deux
suites), `seo/JsonLd.tsx` et `legal/` (`CookieConsentBanner` 515 l.,
`AnalyticsNotice`, `LegalConsentGate`, `CookiePreferencesButton`,
`cookie-consent-storage`) — **plus les appelants réels** : `apps/core`
(`layout.tsx`, `ArticleAnnotatorView`, `EbookReader`, pages `[username]` et
`a/[slug]`), `apps/tenants` (`layout.tsx`, `TenantPageRenderer`,
`TenantArticleRenderer`, `LegalFooterLinks`), `apps/studio` (`layout.tsx`,
`(creator)/layout.tsx` monte `LegalConsentGate`, `totp-enrollment`,
`sanitize-preview-html`), `apps/admin` (`step-up.tsx` — QR TOTP —,
`LegalCMS`), `apps/hi` (pages légales) et les templates du paquet
(`ArticleContentBlock`, `AboutPageContent`).

**Contrats amont relus.** `@qoe/utils/cookie-consent` (`defaultChoice`,
`normalizeConsent` strict sur `true`, registre des traceurs) et les deux gardes
qui encadrent ce lot : `scripts/guard-dangerous-html.mjs` (le JSON-LD y est
une exemption motivée) et `scripts/guard-legal-consent.sh` (câblage du
consentement, sentinelles de catégorie et mode exempté).

| #    | Défaut                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Sévérité | Statut                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F130 | `sanitizeInlineSvg` était une **liste noire** de neuf expressions régulières. Huit formes d'attaque réelles la traversaient : gestionnaire collé à la balise (`<svg/onload=…>`, `<rect/onmouseover=…>`), schéma `javascript:` écrit en entité décimale ou hexadécimale (`&#106;avascript:`, `&#x6a;avascript:`), en entité nommée (`&colon;`) ou coupé par un blanc (`java\nscript:`), gestionnaire reposé après coup par SMIL (`<set attributeName="onmouseover">`), et lien actif (`<a href="https://…">`) dans un QR. Ce filtre est la **seule** barrière avant l'injection du QR fournisseur dans une page admin/studio authentifiée. | haute    | corrigé — inversion de la charge : **liste blanche** d'éléments (géométrie, texte, dégradés, `clipPath`/`mask`) et d'attributs de présentation, références de caractères décodées avant contrôle (`&#…;`, `&colon;`…), `url()` admis seulement vers une ancre locale, aucun élément actif ni animation SMIL ; 8 tests ajoutés à la suite d'attaques : **échouaient** (`expected '<svg/onload=…' to be null`, etc.), verts après sans retouche des cas existants |
| F131 | `buildPersonSchema` fabriquait la canonique du profil à partir du pseudo brut : `username: '@claire'` donnait `https://qoe.fi/%40claire`, une URL qui n'existe pas — alors que `buildArticleSchema` retirait déjà ce `@`. Son `path` optionnel, documenté « chemin canonique de l'article » (copier-coller), était **ignoré**.                                                                                                                                                                        | moyenne  | corrigé — `@` retiré comme pour l'article, `path` honoré quand il est fourni (`{baseUrl}{path}`), docstring réalignée ; 2 tests (`normalise le nom d'utilisateur…`, `respecte le chemin canonique…`) : **échouaient** (`'https://qoe.fi/%40claire'`, `'https://blog.test/claire'`), verts après                                                                                                                                    |
| F132 | `LegalConsentGate` masquait le portail sur toute route dont le chemin **contient** `/legal` (`pathname.includes('/legal')`) : `/legality-report`, `/legal-notice` ou `/paralegal` passaient pour des pages légales, et la nouvelle version des conditions n'y était jamais demandée.                                                                                                                                                                                                           | moyenne  | corrigé — comparaison de **segments** (`/(?:^|\/)legal(?:\/|$)/i`) ; 2 tests (`s'affiche sur une route qui contient « legal » sans être une page légale`, `laisse lire les pages légales elles-mêmes`) : le premier **échouait** (`Unable to find … role "dialog"`), le second garantit la non-régression                                                                                                                              |
| F133 | Deux surfaces bloquantes déclaraient `role="dialog" aria-modal="true"` **sans modalité** : `LegalConsentGate` (conditions à accepter) et `CookiePreferencesCenter` (choix des traceurs). Le focus restait dans la page — un utilisateur clavier devait traverser tout l'écran avant d'atteindre « J'accepte », un lecteur d'écran poursuivait sa lecture derrière le voile — et Échap ne fermait pas le centre de préférences.                                                                   | haute    | corrigé — les deux surfaces reposent sur `Dialog`/`DialogContent`/`DialogTitle` (react-aria, comme `LoginModal`, `RecommendationModal`) : focus confiné et restitué, arrière-plan `aria-hidden`/`inert`, Échap ferme le centre et reste neutralisé sur le portail (acceptation requise) ; 3 tests : focus hors du portail et arrière-plan parcourable **échouaient**, puis Échap sans effet sur le centre échouait aussi |

**Preuve rouge → vert.** Les tests ont été écrits avant les correctifs.
Premier passage sur les trois fichiers concernés → **13 échecs sur 45**
(8 assainisseur SVG, 2 JSON-LD, 3 portails et centre de préférences), puis
`5 fichiers / 63 tests verts` après correctif, sans aucune retouche des cas
existants.

**Preuves (arbre propre, après commits) :**

| Commande | Résultat |
| -------- | -------- |
| `pnpm --filter @qoe/ui test` | **668 tests / 104 fichiers verts** (654/103 avant le lot : **+14 tests, +1 fichier**) |
| `pnpm typecheck` | 25/25 tâches |
| `pnpm --filter @qoe/ui lint` | 0 erreur, 0 avertissement |
| `apps/studio` — `security-hardening.test.ts` + `totp-enrollment.test.tsx` (re-export de `@qoe/ui/security`) | 24 + 10 tests verts |
| les 9 gardes CI (`guard:media-origin`, `audit:guard`, `ui:audit`, `arch:audit`, `guard:article-links`, `guard:dangerous-html`, `guard:flags-parity`, `guard:legal-consent`, `guard:seed-script`) | tous verts |

**Observations trouvées, volontairement non corrigées.**

- `AnalyticsNotice` et `CookieConsentBanner` arment un `setTimeout` de 3,6 s
  pour effacer le toast sans le nettoyer au démontage : la référence survit
  quelques secondes après la fermeture de l'écran. Aucun test observable ne
  peut le prouver (React 19 n'avertit plus), donc observation — pas de
  correctif à l'aveugle.
- La liste blanche de `sanitizeInlineSvg` est plus étroite que l'ancienne liste
  noire : un fournisseur qui glisserait `<image>`, `<style>` ou un `<a>` dans
  son QR retombe désormais sur la **saisie manuelle du secret**, repli déjà
  présent dans studio/admin. C'est le comportement voulu (on préfère ne pas
  afficher le QR que l'afficher dangereusement).
- `writeConsent` écrit `normalizeConsent(choice) ?? choice` : un choix dont la
  version est périmée serait enregistré brut. Les lecteurs re-normalisent et
  le rejettent, donc aucun effet observable — mais le repli surcharge la
  lecture plutôt que de refuser.
- `safeJsonLdReplacer(undefined)` lève (`JSON.stringify(undefined)` vaut
  `undefined`, puis `.replace` échoue) : inatteignable avec les builders typés
  qui alimentent `JsonLd`.
- `solvePowChallenge` ne compare pas `expiresAt` à l'heure courante : c'est le
  serveur Go qui arbitre l'expiration, un contrôle client donnerait une fausse
  garantie.

**Dettes.** Aucune dette R ne visait `security`, `seo` ou `legal`.
**R54** (baselines visuelles), **R56** (doublons `select`/`date`) et **R01**
(`checkContentAccess` fail-open) restent **ouvertes** : décision utilisateur
(environnement de référence, design system, comportement produit).

---

## L07e — `@qoe/ui` notifications, onboarding, profile, social, cmdk, templates, sidebar — durci le 2026-11-19

**Périmètre.** Les **86 fichiers** du lot (sources et tests). Lus intégralement :
`notifications/**` (6 sources, dont `NotificationItem` 476 l. et
`NotificationList` 178 l.), `cmdk/**` (3), `onboarding/OnboardingModal`,
`profile/index.ts`, `sidebar.tsx` (881 l.), et dans `social/` :
`LinkPreview`, `QuotedArticleCard`, `ReportModal`, `ConfirmDeleteModal`,
`RepostPopover`, `ShareMenu`, `MediaLightbox`, `ZoomableLightbox`,
`ProfileHoverCard`, `EntityActionMenu`, `ThoughtCard` (contracts),
`ThoughtActions`, `ThoughtBody`, `ThoughtHeader`, `KnownLikers`,
`HiddenParentNotice`. Les **27 sources de `templates/`** (`parser`, `schema`,
`navigation`, `defaults`, `TemplateRenderer`, les 18 blocs, l'archétype
minimal, le registre) ont été parcourues par lecture structurelle et recherche
ciblée sur les puits dangereux (`dangerouslySetInnerHTML`, `innerHTML`,
`href={`, `target="_blank"`, `window.open`) : aucune autre injection,
échappement ni forme d'URL obsolète n'y subsiste — `ArticleContentBlock` et
`AboutPageContent` passent déjà par `sanitizeArticleHtml`, et tous les liens
externes portent `rel="noopener noreferrer"`.

**Appelants vérifiés.** `apps/core` (`layout.tsx` — bandeau d'annonce —,
`InAppPlacement`, `FeedDashboard` qui monte `OnboardingModal`,
`NotificationsCenter`), `apps/studio` (`GlobalCommandMenu` qui monte
`CmdKDialog`, `(creator)/notifications`), `apps/tenants` (`layout.tsx` monte
`OnboardingModal`), `apps/admin` (`BroadcastAnnouncementConsole`).

| #    | Défaut                                                                                                                                                                                                                                                                                                                                                                                        | Sévérité | Statut                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F134 | `NotificationItem` : le dernier repli de lien produisait `/@${pseudo}` — le core sert `/{pseudo}` et n'a aucune route `/@…` : 404. La branche « article » (`/article/{slug}`) reste, elle, bloquée par le contrat serveur → **R63**.                                                                                                                                                                    | moyenne  | corrigé — repli `/@{pseudo}` remplacé par `/{pseudo}` encodé, comme les autres branches ; test `pointe vers le profil canonique du core` : **échouait** (`'/@camilleroux'` reçu), vert après                                                                                             |
| F135 | `CmdKDialog` : palette de commandes montée en `fixed inset-0` maison — **aucun `role="dialog"`, aucun `aria-modal`, aucun piège ni restitution du focus**, fond cliquable muet, Échap recâblé à la main et `document.body.style.overflow` écrasé sans restauration. C'est l'interface clavier du produit.                                                                                    | haute    | corrigé — `Dialog`/`DialogContent` (react-aria) nommés « Menu de commandes » ; verrou de défilement et Échap fournis par `ModalOverlay` ; test `est une vraie boîte de dialogue, focus compris` : **échouait** (`Unable to find role="dialog" and name "Menu de commandes"`), vert après |
| F136 | `OnboardingModal` : portail maison (`createPortal` + `AnimatePresence`) sans `role`, sans `aria-modal`, sans piège du focus — un écran qui bloque tout le produit laissait tabuler dans la page derrière. Échap était impossible, même en mode facultatif.                                                                                                                                  | haute    | corrigé — `Dialog isDismissable={dismissible}` : focus confiné, arrière-plan `aria-hidden`, Échap ferme seulement si l'écran est facultatif ; 2 tests (`concentre le focus…`, `se ferme à Échap quand il est facultatif`) : **échouaient** tous deux sur `role="dialog"`, verts après  |
| F137 | `NotificationList` : les cinq filtres étaient des `<button>` nus — ni `role="tab"`, ni `aria-selected`, ni `tablist`, ni panneau relié : un lecteur d'écran annonçait cinq boutons sans dire lequel filtre la liste. Le bouton « Tout marquer comme lu » perdait son nom accessible sous `sm` (seul `title` restait).                                                                       | moyenne  | corrigé — `role="tablist"` + `role="tab"` + `aria-selected` + `aria-controls`, panneau `role="tabpanel"` relié à l'onglet actif, `aria-busy` pendant le chargement, `aria-label` sur le bouton d'action ; 2 tests : **échouaient** (`Unable to find … role "tablist"`), verts après |
| F138 | `InvertedCurveBanner` : la **lecture** de `localStorage` n'était pas protégée alors que l'écriture l'était. En navigation privée (Safari), `getItem` lève une `SecurityError` dans l'effet et casse le rendu de l'écran qui héberge l'annonce.                                                                                                                                                  | moyenne  | corrigé — lecture sous `try/catch` (l'annonce reste affichée si le stockage est refusé) ; test `affiche l'annonce quand localStorage lève à la lecture` : **échouait** (`expected [Function] to not throw … SecurityError`), vert après                                                                        |
| F139 | `QuotedArticleCard` : la carte était un `<div onClick>` — ni rôle, ni arrêt de tabulation, donc **impossible à ouvrir sans souris** — et l'ouverture appelait `window.open(url, '_blank')` **sans `noopener`** : la page ouverte pouvait réécrire l'onglet qoe.fi. `LinkPreview` avait la même omission d'argument.                                                                                                                                              | moyenne  | corrigé — la carte est une vraie ancre (`href`, clic milieu, menu contextuel, `rel="noopener noreferrer"`), `window.open` passe `'noopener,noreferrer'` ici et dans `LinkPreview` ; test `est un lien nommé, accessible au clavier…` : **échouait** (`Unable to find … role "link"`), vert après |
| F140 | `sidebar.tsx` : les règles de prérendu étaient injectées via `JSON.stringify` dans un `<script>` **sans échappement** — `JSON.stringify` laisse passer `<`, `>` et `&` : une URL contenant `</script>` ferme l'élément et le reste est interprété comme du HTML. Le garde `guard:dangerous-html` exemptait le fichier en affirmant « pas du HTML ».                                     | faible   | corrigé — `<`, `>`, `&` échappés en séquences unicode (comme le JSON-LD), le contenu reste du JSON strictement valide ; test `n'échappe pas la sortie de <script>…` : **échouait** (`expected '{"prerender":…' not to contain '</script>'`), vert après |

**Preuve rouge → vert.** Les neuf tests ont été écrits avant les correctifs.
Premier passage → **9 échecs sur 9** : 8 dans les quatre nouveaux fichiers
(3 notifications, 1 stockage, 3 modalité, 1 carte), puis le neuvième (sidebar)
capturé en remettant le fichier d'origine (`git stash`) — **échouait** de la
même façon —, tous verts après correctif sans retoucher un cas existant.

**Preuves (arbre propre, après commits) :**

| Commande | Résultat |
| -------- | -------- |
| `pnpm --filter @qoe/ui test` | **677 tests / 109 fichiers verts** (668/104 avant le lot : **+9 tests, +5 fichiers**) |
| `pnpm typecheck` | 25/25 tâches |
| `pnpm --filter @qoe/ui lint` | 0 erreur, 0 avertissement |
| les 9 gardes CI (`guard:media-origin`, `audit:guard`, `ui:audit`, `arch:audit`, `guard:article-links`, `guard:dangerous-html`, `guard:flags-parity`, `guard:legal-consent`, `guard:seed-script`) | tous verts |

**Observations trouvées, volontairement non corrigées.**

- `ShareMenu` fabrique `{mainAppUrl}/a/{id}` quand aucun `authorHandle` n'est
  fourni : même famille que R63 (le core n'a pas de route `/a/{slug}`), mais
  aucun appelant ne l'atteint aujourd'hui.
- `InvertedCurveBanner` porte des couleurs en dur (`#130F26`, `#A78BFA`…) au
  lieu des tokens, et ses libellés (`Nouveau`, `Découvrir`, `Fermer l'annonce`)
  ne passent pas par l'i18n ; `CmdKDialog` garde son pied de palette
  (`Sélectionner avec`, `Naviguer avec…`) en français littéral. C'est un
  arbitrage design/i18n (le bandeau est une signature visuelle), pas un bug.
- `useRealtimeNotificationSync` replanifie une reconnexion toutes les secondes
  tant qu'un consommateur est monté ; c'est voulu (résilience RT) mais il n'y a
  ni backoff ni plafond.
- `NotificationItem` continue d'exempter `guard:article-links` pour la branche
  `/article/{slug}` : la raison est désormais **R63** et non plus une tâche
  d'URL courte.

**Dettes.** **R54** (baselines visuelles), **R56** (doublons `select`/`date`) et
**R01** (`checkContentAccess` fail-open) restent **ouvertes** (décision
utilisateur). Nouvelles dettes de ce lot : **R63** (deeplink Go → article) et
**R64** (lightboxes non modales).

---

## L08 — `@qoe/theme` tokens, providers, cookies, styles — durci le 2026-11-19

**Périmètre.** Les **19 fichiers** du paquet lus en entier : `index.ts`,
`types.ts`, `tokens.ts`, `registry.ts`, `cookie.ts`, `colors.ts` (391 l.),
`ThemeProvider.tsx`, `ThemeStyle.tsx`, `seed-script.tsx`, `native.ts`,
`avatar-themes.ts`, `cover-themes.ts` (265 l.), `__tests__/colors.test.ts`, et
les six feuilles `styles/` (`tokens.css`, `themes.css`, `index.css`,
`base.css`, `marks.css`, `article.css` 390 l.). **Appelants réels vérifiés** :
`packages/ui/src/templates/TemplateRenderer.tsx` (applique
`buildCreatorVars` en `style` React), `apps/tenants` (`TenantPageRenderer`,
`TenantPageShell`, `TenantArticleRenderer` montent `<ThemeStyle scope=":root">`),
`apps/studio/src/app/editor.css` (consomme `var(--font-sans)`),
`apps/core`/`apps/studio` (montage de `ThemeProvider` + `ThemeSeedScript`).

**Contrats amont relus.** `next-themes` (`theme`/`resolvedTheme`/`setTheme`),
le cookie partagé `qoe_theme` (+ `THEME_COOKIE_POLL_MS`) écrit sur le domaine
parent, `parseHexColor`/`isColorDark` de `colors.ts`, et le garde
`scripts/guard-dangerous-html.mjs` qui exempte `<style>` de `ThemeStyle` en
lui prêtant une « valeur validée » — ce lot rend cette exemption vraie.

| #    | Défaut                                                                                                                                                                                                                                                                                                                                                                                            | Sévérité | Statut                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F141 | `readThemeCookie` appelait `decodeURIComponent(match[1])` **hors try/catch**. Un cookie abîmé (`qoe_theme=%E0%A4%A`, ancienne app, extension) levait une `URIError` dans l'effet de `CookieReader`, donc au montage de `ThemeProvider` : toute l'app casse pour un cookie.                                                                                                                        | moyenne  | corrigé — décodage sous `try/catch`, valeur illisible traitée comme absente (le thème local reste appliqué) ; test `survit à une valeur mal encodée…` : **échouait** (`expected [Function] to not throw … 'URIError: URI malformed' was thrown`), vert après                                                                                                                                    |
| F142 | `buildCreatorVars` interpolait `accentColor` et `fontFamily` bruts dans `--primary`/`var(--font-${fontFamily})`, valeurs rendues en SSR dans un `<style dangerouslySetInnerHTML>`. `accentColor: '#fff;</style><script>alert(1)</script>'` **fermait la balise** : injection HTML exécutable sur les pages tenant/studio à partir d'un champ créateur. Le garde `guard:dangerous-html` exemptait ce puits en affirmant « thème validé » — faux. | haute    | corrigé — **liste blanche** : l'accent doit passer `parseHexColor` (HEX 3/4/6/8, casse conservée) sinon ignoré, la police doit être un identifiant de registre (`/^[a-z][a-z0-9-]{0,31}$/i`) ; 3 tests : accent refusé, police refusée et absence de `<script>` dans le rendu : **échouaient** (`expected '#fff;</style><script>alert(1)</script>' to be undefined`, `expected 'var(--font-serif); } html{display:non…' to be undefined`, `expected '<style>:root { --primary: #fff;</styl…' not to contain '<script'`), verts après |
| F143 | `getThemeCookieDomain` testait `hostname.endsWith('qoe.fi')` : `evilqoe.fi` (ou `notqoe.fi`) satisfaisait le suffixe et la page étrangère écrivait le cookie de thème avec `Domain=.qoe.fi`.                                                                                                                                                                                                         | moyenne  | corrigé — égalité stricte ou suffixe **précédé du point** (`host === 'qoe.fi' \|\| host.endsWith('.qoe.fi')`), hôte injectable pour le test ; test `ne revendique le domaine parent que pour qoe.fi…` : **échouait** (`expected null to be '.qoe.fi'`), vert après                                                                                                                              |
| F144 | `@theme inline` redéclarait cinq familles en **auto-référence** (`--font-sans: var(--font-sans)`, `--font-heading: var(--font-sans)`, `--font-outfit`, `--font-space-grotesk`, `--font-serif`) : déclarations mortes, et `font-heading` ne pointait vers aucune pile du paquet. **Pas de bug visible** — la variable retombait sur celle posée par `next/font` dans les cinq apps (`Geist` sur `<html>`) ou sur le défaut Tailwind — d'où la sévérité.                                            | faible   | corrigé — `--font-sans` et `--font-heading` déclarés une fois dans `@theme` avec la pile produit (couche `theme`, donc dominée par la classe `next/font` non layerée : `Geist` reste appliqué), auto-références retirées ; test `n'expose jamais un token qui se référence lui-même` : **échouait** (`expected [ Array(4) ] to deeply equal []`), vert après ; `pnpm --filter @qoe/hi build` vert et `--font-sans` émis dans `@layer theme` |
| F145 | `packages/theme/package.json` n'avait **aucun script `test`** : `turbo run test` (et donc la CI) ne lançait jamais `colors.test.ts` — 10 tests existaient mais aucun pipeline ne les exécutait, et les tests de ce lot seraient nés dans le même angle mort.                                                                                                                                        | moyenne  | corrigé — script `"test": "vitest run"` (même convention que `@qoe/utils`) ; test `déclare un script test…` : **échouait** (`expected undefined to be 'vitest run'`), vert après ; `pnpm --filter @qoe/theme test` passe de « Missing script » à vert                                                                                 |

**Preuve rouge → vert.** Les tests ont été écrits avant les correctifs, dans
un nouveau fichier `src/__tests__/theme-hardening.test.tsx`. Premier passage
sur le paquet → **7 échecs sur 18** (F141, F143, les trois cas F142, F144,
F145), messages exacts ci-dessus ; après correctif, **18 tests / 2 fichiers
verts**, sans retoucher `colors.test.ts` ni aucun cas existant.

**Preuves (arbre propre, après commits) :**

| Commande | Résultat |
| -------- | -------- |
| `pnpm --filter @qoe/theme test` | **18 tests / 2 fichiers verts** (10/1 avant le lot : **+8 tests, +1 fichier**) |
| `pnpm --filter @qoe/ui test` | **677 tests / 109 fichiers verts** (inchangé : ce lot ne touche aucun composant UI) |
| `pnpm typecheck` | 25/25 tâches |
| `pnpm --filter @qoe/theme lint` | 0 erreur, 0 avertissement |
| `pnpm --filter @qoe/hi build` | vert — les feuilles du paquet compilent, `--font-sans` émis dans `@layer theme` et la classe `next/font` (non layerée) reste prioritaire |
| `pnpm --filter @qoe/ui lint` | 0 erreur, 0 avertissement |
| les 9 gardes CI (`guard:media-origin`, `audit:guard`, `ui:audit`, `arch:audit`, `guard:article-links`, `guard:dangerous-html`, `guard:flags-parity`, `guard:legal-consent`, `guard:seed-script`) | tous verts |

**Observations trouvées, volontairement non corrigées.**

- `THEMES` et `ACCENTS` (avec `dataTheme`, `dataAccent`) n'ont **aucun
  consommateur** dans le dépôt et aucun sélecteur `[data-theme=…]` n'existe
  dans les feuilles : le mode sombre passe par la classe `.dark` et l'accent par
  `[data-accent='vermillion']`. La surface est morte mais publique → **R65**
  (décision produit/API), pas un bug de rendu.
- `PARENT_DOMAIN = 'qoe.fi'` reste en dur : c'est le domaine du produit, mais un
  fork doit éditer le paquet (même famille que les observations de
  portabilité de L07). Ce lot ne le rend pas configurable (pas de variable
  d'environnement côté client, le cookie est écrit dans le navigateur).
- Le patch `console` en développement de `ThemeProvider` utilise `as any` +
  `eslint-disable` : préexistant, le rendre type-safe demande de réécrire la
  signature de `console.error` (surcharges variadiques), hors correctif minimal.
- `CookieReader` interroge le cookie toutes les `THEME_COOKIE_POLL_MS` en plus
  des événements `focus`/`visibilitychange` : coût volontaire (sous-domaines),
  aucun repaint tant que la valeur ne change.
- `ThemeSeedScript` **avait déjà** son `localStorage.setItem` sous `try/catch`
  et ne réagit qu'à `light`/`dark` : aucune action, contrairement à la lecture
  non gardée de F138.
- `resolveAccentFromColor` reconnaît `#ee4b2b`, qui est bien la valeur de
  `--vermillion-500` (`tokens.css`) : pas d'incohérence de token ici.

**Dettes.** **R54** (baselines visuelles), **R56** (doublons `select`/`date`) et
**R01** (`checkContentAccess` fail-open) restent **ouvertes** (décision
utilisateur) ; **R63** (deeplink Go) et **R64** (lightboxes) inchangées.
Nouvelle dette : **R65** (registre de thèmes non câblé, décision produit).

---

## L09 — `@qoe/brand` tracés, avatars, studio, cibles web & native — durci le 2026-11-19

**Périmètre.** Les **10 fichiers** du paquet lus en entier : `paths.ts` (logos,
badges, silhouettes, 12 icônes sociales), `avatars.ts`, `studio.ts`,
`index.tsx` (cible web), `native.tsx` (cible React Native) et les cinq suites.
**Consommateurs réels vérifiés** : `packages/ui/src/{Logo,SocialIcon,SafeAvatar,
NotFoundView,sidebar}.tsx` et `packages/ui/src/ui/CertifiedBadge.tsx` (re-export
+ i18n), `apps/mobile/src/components/header/QoeLogo.tsx` (passe `height`, `width`
et `color`) et `apps/mobile/src/components/ui/badge.tsx`.

| #    | Défaut                                                                                                                                                                                                                                                                                       | Sévérité | Statut                                                                                                                                                                                                                                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F146 | `SocialIcon` (web **et** natif) indexait `BRAND_SOCIAL_ICONS[platform]` : une clé héritée (`constructor`, `toString`, `__proto__`, `hasOwnProperty`) renvoyait une fonction truthy, le composant quittait son repli et rendait un `<svg>` **sans `viewBox` ni `path`** (icône vide). La clé vient d'un lien social saisi par l'utilisateur. | moyenne  | corrigé — helper `getSocialIcon()` dans `paths.ts` avec `Object.hasOwn`, utilisé par les deux cibles ; les quatre clés héritées retombent sur le globe ; test `rend le fallback web pour une clé du prototype…` : **échouait** (`constructor: expected '<svg fill="currentColor" …' to contain '<line'`), vert après |
| F147 | Cible native : les ratios étaient **recopiés à la main** (`1.624`, `2.585`) au lieu de `BRAND_LOGOS.*.aspectRatio` (exporté, jamais consommé), et `width` seul laissait la hauteur à `size` — `<LogoWordmark width={120} />` rendait 120 × 28, un logo écrasé. `apps/mobile/QoeLogo` expose précisément cette prop `width`.                                                              | moyenne  | corrigé — hauteur déduite de la largeur (et inversement) à partir de `aspectRatio` ; test `déduit la hauteur d'une largeur imposée` : **échouait** (`height="62"` attendu, 28 reçu), et `déduit la largeur du viewBox du wordmark` : **échouait** (`width="1416"` attendu, 1417 reçu au ratio 2,585) |
| F148 | Cible native : le repli de `SocialIcon` ne dessinait **qu'un cercle nu**, là où le web rend le globe complet (cercle + méridien + ligne) : une plateforme inconnue devenait une pastille vide sur mobile.                                                                                                                                                  | moyenne  | corrigé — mêmes primitives que le web (`Circle`, `Line`, `Path`, bouts arrondis) ; test `rend le fallback natif complet` : **échouait** (`expected '<div data-native-view…' to contain '<circle'`), vert après                                                                                            |
| F149 | `getDefaultAvatar(3.7)` calculait `DEFAULT_AVATARS[2.7]` → `undefined` → repli silencieux sur l'**avatar 1** au lieu du troisième ; un identifiant fractionnaire (moyenne d'analytics, import) changeait l'avatar affiché.                                                                                                                                    | faible   | corrigé — troncature (`Math.trunc`) avant la borne 1–10 ; test `tronque un identifiant fractionnaire…` : **échouait** (`expected 1 to be 3`), vert après                                                                                                                                                 |

**Preuve rouge → vert.** Les cinq tests ont été écrits avant les correctifs.
Premier passage → **5 échecs sur 37**, puis `6 fichiers / 37 tests verts`.
Un seul test existant a bougé : la doublure `react-native-svg` de
`native-components.test.tsx` ne connaissait pas `Line`, désormais utilisée par
le repli natif — **ajout d'un export au mock, aucune assertion modifiée**
(échec vu : `No "Line" export is defined on the "react-native-svg" mock`).

**Preuves (arbre propre, après commits) :**

| Commande | Résultat |
| -------- | -------- |
| `pnpm --filter @qoe/brand test` | **37 tests / 6 fichiers verts** (32/5 avant : **+5 tests, +1 fichier**) |
| `pnpm --filter @qoe/ui test` | **677 tests / 109 fichiers verts** (inchangé) |
| `pnpm typecheck` | 25/25 tâches |
| `pnpm --filter @qoe/brand lint` | 0 erreur, 0 avertissement |
| `pnpm --filter @qoe/ui lint` | 0 erreur, 0 avertissement |
| les 9 gardes CI | tous verts |

**Observations trouvées, volontairement non corrigées.**

- `BRAND_BADGES.media` n'a pas de `strokeWidth` : les deux rendus recopient
  `1.2` alors que `certified` déclare le sien (1,5). Aucun écart visuel
  observable, et déplacer la valeur dans le registre ne changerait pas le
  rendu — laissé tel quel plutôt que de créer un va-et-vient sans preuve.
- Couleurs de repli en dur côté natif (`#71717A` pour les silhouettes,
  `#000000` pour le wordmark) : React Native n'a pas de variables CSS, la
  teinte vient des props ; le wordmark noir reste invisible en thème sombre si
  l'appelant ne passe pas `color` — arbitrage design, aucun appelant concerné
  aujourd'hui (`QoeLogo` transmet `color`).
- `DEFAULT_AVATARS` (palette `#4f46e5`…`#f97316`) duplique la palette du design
  system au lieu de la consommer : `@qoe/brand` n'a aucune dépendance, et les
  avatars sont aussi servis par le seed Go.
- `twitter` reste un alias de `x` (même tracé) : voulu pour les anciens liens.
- `isDefaultAvatarUrl` n'accepte qu'un chemin nu (pas de `?v=`, pas d'URL
  absolue) : aucun consommateur ne l'appelle, donc pas d'arbitrage à trancher
  aujourd'hui — voir **R66**.

**Dettes.** **R01**, **R54**, **R56**, **R63**, **R64**, **R65** restent
**ouvertes** (décisions utilisateur/produit/serveur). Nouvelle dette : **R66**
(registres `DEFAULT_AVATARS`/`STUDIO_ENTITIES` sans consommateur TS).

---

## L10 — `@qoe/content` canonique, projection continue, surlignage, paywall — durci le 2026-11-19

**Périmètre.** Les **16 sources + 6 suites** du paquet lues en entier
(`canonical/{types,anchors,unicode}`, `continuous/{types,projection,attributed}`,
`highlighter/{types,slicer,segment-window}`, `excerpt/{clean-excerpt,html-entities}`,
`paywall/{metrics,semantic-cut}`, les barrels et `vitest.config.ts`).
**Consommateur réel unique** : `apps/mobile/src/lib/highlight-queue-core.ts`
(importe `computeLocalAnchors`, `makeLocalId`, `normalizeCanonical`), avec sa
suite de 13 tests. **Contrat serveur relu** : `apps/api/internal/canon/canon.go`
(`Normalize` via `unicode.IsSpace` + `strings.TrimSpace`, `Find` + replis
tolérants) et `canon_test.go`.

| #    | Défaut                                                                                                                                                                                                                                                                                                    | Sévérité | Statut                                                                                                                                                                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F150 | `normalizeCanonical` prétendait être le « miroir fidèle » de `canon.Normalize` mais utilisait `\s` de JavaScript : il **ignorait U+0085 (NEL)** — blanc pour `unicode.IsSpace` — et **traitait U+FEFF (BOM) comme un blanc**, que Go conserve. Un passage collé depuis un terminal (NEL) ou un fichier (BOM) était donc ancré à un autre offset que côté serveur, alors que ces ancres servent à rendre le surlignage optimiste. | moyenne  | corrigé — classe `GO_SPACE` calquée sur `unicode.IsSpace` (et elle seule), trim final limité au séparateur ASCII (pas de `trim()` qui mangerait le BOM) ; 3 tests : **échouaient** (`expected 'a\u0085b' to be 'a b'`, `expected 'a b' to be 'a\ufeffb'`), verts après |
| F151 | `cleanArticleExcerpt` tronquait avec `text.slice(0, maxLength)`, donc en **unités UTF-16** : une coupe au milieu d'un emoji laissait un demi-surrogate dans l'extrait, chaîne illégale une fois stockée en base et sérialisée en JSON.                                                                      | moyenne  | corrigé — coupe reculée d'une unité si elle tombe sur une high surrogate ; test `ne coupe jamais une paire de substitution` : **échouait** (`expected '😀😀😀😀😀�…' not to match /[\uD800-\uDBFF](?![\uDC00-\uDFFF])…/`), vert après                                                                  |
| F152 | `decodeHtmlEntities` passait tout point de code `0 ≤ n ≤ 0x10FFFF` à `String.fromCodePoint` : `&#0;` injectait un **NUL** et `&#xD800;` un **surrogate isolé** dans le résumé.                                                                                                                              | faible   | corrigé — `decodeCodePoint` refuse 0, les demi-paires et les valeurs hors plan (l'entité reste littérale, comme pour une entité inconnue) ; 2 tests : **échouaient** (`expected 'a\u0000b' to be 'a&#0;b'`, `expected '� et �' not to match …`), verts après                                                                                                                                    |
| F153 | `calculateReadingTimeMinutes` documentait `cjkCpm` (350 caractères/min) mais **l'ignorait** : chaque idéogramme était compté comme un mot latin à 200 wpm, soit près du double du temps annoncé (700 idéogrammes → 4 min au lieu de 2).                                                                      | moyenne  | corrigé — portions latine et CJK calculées séparément (`latinWords/wpm + cjkChars/cjkCpm`), minimum 1 min conservé ; 2 tests : **échouaient** (`expected 4 to be 2`, `expected 3 to be 2`), verts après                                                                                                                                    |
| F154 | Le document canonique déclare `style: 'strike'` (et l'alias HTML `s`), mais `NativeInlineStyle` ne les connaissait pas : `projection.ts` les laissait passer par un cast `as NativeInlineStyle` et `PaintSpan` n'avait aucun drapeau — le barré **disparaissait** au rendu, et un style inconnu traversait le type. | moyenne  | corrigé — `strike` ajouté à l'union native, `PaintSpan.strike` peint comme les autres styles, alias `s` → `strike`, styles inconnus écartés par une liste blanche (plus de cast) ; 3 tests : **échouaient** (`expected false to be true`, `expected [ 's' ] to deeply equal [ 'strike' ]`, `expected [ { startCp: +0, endCp: 2, …(2) } ] to deeply equal []`), verts après |

**Preuve rouge → vert.** Tests écrits avant correctifs. F150–F153 : premier
passage → **7 échecs sur 53**. F154 : les trois tests ont été écrits après la
lecture du code mais **avant** le correctif, et l'échec a été capturé en
remettant les fichiers d'origine (`git stash -- src/continuous`) :
3 échecs sur 3, puis `7 fichiers / 56 tests verts`. Aucune assertion
existante modifiée, aucune doublure touchée.

**Preuves (arbre propre, après commits) :**

| Commande | Résultat |
| -------- | -------- |
| `pnpm --filter @qoe/content test` | **56 tests / 7 fichiers verts** (46/6 avant : **+10 tests, +1 fichier**) |
| `pnpm --filter @qoe/content test:coverage` | vert — **94,95 % stmts / 85,01 % branches / 100 % fonct. / 98,29 % lignes** (seuils 85/80/85/85 ; 84,39 % de branches avant) |
| `apps/mobile` — `src/lib/highlight-queue-core.test.ts` (consommateur direct) | **13 tests verts** |
| `pnpm --filter @qoe/ui test` | **677 tests / 109 fichiers verts** (inchangé) |
| `pnpm typecheck` | 25/25 tâches |
| `pnpm --filter @qoe/content lint` | 0 erreur, 0 avertissement |
| les 9 gardes CI | tous verts |

**Observations trouvées, volontairement non corrigées.**

- `computeLocalAnchors` ne porte **pas** les replis tolérants de
  `canon.Document.Find` (ellipses de bord retirées, préfixes de mots de plus en
  plus courts) : un passage remanié n'a pas d'aperçu optimiste avant la
  synchro. Le serveur reste autoritaire et le commentaire du consommateur
  l'assume — porter `findCandidates` serait une fonctionnalité, pas un
  correctif.
- `CanonicalInlineSpan.style` est typé `'bold' | … | string` : l'union est
  absorbée par `string`, donc une faute de frappe côté serveur compile. Un
  `(string & {})` garderait l'autocomplétion sans changement de comportement —
  aucun test ne peut prouver l'écart, laissé en observation.
- `buildArticleText` émet un `\n` avant ET après chaque `img`/`hr` : un
  document qui commence par une image produit un texte d'affichage qui commence
  par un saut de ligne (paragraphe vide en tête). Aucun consommateur actuel du
  flux continu, donc pas d'arbitrage de rendu à trancher ici.
- `DEFAULT_MARK_ARGB` est un `Record<string, number>` indexé ailleurs par le
  type de marque : aucune clé héritée n'est atteignable aujourd'hui (les
  valeurs viennent du type `NativeMark`, pas d'une saisie), mais le motif
  `Record<string, …>` reste exposé (même famille que F146).
- `createSemanticTeaser` compte et conserve le contenu de `<script>`/`<style>`
  s'il en trouve (les articles sont du HTML sanitisé côté serveur, aucun
  `<script>` ne peut y entrer) : pas de correctif sans entrée hostile réelle.

**Dettes.** **R01**, **R54**, **R56**, **R63**, **R64**, **R65**, **R66**
restent **ouvertes**. Nouvelle dette : **R67** (surfaces `continuous`,
`highlighter`, `paywall`, `excerpt` sans consommateur TS).

---

## L15 — `@qoe/analytics` referrers, Umami, lecture — durci le 2026-11-19

**Périmètre.** Les **8 sources + 5 suites** lues en entier (`index`, `client.tsx`,
`events`, `referrers`, `server`, `useArticleReadingTracker`,
`useFeedImpressionTracker`, `creator-analytics-aggregations.test`), + `package.json`,
`tsconfig.json`, `vitest.config.ts` et la config de couverture racine.
**Consommateurs réels vérifiés par import** : `apps/core` (`lib/analytics.ts`,
`AnalyticsGate`, `FeedDashboard`, `LibraryClient`, `ArticleAnnotatorView`),
`apps/tenants` (`AnalyticsGate`, `TenantArticleReadingTracker`), `apps/studio`
(`analytics/actions.ts` + blocs `TopPagesBlock`/`ReferrersBlock`/`DevicesAndGeoBlock`/
`TimeseriesChart`), `apps/admin` (layout), `apps/hi`. **Contrat serveur relu** :
`apps/core/src/app/api/analytics/{reading-session,feed-impression}/route.ts` et
`apps/tenants/.../reading-session/route.ts` (validation du statut/source, clamp
du scroll, fallback d'hôte) — le payload du hook correspond exactement à ce que
ces routes attendent (`hostname`, `referrerUsername`, `status`, `scrollDepth`).

| #    | Défaut                                                                                                                                                                                                                                              | Sévérité | Statut                                                                                                                                                                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F188 | `getReferrerLabel` classait sur l'**URL entière** : `https://example.com/t.co/article` devenait « X / Twitter » et `https://myblog.com/google-analytics-guide` devenait « Google Search » — les blocs Sources/Referrers du studio affichaient donc de fausses catégories. | moyenne  | corrigé — extraction de l'hôte (`new URL(...)`, domaine nu accepté) et motifs appliqués **à l'hôte seul** ; test : **échouait** (`expected 'Réseaux Sociaux' to be 'Web Referrer'` et `expected 'Recherche' to be 'Web Referrer'`), vert après |
| F189 | Aucun appel à l'API Umami n'était borné : login self-hosted, stats, timeseries et metrics utilisaient `fetch` **sans signal**. Un Umami qui ne répond pas retenait le rendu du dashboard (`apps/studio/analytics`) indéfiniment. | moyenne  | corrigé — `AbortSignal.timeout(UMAMI_TIMEOUT_MS = 5 000)` sur les 4 appels ; test : **échouait** (`expected undefined to be an instance of AbortSignal`), vert après |
| F190 | Un token Umami **révoqué/expiré** (401) n'invalidait pas le cache : le dashboard restait vide jusqu'à l'expiration des 4 h, sans nouvelle tentative de login. | moyenne  | corrigé — `fetchWithToken` : sur 401, invalidation du token de ce token précis puis **un** rejeu avec un token neuf ; test : **échouait** (`expected 1 to be 2` — un seul login, zéro donnée), vert après |
| F191 | Les réponses Umami étaient converties par simple `as UmamiPageMetric[]` : `{error: 'quota exceeded'}` traversait le typage et remontait jusqu'au studio, qui appelle `.map` dessus. | moyenne  | corrigé — validation `Array.isArray` (metrics et timeseries, y compris la forme `{pageviews: [...]}`) ; test : **échouait** (`expected { error: 'quota exceeded' } to deeply equal []`), vert après |
| F192 | **Les suites ne testaient pas le paquet** : `reading-tracker-logic.test.ts` et `creator-analytics-aggregations.test.ts` **recopiaient** la logique dans le fichier de test, si bien que `useArticleReadingTracker.ts`, `client.tsx` et les hooks n'étaient chargés par aucune suite (couverture 74,15 % avec ces fichiers à 0 %, invisibles du rapport). La logique était de plus **dupliquée** dans le hook (tick temps réel + rapport final) et classait `studio.qoe.fi`/`api.qoe.fi`/`studio.qoe.test` comme **publications de créateur**. | moyenne  | corrigé — extraction de `src/reading.ts` (`classifyReadingStatus`, `resolveReadingSource`, `resolveReadingProvenanceFrom`, `tenantHostname` avec liste des sous-domaines produit + apex), consommée par le hook et exportée par le barrel ; 7 tests sur les fonctions réelles. Test : **échouait** (`Cannot find module '/src/reading'` — aucune fonction publique n'existait) |
| F193 | Le paquet n'avait **ni `test:coverage`, ni plancher de couverture** : aucun gate ne mesurait `packages/analytics`, absent aussi de la config de couverture racine. | faible   | corrigé — `test:coverage` + `vitest.config.ts` (plancher 93/90/100/92) ; preuve : les seuils passent à 93,97/91,42/100/93,78 |

**Candidats examinés puis ABANDONNÉS** (pas de rouge = pas de correctif) :

- **`useTrackEvent` dépend de l'identité de `data`** : l'effet re-tire l'event à
  chaque rendu dès que l'appelant passe un littéral. Défaut réel à la lecture,
  mais **aucun rouge possible** ici : le paquet n'a ni `jsdom` ni
  `@testing-library/react` (ajout de dépendances = décision + lockfile). Consigné
  en **R75**, non corrigé à l'aveugle.
- **`?ref=<valeur libre>` accepté comme username** : contrat documenté ambigu
  (`?ref=simone` est légitime), donc pas de correctif sans décision produit →
  **R76**.
- **Zéros plutôt que `null` quand aucune auth n'est configurée** : comportement
  verrouillé par le test existant (`retourne des zéros quand aucune auth n'est
  configurée`) — conservé tel quel.

**Preuve rouge → vert.** Suite écrite avant correctifs (`analytics-hardening.test.ts`) :
premier passage **9 échecs / 10** (`Tests 9 failed | 1 passed`), messages cités
ci-dessus. Les 5 suites historiques (27 tests) sont restées vertes **sans aucune
modification d'assertion** — y compris les deux suites qui testent des copies,
laissées intactes comme documentation de la spec. Doublures ajoutées : `fetch`
global uniquement.

**Preuves (arbre propre, après commit) :**

| Commande | Avant | Après |
| -------- | ----- | ----- |
| `pnpm --filter @qoe/analytics test` | 27 tests / 5 fichiers | **44 tests / 6 fichiers verts** |
| `pnpm --filter @qoe/analytics test:coverage` | 74,15 % st. · 75,86 % br. · 66,66 % fn. · 72,61 % lignes — **aucun seuil**, `client.tsx`/hooks/`reading` invisibles | **93,97 % · 91,42 % · 100 % · 93,78 %** (plancher 93/90/100/92) |
| `pnpm --filter @qoe/analytics lint` / `typecheck` | 0 / 0 | **0 / 0** |
| `pnpm --filter @qoe/studio test` (consommateur direct) | 575 / 64 | **575 / 64 verts** |
| `pnpm --filter @qoe/core test` (consommateur direct) | 255 / 32 | **255 / 32 verts** |
| `pnpm --filter @qoe/tenants test` (consommateur direct) | 39 | **39 verts** |
| `pnpm test` (monorepo complet, turbo) | — | **24/24 tâches, 0 échec** |
| `pnpm typecheck` | 25/25 | **25/25 tâches** |
| les 9 gardes CI | vertes | **vertes** |

**Observations trouvées, volontairement non corrigées.**

- `fetchUmamiWebsiteStats` rend des **zéros** (et non `null`) sans
  authentification : le studio ne peut pas distinguer « Umami non configuré »
  de « zéro vue ». Comportement verrouillé par un test existant.
- `limit` est transmis brut à Umami (aucune borne) : l'appelant est le studio
  (`limit` constant), aucune entrée utilisateur.
- `EVENTS`/`EventProps` : le type `EventProps` ne couvre que 6 des 29 events du
  catalogue. Il n'est consommé nulle part aujourd'hui ; le compléter demanderait
  de typer chaque propriété métier.
- Le buffer d'impressions (`useFeedImpressionTracker`) est module-level et son
  minuteur de flush n'est jamais annulé : voulu (le lot doit survivre au
  démontage des cartes).

**Dettes.** **R01**, **R54**, **R56**, **R63** à **R68**, **R71** à **R74**
restent **ouvertes**. Nouvelles dettes : **R75** (aucune infra de test React),
**R76** (`?ref` libre interprété comme username), **R77** (défaut cloud
`api.umami.is` quand `UMAMI_API_URL` manque).

---

## L14 — `@qoe/moderation` identité, emails, texte, images, IA — durci le 2026-11-19

**Périmètre.** Les **16 sources + 2 suites** lues en entier (`index`, `email/{index,email-guard,disposable-domains}`,
`identity/{index,username-guard,homoglyphs}`, `text/{index,fast-path,chunker}`,
`image/{index,magic-bytes}`, `ai/{index,types,openai-omni}`) + `package.json`,
`tsconfig.json` et la configuration de couverture racine. **Consommateur réel
unique vérifié** : `apps/core/src/app/login/actions.ts` (`validateRegistrationEmail`,
`validateUsername` dans `signup`), à travers `apps/core/next.config.ts`
(`transpilePackages`) et `apps/core/package.json`. Recherche exhaustive : aucun
autre import de `@qoe/moderation` dans les 7 apps, les autres packages ni dans
`apps/api` (Go) — le paquet n'est appelé qu'à l'inscription. **Côté Go relu** :
`internal/antispam`, `internal/modules/media`, `internal/shared/identifier` —
aucune validation de pseudo/email équivalente côté serveur (la règle vit donc
uniquement ici), et `canonicalEmail` n'y est jamais lu.

| #    | Défaut                                                                                                                                                                                                                                                       | Sévérité | Statut                                                                                                                                                                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F181 | Les noms **réservés** n'étaient comparés qu'au pseudo brut : `adm1n`, `m0derator` ou `5upport` (leetspeak, ASCII valide) passaient la validation et permettaient l'**usurpation** d'un compte de l'équipe, alors que les motifs haineux, eux, étaient testés sur les variantes décodées. | haute    | corrigé — les quatre variantes (brut, homoglyphes, leetspeak, leetspeak sans symboles) sont testées contre `RESERVED_USERNAMES` **et** contre les motifs interdits ; test : **échouait** (`« adm1n » devrait être refusé: expected true to be false`), vert après |
| F182 | `chunkText` avec `chunkSize` invalide (`0`, négatif, `NaN`) ne produisait **aucun chunk pour un texte non vide** : le contenu disparaissait silencieusement de la modération (et la boucle parcourait le texte caractère par caractère). | moyenne  | corrigé — `normalizeOptions` : taille non finie ou `< 20` → défaut 4 000 ; test : **échouait** (`expected [] to have a length of 1 but got +0`), vert après                                                                                       |
| F183 | Avec `overlap > chunkSize`, le curseur ne reculait que d'**un caractère** par itération : 2 000 caractères produisaient **1 901 chunks** quasi identiques (coût IA multiplié par ~1 900). | moyenne  | corrigé — chevauchement borné à la moitié du chunk, progression garantie ; test : **échouait** (`expected 1901 to be less than 200`), vert après                                                                                          |
| F184 | La regex email acceptait un point en tête, en queue ou doublé dans la partie locale (`.a@qoe.fi`, `a.@qoe.fi`, `a..b@qoe.fi`) : `validateRegistrationEmail` répondait **valide**, puis Supabase refusait avec un message incompréhensible pour l'utilisateur. | moyenne  | corrigé — partie locale en `dot-atom` (RFC 5322 §3.4.1) ; test : **échouait** (`« .a@qoe.fi » devrait être rejeté: expected true to be false`), vert après                                                                              |
| F185 | Aucune borne sur la partie locale (RFC 5321 : 64 caractères) : `'a'.repeat(65) + '@qoe.fi'` était déclaré valide.                                                                                                                                            | faible   | corrigé — `MAX_EMAIL_LOCAL_PART_LENGTH = 64` avec message dédié ; test : **échouait** (`expected true to be false`), vert après                                                                                                            |
| F186 | Le minuteur d'abandon de `OpenAiModerator` était un `setTimeout` nettoyé **seulement après une réponse reçue** : un rejet réseau laissait une horloge active jusqu'à 4 s (`expected 1 to be +0`), et l'API `AbortController` + `setTimeout` est remplacée depuis Node 18 par `AbortSignal.timeout`. | moyenne  | corrigé — `signal: AbortSignal.timeout(this.timeoutMs)`, plus aucune horloge JS ; test : **échouait** (`expected 1 to be +0`), vert après                                                                                              |
| F187 | Le paquet n'avait **ni `test:coverage`, ni plancher de couverture local** : la seule gate était agrégée à la racine, donc un `pnpm --filter @qoe/moderation test` ne mesurait rien.                                                                     | faible   | corrigé — `test:coverage` + `vitest.config.ts` (plancher 90/80/100/92) ; preuve : `pnpm --filter @qoe/moderation test:coverage` passe les seuils                                                                                    |

**Candidats examinés puis ABANDONNÉS** (pas de rouge = pas un défaut) :

- **Homoglyphes cyrilliques sur un nom réservé** (`mоderator`, `аdmin`, `qое`) :
  le pseudo est refusé, mais par le **format ASCII** (`reason: 'format'`), pas
  par la liste de réservation — `expected 'format' to be 'reserved'`. Aucun
  compte ne peut donc être créé : conservé en garde de non-régression, pas
  présenté comme une faille.
- **Fuite de minuteur sur réponse HTTP en erreur** : le `clearTimeout` était déjà
  atteint avant le test de `response.ok` — le test a passé du premier coup
  (`1 passed`), donc seul le chemin de rejet réseau constituait le défaut F186.

**Preuve rouge → vert.** Suite écrite avant correctifs (`moderation-hardening.test.ts`),
rejouée contre les sources d'origine : **7 échecs / 8** (`Tests 7 failed | 1 passed`),
messages cités ci-dessus. Les 2 suites historiques (`moderation.test.ts`, 24 tests)
sont restées vertes **sans aucune modification d'assertion** ; les seules doublures
ajoutées portent sur des frontières externes (`fetch` global, horloges `vi.useFakeTimers`).

**Preuves (arbre propre, après commit) :**

| Commande | Avant | Après |
| -------- | ----- | ----- |
| `pnpm --filter @qoe/moderation test` | 24 tests / 1 fichier | **38 tests / 2 fichiers verts** |
| `pnpm --filter @qoe/moderation test:coverage` | 86,43 % st. · 81,05 % br. · 92,3 % fn. · 89,78 % lignes — **aucun seuil** | **95,75 % · 89,39 % · 100 % · 98,48 %** (plancher 90/80/100/92) |
| `pnpm --filter @qoe/moderation lint` / `typecheck` | 0 / 0 | **0 / 0** |
| `pnpm --filter @qoe/core test` (consommateur direct) | 255 / 32 | **255 / 32 verts** |
| `pnpm test` (monorepo complet, turbo) | — | **24/24 tâches, 0 échec** |
| `pnpm typecheck` | 25/25 | **25/25 tâches** |
| les 9 gardes CI | vertes | **vertes** |

**Observations trouvées, volontairement non corrigées.**

- `RESERVED_USERNAMES` contient `'a'`, **inatteignable** (longueur minimale 3).
  Entrée morte sans effet : la retirer ne change aucun comportement, la garder
  documente l'intention.
- `normalizeEmail` supprime le tag `+` pour **tous** les fournisseurs alors que
  le commentaire dit « pour les fournisseurs majeurs » : sans consommateur du
  `canonicalEmail` (R74), aucun effet observable aujourd'hui.
- `detectMagicBytes` exige **12 octets** minimum même pour un JPEG (3 suffisent) :
  un fichier réel fait toujours plus, et le plancher évite les faux positifs sur
  un buffer tronqué. Comportement verrouillé par les tests existants.
- `fastPathScan` est volontairement **strict et court** (4 motifs) : il ne
  remplace pas le modérateur IA, il coupe les menaces explicites avant l'écriture.

**Dettes.** **R01**, **R54**, **R56**, **R63** à **R68**, **R71**, **R72** restent
**ouvertes**. Nouvelles dettes :

- **R73** — `OpenAiModerator` est **fail-open** (pas de clé, clé mock, erreur
  HTTP, timeout réseau → `safe: true`). Choisi pour ne pas bloquer la publication
  quand l'API tombe, mais une clé absente en production désactive la modération
  **sans aucune trace**. Arbitrage attendu : alerte/métrique de repli, ou
  fail-closed avec file d'attente pour les médias.
- **R74** — `canonicalEmail` n'est **lu par personne** (ni Go, ni la base) :
  l'anti-multi-comptes n'existe pas au-delà de l'inscription. Arbitrage backend :
  colonne + index unique en migration goose, refus de doublon dans
  `/v1/auth/sync`, et décision sur les points Gmail (spécifiques à Gmail).

---

## L13 — `@qoe/i18n` catalogues, overrides, locale SSR, cookie — durci le 2026-11-19

**Périmètre.** Les **6 sources + 2 suites** lues en entier (`core`, `catalogs`,
`locales`, `server`, `provider`, `index`, `catalog.d.ts`, `core.test`,
`catalogs.test`) + `package.json`, `tsconfig.json` et les catalogues
`messages/{fr,en}.{json,js,po}`. **Consommateurs réels vérifiés par import** :
7 apps sur les 6 sous-chemins — `@qoe/i18n/server` (core, tenants, admin, studio,
hi : layouts, pages légales, footers, routes), `@qoe/i18n/provider` (les 4
layouts web), `@qoe/i18n/core` + `/catalogs` (`apps/mobile/src/context/language-provider.tsx`,
`apps/mobile/src/lib/i18n.ts`), `@qoe/i18n/locales`
(`apps/studio/src/lib/locale-header.ts`), barrel (`apps/core` settings,
`apps/hi` landing, `apps/admin` FrontendCMS).

| #    | Défaut                                                                                                                                                                                                                                             | Sévérité | Statut                                                                                                                                                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F169 | Les overrides de traduction **imbriqués** (`{"common":{"save":"Perso"}}`, format du legacy `fr.json`) n'étaient jamais appliqués : `translateKey` les injectait tels quels dans un map **plat**, donc la clé `common.save` continuait de rendre le catalogue et un objet se retrouvait au milieu des chaînes. | haute    | corrigé — résolution par chemin (`findOverride` accepte plat **et** imbriqué, aplati aussi dans `getStaticTranslations`) ; test : **échouait** (`expected 'Enregistrer' to be 'Perso'`), vert après                                                                  |
| F170 | `translateKey` appelait `setActiveLanguage`, c.-à-d. `i18n.load` + `i18n.activate` sur le **singleton** de `@lingui/core` : une requête SSR en `en` laissait l'instance globale en `en` pour les requêtes suivantes (fuite de locale entre requêtes concurrentes, macros `t\`…\`` comprises). | haute    | corrigé — instance `setupI18n` **par locale** (cache `localeInstances`), `translateKey` ne touche plus au singleton ; test : **échouait** (`expected 'en' to be 'fr'`), vert après                                                                                |
| F171 | Chaque traduction serveur rechargeait tout le catalogue (40–130 Ko) et réactivait l'instance : 50 appels = 50 `i18n.load`.                                                                                                                                  | moyenne  | corrigé — instance mémoïsée par locale ; test : **échouait** (`expected "load" to be called +0 times, but got 50 times`), vert après                                                                                                                            |
| F172 | Un payload d'overrides `null` faisait lever `TypeError` sur `overrides[lang]` — **500** sur toutes les pages traduites dès que `TRANSLATIONS_OVERRIDE` valait `"null"`.                                                                               | moyenne  | corrigé — `isRecord` + paramètre `Record<string, unknown> \| null` toléré ; test : **échouait** (TypeError), vert après                                                                                                                                         |
| F173 | `JSON.parse(config['TRANSLATIONS_OVERRIDE'])` était utilisé **sans validation** : `null`, `[1,2]` ou `"texte"` traversaient le typage `Record<string, unknown>`.                                                                                       | moyenne  | corrigé — `parseOverridesPayload` (objet non-tableau uniquement) ; test : **échouait** (`expected null to deeply equal {}`), vert après                                                                                                                          |
| F174 | Le `fetch` des overrides n'avait **ni timeout ni signal** : une API Go qui ne répond pas retenait le rendu SSR indéfiniment (aucun délai par défaut côté `fetch`).                                                                                      | moyenne  | corrigé — `AbortSignal.timeout(OVERRIDES_TIMEOUT_MS = 2 500 ms)` ; test : **échouait** (`expected undefined to be an instance of AbortSignal`), vert après                                                                                                     |
| F175 | La fusion catalogue compilé + legacy était recopiée **trois fois** (`catalogs.ts`, `server.ts`, `provider.tsx`) : deux ordres de fusion à maintenir, et le module RN-safe n'était pas la référence.                                                       | faible   | corrigé — `CATALOGS`/`getCatalog` source unique, serveur et provider la consomment ; test : **échouait** (`expected [ 'provider.tsx', 'server.ts' ] to deeply equal []`), vert après                                                                              |
| F176 | Côté client, `getStaticTranslations` mergait les overrides imbriqués dans un map plat : l'override était ignoré **et** un objet remplaçait une chaîne (`typeof messages.common === 'object'`).                                                          | moyenne  | corrigé — `flattenMessages(localeOverrides)` avant merge ; test : **échouait** (`expected 'Enregistrer' to be 'Perso'`), vert après                                                                                                                             |
| F177 | Hors `I18nClientProvider`, `useTranslate` (repli) ignorait le 3ᵉ argument : `t('k', 'Bonjour {name}', { name })` affichait littéralement **« Bonjour {name} »**.                                                                                       | moyenne  | corrigé — `fallbackTranslate` (interpolation `{param}`, paramètre objet accepté) ; test : **échouait** (export absent), vert après                                                                                                                              |
| F178 | `changeLanguage` écrivait `document.cookie = \`x-locale=${lang};path=/;max-age=…\`` **sans valider ni encoder** : `"fr; x-locale=en"` injectait un second cookie, et le cookie partait sans `SameSite` ni `Secure`.                                  | haute    | corrigé — `buildLocaleCookie` (langue ∈ `ALL_LANGUAGES`, `encodeURIComponent`, `SameSite=Lax`, `Secure` en https) ; test : **échouait** (chaîne sans attributs de sécurité), vert après                                                                           |
| F179 | La détection de domaine faisait `hostname.endsWith('qoe.fi')` : `evilqoe.fi` obtenait `domain=.qoe.fi`, tandis que `qoe.fi` (apex) n'en obtenait **aucun** (même classe que F156).                                                                    | faible   | corrigé — comparaison par labels (`hostname === domaine \|\| endsWith('.' + domaine)`) ; 2 assertions : **échouaient** (`expected '…;S…' to be '…;d…'`), vertes après                                                                                        |
| F180 | Le paquet n'avait **aucun script `test`** : ses 7 tests n'étaient lancés ni par `turbo run test`, ni par `pnpm verify` — et `server.ts`, `catalogs.ts`, `provider.tsx` n'étaient **chargés par aucune suite** (seul `core.ts` apparaissait en couverture). | moyenne  | corrigé — scripts `test` + `test:coverage` et plancher de couverture (`vitest.config.ts`) ; preuve : `pnpm --filter @qoe/i18n test` = 30 tests / 4 fichiers, seuils 94/79/100/94 respectés |

**Preuve rouge → vert.** Suite écrite avant correctifs (`i18n-hardening.test.ts`,
14 tests) puis rejouée contre les sources d'origine : **11 échecs / 14**, messages
cités ci-dessus — dont `expected "load" to be called +0 times, but got 50 times`
et `expected [ 'provider.tsx', 'server.ts' ] to deeply equal []`. Aucune assertion
existante modifiée (`core.test.ts`, `catalogs.test.ts` verts tels quels), aucune
doublure contournée : `next/cache` et `next/headers` sont remplacés par des
doublures minimales pour exécuter la logique réelle.

**Preuves (arbre propre, après commit) :**

| Commande | Avant | Après |
| -------- | ----- | ----- |
| `pnpm --filter @qoe/i18n test` | **aucun script** (7 tests / 2 fichiers, jamais exécutés par la CI) | **30 tests / 4 fichiers verts** |
| `pnpm --filter @qoe/i18n test:coverage` | 90,9 % st. · 72,41 % br. · 100 % fn. · 90,9 % lignes — **sur `core.ts` seul** (`server`, `catalogs`, `provider` jamais chargés) | **95,23 % · 80,35 % · 100 % · 95,23 %** sur 5 modules (seuils 94/79/100/94) |
| `pnpm --filter @qoe/i18n lint` / `typecheck` | 0 / 0 | **0 / 0** |
| `pnpm --filter @qoe/core test` | 255 / 32 | **255 / 32 verts** |
| `pnpm --filter @qoe/admin test` | 88 | **88 verts** |
| `pnpm --filter @qoe/studio test` | 575 / 64 | **575 / 64 verts** |
| `pnpm --filter @qoe/tenants test` | 39 | **39 verts** |
| `pnpm --filter @qoe/mobile test` | 176 / 15 | **176 / 15 verts** |
| `pnpm typecheck` | 25/25 | **25/25 tâches** |
| les 9 gardes CI | vertes | **vertes** |

**Observations trouvées, volontairement non corrigées.**

- `initI18n` **doit** activer le singleton : c'est le seul moyen pour que les
  macros `t\`…\`` des Server Components rendent dans la bonne langue. La locale
  reste donc globale pour ce chemin ; seule la voie `translateKey`/`getTranslate`
  est isolée. Voir R71.
- `translate` avale silencieusement toute erreur de compilation ICU
  (`catch { return defVal || key }`) : le repli est voulu (une traduction ne doit
  pas casser une page), mais l'erreur n'est pas tracée. Voir R72.
- `catalog.d.ts` déclare `module '*.js'` : le wildcard couvre aussi d'éventuels
  imports `.js` locaux du paquet. Aucun aujourd'hui.
- `getLanguage` garde des `catch {}` muets autour de `cookies()`/`headers()` :
  hors contexte de requête (build, script), le repli `fr` est le comportement
  attendu ; journaliser bruiterait chaque build.

**Dettes.** **R01**, **R54**, **R56**, **R63** à **R68** restent **ouvertes**.
Nouvelles dettes :

- **R71** — Les **macros** Lingui (`t\`…\``) compilées dans les Server Components
  lisent le singleton activé par `initI18n` dans chaque layout : deux requêtes
  concurrentes en `fr` et `en` peuvent encore s'entrelacer entre l'activation et
  le rendu des enfants. Le correctif propre demande soit de passer les macros en
  composants clients `useLingui()`, soit un stockage par requête
  (`AsyncLocalStorage`) — arbitrage d'architecture à valider.
- **R72** — `translate`/`compileMessage` masquent les erreurs de syntaxe ICU
  (repli silencieux). Utile en prod, aveuglant en développement : un avertissement
  conditionné à `NODE_ENV !== 'production'` serait le bon compromis, mais il
  faut d'abord décider de son volume en CI.

---

## L12 — `@qoe/formatters` devises, nombres, dates — durci le 2026-11-19

**Périmètre.** Les **4 sources + 1 suite** lues en entier (`index`, `currency`,
`numbers`, `dates`, `formatters.test`) + `package.json`, `tsconfig.json`,
`vitest.config.ts`. **Consommateurs réels vérifiés par import** :
`packages/utils/src/format.ts` (seul import du barrel), `apps/mobile/src/lib/format.ts`
(re-export → `time-elapsed.tsx`, `thought-actions.tsx`,
`thread-anchor-card.tsx`), `apps/core/src/app/(reader)/billing/billing-helpers.ts`
(→ `BillingClient.tsx`, composant `'use client'` prérendu). Aucun import de
`@qoe/formatters` dans `apps/tenants`, `apps/admin`, `apps/studio`, `apps/hi`,
`packages/ui`, `packages/content`, `packages/auth`, `packages/sdk` ni dans les
scripts de seed (vérifié par recherche exhaustive).

| #    | Défaut                                                                                                                                                                                                                                                                                                              | Sévérité | Statut                                                                                                                                                                                                                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F162 | `Infinity` traversait `typeof num === 'number'` et `Number.isNaN` : `formatCount(Infinity)` rendait **« Infinity Md »**, `formatBalanceCents(Infinity)` **« Infinity »**, `formatTransactionAmount(Infinity)` **« +Infinity € »**, `formatPercentage(Infinity, 100)` **`Infinity`** et `formatCurrency(Infinity)` **« ∞ € »**. | haute    | corrigé — `Number.isFinite` dans les quatre formateurs, même repli que `NaN` ; test : **échouait** (`expected 'Infinity Md' to be '0'`), vert après                                                                                          |
| F163 | Le repli d'entrée invalide de `formatCurrency` était **codé en dur en français** : `formatCurrency(NaN, { locale: 'en-US', currency: 'USD' })` rendait `0,00 USD` là où le chemin valide rend `$100.00` — deux formats dans la même fonction.                                                                  | moyenne  | corrigé — le `0` passe par le même formateur mémoïsé que les montants valides, avec espaces insécables normalisés pour garder la chaîne de repli stable ; test : **échouait** (`expected '0,00 USD' to be '$0.00'`), vert après |
| F164 | Des options incohérentes faisaient lever `Intl` et le `catch` rendait une chaîne brute, **sans devise ni groupement** : `formatCurrency(1.2, { minimumFractionDigits: 3, maximumFractionDigits: 2 })` donnait `1.200 €` (mauvais séparateur) ; un code devise vide laissait `25.50 ` avec un espace orphelin ; `minimumFractionDigits: NaN` donnait `toFixed(NaN)` → `25`. | moyenne  | corrigé — `max` borné à `max(min, …)`, décimales normalisées (entier 0–20) et repli sans espace final ; 2 tests : **échouaient** (`expected '1.200 €' to contain '1,200 €'`, `expected '25.50 ' to be '25.50'`), verts après |
| F165 | `formatTransactionDate` suivait le **fuseau ambiant** (`toLocaleDateString`) : pour l'instant `2026-08-17T22:30:00Z`, le serveur en UTC rend `17 août 2026, 22:30` et le navigateur parisien `18 août 2026, 00:30` — mismatch d'hydratation React dans `BillingClient` (`'use client'`, prérendu côté serveur). | haute    | corrigé — `timeZone` explicite, `Europe/Paris` par défaut, `DEFAULT_TIME_ZONE` exporté ; test : **échouait sous `TZ=America/New_York`** (`expected '17 août 2026, 18:30' to contain '18 août 2026'`) et sous `TZ=UTC` pour le fuseau explicite (`expected '18 août 2026, 00:30' to contain '17 août 2026'`), vert après |
| F166 | Une date **civile seule** (`'2026-08-17'`) était lue par `new Date()` comme minuit **UTC** : à Paris elle s'affichait `17 août 2026 à 02:00` au lieu de `00:00`, et à New York `16 août 2026` — un jour de décalage.                                                                                  | moyenne  | corrigé — `parseDate` construit les dates seules à minuit **local**, avec rejet des dates impossibles (`2026-02-31` n'est plus « corrigée » en 3 mars) ; test : **échouait** (`expected '17 août 2026 à 02:00' to be '17 août 2026 à 00:00'`), vert après |
| F167 | `Intl.NumberFormat` était reconstruit **à chaque appel** de `formatCurrency`, et `toLocaleDateString` construisait un `Intl.DateTimeFormat` par appel de `formatTransactionDate` — alors que ces helpers tournent à chaque rendu de liste (portefeuille, transactions).                        | faible   | corrigé — cache mémoïsé borné (64 formateurs devise, 32 date/heure) ; tests : **échouaient** (`expected 3 to be 1`, `expected +0 to be 1`), verts après                                                                          |
| F168 | `formatPercentage` propageait une précision invalide : `10 ** NaN` rendait **`NaN`** (affiché tel quel dans l'UI) et une précision négative tronquait le résultat à zéro.                                                                                                                                        | faible   | corrigé — précision normale (entier 0–6, sinon 0) ; test : **échouait** (`expected NaN to be 33`), vert après                                                                                                                  |

**Preuve rouge → vert.** Les tests ont été écrits avant correctifs puis rejoués
contre les sources d'origine (`git stash` des trois modules) : **9 échecs sur 10**,
messages cités ci-dessus, plus les deux échecs dépendants du fuseau
(`TZ=UTC`, `TZ=America/New_York`). Aucune assertion existante modifiée : le test
historique `formatCurrency(NaN)` attend toujours `0,00 €` avec espace simple,
ce que la normalisation du repli préserve. Aucune doublure modifiée.

**Preuves (arbre propre, après commit) :**

| Commande | Avant | Après |
| -------- | ----- | ----- |
| `pnpm --filter @qoe/formatters test` | 10 tests / 1 fichier | **23 tests / 2 fichiers verts** |
| `pnpm --filter @qoe/formatters test:coverage` | 98,88 % st. · 90,58 % br. · 100 % fn. · 98,76 % lignes | **97,82 % · 89,91 % · 100 % · 99,17 %** (seuils 90/85/90/90 respectés) |
| `pnpm --filter @qoe/formatters lint` / `typecheck` | 0 problème | **0 problème / 0 erreur** |
| `pnpm --filter @qoe/utils test` (consommateur direct) | 150 tests / 14 fichiers | **150 / 14 verts** |
| `pnpm --filter @qoe/mobile test` (consommateur direct) | 176 tests / 15 fichiers | **176 / 15 verts** |
| `pnpm --filter @qoe/core test` (consommateur direct) | 255 tests / 32 fichiers | **255 / 32 verts** |
| `pnpm typecheck` | 25/25 | **25/25 tâches** |
| les 9 gardes CI | vertes | **vertes** |

**Observations trouvées, volontairement non corrigées.**

- `formatTransactionAmount` code `€` en dur et expose `euros` : le module s'annonce
  « universel », mais tous les appelants sont le portefeuille EUR (`apps/core`).
  Paramétrer la devise demanderait de toucher le contrat `FormattedTransactionAmount`
  pour un besoin qui n'existe pas.
- `niceDate('invalid-date')` **renvoie l'entrée telle quelle** (comportement verrouillé
  par un test existant) tandis que `niceDate(new Date(NaN))` renvoie `''` : deux replis
  pour la même erreur. Changer le contrat exige une décision produit sur l'affichage
  d'une date corrompue.
- `MONTHS_FR[date.getMonth()] ?? ''` : le `?? ''` est **inatteignable** (`getMonth()`
  est borné à 0–11). Code mort inoffensif laissé tel quel pour ne pas modifier les
  assertions.
- `formatCount` utilise l'espace simple U+0020, pas l'espace fine insécable des
  conventions typographiques françaises : choix visuel assumé par les tests.
- `toLocaleDateString` **est** `Intl.DateTimeFormat` : le passage au formateur mémoïsé
  ne change pas la chaîne produite (vérifié par les tests existants).

**Dettes.** **R01**, **R54**, **R56**, **R63** à **R68** restent **ouvertes**.
**R69** et **R70**, ouvertes à la clôture du lot, ont été **fermées dans la
foulée** (même journée, commit dédié) :

- **R69** — `MONTHS_FR` n'est plus exporté (constante interne de `dates.ts`) ;
  le barrel expose à la place `DEFAULT_TIME_ZONE`. Vérifié par recherche
  exhaustive : aucun import de `MONTHS_FR` dans les 7 apps ni les 15 packages.
- **R70** — `formatDuration` n'existe plus qu'une fois (`@qoe/utils`). Le studio
  est branché dessus (il affichait **« 61m 40s »** pour 3700 s, sans unité
  horaire, et des flottants non arrondis pour `avgDwellSeconds`), l'admin garde
  son libellé « vide » via un adaptateur `formatQueuedFor` (sa copie perdait les
  secondes : **« 90 s » → « 1 min »**). Un **garde de déduplication** échoue si
  une définition locale réapparaît (`packages/utils/src/__tests__/format-duration-dedupe.test.ts`) :
  il trouvait **2 fautifs** avant correction (`expected [ …(2) ] to deeply equal []`),
  il en trouve **0** après.

---

## L11 — `@qoe/config` constantes, env, routes, tenants, surfaces — durci le 2026-11-19

**Périmètre.** Les **16 sources + 6 suites** lues en entier (`constants`, `env`,
`features`, `schemas`, `legal`, `routes`, `tenant`, `domain-hub`, `surfaces`,
`surfaces-admin`, `surfaces-mobile`, `index`, `package.json`, `tsconfig`,
`vitest.config`). **Consommateurs réels vérifiés** : `apps/tenants` (`proxy.ts`,
`sitemap.ts`, `rss.xml`), `apps/admin/middleware.ts` + `login/actions.ts`,
`apps/studio/middleware.ts` + `login/route.ts` + **wizard d'onboarding**,
`apps/hi` (`Footer`, `CreatorHub`, `Hero`, `legal/[slug]`, `legal/page`,
`sitemap`, `support`), `apps/core` (`support-app`), `packages/auth/current-user`.
**Contrat serveur relu** : `apps/api/internal/shared/identifier/identifier.go`
(`var reserved`, `IsReserved`, `reservedTenantRoutes`) et
`apps/api/internal/modules/settings/service.go`.

| #    | Défaut                                                                                                                                                                                                                                                                                                         | Sévérité | Statut                                                                                                                                                                                                                                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F155 | `parseTenantHost('qoe.fi')` classait l'**apex du produit** en site tenant : `qoe.fi` n'était ni dans `SYSTEM_DOMAINS` ni suffixé par `.qoe.fi`, donc la branche « custom domain » le prenait pour une publication nommée `qoe.fi` (proxy, sitemap et RSS tenants faux).                                | haute    | corrigé — apex ajouté à `SYSTEM_DOMAINS` ; test `reconnaît l'apex qoe.fi comme domaine système…` : **échouait** (`expected false to be true`), vert après                                                                                        |
| F156 | `getAuthCookieDomain` testait `endsWith('qoefi')` **sans point de séparation ni l'apex** : `evilqoefi` revendiquait `.qoe.fi`, alors que `qoe.fi` et `studio.qoe.fi` n'obtenaient **aucun** domaine — le cookie SSO n'était jamais partagé entre sous-domaines de production.                       | moyenne  | corrigé — comparaison stricte ou suffixée par `.` (même règle que F143), apex et alias `qoefi` couverts ; 2 tests : **échouaient** (`expected undefined to be '.qoe.fi'`, `expected '.qoe.fi' to be undefined`), verts après                  |
| F157 | `resolveLegalDbSlug`/`toPublicLegalSlug` faisaient `map[clean] \|\| clean` : `/legal/constructor` renvoyait `Object.prototype.constructor`, donc **une fonction** à la place d'un slug (lookup de document, URL). Même classe que F146.                                                            | moyenne  | corrigé — `ownLookup` (`Object.hasOwn`) sur les deux tables ; test : **échouait** (`expected [Function Object] to be 'constructor'`), vert après                                                                                               |
| F158 | `getMonorepoUrl` recopiait la table des ports, les sous-domaines de production et la détection d'environnement de `domain-hub` : la vitrine était rendue à `http://start.<domaine>:15401` alors qu'`apps/hi` répond à la **racine** de son port (lien d'aide cassé dans `apps/core`), et les ports étaient figés à six endroits. | moyenne  | corrigé — délégation totale à `resolveAppUrl` (`MONOREPO_SERVICES`, `satisfies`) ; test `sert la vitrine à la racine de son port…` : **échouait** (`expected 'http://start.lvh.me:15401' to be 'http://lvh.me:15401'`), vert après           |
| F159 | La branche navigateur de `parseEnv` **omettait `NEXT_PUBLIC_STUDIO_URL`** de `clientValues` : la valeur configurée était remplacée par le défaut `http://studio.localhost`, alors que `NEXT_PUBLIC_DASHBOARD_URL` (même application) était bien transmis.                                          | faible   | corrigé — variable ajoutée à `clientValues` ; test : **échouait** (`expected 'http://studio.localhost' to be 'https://studio.example.com'`), vert après                                                                                      |
| F160 | `RESERVED_SUBDOMAINS` ne portait que 16 noms, quand `identifier.reserved` (Go) en refuse **41** : `parseTenantHost('media.qoe.fi')`, `('search.qoe.fi')` ou `('support.qoe.fi')` traitaient des hôtes du produit comme des sites tenants. Le wizard d'onboarding en tenait une **troisième copie** (26 entrées), sans `collab`/`core`/`tenants` — qu'il pouvait donc proposer comme adresse disponible. | haute    | corrigé — liste TS alignée sur Go (+ hôtes produit `hi`/`core`/`tenants`/`collab`/`assets`), wizard branché sur `@qoe/config/tenant` via `isReservedSubdomain` ; 2 tests config : **échouaient** (`expected [ 'billing', 'blog', 'dev', …(27) ] to deeply equal []`, `billing: expected false to be true`) et 2 tests studio : **échouaient** (`collab: expected false to be true`, `search: expected false to be true`) |
| F161 | Dans le wizard, `const consentAccepted = true` n'était **jamais lu** (avertissement ESLint `'consentAccepted' is assigned a value but never used`) alors que `guard:legal-consent` le compte comme **sentinelle** de l'acte de consentement : la preuve ne dépendait d'aucun état.                  | faible   | corrigé — le drapeau conditionne désormais l'appel `acceptLegalConsentsAction` (`consentAccepted && consentDocuments.length > 0`), donc il porte réellement l'acte ; vérifications : ESLint 0 problème, et la suppression du drapeau faisait échouer le garde (`✗ wizard onboarding studio (…wizard.tsx) : acte de consentement perdu`) |

**Preuve rouge → vert.** Tests écrits avant correctifs : premier passage `@qoe/config`
→ **6 échecs sur 87**, puis **89 / 7 fichiers verts**. Côté studio, la liste
réservée a d'abord été isolée dans `onboarding/lib/reserved-subdomains.ts`
avec l'ancienne copie locale pour capturer le rouge : **2 échecs sur 3**, puis
3/3 après branchement sur `@qoe/config/tenant`. Aucune assertion existante
modifiée, aucune doublure touchée.

**Preuves (arbre propre, après commits) :**

| Commande | Résultat |
| -------- | -------- |
| `pnpm --filter @qoe/config test` | **89 tests / 7 fichiers verts** (76/6 avant : **+13 tests, +1 fichier**) |
| `pnpm --filter @qoe/config lint` / `typecheck` | 0 erreur, 0 avertissement · ok |
| `pnpm --filter @qoe/studio test` | **575 tests / 64 fichiers verts** (572/63 avant : +3 tests, +1 fichier) |
| `pnpm --filter @qoe/tenants test` | **39 tests verts** (consommateur de `parseTenantHost`) |
| `pnpm --filter @qoe/auth test` | **26 tests verts** (consommateur de `getMonorepoUrl`) |
| `pnpm --filter @qoe/ui test` | **677 tests / 109 fichiers verts** (inchangé) |
| `pnpm typecheck` | 25/25 tâches |
| les 9 gardes CI | tous verts (dont `guard:legal-consent`, cassé puis réparé par F161) |

**Observations trouvées, volontairement non corrigées.**

- `env.ts` rend la branche navigateur avec un **cast**
  `as z.infer<typeof envSchema>` : `env.DATABASE_URL` est typé `string` alors
  que la clé n'existe pas dans le navigateur. Aucun composant client ne lit ces
  clés aujourd'hui ; une correction propre demande **deux exports** (`env`
  serveur, `publicEnv` navigateur) et touche tous les appelants — arbitrage
  d'architecture, pas un bug observable.
- `getAuthCookieDomain` n'a **aucun consommateur** dans le dépôt (le SSO est
  câblé ailleurs) : corrigé quand même parce que la fonction est exportée et
  fausse, mais le branchement réel reste à décider.
- `URLS.DOCS` renvoie `https://docs.qoe.fi` **même en développement** : la
  documentation est un site statique hors monorepo, sans app locale — assumé,
  documenté dans `DOCS_URL`.
- `index.ts` doit ré-exporter explicitement `getLandingAppUrl`/`getMainAppUrl`
  car `./legal`, `./tenant` et `./domain-hub` en déclarent chacun une variante
  (`export *` laisse l'ambiguïté non résolue) : la ligne explicite fige la
  version du Domain Hub. Pas de bug, mais trois définitions pour deux noms.
- `FEATURE_FLAGS`/`isFeatureEnabled`/`getCreatorFeatureToggles` n'ont **aucun
  consommateur** (le registre réel est `@qoe/flags`) → **R68**.

**Dettes.** **R01**, **R54**, **R56**, **R63** à **R67** restent **ouvertes**.
Nouvelle dette : **R68** (flags dupliqués dans `@qoe/config`).

---

## Campagne E2E complète — 2026-11-18

Toutes les suites ont été réellement exécutées (Go base vierge, vitest, SDK,
lint, gardes CI, SMTP local, puis **chaque projet Playwright** : `public-web`,
`core-journeys`, `security`, `like-privacy`, `oauth-consent`, `chromium`,
`tenants`, `admin`, `studio`, `admin-legal`, parcours `RUN_FULL_STACK=1`
compris). Défauts trouvés en chemin :

| #   | Défaut | Sévérité | Statut |
| --- | ------ | -------- | ------ |
| F88 | `like-privacy` pilotait le menu sans passer par le vrai widget React Aria et sans fermer le portail de consentement légal : le clic n'arrivait jamais au bouton (faux test). Réécrit sur les rôles réels + fermeture du portail. | moyenne | corrigé — `--project=like-privacy` vert |
| F89 | `api-access-control` : deux tests `fullyParallel` appelaient `/v1/home/config` en concurrence (assertion 404/200 instable) → `test.describe.configure({ mode: 'serial' })`. | moyenne | corrigé |
| F90 | `studio.spec.ts` / `admin.spec.ts` listaient des routes inexistantes (`/subscribers`, `/newsletter`, `/account`, `/admin/publishers`, `/admin/articles`, `/admin/moderation`, `/admin/finance`) ⇒ 404 au lieu de 307. Listes réalignées sur les dossiers réels. | moyenne | corrigé |
| F91 | `oauth-consent` sautait tout le fichier quand `/auth/v1/health` renvoyait 401 (Kong exige une `apikey`). Garde remplacé par `health.status < 500`. | moyenne | corrigé — 2 cas verts |
| F92 | `playwright.apps.config.ts` sondait `localhost:8090` : sur macOS `localhost` résout d'abord en `::1`, l'API Go (IPv4) était déclarée absente ⇒ attente infinie du webServer. Loopback explicite `127.0.0.1`. | haute | corrigé |
| F93 | Le même fichier relançait `next dev` alors que le serveur tournait : la sonde HTTP suivait le 307 de studio/admin vers le core et concluait « pas prêt » (`EADDRINUSE` ensuite). Readiness TCP + nettoyage du verrou `.next/dev/lock` (Next 16 refuse un second `next dev` du même dossier, et le verrou survit à un arrêt brutal). | haute | corrigé |
| F94 | `public-feed-capture`, `connected-feed-capture`, `newsletter-rfc8058` : ancienne forme d'URL (`a[href*="/article/"]`) et publication inexistante (`Subscriber.publicationId` → `Publisher`, 23503). Chemin canonique `/{propriétaire}/a/{slug}`, `Publisher` créé, `window.confirm` accepté (« Voir moins » d'une carte article demande confirmation ; Playwright refuse les dialogues par défaut, donc aucun POST ne partait), portail de consentement fermé, titre de réglages réel. | haute | corrigé — `--project=chromium` **20/20 verts** |
| F95 | `admin-legal` ignorait les deux gardes : publication juridique = acte **N3** (preuve forte récente **AAL2**) et **double validation** par une seconde personne. Ajout de `upgradeSessionToAal2()` (enrôlement TOTP + challenge + verify, TOTP sans dépendance) et du quorum réel (`request-publish` puis `approvals/{id}/decide`, le Go attend `approved`). Page publique visée sur `apps/hi` (`/legal/:slug` ≠ core, qui répond 308 vers `:15401`). | haute | corrigé — `--project=admin-legal` **2/2 verts** |

**Preuves** (Mac → VPS de dev, tunnels `15409`/`54321`/`6379`) :

| Commande | Résultat |
| -------- | -------- |
| `go test -p 1 -count=1 ./cmd/... ./internal/...` (base vierge) | **82 packages ok, exit 0** |
| `pnpm test` · SDK `vitest` · `pnpm lint` | 22/22 · 221 tests · 25/25 |
| `playwright --project=chromium` (7 fichiers) | **20/20 verts** |
| `playwright --project=studio --project=admin` (`RUN_FULL_STACK=1`) | verrou **et** dashboard authentifié verts |
| `playwright --project=admin-legal` (`RUN_FULL_STACK=1`) | **2/2 verts** (AAL2 + quorum) |
| `playwright --project=oauth-consent` | **2/2 verts** |
| `pnpm mail:dev` + `email_smtp_sink_test.go` (`SMTP_SINK=1`) | PASS (`.eml` écrit, sujet RFC 2047 décodé) |

---

## L38 — URLs d'article (core ↔ tenants) + SMTP de dev — durci le 2026-11-18

**Contexte.** Trois formes d'URL coexistent et **ne sont pas interchangeables** :
c'est la source d'anomalies la plus coûteuse du dépôt (liens qui marchent en
dev grâce à une redirection, puis cassent sur un domaine propre).

| Contexte                  | Forme canonique                                   | Formes secondaires                              |
| ------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| Tenant (domaine/sous-dom.) | `/{categorie}/{sous-categorie?}/{slug}`           | `/{code}` (928488), `/l/{code}`, `/author/{u}`  |
| Tenant (anciennes URLs)    | `/article/{slug}`, `/articles/{slug}` → **308**   | —                                               |
| Tenant (index)             | `/{categorie}`, `/{parent}/{enfant}`              | `/sitemap`, `/search`, `/about`, `/team`        |
| Core (qoe.fi)              | `/{proprietaire}/a/{slug}`                        | `/l/{code}`, `/{username}/thought/{id}`         |

`/{code}` n'existe **que** côté tenant : le core ne résout un code court que via
`/l/{code}` (tâche R47).

**Périmètre.** `apps/api/sql/queries/articles.sql` (+ sqlc), `apps/api/internal/
modules/articles/{service,shortcode}.go`, `packages/config/src/routes.ts`,
`packages/sdk/src/lib/shareUrl.ts`, `packages/ui/src/{social/LinkPreview,
seo/JsonLd}.tsx`, `apps/core/src/components/social/ArticleAnnotatorView.tsx`,
`scripts/guard-article-links.mjs`, `scripts/dev-smtp.mjs`.

### Findings et correctifs

| #   | Défaut                                                                                                                                       | Sévérité | Correctif                                                                                                              | Fichiers |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| F65 | Le Go ne renvoyait ni `shortCode` ni `category.parentSlug` sur la lecture d'article : impossible de composer le chemin d'une sous-rubrique (`/tech/ia/slug`), d'où les replis `/article/{slug}` | moyenne | `GetArticleBySlug`, `GetArticleBySlugAny`, `GetArticleByID` joignent la catégorie parente et exposent `shortCode` ; `CategoryInfo.parentSlug` + `ArticleResponse.shortCode` (sqlc régénéré) | `articles.sql`, `service.go` |
| F66 | `resolveArticleShareUrl` générait `/{slug}` sous `/article/` et ignorait la catégorie — forme obsolète, 404 sur sous-rubrique | haute | Délègue à `buildArticlePath()` (`@qoe/utils`) : `/{parent}/{categorie}/{slug}`, `uncategorized` par défaut, option `preferShortCode` → `/l/{code}` | `sdk/lib/shareUrl.ts`, `sdk/actions/tenant` |
| F67 | `LinkPreview` figeait `https://${subdomain}.qoe.fi/article/${slug}` : domaine propriétaire en dur, chemin obsolète, aucun domaine propre | moyenne | `getArticleUrl(..., { preferTenant: true, absolute: true })` | `ui/social/LinkPreview.tsx` |
| F68 | CTA paywall (`ArticleAnnotatorView`) : `https://{sub}.qoe.fi/article/{slug}` ou chemin core **inexistant** `/{publisher}/{slug}` | haute | `getArticleUrl(article, { preferTenant: true, absolute: true })` | `apps/core/.../ArticleAnnotatorView.tsx` |
| F69 | `buildArticleSchema` retombait sur `/article/{slug}` : JSON-LD déclarait une URL 404 dans le core | moyenne | Repli `/{owner}/a/{slug}` (owner = auteur, sinon `qoefi`) | `ui/seo/JsonLd.tsx` |
| F70 | `routes.tenant.article` encodait la sous-catégorie entière (`tech%2Fia`) → 404 | moyenne | `encodeSegments` : chaque segment encodé, `/` conservé ; ajout de `routes.tenant.category` | `config/routes.ts` |
| F71 | Aucun garde n'empêchait de régénérer l'ancienne forme ; l'anomalie revenait à chaque lot | moyenne | `guard:article-links` (CI) : interdit `/article/${…}` généré et les hôtes `qoe.fi` en dur, allowlist = redirections legacy documentées + R46 | `scripts/guard-article-links.mjs`, `package.json`, `ci.yml` |

### Tests ajoutés (table de vérité verrouillée)

- `packages/config/src/__tests__/article-route-shapes.test.ts` (8) : tenant
  avec sous-catégorie, domaine propre, encodage par segment, core `/{owner}/a/`,
  liens courts `/l/{code}`.
- `packages/sdk/src/__tests__/shareUrl.test.ts` (9) : jamais `/article/`,
  `uncategorized` par défaut, option code court.
- `packages/ui/src/seo/__tests__/JsonLd.test.tsx` : JSON-LD canonique core.
- `packages/sdk/src/__tests__/tenantActions.test.ts` : citation = chemin tenant
  `https://media.qoe.fi/tech/ia/slug-1`.

### SMTP local (sans Docker)

`scripts/dev-smtp.mjs` + `pnpm mail:dev` : puits SMTP autonome (aucune
dépendance), écoute sur `127.0.0.1:1025`, écrit chaque message en `.eml` dans
`.mail-outbox/` (gitignoré). Vérifié de bout en bout avec un client SMTP réel
(dot-unstuffing `.` → `..` compris). Côté mailer :

```bash
EMAIL_PROVIDER=smtp SMTP_HOST=127.0.0.1 SMTP_PORT=1025 pnpm dev
# SMTP_USER vide → aucune AUTH, donc aucun TLS requis
```

### Preuves exécutées

```bash
cd apps/api && sqlc generate && go build ./... && go vet ./internal/modules/articles/  # EXIT=0
cd packages/sdk && pnpm exec vitest run            # 29 fichiers / 207 tests
cd packages/config && pnpm exec vitest run         # 6 fichiers / 76 tests
cd packages/ui && pnpm exec vitest run src/seo src/social   # 49 tests
pnpm typecheck                                     # 25 successful, 25 total
node scripts/guard-article-links.mjs               # aucun lien obsolète
```

### Reste à faire (lot L38)

| #   | Tâche                                                                                                        | Sévérité | Motif                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------- |
| R46 | `NotificationItem` : le repli `article` doit venir du serveur (`url`)                                          | moyenne  | La cible est ambiguë (notification lue dans le core **ou** le studio) ; allowlisté dans le garde en attendant. |
| R47 | Le core n'accepte pas `/{code}` (code court nu), contrairement aux tenants                                     | faible   | Produit : ajouter une route `/[code]` numérique au core ou assumer `/l/{code}` partout.     |
| R48 | Généraliser `shortCode` à toutes les surfaces (cartes, e-mails) comme lien de partage stable                    | faible   | Le champ existe désormais côté Go ; les cartes n'ont pas encore la donnée.                  |

---

## Annexe — tracking d'e-mails : décision produit (R49)

**Verdict.** Oui, c'est pertinent — mais **plus tard**, en lot dédié, et
« click-first » : le clic est une intention réelle, l'ouverture n'est qu'un
signal estimé (Apple Mail Privacy Protection précharge les images et gonfle les
ouvertures de 30 à 50 % ; Gmail proxifie aussi les pixels). On ne construit
jamais une décision (facturation, classement d'auteur) sur l'ouverture.

**« Non contournable » = non forgeable, pas inévitable.** On ne peut pas rendre
un pixel inévitable (bloqueurs, texte brut, MPP, sécurité d'entreprise), et il
ne faut pas essayer : ce serait du fingerprinting. Ce qui doit être
infalsifiable :

1. **Jeton opaque signé** (HMAC-SHA256 côté serveur, comparaison à temps
   constant) : `recipientId × campaignId × linkId × nonce`, usage unique par
   événement, expiration. Personne ne peut gonfler les statistiques d'un autre.
2. **Redirection à destination stockée en base**, jamais de `?url=` (sinon
   open redirect + attribution falsifiable).
3. **Vérité côté domaine** : clic → lecture authentifiée → abonnement. Ces
   événements-là sont déjà à nous ; l'e-mail ne fournit qu'une *attribution*
   (fenêtre 7 jours) à ces conversions, pas la conversion elle-même.
4. **Idempotence** : contrainte unique `(recipientId, type, linkId)` + file
   asynq pour l'ingestion ; agrégats journaliers en rollup (l'edge répond 302
   sans attendre la base).
5. **Classement des robots** : `GoogleImageProxy`/MPP → événement
   `open_proxy` séparé ; scanners de liens (Microsoft Safe Links, Barracuda) →
   `suspected_prefetch`, jamais comptés comme humains.

**Interdits.** Pixel tiers (Meta/Google), e-mail de sécurité transactionnel
traqué (alerte de connexion, confirmation), IP brute conservée, redirection
ouverte, identifiant lisible dans l'URL.

**Phasage.**

| Phase | Contenu                                                            | Pourquoi maintenant / plus tard                          |
| ----- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| 0     | Événements serveur déjà disponibles : `sent`, `delivered`, `bounce`, `complaint` (`ArticleReleaseDelivery`, suppression, webhooks HMAC) + attribution des lectures | Zéro nouvelle surface, utile immédiatement               |
| 1     | Clics : jeton opaque, `GET /v1/email/click/{token}` → 302, table d'événements, rollup, dashboard studio par article | Le vrai KPI, faible coût, pas de risque délivrabilité     |
| 2     | Ouvertures marquées « estimées » + classification proxy/bot + opt-out par destinataire (le lien continue de fonctionner, sans enregistrement) | Après phase 1, avec base légale et rétention écrites      |
| 3     | Attribution revenu (fenêtre 7 j), cohortes, A/B d'objet                      | Nécessite des volumes et un modèle d'attribution stable    |

**Base légale / rétention.** Intérêt légitime pour des statistiques agrégées ;
suivi individuel = information claire + opt-out ; événements bruts 90 jours,
agrégats conservés ; pas de profilage hors plateforme.

Statut : `bloqué (produit)` — à planifier après l'audit, pas pendant.
