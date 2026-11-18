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
| L07a    | `packages/ui/src/primitives/**`, `ui/**`, `tokens.ts`                                                        | 310 fichiers (global)       | à auditer               |
| L07b    | `packages/ui/src/{reader,annotations,cards}/**`                                                              | idem                        | à auditer               |
| L07c    | `packages/ui/src/{auth,forms,providers}/**`                                                                  | idem                        | à auditer               |
| L07d    | `packages/ui/src/{security,seo,legal}/**`                                                                    | idem                        | à auditer               |
| L07e    | `packages/ui/src/{notifications,onboarding,profile,social,cmdk,templates,sidebar.tsx}`                       | idem                        | à auditer               |
| L08     | `packages/theme/src/**`                                                                                      | 19 fichiers                 | à auditer               |
| L09     | `packages/brand/src/**`                                                                                      | 10 fichiers                 | à auditer               |
| L10     | `packages/content/src/**`                                                                                    | 25 fichiers                 | à auditer               |
| L11     | `packages/config/src/**`                                                                                     | 17 fichiers                 | à auditer               |
| L12     | `packages/formatters/src/**`                                                                                 | 5 fichiers                  | à auditer               |
| L13     | `packages/i18n/src/**` + `messages/`                                                                         | 9 fichiers                  | à auditer               |
| L14     | `packages/moderation/src/**`                                                                                 | 16 fichiers                 | à auditer               |
| L15     | `packages/analytics/src/**`                                                                                  | 12 fichiers                 | à auditer               |
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

**Prochain lot à traiter : L07a — `packages/ui` (primitives et composants partagés).**
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

Cinq tests (`adminActions.test.ts`) verrouillent l'ordre « Go d'abord » (aucun
ban si le Go refuse), la compensation et la remontée d'erreur d'unban.

| #   | Tâche                                                                                                       | Sévérité | Motif |
| --- | ----------------------------------------------------------------------------------------------------------- | -------- | ----- |
| R50 | `legal` : `fetchLegalDocumentsToAccept` renvoie `[]` en cas de panne ⇒ l'inscription passe sans cases à cocher (fail-open sur le consentement). Trancher : bloquer l'inscription (fail-closed) ou accepter puis re-demander au portail, avec trace. | produit  | Décision juridique/produit, pas technique : le comportement actuel est un choix assumé mais non écrit. |
| R51 | `actions/ai`, `ebooks`, `workspace` : vérifier le contrat Go (quotas, taille, types MIME) avant d'écrire des gardes TS redondantes. | —        | Suite du lot L06d. |
| R52 | Invalidation par tag (`article:{id}`, `post:{id}`) au lieu de chemins legacy : les mutations de surlignage/annotation/réponse masquée ne rafraîchissent aujourd'hui rien côté serveur (F79, F82). | moyenne | Demande un `unstable_cache`/`cacheTag` dans les pages core et tenants ; à faire d'un bloc pour éviter les invalidations globales. |

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
