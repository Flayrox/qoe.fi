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

<!-- Les comptes rendus de chaque lot sont ajoutés ci-dessous, du plus ancien au plus récent. -->
