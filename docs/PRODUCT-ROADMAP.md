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
