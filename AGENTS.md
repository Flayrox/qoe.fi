# qoe.fi — repères pour les agents

## Mémoire du chantier

Ce repo tient sa mémoire dans des plans vivants versionnés. **Lis-les avant de coder, mets-les à jour après.**

| Fichier                         | Contenu                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/admin/ADMIN-PLAN.md`      | Plan vivant de la console admin                                                               |
| `apps/studio/EDITOR-PLAN.md`    | Plan vivant de l’éditeur studio                                                               |
| `apps/studio/ANALYTICS-PLAN.md` | Plan vivant des analytics (multi-auteurs/médias)                                              |
| `docs/AUDIT-CHECKLIST.md`       | Checklist d'audit : un lot par package, une ligne par fichier/fonction                        |
| `docs/CONTENT-GRAPH-PLAN.md`    | Plan vivant du graphe de contenu (post unifié, arêtes) et de la recommandation — lots L41→L43 |

## Rythme imposé — un commit par lot d'audit

- **Un lot = un commit.** Chaque lot de `docs/AUDIT-CHECKLIST.md` se termine par un commit dédié (`audit(<lot>): …`) qui contient le code, les tests et la mise à jour de la checklist. Rien d'un lot clos ne reste en travail non commité.
- **Un changement = un commit.** Tout changement cohérent et vert est commité immédiatement, même transverse, même petit, même s'il ne clôt pas un lot (`fix(...)`, `chore(...)`, `docs(...)`). Un lot peut donc produire plusieurs commits ; on ne laisse jamais une correction vérifiée en travail non commité.
- **Aller au plus profond à chaque passage.** Pour chaque fichier et chaque fonction exportée : lire les appelants réels, les colonnes SQL et les validations Go en doublon, pas seulement le code du package. Si une primitive native, une API plus récente ou un garde CI remplace proprement l'existant, on remplace dans le même lot.
- **Aucun bug laissé ouvert.** Un défaut constaté se corrige dans le lot, même s'il déborde du périmètre initial (test rouge d'abord, correctif, preuve). Une correction qui exige une décision produit passe `bloqué` avec la question écrite — jamais « plus tard » implicite.
- **Preuve avant verdict.** Une ligne `durci` sans commande verte (test, typecheck, lint) recollée dans la checklist n'a pas sa place : on écrit la commande et son résultat.

## Portabilité d'infra — self-hosted d'abord, CDN interchangeable

Le scale ne doit jamais demander de toucher au code : il change une variable
d'environnement. Règle appliquée à chaque lot (axe 8 de la checklist).

- **Supabase = self-hosted par défaut.** On ne code jamais un domaine
  propriétaire (`xxx.supabase.co`, `cdn.qoe.fi`) dans la logique : le client
  Supabase reçoit `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`, qui pointent
  aussi bien vers le cloud que vers notre instance auto-hébergée.
- **Une seule source pour l'origine des médias.** Toute URL publique d'image
  passe par une fonction de résolution (`resolveMediaCdnBase()`), pilotée par
  une variable d'environnement, avec un défaut déterministe. Aucune
  concaténation d'hôte à la main, aucun `https://cdn…` littéral dans un
  composant.
- **Prêt pour Bunny / Cloudflare / R2 / imgproxy.** Le rewrite d'URL est un
  remplacement d'origine (Supabase → CDN), pas une reconstruction de chemin :
  changer de CDN = changer la variable. Les URLs déjà servies par un ancien CDN
  restent reconnues (idempotence + hôtes historiques), sinon les images en base
  cassent au basculement.
- **Rien d'absolu quand un chemin suffit.** Préférer stocker la clé/le chemin
  storage et l'origine configurable ; une URL absolue en base est une dette de
  migration (à documenter si inévitable).
- **Une preuve par règle.** Chaque résolution d'origine a un test unitaire qui
  prouve : défaut sans variable, surcharge par variable, idempotence, et refus
  d'un hôte étranger.

## Architecture en une page

- **Backend** : `apps/api` (Go, chi + pgx + sqlc + asynq + pgvector, migrations goose dans `apps/api/sql/migrations`). C'est la **source de vérité** métier.
- **Front** : `apps/core` (lecteur), `apps/studio` (créateur), `apps/admin` (ops), `apps/tenants` (publications multi-tenant), `apps/hi` (vitrine), `apps/mobile` (Expo).
- **Partagé** : `packages/sdk` (server actions → proxy vers Go), `packages/ui` (design system), `packages/supabase` (auth), `packages/auth`, `packages/flags`, `packages/observability`.
- **Temps réel** : `apps/collab-server` (Yjs, édition collaborative uniquement).

## Environnement de dev

- **Aucun Docker en local.** L’infra (Postgres, Redis, etc.) tourne sur le VPS Hetzner et la base de dev principale y est hébergée. Ne pas lancer `docker compose` sur le poste.
- `pnpm dev:vps` démarre la stack locale (Next.js + API Go via launchd + Caddy) branchée sur cette base distante (`DATABASE_URL` → `116.203.158.47:15409`).
- Domaines locaux : `qoe.test` (core), `studio.qoe.test`, `admin.qoe.test`, `*.qoe.test` (tenants), API sur `api.qoe.test:15407`.
- **Stack Supabase de test/dev = celui du VPS Hetzner** (self-hosted, `116.203.158.47:54321`).
  Aucun `supabase start` local n'est requis : `pnpm dev:vps` (ou
  `scripts/ensure-supabase-hetzner.sh ensure`) ouvre un tunnel SSH et l'expose sur
  `127.0.0.1:54321`, l'origine que l'application et les e2e visent déjà. La règle
  `resolveSupabaseUrl` reste en place : un build local ne peut toujours pas viser la
  production, le relais garde une origine loopback.
- Les données de test vivent dans cette base partagée : vérifier leur existence avant d’insérer.
- **E-mails en local** : `pnpm mail:dev` lance un puits SMTP autonome (sans
  dépendance) sur `127.0.0.1:1025` qui écrit chaque message en `.eml` dans
  `.mail-outbox/` (gitignoré). Pointer le mailer dessus :
  `EMAIL_PROVIDER=smtp SMTP_HOST=127.0.0.1 SMTP_PORT=1025` (SMTP_USER vide →
  aucune AUTH, donc aucun TLS requis).

## Commandes utiles

```bash
pnpm dev                 # copie .env + compile i18n + turbo dev
pnpm typecheck           # tsc sur tout le workspace
pnpm lint
pnpm test                # vitest
pnpm test:api            # Go + Postgres partagé (docker)
pnpm e2e                 # Playwright
pnpm db:migrate          # goose up (apps/api)
pnpm ui:audit             # ratchet de dette UI
pnpm guard:article-links  # interdit les liens d'article obsolètes (`/article/{slug}`)
pnpm mail:dev             # puits SMTP local (`.mail-outbox/*.eml`)
pnpm ui:catalog          # régénère le catalogue du UI lab
```

## Ordre des lots — le mobile passe en dernier

- **Le mobile n'est pas prioritaire pour l'instant.** Le lot L26 (`apps/mobile/src/**` +
  `apps/mobile/modules/**`) est **mis en pause**, non clos, avec son reliquat nommé dans
  `docs/AUDIT-CHECKLIST.md`. On n'ouvre plus de fichier mobile de sa propre initiative.
- **On ne travaille sur `apps/mobile/**` que si l'utilisateur le demande explicitement**
  (un message qui nomme le mobile). Sinon : on saute, on note le défaut repéré dans la
  checklist mobile et on continue la feuille de route sur les lots web/Go.
- **File d'attente** : L27 → L28 → … → L37 (transverse), puis **L26 mobile en toute fin de
  campagne**, avec le reliquat tel qu'il est documenté (à remesurer à l'ouverture).
- Un défaut mobile **mesuré** mais non corrigé reste listé avec sa raison (`reporté en fin de
campagne`) : jamais « plus tard » implicite, jamais de correctif mobile non demandé.

## Stage — pause totale

- **Qoefi Stage (l'éditeur canvas, l'équivalent Figma du site) est en pause totale**, non clos,
  sur décision explicite. Il vit dans `apps/studio/src/features/stage/**` (+ le sous-ensemble
  vendorisé `vendor/onlook/**`) et se monte sur `/settings/design`
  (`apps/studio/src/app/(creator)/settings/design/page.tsx`), pas sur une route dédiée.
- **On n'ouvre plus un fichier Stage de sa propre initiative.** On ne le reprend que si
  l'utilisateur le demande explicitement, et après une décision produit écrite sur son modèle
  d'édition.
- Corollaire : aucun lot transverse (i18n, dialogues composés, refactors) ne « traverse »
  `features/stage/**` au passage. Un défaut Stage constaté se **note** dans
  `docs/AUDIT-CHECKLIST.md` (section « Stage — pause totale »), il ne se corrige pas.
- Le reliquat nommé (undo non groupé, snapshot à chaque publication, modèle mono-page) et ses
  questions produit sont dans `docs/AUDIT-CHECKLIST.md` ; à remesurer à la reprise.

## Traductions — le studio est fait, les autres apps non

- **État mesuré le 2026-11-24** (`QOE_I18N_ZONES=apps/<app>/src node scripts/check-i18n-hardcoded.mjs`) :
  studio et `hi` à **0**, `tenants` **45** copies FR / 16 fichiers, `core` **345** / 65,
  `admin` **1 548** / 123.
- **Ordre imposé** : `tenants` → `core` → `admin`. Une app se traite **entièrement** dans le
  même tour (jamais une surface mi-traduite) : critère de sortie `QOE_I18N_ZONES=apps/<app>/src` à
  **0**, catalogues régénérés, EN traduit à **100 %** (aucun `msgstr` vide).
- **Exception documentée** : les endonymes du sélecteur de langue (`Français`, `English`) ne se
  traduisent pas ; ils vivent dans une constante de `apps/hi/src/components/layout/Footer.tsx`.
- `mobile` (L26) et Stage restent hors périmètre, y compris pour l'i18n.

## Conventions

- Go est la source de vérité : ne pas réimplémenter une règle métier côté TS.
- Toute route protégée passe par `CombinedAuth` + le garde de capacité admin ; ne jamais retirer un `requireCapability`.
- Les migrations sont rejouables from scratch (`goose`), jamais de delta manuel.
- Les guards CI (`guard:seed-script`, `guard:legal-consent`, `ui:audit`, `arch:audit`, coverage gates) ne se contournent pas : on corrige la cause.
- Commentaires et messages en français, style existant.
- Les lots se suivent dans l'ordre de `docs/AUDIT-CHECKLIST.md` ; **le mobile est le dernier**
  (cf. « Ordre des lots » plus haut) et ne se traite que sur demande explicite.
