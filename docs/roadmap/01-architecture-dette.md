# 01 — Architecture & dette structurelle

## ARCH-01 — Découper les god-files React

| Fichier                                                                | Lignes | Problème                                                                              |
| ---------------------------------------------------------------------- | -----: | ------------------------------------------------------------------------------------- |
| `apps/core/src/app/(reader)/home/components/ThoughtComposer.tsx`       |  2 643 | Composer + typeahead + mentions + hashtags + emojis + médias + threads + restrictions |
| `apps/studio/src/app/(creator)/articles/articles-client.tsx`           |  2 172 | Liste + filtres + tri + bulk + édition inline + navigation                            |
| `apps/studio/src/features/editor/components/Editor.tsx`                |  1 630 | Éditeur complet                                                                       |
| `apps/admin/src/app/(admin)/admin/frontend/components/FrontendCMS.tsx` |  1 533 | CMS                                                                                   |
| `apps/studio/src/app/(creator)/media/MediaStudioClient.tsx`            |  1 525 | Médiathèque                                                                           |
| `packages/ui/src/annotations/TextHighlighter.tsx`                      |  1 443 | Annotations                                                                           |
| `apps/admin/src/app/(admin)/admin/legal/LegalCMS.tsx`                  |  1 442 | CMS légal                                                                             |

**Pourquoi c'est un problème de scalabilité** : au-delà de ~600 lignes, un
composant devient difficile à relire, à tester et à modifier sans conflit. À
plusieurs devs, chaque PR touche le même fichier.

**Approche** : extraire par responsabilité, dans le même dossier :

- hooks (`useComposerMentions`, `useComposerMedia`, `useComposerDraft`)
- sous-composants (`ComposerToolbar`, `MentionTypeahead`, `MediaPicker`)
- logique pure dans `*.logic.ts` testable sans DOM

Critère de sortie : aucun composant > 600 lignes, `ThoughtComposer` < 400.

## ARCH-02 — Découper les god-services Go

| Fichier                                          | Lignes |
| ------------------------------------------------ | -----: |
| `apps/api/internal/modules/articles/service.go`  |  2 431 |
| `apps/api/internal/modules/media/service.go`     |  1 356 |
| `apps/api/internal/modules/analytics/service.go` |  1 297 |
| `apps/api/internal/modules/oauth/service.go`     |  1 220 |
| `apps/api/internal/modules/posts/service.go`     |  1 090 |
| `apps/api/internal/modules/admin/handler.go`     |  1 681 |

**Approche** : un fichier par cas d'usage (`service_publish.go`,
`service_release.go`, `service_import.go`), interface interne par dépendance
(email, storage, queue) pour les tests, et `handler.go` réduit au mapping
HTTP → service.

## ARCH-03 — Duplication Go ↔ TS

`apps/api/internal/modules/feed/personalized.go` (1 965 lignes) est un **port
explicite** de `packages/db/src/feed.ts` (1 382 lignes), qui n'existe plus dans
le repo mais dont la logique a été recopiée. Des commits récents parlent encore
de « parité Go ↔ TS » (campagnes staff).

**Risque** : deux implémentations d'un même algorithme, deux jeux de bugs, deux
endroits à modifier.

**Décision à prendre** : Go est la source de vérité. Supprimer le code TS
résiduel ou le réduire à un adaptateur qui appelle l'API. Générer les types
depuis `docs/openapi/*.yaml` plutôt que les réécrire.

## ARCH-04 — Composition root

`apps/api/cmd/server/main.go` fait 666 lignes : construction de ~35 services,
branchement des dépendances et enregistrement de toutes les routes. Ça tient
encore, mais chaque nouveau module l'allonge.

**Approche** : déplacer `newRouter` dans `internal/httpapi/`, avec une fonction
`Register(deps)` par module et un `Deps` structuré par domaine (Auth, Storage,
Queue, Mail). `main.go` ne garde que le cycle de vie.

## ARCH-05 — Frontières de `@qoe/ui`

`packages/ui` dépend de `@qoe/sdk`, `@qoe/supabase` et `next`. Conséquences :

- le design system n'est pas réutilisable par `apps/mobile` (React Native) ;
- un composant peut déclencher un appel réseau, donc difficile à tester en
  isolation et à rendre côté serveur.

**Approche** : `@qoe/ui` = présentation pure (props in, events out). Les
composants qui chargent des données passent dans `packages/ui/containers` ou
restent dans l'app. Séparer les primitives headless si mobile doit converger.

## ARCH-06 — Workspaces multi-médias (Studio) — ✅ fait (2026-11-07)

Un compte peut appartenir à plusieurs Médias ; le Studio doit toujours savoir
**dans quelle publication** il écrit, sans changer de compte.

Fait :

- cookie `qoe_active_workspace` parsé/sérialisé par un module pur unique
  (`@qoe/sdk/workspace`) — plus de `JSON.parse` recopié dans les pages ;
- résolveur serveur unique `@qoe/sdk/actions/workspace`
  (`GET /v1/workspaces/active` + `GET /v1/me/publication`, membership active
  uniquement), mémoïsé par requête via `cache()` ;
- fin du fallback inventé `publicationId = userId` : une panne Go remonte ;
- `?ws=<mediaId>` consommé par `apps/studio/middleware.ts` (cookie + redirect
  sans le paramètre) pour les liens notifications/emails ;
- switcher : `router.refresh()` sur place, état pending, nettoyage du cookie
  obsolète, section « invitations en attente » avec acceptation → bascule ;
- sidebar filtrée par rôle + permissions effectives (`media:create_articles`,
  `media:manage_newsletter`, owner/editor pour analytics & développeur) ;
- badge « Publier dans : … » dans l'éditeur, avec alerte si le cookie média a
  dû retomber sur le profil personnel ;
- page Média : « gérer » (sélection locale) vs « Ouvrir cet espace » (cookie) ;
  en PERSONAL, aucun média n'est présélectionné comme actif.

Reste à faire :

- scope d'URL `/w/[mediaSlug]` pour des liens partageables et un workspace par
  onglet (aujourd'hui le cookie est global au navigateur) ;
- décider du sort de `media:view_analytics` accordé au rôle `viewer` alors que
  Go réserve les analytics à owner/editor (ARCH-08 potentiel).

## ARCH-07 — Identité publique : personne vs publication — ✅ fait (2026-11-07)

Cause du bug « logo du média sur mon compte perso » : le type public était
dérivé de l'appartenance à un média (`identity.Type(hasActiveMediaMembership)`),
alors que le Studio affiche le type du **workspace**.

Règle posée :

- pensée, profil, notification, highlight = **la personne** → `PERSONAL` ;
- article = **le type de sa publication** (`p.type`) → `MEDIA` seulement s'il
  est publié dans un média ;
- `MediaMember` ne sert plus qu'au RBAC, jamais à l'identité publique.

Fait : `identity.FromPublicationType`, SQL `author_is_media` dérivé de
`p.type` (articles, feed, creator), posts/notifications/highlights en
`PERSONAL`, tests Go mis à jour et tests de non-régression.

Reste à faire : vérifier les surfaces mobiles lors de leur prochaine release
(elles consomment les mêmes DTO).

## Règle générale

Un fichier > 800 lignes est un signal : soit il fait plusieurs choses, soit il
manque une abstraction. Ne pas découper pour découper — découper quand les
responsabilités sont identifiables.
