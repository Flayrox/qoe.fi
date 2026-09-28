# Audit des voies d'envoi et d'activation d'abonnés (Tranche 0 ciblée)

> **Question :** par quels chemins une adresse peut-elle devenir destinataire
> d'une campagne ? Et ces chemins exigent-ils tous une preuve individuelle ?
>
> Méthode : lecture du code (routes, SQL, workers), pas des commentaires —
> la migration 00020 et `home/widgets.go` décrivent un double opt-in que le
> SQL ne fait plus. Date : 2026-09-28.

## Matrice des voies

| Voie | Auth / limite | Ce qu'elle fait réellement | Verdict |
|---|---|---|---|
| `POST /v1/newsletters/{id}/send` → worker (`InsertNewsletterDeliveries`) | JWT créateur + garde `bulk_campaign_send` (N2) + rate-limit | Ne retient que `isActive && receiveArticles && confirmedAt NOT NULL` | ✅ sain |
| `POST /v1/home/subscribe` | Publique + rate-limit Redis 10/min | **Active immédiatement** (`confirmedAt = now()`, single opt-in) | 🟡 non conforme fiche 01 (pas de `pending`) |
| `POST /v1/publications/{slug}/subscribe` | Publique, CORS `*`, **aucun rate-limit** | **Activait immédiatement** via `UpsertSubscriber` | 🔴 **corrigé** : pending + confirmation + rate-limit 10/min |
| `POST /v1/creator/subscribers` | Clé API scope `write` + quota par clé, **volume illimité** | **Activait immédiatement** n'importe quelle adresse | 🔴 **corrigé** : pending + confirmation |
| Paiement Stripe (`UpsertSubscriberPayment`) | Paiement effectif | Active + **réactive les désabonnés** (`isActive/receiveArticles = true`) | 🟡 défendable (le paiement prouve la boîte), mais la réactivation d'un désabonné mériterait un parcours explicite — à trancher |
| `devtools SimulateSubscriber` | Superadmin (+ dev-only hors prod) | Active immédiatement | 🟢 OK (outil superadmin, pas un parcours utilisateur) |
| Imports staging + reconfirmation | Quarantaine + revue + clic individuel | Jamais destinataires sans clic | ✅ sain |
| Confirm / unsubscribe (HMAC) + workers confirm/welcome | Signature timing-safe | Conforme au double opt-in historique | ✅ sain |

## Correction appliquée (ce commit)

Nouvelle requête `UpsertSubscriberPending`, utilisée par les deux routes
corrigées, vérifiée contre la base de dev en transaction annulée :

- nouveau → `receiveArticles = false`, `confirmedAt NULL`, token présent ;
- réinscription → token rafraîchi, toujours pas destinataire ;
- déjà actif + confirmé → état et token inchangés (pas de confirmation à renvoyer) ;
- désabonné → **non réactivé** (`receiveArticles` reste `false`), nouveau token
  pour une réinscription explicite par son propre clic (`isActive = true` seul
  ne rend jamais destinataire : il faut aussi `receiveArticles` et `confirmedAt`).

Le worker `confirm_email` existant (inutilisé en pratique jusqu'ici — aucune
route ne créait plus de `confirmationToken`) redevient le chemin d'envoi des
confirmations, via `PublishSubscriberConfirm` en best-effort.

## Restes connus (non bloquants pour l'envoi encadré)

1. `POST /v1/home/subscribe` : toujours en single opt-in. À aligner sur le
   même `pending` (fiche 01) dans un second temps — même mécanique, autre route.
2. Paiement Stripe : décider si un payeur désabonné doit retrouver
   `receiveArticles = true` automatiquement.
3. Passkeys GoTrue / fournisseur SMS : dépendances externes non tranchées
   (le garde refuse honnêtement en attendant).
