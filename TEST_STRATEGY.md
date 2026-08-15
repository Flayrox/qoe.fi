# 🧪 Stratégie de test de la plateforme — « Top du top »

> **Contexte** : le backend est désormais **unique** (Go, `apps/api-go`) — l'API
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

| Couche                          | Nombre | Couverture réelle          | Verdict                |
| ------------------------------- | ------ | -------------------------- | ---------------------- |
| Go — unitaires + golden         | ~18    | contrats, scopes, webhooks | ✅ bon socle           |
| Go — intégration (vraie DB)     | **0**  | requêtes sqlc, RBAC réel   | ❌ **le trou principal** |
| TS — unitaires (vitest)         | ~47    | db, ui, config             | ✅ correct             |
| TS — e2e (Playwright)           | ?      | smoke + parcours clés      | ⚠️ à étoffer           |
| Go — worker (asynq → HTTP)      | **0**  | livraison HMAC, retries    | ❌ manquant            |

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
  4. `posts`/`feed` : requêtes feed following/trending (les plus complexes du codebase).
- **Critère de sortie** : ≥ 80% de couverture `go test -cover` sur
  `internal/modules/{articles,webhooks,settings}`.

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
- **Job e2e** : Playwright sur compose de test (Postgres + Redis + api-go),
  exécuté en parallèle, artefact de traces en cas d'échec.
- **Vitrine** : badge de couverture + rapport d'échec lisible.

---

## 📦 Organisation du code de test (Go)

```
apps/api-go/
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

1. **Pilier 1a** : `testutil` (pool partagé) + intégration `articles` — débloque tout.
2. **Pilier 2** : worker webhook (indépendant, haute valeur).
3. **Pilier 1b** : webhooks + settings + posts/feed.
4. **Pilier 3** : e2e Playwright (nécessite pilier 1 pour une base saine).
5. **Pilier 4** : CI (le plus simple, à faire en continu).

---

## ✅ Critères « top du top » (definition of done)

- [ ] `go test -race ./...` vert avec intégration DB (Testcontainers) en CI
- [ ] Couverture ≥ 80% sur les modules critiques (articles, webhooks, settings)
- [ ] Worker webhook testé (HMAC, retries, filtrage) — 0 régression possible
- [ ] 3 parcours e2e Playwright verts (créateur, abonné/webhook, admin)
- [ ] Un test qui échoue donne un rapport lisible en < 10 min de CI
