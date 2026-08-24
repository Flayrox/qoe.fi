# 🎯 Vision — API Créateurs & Médias (qoe.fi comme plateforme CMS)

> **Statut** : document de référence (living doc). Décisions actées en ✅, restantes en ⚠️.
> L'API créateurs a remplacé `apps/api` (Hono / api-legacy), désormais supprimé — voir `SUNSET_API_LEGACY.md`
> pour le plan de migration et la carte des endpoints.

---

## 1. Positionnement

Deux directions, un seul contrat :

- **Direction entrante** — un média **s'installe sur qoe.fi** et publie depuis son
  propre CMS (WordPress, Ghost, Payload, custom…) via l'API. qoe.fi est sa
  plateforme de diffusion (audience, paywall, analytics, notifications).
- **Direction sortante** — un média **utilise qoe.fi comme CMS (headless)** :
  il gère ses articles sur qoe.fi et les diffuse sur **son propre site** via
  l'API + webhooks. qoe.fi est son back-office de contenu.
- **Apps tierces** — des applications tierces (non médias) construisent sur
  qoe.fi via **OAuth** (en plus des clés API).

> Le mobile (iOS/Android) passe par le backend Go directement — hors contrat créateurs.

**Promesse** : _« n'importe quel média s'intègre sans jamais nous contacter »_.
Cela exige un **contrat stable, documenté et testé** — d'où le principe
contrat-first (§5).

---

## 2. Carte des capacités

### Direction entrante (publier sur qoe.fi depuis son CMS)

| Capacité                                                                 | État                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------- |
| Créer / éditer / publier / supprimer des articles                        | ✅ Go (`POST/PATCH /v1/articles`, `/publish`, `DELETE`) |
| Attribution au média (`publicationId`) + auteur humain + co-auteurs      | ✅ schéma + RBAC (`owner/editor/writer/viewer`)         |
| Scheduling (`scheduledAt`, `DRAFT/SCHEDULED/PUBLISHED`)                  | ✅ schéma — API à exposer                               |
| Paywall (`isPremium`, `visibility`, tiers)                               | ✅                                                      |
| Catégories, analytics                                                    | ✅                                                      |
| **Import bulk** (arriver avec des milliers d'articles)                   | ❌ à construire                                         |
| **Upload d'images/couvertures**                                          | ⚠️ à construire (stockage Supabase ?)                   |
| **Idempotency keys** (réessais sûrs)                                     | ❌ à construire                                         |
| **Webhooks de confirmation** (le CMS sait que la publication est passée) | ❌ à construire                                         |

### Direction sortante (qoe.fi comme CMS headless)

| Capacité                                               | État                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Lecture publique par slug + `publicationId`            | ✅ Go                                                                                 |
| Liste, catégories, analytics                           | ✅ (contrat à aligner, §4)                                                            |
| Paywall servi avec troncature zéro-fuite               | ✅                                                                                    |     | **Webhooks sortants signés** (le site du média se met à jour tout seul) | ✅ HMAC-SHA256 + retries + logs de livraison (worker asynq) · API de gestion Go ✅ · UI dashboard ⏳ |
| **Clés API par scope + rotation + rate-limit par clé** | ✅ scopes READ/WRITE/ANALYTICS (Go + dashboard) · ⏳ rotation · ⏳ rate-limit par clé |
| **Logs de livraison visibles dans le dashboard**       | ❌ à construire                                                                       |

### Apps tierces

| Capacité                                        | État                                       |
| ----------------------------------------------- | ------------------------------------------ |
| **OAuth 2.0** (authorization code + PKCE)       | ❌ à construire (décision ✅ « les deux ») |
| Scopes granulaires (lecture/écriture/analytics) | ❌ à construire                            |

---

## 3. Décisions actées ✅

| Décision                | Choix                                                           | Implication                                                                                                                                                                           |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**                | **Clés API ET OAuth**                                           | Clés `qoe_live_*` pour médias/créateurs ; OAuth 2.0 pour apps tierces                                                                                                                 |
| **Formats de contenu**  | **Markdown ET HTML**                                            | WordPress → HTML ; Ghost/Payload → Markdown. Format canonique interne + acceptation des deux                                                                                          |
| **Modération**          | Clé API délivrée **après analyse manuelle** + filet de sécurité | Les médias ne sont pas à l'abri d'une erreur : flags, suspension, alerte interne à la publication                                                                                     |     | **Contrat-first** | Spec OpenAPI = source de vérité | Golden tests Hono→Go, types générés, docs auto |
| **Publications/brands** | **Non pour l'instant** : 1 compte = 1 publication = 1 clé       | Isolement sécurité (une clé compromise = une seule marque) ; l'architecture (schéma polymorphe, API par `publicationId`) reste compatible multi-brands plus tard sans breaking change |

### Stratégie des deux formats (§3 décision formats)

- **Canonique interne** : Markdown comme format de stockage de référence
  (convertible en HTML à la lecture), **ou** HTML sanitisé si les médias cibles
  sont des régies classiques — **décision technique à finaliser** (§6).
- L'API accepte `contentFormat: "markdown" | "html"` à la création/mise à jour
  et normalise en interne (conversion + sanitisation, zéro XSS).
- Les marqueurs paywall multi-éditeurs sont déjà supportés des deux côtés
  (Ghost `<!--kg-gated-block-->`, `data-type="paywall-divider"` Lexical/TipTap…).

### Modèle de modération (détaillé)

1. **À l'octroi** : demande de clé → analyse manuelle (identité du média, existence
   réelle, charte) → délivrance de la clé. Les intégrations connues (WordPress,
   Ghost, Payload) sont des flux standards.
2. **En continu** : filet de sécurité même pour les médias approuvés —
   rate-limiting par clé, détection d'anomalies, capacité de suspension immédiate.
3. **Contenu** : workflow éditorial RBAC existant (`writer` ne publie pas,
   `editor`/`owner` publient) — les médias externes passent par le même workflow.

---

## 4. Contrat cible — écarts Go vs Hono (à aligner)

Source : `apps/api/src/app.ts` (Hono, supprimé) + `apps/api/internal/modules/articles/`.

| Écart               | Hono (actuel)                                   | Go (actuel)                                                                   | Action                                                    | Statut |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- | ------ |
| **Enveloppe liste** | `{ data: [...], pagination: {...} }`            | tableau brut (pas d'enveloppe)                                                | Adapter en Go (`ToCreatorList`)                           | ✅     |
| **Pagination**      | `page` (1-based, défaut 10, max 100)            | `offset` (0-based, défaut 50)                                                 | Accepter `page` + mapper en offset                        | ✅     |
| **Filtres liste**   | `category` (slug), `published: true` uniquement | aucun filtre, tous statuts                                                    | Ajouter `category` + défaut `published:true`              | ✅     |
| **Champ contenu**   | `contentHtml` (tronqué)                         | `content` (+ absent de la liste)                                              | Renommer + inclure dans la liste                          | ✅     |
| **Catégorie**       | objet `category {id,name,slug,description}`     | `categoryId` seul                                                             | Embedder l'objet                                          | ✅     |
| **Champs en trop**  | —                                               | `status, publicationId, authorId, tierId, author, publication, accessGranted` | Sortir du contrat créateurs (restent dans l'API publique) | ✅     |
| **Résolution slug** | clé API → `authorId`                            | `publicationId` en query (public)                                             | Aligner : clé API → publication du créateur               | ✅     |
| **Bonus Go**        | lecture seule                                   | `create/update/publish/delete`                                                | Conserver — cœur du cas CMS                               | ✅     |

> Le **golden test** `contract_test.go` (§Phase 0) verrouille la forme de sortie
> (enveloppe, nommage, pagination, troncature) contre des fixtures issues du
> contrat Hono réel.

---

## 5. Principes d'ingénierie (le « GOLD »)

1. **Contrat-first** — spec OpenAPI 3.1 versionnée (`docs/openapi/creators-api.yaml`)
   comme source de vérité ; golden tests contre le contrat réel.
2. **Zéro-fuite paywall** — la troncature est serveur, testée, jamais de contenu
   payant au-delà du marqueur transmis (déjà en place TS + Go).
3. **Idempotence** — clé `Idempotency-Key` sur POST/PATCH (réessais CMS sûrs).
4. **Webhooks signés** — HMAC-SHA256, retries/backoff, logs de livraison.
5. **Rate-limiting par clé** — par scope, pas seulement par IP.
6. **Sécurité des clés** — hash SHA-256 au repos, rotation, révocation, scopes.
7. **Sans-fuite** — jamais de secrets dans les réponses ni les logs.
8. **Versionnage** — contrat v1 stable ; changements = nouvelle version, jamais
   de breaking silencieux.

---

## 6. Décisions restantes ⚠️

| Question                     | Détail                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| **Format canonique interne** | Markdown (modernes) vs HTML sanitisé (régies classiques) — ou les deux stockés.             |
| **Format canonique interne** | Markdown (modernes) vs HTML sanitisé (régies classiques) — ou les deux stockés.             |
| **Upload média**             | Où stocker images/couvertures (Supabase Storage ?) + endpoint d'upload + transformations.   |
| **OAuth scope**              | Quels scopes pour les apps tierces (lecture publique ? écriture au nom de l'utilisateur ?). |
| **`/v1/search/articles`**    | Le recréer en Go (Meilisearch déjà en dép) ou l'abandonner.                                 |

---

## 7. Roadmap

| Phase                 | Contenu                                                                                                                                             | Statut                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **0 — Contrat-first** | Spec OpenAPI `docs/openapi/creators-api.yaml` + golden tests Go (`contract.go`/`contract_test.go`) verrouillant enveloppe, pagination et zéro-fuite | ✅ **fait**                    |     | **1 — Aligner `articles`** | Contrat complet : liste + slug (enveloppe, `page`, filtres, `contentHtml`, catégorie embarquée, clé API → publication) **et** `contentFormat` markdown/html (conversion safe côté serveur) | ✅  |     | **2 — Plateforme créateurs** | Scopes ✅ (READ/WRITE/ANALYTICS) · Webhooks sortants ✅ (API de gestion Go + worker HMAC/retries + événements published/updated/deleted). Reste : UI dashboard webhooks, rotation de clés, rate-limit par clé, idempotency, API explorer, import bulk, upload média | 🚧 scopes + webhooks backend ✅ |
| **3 — Ops**           | slog JSON, metrics/traces (Prometheus/OTel), migrations goose, Sentry                                                                               | ⏳                             |
| **4 — Sunset Hono**   | Suppression de `apps/api` (Hono / api-legacy) — backend Go unique                                                     | ✅ terminé (voir SUNSET_API_LEGACY.md) |

---

## 8. Glossaire

- **Publication** : entité polymorphe (personnelle OU média) sous laquelle les
  articles sont publiés — porte identité, abonnés, paywall, analytics.
- **Clé API** : `qoe_live_*`, délivrée après revue, pour médias/créateurs.
- **OAuth** : pour apps tierces (à construire).
- **Contrat** : forme exacte (JSON, statuts, enveloppe) d'un endpoint — verrouillée
  par golden tests.
