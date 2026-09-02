# 📖 Audit des outils de lecture (surlignage, citations, annotations, accessibilité)

> Audit **vérifié sur le code** des capacités de lecture côté **web** (`apps/core` + `packages/ui`),
> **mobile** (`apps/mobile`) et **API Go** (`apps/api`), et plan pour la parité.
> Complément de `docs/PARITY_WEB_MOBILE.md` — focus « lecture enrichie ».

---

## 1. État des lieux

### Web (référence — moteur « Genius »)

Le web a un **moteur d'annotation complet** : `packages/ui/src/annotations/` (`TextHighlighter.tsx`,
`TextSelectionPopover.tsx`, `AnnotationSideDrawer.tsx`, `quote-anchor.ts`), câblé dans
`apps/core/src/components/social/ArticleAnnotatorView.tsx` (lu dans le drawer de lecture) :

- **Sélection de texte** → popover : surligner, noter/commenter, citer, copier, changer la visibilité, supprimer.
- **Ancrage par `quoteOrdinal`** : chaque surlignage enregistre l'occurrence du passage cité dans l'article → rendu inline (`<mark>`) dans le contenu, déduction de l'emplacement.
- **Citations d'extraits (crosspost)** : `onCrosspost` ouvre le composeur avec `quotedArticle` + `quotedExcerpt` + commentaire (citer un extrait dans une pensée).
- **Annotations** : note + fil de commentaires par surlignage (`AnnotationComment`), upvotes, privé/public, officiel.
- **Carnet** : page `/highlights` (« Carnet de Surlignages ») liste citations + notes.
- **Préférences de lecture** : appliquées **globalement** par SSR (`html[data-qoe-*]` + CSS dans `globals.css`) — mais **aucun contrôle depuis la page article**.

### Mobile (état actuel)

- **Surlignage manuel** : `apps/mobile/src/components/article/article-highlights.tsx` — bouton « + » → formulaire où l'on **tape** le passage à la main (texte + note + public/privé). ❌ pas de sélection de texte, ❌ pas d'ancre (`quoteOrdinal` jamais envoyé), ❌ pas de rendu inline.
- **Listes** : onglet « Surlignages » dans la Bibliothèque (parité web `/highlights` ✅).
- **Manque mobile** : suppression d'un surlignage (API ✅, UI ❌), toggle privé/public après création (API ✅, UI ❌), commentaires/threads (API ✅, UI ❌), citation d'extrait d'article (❌).
- **Accessibilité** : préférences `fontScale`/`highContrast`/`reduceMotion` stockées serveur et partiellement appliquées (8 composants animés + `useTheme`), mais **pas appliquées au corps d'article** et **aucun contrôle depuis la page article**.

### API Go (déjà prête ✅)

- `POST /v1/articles/{id}/highlights` — accepte `text, note, isPublic, quoteOrdinal` (`modules/highlights/handler.go:71`).
- `GET /v1/articles/{id}/highlights`, `DELETE /v1/highlights/{id}`, `POST /v1/highlights/{id}/upvote`, `GET|POST /v1/highlights/{id}/comments` (`AnnotationComment`).
- `GET /v1/me/highlights` (bibliothèque). Visibilité : `toggleHighlightPrivacyAction` côté SDK web (endpoint Go à vérifier pour le mobile).
- `quoteOrdinal` stocké et dédupliqué (`modules/creator/api_highlights.go:24`).

---

## 2. Matrice de capacités

| Capacité                                                                               | Web                                                            | Mobile                                                   | API Go                          | Écart                                           |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------- | ----------------------------------------------- |
| Surligner **par sélection** de texte                                                   | ✅ `TextHighlighter` + popover                                 | ❌ formulaire manuel                                     | ✅                              | ❌ **refonte mobile**                           |
| Ancre inline (`quoteOrdinal` + rendu `<mark>`)                                         | ✅                                                             | ❌ (jamais envoyé/rendu)                                 | ✅                              | ❌                                              |
| Note d'annotation                                                                      | ✅ + UI                                                        | ◐ au create (formulaire)                                 | ✅                              | ◐                                               |
| Commentaires / threads par surlignage                                                  | ✅ (`AnnotationSideDrawer`)                                    | ❌                                                       | ✅                              | ❌                                              |
| Citer un extrait (crosspost article)                                                   | ✅ `onCrosspost` → composeur (`quotedArticle`+`quotedExcerpt`) | ❌ (composeur ne connaît que les citations de _pensées_) | via posts                       | ❌                                              |
| Copier un passage                                                                      | ✅ popover                                                     | ◐ (selection systeme RN)                                 | n/a                             | ◐                                               |
| Visibilité privé/public                                                                | ✅ toggle après création                                       | ◐ au create seulement                                    | ✅                              | ◐                                               |
| Supprimer un surlignage                                                                | ✅                                                             | ❌                                                       | ✅                              | ❌                                              |
| Upvote                                                                                 | ✅                                                             | ✅ (optimiste)                                           | ✅                              | ✅                                              |
| Carnet / liste de mes surlignages                                                      | ✅ `/highlights`                                               | ✅ onglet Bibliothèque                                   | ✅                              | ✅                                              |
| Préférences de lecture **depuis l'article** (fontScale, contraste, réduire animations) | ❌ (global seulement)                                          | ❌ (non appliquées au corps)                             | ✅ (`/v1/settings/preferences`) | ❌ **à construire (les deux)** — vision produit |

---

## 3. Plan d'action priorisé

### P0 — Compléter la boucle mobile sur l'existant (S, API déjà prêtes)

1. **UI de suppression + toggle privé/public** sur les cartes de surlignage (mobile) — `deleteHighlight` + toggle visibilité existent déjà côté Go/SDK web.
2. **SDK client mobile : envoyer `quoteOrdinal`** dans `createHighlight` (champ optionnel — coûte rien, prépare l'ancre).
3. **Commentaires par surlignage (lecture seule d'abord)** : afficher le fil `AnnotationComment` dans la carte + ajout d'un commentaire (API prête).

### P1 — Sélection native + ancrage (M/L, cœur de la parité)

4. **Surlignage par sélection sur mobile** : le contenu article est rendu par le mini-renderer maison `apps/mobile/src/components/article/html-blocks.tsx` (`ArticleHtml`) → l'enrichir pour :
   - exposer les **offsets de blocs** (mapping bloc→texte brut, positions absolues) afin de calculer un `quoteOrdinal`/ancre comparable au web ;
   - gérer une **sélection** (long-press / loupe) avec popover RN : **Surligner · Note · Citer · Copier** ;
   - rendre les passages surlignés (`<mark>` local, teinte réglable plus tard).
   - Réutiliser les composants UI existants (`ActionSheet`, `Toast`) + `useUserSettings`.
5. **Citer un extrait depuis l'article (mobile)** : étendre `apps/mobile/src/features/compose/compose-screen.tsx` avec `quotedArticle`+`quotedExcerpt` (même contrat que l'événement `open-composer` du web), entrée depuis le popover de sélection.

### P2 — Accessibilité & confort (parité avec la vision produit)

6. **Toolbar de lecture sur la page article (mobile)** : contrôles in-situ de `fontScale`, `highContrast`, `reduceMotion`, police — patch `updateUserSettings` + application **au rendu `ArticleHtml`** (taille, interligne, contraste) et aux animations.
7. **Toolbar de lecture sur la page article (web)** : la page article est actuellement minimale (aucun contrôle) — ajouter le même sélecteur réactif côté web (le provider `ReadingPreferencesProvider` existe déjà).
8. **Couleurs/catégories de surlignage** (si produit voulu) : nécessite un champ `color` en base + UI (les deux plateformes + API).

---

## 4. Fichiers de référence

| Rôle                            | Fichiers                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Moteur annotation web           | `packages/ui/src/annotations/` (TextHighlighter, TextSelectionPopover, AnnotationSideDrawer, quote-anchor) |
| Vue article annotée web         | `apps/core/src/components/social/ArticleAnnotatorView.tsx`, `ArticleReaderDrawer.tsx`                      |
| Carnet web                      | `apps/core/src/app/(reader)/highlights/page.tsx`                                                           |
| Surlignages mobile (formulaire) | `apps/mobile/src/components/article/article-highlights.tsx`                                                |
| Rendu article mobile            | `apps/mobile/src/components/article/html-blocks.tsx` (`ArticleHtml`)                                       |
| Carte bibliothèque mobile       | `apps/mobile/src/features/library/library-screen.tsx`                                                      |
| Composeur mobile                | `apps/mobile/src/features/compose/compose-screen.tsx`                                                      |
| API surlignages Go              | `apps/api/internal/modules/highlights/handler.go`, `modules/creator/api_highlights.go`                     |
| Préférences de lecture          | `GET/PATCH /v1/settings/preferences` (+ `useUserSettings` mobile, `ReadingPreferencesProvider` web)        |
