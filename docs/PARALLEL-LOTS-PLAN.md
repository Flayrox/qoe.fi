# Trois lots parallèles — plan vivant

> Plan de travail pour trois chantiers isolés des territoires déjà occupés
> (éditeur `apps/studio/src/features/editor/**`, encaissement `billing/**`).
> À lire avant de reprendre, à cocher et à journaliser après chaque lot.

Dernière mise à jour : 2026-11-15 · branche `dev`.

## Règles

- Ne pas toucher `apps/studio/src/features/editor/**` ni `apps/api/internal/modules/billing/**`.
- Go reste la source de vérité (recherche, digest, export).
- Aucune migration : le schéma existant suffit aux trois lots.
- Commentaires et messages en français.
- Vérification finale : `go test ./internal/modules/search/... ./internal/workers/... ./internal/modules/newsletters/...`,
  `pnpm --filter @qoe/sdk typecheck`, `pnpm --filter @qoe/core typecheck`,
  `pnpm --filter @qoe/tenants typecheck`, `pnpm --filter @qoe/studio typecheck`.
- Commit unique en fin de chantier (ou un commit par lot si un lot bloque).

---

## Lot 1 — Index de recherche enrichi + recherche tenant via Meilisearch

### Constat

- `searchDocMap` n’indexe ni `readingTime` ni `imageUrl`, alors que la table
  `Article` les possède.
- `ReindexAll` ne met à jour que les documents absents : un index existant ne
  recevrait jamais les nouveaux champs.
- `Setup`/`ensureIndex` réécrit `filterable-attributes` avec seulement
  `publisherId` quand l’index existe, ce qui peut retirer `categoryId`.
- La page tenant filtre encore le bundle `publisher.articles` en mémoire.

### Tâches

- [x] `GetArticleForSearch` : ajouter `imageUrl`, `readingTime` ; sqlc régénéré.
- [x] `searchDocMap` : nouveaux champs + test unitaire.
- [x] `ReindexAll` : upsert de **tous** les documents (plus seulement les
      manquants), pour propager les nouveaux champs.
- [x] `Setup`/`ensureIndex` : liste `filterable-attributes` complète et
      idempotente (`publisherId`, `categoryId`, `authorId`, `isPremium`, `published`).
- [x] Handler `/search/articles` : filtre optionnel `categoryId` combiné avec
      `publisherId` (`AND`), échappement des quotes.
- [x] SDK : `SearchArticleHit` expose `imageUrl` / `readingTime`.
- [x] Tenant : helper `fetchTenantSearchArticles` (Go, q + publisherId +
      categoryId), utilisé quand `q` est non vide ; repli sur le bundle si
      l’API échoue. Sans `q`, comportement actuel conservé.
- [x] Tests : filtre `categoryId`, doc enrichi, typechecks.

### Critère de done

Une recherche tenant avec `q` renvoie les hits Meilisearch (image + temps de
lecture), la catégorie est filtrée côté Go, et l’index existant peut être
réindexé sans perdre les champs.

---

## Lot 2 — Digest newsletter

### Décision

Un digest est un **brouillon** généré depuis les articles publiés récemment,
puis relu/modifié/envoyé via le pipeline newsletter existant. Pas de nouveau
worker, pas de nouvelle table, pas d’envoi automatique implicite.

### Tâches

- [x] SQL `ListArticlesForDigest` (articles publiés d’une publication depuis N
      jours, avec domaine/sous-domaine de la publication) ; sqlc régénéré.
- [x] Service `CreateDigestDraft(ctx, userID, {publisherId, days, limit})` :
      bornes 1–90 jours / 1–20 articles, erreur claire si aucun article.
- [x] HTML échappé, liens publics corrects (domaine custom > sous-domaine >
      `/p/{slug}`), extrait texte, image optionnelle.
- [x] Route protégée `POST /v1/newsletters/digest`.
- [x] Action studio `createDigestAction` + bouton « Créer un digest » qui ouvre
      le compositeur sur le brouillon généré.
- [x] Tests : helpers HTML purs (échappement, liens, extraits) + typecheck studio.
- [ ] Tests dédiés du handler `POST /v1/newsletters/digest` (auth/JSON) et de
      la création réelle du brouillon en DB — non exécutés localement (Docker
      absent).

_À ce jour, seuls les helpers HTML sont testés : le handler digest n’a pas de
test dédié._

### Critère de done

Le créateur clique, obtient un brouillon éditable contenant les N derniers
articles, et peut l’envoyer par le flux existant.

---

## Lot 3 — Export de données visible dans le studio

### Constat

- `GET /v1/creator/export?publisherId=` produit déjà une archive ZIP
  (articles Markdown + HTML + abonnés CSV + manifest).
- `apps/studio/src/app/api/export/route.ts` relaie déjà cette archive avec la
  session et le workspace actif.
- L’entrée `data-export` existe dans l’arbre de réglages, mais aucun lien UI
  ne pointe vers `/api/export`.

### Tâches

- [x] Section « Données & confidentialité » dans `settings/page.tsx`, ancre
      `#data-export`.
- [x] Lien de téléchargement de l’archive ZIP (`/api/export`) + mention de
      l’archive complète.
- [x] Vérifier que la route renvoie bien `Content-Disposition` et `no-store`.
- [x] Typecheck studio.

### Critère de done

Depuis les réglages studio, le créateur télécharge l’archive complète de sa
publication sans passer par une action serveur qui sérialise le ZIP.

---

## Journal

| Date | Lot | Résultat | Commit |
| --- | --- | --- | --- |
| 2026-11-15 | Plan créé | périmètres vérifiés dans le code | _(à venir)_ |
| 2026-11-15 | Lots 1–3 | Go search + workers ciblés + helpers digest **ok** ; sdk **163**, tenants **39**, studio **162** tests ; typechecks sdk/core/tenants/studio **0 erreur**. Tests DB newsletter/worker et handler digest non exécutés (Docker absent). | _(ce commit)_ |
