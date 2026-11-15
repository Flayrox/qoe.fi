# PRODUCT-ROADMAP — six chantiers produit

> Plan vivant. À lire avant de coder, à mettre à jour après chaque lot.
> Ce document ne remplace pas les plans par app (`ADMIN-PLAN`, `EDITOR-PLAN`,
> `ANALYTICS-PLAN`) : il porte les chantiers **produit** transverses.

## Pourquoi ces six-là

Le produit est déjà large (IA de lecture, TTS, hors-ligne, commentaires,
recommandations, OAuth, webhooks, newsletter SMTP/Resend). Les trous qui
restent ne sont pas des réglages : ce sont les briques qui décident si la
plateforme peut vivre et concurrencer Substack/Medium.

| # | Chantier                      | Territoire                                                            | Taille | Migration |
| - | ----------------------------- | --------------------------------------------------------------------- | ------ | --------- |
| 1 | Encaisser (Stripe)            | Go `billing`/`subscriptions`/`workers/stripe.go`, studio `monetization`, core `billing`/`pricing`, tenants `PaywallCut` | L/XL   | non (schéma existant suffit) |
| 2 | Newsletter : digest           | Go `newsletters` (+ `Publisher.emailSettings`), studio `newsletters`   | M/L    | non (JSONB) |
| 3 | Commentaires cœur + modération| `core/components/article-overlay`, studio `community`                  | M      | non       |
| 4 | Livres (EPUB créateur)        | Go `ebooks`/nouveau `books`, studio `books`, core `library/ebooks`     | L      | oui (persistance, lot 2) |
| 5 | Traduction des publications   | Go `ai`/`articles`, studio `articles`, tenants/core rendu              | L      | oui (versions, lot 2) |
| 6 | Portabilité (export)          | Go `users`/nouveau `exports`, studio réglages                          | M      | non       |

## Règles d'isolation

- Un seul agent par territoire. Les douze territoires déjà attribués
  (éditeur, analytics, mobile, imports, tests admin, library/messages,
  domaine, recherche, hi, sécurité/sessions, médias, collab-server) ne sont
  pas touchés ici.
- Migrations : dernière = `00090`. Aucun chantier de ce plan n'ajoute de
  migration tant que le schéma existant suffit (c'est le cas des lots 1, 2,
  3 et 6). Les lots 4 et 5 auront besoin de numéros dédiés (`00091+`) en
  phase 2.
- Go reste la source de vérité : le front ne calcule ni prix, ni droits, ni
  commission.

## Journal

### 2026-11-15 — cadrage

- Diagnostic posé sur le code réel (pas sur les plans) : voir le tableau.
- Constat central : la chaîne d'encaissement est coupée. `Tier`,
  `Publisher.stripeAccountId`, `Subscriber.stripeSubscriptionId` existent, le
  webhook et le worker aussi, mais **aucune session Checkout / portail n'est
  créée** et le flag `subscription-checkout-enabled` est mort. Les CTA
  « Qoefi Plus » et « Membre Premium » renvoient vers le support ou l'ancre
  newsletter.
- Constat secondaire : le backend des commentaires est complet mais seul
  `apps/tenants` le consomme ; `apps/core` et le studio ignorent la fonction.
- Rien n'est encore modifié à cette étape.

### 2026-11-15 — lot 1 : encaissement (socle livré)

Ce qui est en place :

- Client Stripe HTTP minimal (`modules/billing/stripe.go`) : session Checkout
  en mode abonnement, portail de facturation, metadata dupliquée session +
  abonnement, destination Connect et commission.
- Routes Go : `GET /v1/billing/tiers` (public, pour le paywall),
  `POST /v1/billing/checkout`, `POST /v1/billing/portal`,
  `POST /v1/billing/tiers` (création réservée au gestionnaire de la publication).
- Webhook : `checkout.session.completed` (abonnement publication **ou** bundle
  Plus) et `customer.subscription.updated`. Correction au passage : les
  handlers lisaient `data["metadata"]` alors que Stripe envoie
  `data.object.metadata` — `stripeObject()` accepte les deux formes.
- Plus = `SubscriptionGrant` (source unique des droits, un mois par paiement) ;
  publication = `Subscriber` premium + `stripeCustomerId`/
  `stripeSubscriptionId`/`tierId`. **Aucune migration.**
- Studio : page `/monetization` (catalogue, création de formule, portail),
  entrée sidebar + Cmd+K.
- Core : le CTA « Souscrire à Qoefi Plus » appelle réellement Checkout ;
  tenants : le CTA « Membre Premium » appelle Checkout et affiche le prix du
  catalogue (plus de montant codé en dur).

Configuration attendue : `STRIPE_SECRET_KEY`, `STRIPE_PLUS_PRICE_ID`,
`BILLING_RETURN_BASE_URL` (défaut `NEXT_PUBLIC_APP_URL`). Sans clé, les routes
répondent 503 explicite.

Vérifications : `go build ./...`, `go test ./internal/modules/billing
./internal/config`, `pnpm --filter {sdk,studio,core,tenants,config} typecheck`.

À faire ensuite (lot 1) :

- Test de bout en bout en mode test Stripe (checkout → webhook → droit visible).
- Commission Pro à 5 % : le handler applique 10 % fixes, il doit lire `HasPro`.
- Offre annuelle (le schéma porte `yearlyPriceCents`/`stripePriceIdYearly`).
- Supprimer ou brancher `packages/sdk/src/hooks/useSubscriptionCheckout.ts`
  (il vise des routes `/api/billing/*` qui n'existent pas).
- Le portail ne retrouve le client que via un abonnement existant : prévoir un
  vrai lien `User → stripeCustomerId` en phase 2.

### 2026-11-15 — lot 3 : commentaires au cœur + modération (livré)

- `apps/core/src/components/social/ArticleComments.tsx` : discussion sous
  l'article du lecteur principal (liste, réponse sur un niveau, suppression de
  ses propres commentaires), branchée sur les server actions existantes.
  Montée dans `ArticleAnnotatorView`, donc visible dans l'overlay article.
- Studio : page `/community` — liste des articles (avec `commentsCount`),
  chargement de la discussion à la demande, suppression. Aucune route Go
  nouvelle, aucune migration.
- Entrées `studio.community` (sidebar + Cmd+K).
- Vérifications : `pnpm --filter {studio,core,config} typecheck`.

À faire ensuite (lot 3) :

- Pagination des commentaires (le backend renvoie la liste complète).
- Signalement d'un commentaire depuis le studio et depuis le core.
- Badge « auteur » et lien vers le profil dans la discussion.
- Badge « auteur » et lien vers le profil dans la discussion.

### 2026-11-15 — lot 6 : portabilité / export (livré)

- Nouveau module Go `internal/modules/exports` : `GET /v1/creator/export?publisherId=`
  renvoie une archive ZIP en lecture seule (`articles/*.md` + `*.html`
  d'origine, `subscribers.csv`, `manifest.json`). Aucune migration.
- Convertisseur HTML → Markdown compact et testé (`markdown_test.go`).
- Studio : route handler `/api/export` (session + workspace actif, relais
  authentifié vers Go), point d'entrée dans les réglages (« Données &
  confidentialité »).
- Vérifications : `go build ./...`, `go test ./internal/modules/exports`,
  `pnpm --filter @qoe/studio typecheck`.

À faire ensuite (lot 6) :

- Inclure les médias (images uploadées) dans l'archive et les réécrire.
- Export asynchrone + lien signé pour les grosses publications.
- Journaliser l'export (audit admin) et prévenir pour les départs.

### 2026-11-15 — lot 4 : livres / EPUB (premier lot livré)

- Nouveau module Go `internal/modules/books` :
  `POST /v1/creator/books/compile` reçoit `{title, author, articleIds}` et
  renvoie un **EPUB 3** en mémoire (`mimetype` non compressé, `container.xml`,
  `content.opf`, `nav.xhtml`, un XHTML par chapitre, CSS). Les balises void
  sont refermées et les images sans `alt` corrigées pour rester valides.
- Propriété vérifiée article par article (même règle que Stripe/export) ;
  80 articles maximum ; ordre de sélection conservé.
- Studio : page `/books` (sélection ordonnée, titre, auteur, download) et
  route handler `/api/books/compile` qui relaie la session.
- Vérifications : `go build ./...`, `go test ./internal/modules/books`,
  `pnpm --filter @qoe/studio typecheck`.

À faire ensuite (lot 4) :

- Persistance du livre (`Publisher` propriétaire, chapitres, couverture) :
  migration `00091+`, puis bibliothèque publique et lecture dans le core.
- Vente du livre : réutiliser le Checkout du lot 1 (produit one-shot).
- Inclure les images de l'éditeur dans l'archive et les réécrire.
- Édition du sommaire (titres de chapitres distincts des titres d'articles).

### 2026-11-15 — lot 2 : digest — consolidation (doublon retiré)

Le digest avait été implémenté **deux fois** en parallèle :

- l'autre agent (commit `70e8efa5`, `docs/PARALLEL-LOTS-PLAN.md` lot 2) :
  `POST /v1/newsletters/digest` crée un **brouillon d'issue** depuis les
  articles récents (`ListArticlesForDigest`), rendu par `buildDigestHTML`
  (URL canonique, couverture, temps de lecture, extraits), bouton dans
  l'onglet Newsletter du Studio ;
- moi : `internal/modules/digest` + page `/digest` (configuration
  hebdomadaire + aperçu), sans création d'issue.

Décision : **on garde l'implémentation de l'agent newsletter** (elle réutilise
le pipeline d'envoi, les gardes et l'éditeur existants) et mon doublon est
**supprimé** (`internal/modules/digest`, page `/digest`, entrée de surface,
route). Reste uniquement à sa charge le test du handler `POST
/v1/newsletters/digest` (noté dans son plan).

Ce qui manque encore pour un vrai digest récurrent : une cadence (tâche
périodique asynq) qui appelle `CreateDigestDraft` puis laisse le créateur
relire — à construire **dans `modules/newsletters`**, pas ailleurs.

### 2026-11-15 — lot 1, fin : commission Pro, portail, ménage

- **Commission Pro 5 %** : `billing.Service.IsPro` lit `subscriptions.HasPro`
  (source unique des droits) et le handler applique `commissionPercent(isPro)`
  — 5 % pour une publication Pro, 10 % sinon. Testé (`TestCommissionPercent`).
- **Lien `User → stripeCustomerId`** : migration `00091_user_stripe_customer.sql`
  (colonne nullable + index unique partiel), `models.go` et `schema.sql` mis à
  jour. Le webhook Checkout et `customer.subscription.*` écrivent le lien
  (`rememberCustomer`, best-effort : un échec ne fait pas rejouer l'événement) ;
  `POST /v1/billing/portal` lit d'abord ce lien, puis replie sur l'email pour
  les comptes antérieurs. **Cette migration doit être appliquée**
  (`pnpm db:migrate`) avant un test de paiement réel.
- **Hook mort supprimé** : `packages/sdk/src/hooks/useSubscriptionCheckout.ts`
  et son export (il visait `/api/billing/*`, inexistant).
- **Export** : ma page `/export` faisait doublon avec le bloc « Données &
  confidentialité » ajouté par l'agent newsletter dans les réglages ; la page
  et son entrée de surface sont retirées, `GET /v1/creator/export` et
  `/api/export` restent (c'est ce que ce bloc utilise).

### 2026-11-15 — lot 5 : traduction (premier lot livré)

- Go : `POST /v1/ai/translate` (module `ai`), langue cible dans un vocabulaire
  fermé (fr/en/es/de/it/pt), texte ≤ 12 000 caractères, provider requis
  (sinon 503 explicite). Prompt qui interdit les commentaires et conserve la
  structure HTML.
- Studio : page `/translate` — choisir un article, une langue, générer,
  relire et copier. Cmd+K (pas de sidebar : usage ponctuel).
- Vérifications : `go build ./...`, `go test ./internal/modules/ai`,
  `pnpm --filter @qoe/studio typecheck`.

À faire ensuite (lot 5) :

- Persistance des versions (`ArticleTranslation` ou colonnes `locale`) :
  migration `00091+`, puis sélecteur de langue côté core/tenants + `hreflang`.
- Quota et coût : la route de traduction ne consomme pas encore le quota IA
  mensuel ; à brancher avant ouverture large.
- Relecture côte à côte (source / traduction) et publication différée.

## État au 2026-11-15

| # | Chantier | État | Prochaine étape |
| - | -------- | ---- | --------------- |
| 1 | Encaissement | socle livré (Go + SDK + Studio + paywall) | test mode Stripe de bout en bout, commission Pro 5 % |
| 2 | Digest | brouillon newsletter (agent newsletter) ; mon doublon retiré | cadence récurrente dans `modules/newsletters` |
| 3 | Commentaires | core + modération Studio livrés | pagination, signalements |
| 4 | Livres | compilation EPUB livrée | persistance + vente |
| 5 | Traduction | aperçu IA livré | versions localisées + hreflang |
| 6 | Portabilité | archive ZIP + entrée réglages | médias + export asynchrone |
