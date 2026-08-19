# 🧪 Stratégie de test de la plateforme — « Top du top »

> **Contexte** : le backend est désormais **unique** (Go, `apps/api`) — l'API
> Hono (`apps/api`) a été supprimée. On peut enfin bâtir un filet de tests
> **exhaustif et durable** sans dupliquer l'effort sur deux backends.
>
> **Ambition** : chaque couche a son filet, du plus rapide au plus proche de la
> réalité, et le tout tourne en CI en quelques minutes.

---

## 🎯 Principes

1. **Testez le contrat, pas l'implémentation** — les golden tests verrouillent la
   forme des réponses ; le reste peut refactorer librement.
2. **Pyramide inversée de coût** : beaucoup de tests unitaires rapides, un peu
   d'intégration avec vraie DB, très peu d'e2e.
3. **Une seule vérité par couche** : les tests Go testent le Go, les tests TS
   testent le TS, et les tests e2e traversent le tout.
4. **La CI est le juge** : tout ce qui n'est pas exécuté en CI n'existe pas.

---

## 📊 État actuel (audit août 2026)

| Couche                          | Nombre | Couverture réelle                         | Verdict                |
| ------------------------------- | ------ | ----------------------------------------- | ---------------------- |
| Go — unitaires + golden         | ~18    | contrats, scopes, webhooks                | ✅ bon socle           |
| Go — intégration (vraie DB)     | ~115   | articles (54) + webhooks (25) + settings (29) + posts (7) + billing (5) | ✅ solide |
| Go — smoke routeur complet      | 6      | assemblage main.go, flux créateur complet, clé API | ✅ attrape les bugs de wiring |
| Go — worker (asynq)             | ~20    | webhook HMAC + newsletter + stripe + search mock | ✅ 61% coverage |
| TS — unitaires (vitest)         | ~47    | db, ui, config                            | ✅ correct             |
| TS — e2e (Playwright)           | ~10    | smoke routes, public feed, annotations    | ✅ socle (à étendre)   |

---

## 🏗️ Le plan en 4 piliers

### Pilier 1 — Intégration Go avec vraie Postgres (la priorité n°1)

**Objectif** : exécuter les queries sqlc générées contre une vraie Postgres et
vérifier le comportement réel des handlers (RBAC, scopes, pagination).

- **Infra** : Testcontainers (`github.com/testcontainers/testcontainers-go`) avec
  image `pgvector/pgvector:pg16` (parité prod), un seul conteneur partagé par
  package via `TestMain` (économie de démarrage), schéma appliqué via `sqlc` +
  fixtures de seed minimales.
- **Portée (par ordre de valeur)** :
  1. `articles` : `ListCreatorArticles` (filtres category/published, pagination,
     contenu tronqué, zéro-fuite paywall) — les golden tests actuels ne vérifient
     que la forme, pas le SQL.
  2. `webhooks` : `ListWebhooksByPublication`, `CreateWebhook`, scopes
     `RequireAPIScope` contre une vraie base (403/200), RBAC owner/editor.
  3. `settings` : `GenerateApiKey` (scopes, hash), onboarding, subdomain check.
     ✅ fait — 13 tests (scopes filtrés, accès complet, approbation, RBAC,
     subdomaine, onboarding, révélation).
  4. `posts` : création, likes, reposts, réponses (threadgate), bookmarks.
     ✅ fait — 7 tests, dont zéro auto-notification et création de fil.
  5. Le feed est couvert par les e2e Playwright (pilier 3) — c'est un flux
     lecteur, pas le contrat créateurs.
- **Critère de sortie** : ≥ 40% de couverture `go test -cover` sur les modules
  critiques avec vraie DB (articles 39%, posts 40%, settings 27% — les handlers
  HTTP restent à couvrir), et 100% des queries sqlc utilisées en prod testées.

### Pilier 2 — Tests du worker webhook (asynq → HTTP)

**Objectif** : vérifier que l'émission d'un événement aboutit à une livraison
signée HMAC vers l'endpoint, avec retries et log de livraison.

- `httptest.Server` comme endpoint cible qui vérifie `X-Qoe-Signature` et répond
  200 / 500 / timeout selon le cas de test.
- Cas : succès (200, delivery SUCCESS, HTTP 200 enregistré), échec HTTP (500 →
  FAILED), échec réseau (retry asynq), filtre par événement souscrit (un webhook
  `article.published` ne reçoit pas `article.updated`).
- Réutilise le module search (`Searcher` mockable) comme modèle de design :
  interfaces étroites injectables.

### Pilier 3 — Tests e2e Playwright des parcours critiques

**Objectif** : 3 parcours utilisateur de bout en bout (UI réelle + backend Go).

1. **Créateur publie** : login → dashboard → créer un article (markdown) →
   publier → l'article apparaît sur le blog public avec le paywall.
2. **Abonné reçoit** : s'abonner → recevoir un webhook signé sur un endpoint
   mock (vérifie le contrat bout-en-bout).
3. **Admin modère** : inviter un membre média → notification → rôle appliqué.

### Pilier 4 — Durcissement CI

- **Jobs Go** : `go test -race ./...` + `go vet` + `go test -cover` avec le
  seuil de couverture des modules critiques (pilier 1).
- **Job TS** : typecheck + lint + vitest (déjà en place).
- **Job e2e** : Playwright sur compose de test (Postgres + Redis + api),
  exécuté en parallèle, artefact de traces en cas d'échec.
- **Vitrine** : badge de couverture + rapport d'échec lisible.

---

## 📦 Organisation du code de test (Go)

```
apps/api/
├── internal/modules/articles/
│   ├── contract_test.go        # golden (déjà en place)
│   └── integration_test.go     # Testcontainers (nouveau)
├── internal/modules/webhooks/
│   ├── service_test.go         # unitaires (déjà en place)
│   ├── handler_integration_test.go  # Testcontainers (nouveau)
│   └── worker_test.go          # httptest + asynq (nouveau)
└── internal/testutil/          # helpers partagés
    ├── pool.go                 # TestMain, démarre 1 conteneur pgvector
    └── seed.go                 # fixtures minimales (publication, user, article)
```

## 🚦 Ordre d'exécution recommandé

1. ✅ **Pilier 1a** : `testutil` (pool partagé) + intégration `articles`.
2. ✅ **Pilier 2** : worker webhook (HMAC, retries, filtrage).
3. ✅ **Pilier 1b** : webhooks + settings + posts + service articles (RBAC média).
4. 🔜 **Pilier 3** : e2e Playwright (nécessite pilier 1 pour une base saine).
5. ✅ **Pilier 4** : CI (`go test -race` en place, seuil de couverture à ajouter).

---

## ✅ Critères « top du top » (definition of done)

- [x] `go test -race ./...` vert avec intégration DB (Testcontainers) en CI
- [x] Intégration vraie Postgres : articles, webhooks, settings, posts, billing + worker
- [x] Worker webhook testé (HMAC, retries, filtrage) + newsletter + stripe + search
- [x] Handlers HTTP couverts (JWT + clés API + scopes) — articles 54%, webhooks 76%, settings 68%
- [x] Smoke test de l'assemblage complet (newRouter) — a attrapé un crash de prod au démarrage
- [x] Gate de couverture CI par module critique (articles ≥50, webhooks ≥70, settings ≥60, posts ≥35, search ≥55, workers ≥60)
- [ ] 3 parcours e2e Playwright verts (créateur, abonné/webhook, admin)
- [ ] Un test qui échoue donne un rapport lisible en < 10 min de CI
