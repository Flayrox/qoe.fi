# 03 — CI, DX, déploiement

## CI-01 — `lint` / `typecheck` ne doivent pas dépendre de `^build` (P1)

**Constat** : `turbo.json`
```json
"lint":      { "dependsOn": ["^build"], "outputs": [] },
"typecheck": { "dependsOn": ["^build"], "outputs": [] }
```
Chaque lint/typecheck rebuild d'abord tous les packages amont. Sur 25 packages,
c'est la majorité du temps de CI.

**Correctif** : retirer `dependsOn: ["^build"]` (ou le remplacer par
`["^typecheck"]`), et donner des `outputs` à `typecheck` (`*.tsbuildinfo`).
Un package TypeScript n'a pas besoin d'être bundlé pour être typechecké.

## CI-02 — Cache Turbo (P1)

Pas de cache distant : chaque runner et chaque poste repart de zéro.
Options : Vercel Remote Cache (gratuit pour usage perso), `turborepo-remote-cache`
auto-hébergé, ou cache GitHub Actions sur `.turbo`.

Ajouter aussi `outputs` corrects pour `test` (`coverage/**`) afin que les
résultats soient rejouables.

## CI-03 — `.env` dans `globalDependencies` (P2)

`turbo.json` déclare `"globalDependencies": ["**/.env.*local", ".env"]`.
Modifier une variable locale invalide **tout** le cache. Garder `globalEnv`
(suffisant pour hasher les variables utilisées) et retirer `.env` des
dépendances de fichiers.

## CI-04 — CI filtrée par affected (P1)

Aujourd'hui : install + typecheck + lint + tests + build sur chaque PR, plus
deux jobs e2e qui refont install + migrations + seed.

**Correctif** :
- job `setup` unique (install + build des packages) réutilisé par les autres ;
- `turbo run ... --filter=[origin/main]` pour ne tester que ce qui change ;
- e2e complet uniquement sur `main` / label `e2e`.

## CI-05 — Mobile absent de la CI (P1)

`apps/mobile` = 215 fichiers, 33 849 lignes, et **aucun job CI** ne le
typecheck. Une régression mobile ne se voit qu'à l'ouverture de l'app.

**Minimum** : `pnpm --filter @qoe/mobile typecheck` + `lint` dans le job
`build-and-test`.

## CI-06 — `dev` / `main` (P0, en cours)

**Constat au 2026-11-07** : `dev` est 70 commits devant `main`, `main` n'a
rien en avance. `build-images.yml` ne part que de `main`, et `deploy-prod.sh`
pull ces images → le travail de novembre n'est pas déployable.

**Décision à tenir** :
- soit trunk-based : petites PR sur `main`, `dev` supprimée ;
- soit `dev` → `main` automatique après CI verte, avec protection de branche.

Dans les deux cas : protection de `main` (PR obligatoire, CI verte, pas de
force-push), `CODEOWNERS`, template de PR.

## CI-07 — Staging (P1)

Un seul environnement (le VPS netcup de prod). Les migrations sont rejouées
directement en prod après backup.

**Approche** : un second VPS (ou un compose dédié sur le VPS dev qui héberge
Supabase + embedding) qui rejoue les migrations sur une copie de prod, avec
`deploy-prod.sh --target staging`. Tester au moins : migration, login, feed,
publication d'article.

## CI-08 — Zero-downtime (P2)

`deploy-prod.sh` redémarre les conteneurs → coupure. Caddy est déjà en place :
un `docker compose up -d --no-deps <service>` avec un `healthcheck` + bascule
Caddy suffit pour la plupart des services. À défaut, documenter une fenêtre de
maintenance.

## CI-09 — Build d'images (P2)

`build-images.yml` a une matrice de 8 services qui rebuild chacun le même
contexte avec Turborepo. Chaque push `main` = 8 builds de ~10 min.

**Approche** : `docker buildx bake` avec un seul build multi-target et
`cache-from/cache-to: type=registry,ref=ghcr.io/flayrox/qoefi-cache`. Les
couches communes (deps, build Turborepo) ne sont calculées qu'une fois.

## CI-10 — Secrets (P1)

- `.env.bak.cloud` traîne à la racine (ignoré par git, mais à supprimer ou
  déplacer hors du repo).
- Ajouter `gitleaks` en pre-commit + CI.
- Vérifier l'historique git (le repo est peut-être privé, mais une fuite reste
  une fuite).
- `apps/mobile/certs/certificate.pem` est versionné : vérifier que c'est un
  certificat de dev/publiable, pas une clé privée.

## DX locale

- `pnpm dev` compile i18n et copie `.env` à chaque lancement : correct, mais
  ajouter un `doctor` qui vérifie Postgres/Redis/Meili et affiche les ports.
- Les scripts `dev:*` sont nombreux (30+) : une table dans `docs/` éviterait
  de les redécouvrir. À terme, `pnpm dev --filter`.
- Husky ne lance que prettier + eslint sur les fichiers modifiés : ajouter
  `tsc --noEmit` incrémental sur le package touché (sinon les erreurs de type
  arrivent 10 min plus tard en CI).

## Journal

- **2026-11-07** : `dev` (70 commits d'avance, `main` sans avance) mergé en
  fast-forward dans `main` **en local**. Vérifications avant merge :
  `pnpm typecheck` ✅, `pnpm lint` ✅ (warnings seulement), `pnpm test` ✅
  (21/21 tâches, 1 063 tests), `go vet ./...` + `go build ./...` ✅.
  Reste : push de `main` (déclenche les images GHCR) + déploiement prod.
