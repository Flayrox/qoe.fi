# Éditeur studio — plan vivant

> **Ce fichier est la mémoire du chantier.** À chaque reprise, le lire avant de
> coder, puis le mettre à jour après chaque lot : ce qui est fait, ce qui reste,
> dans quel ordre et comment vérifier.
>
> **Instructions utilisateur :** la section [« 📝 Instructions »](#-instructions)
> est prioritaire sur le reste.

Dernière mise à jour : 2026-11-11 · branche `main` · dernier commit éditeur `63cf082f`.

---

## 1. Objectif

Rendre l’éditeur studio **confortable à la souris, au clavier et au tactile**,
sans sacrifier la fiabilité de l’enregistrement ni l’accessibilité des articles.

Priorités :

- supprimer les pièges de focus et les gestes qui demandent une précision inutile ;
- rendre les actions contextuelles visibles, surtout sur mobile ;
- traiter l’accessibilité des médias au moment de l’édition, pas seulement à la publication ;
- ne pas dupliquer une règle métier dans le front : Go reste la source de vérité.

Contraintes :

- `Tab` doit rester une touche de navigation ; l’alinéa garde un accès explicite.
- Sur ordinateur, un clic simple place le curseur ; les annotations s’ouvrent avec
  `Alt`/`Option` ou par une action visible.
- Sur tactile, un tap sur une annotation ouvre sa note.
- Toute modification doit être vérifiée puis commitée séparément.

## 2. État vérifié

Derniers commits du chantier :

| Commit     | Contenu                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------- |
| `63cf082f` | Raccourci alinéa `Mod+Alt+A`, hors du conflit DevTools macOS                              |
| `8495cb3d` | Toolbar ARIA à arrêt unique, lettrine canonique et snap de gouttière                      |
| `109123c7` | Suite API Go verte (67 paquets), correctifs des 9 paquets rouges                          |
| `0bfccbe8` | Tolérance de 32 px autour du début de ligne visuelle, y compris sur les lignes coupées    |
| `403ada88` | `Tab` libéré pour les paragraphes ; l’alinéa reste dans les barres d’outils               |
| `4193684a` | Ouverture tactile des annotations + bouton « Modifier la note d’auteur » dans le bandeau  |
| `fd56f4f7` | Retours à la ligne conservés dans les citations d’annotation multi-paragraphes            |
| `000f4393` | Bouton « Légende et crédit de l’image » désactivé tant qu’aucune image n’est sélectionnée |
| `97e71e0a` | `Tab` rendu au navigateur dans les listes ; boutons d’imbrication dans la barre d’outils  |
| `2412f4b4` | Galeries éditables : alt, déplacement et retrait d’une image                              |
| `fcf13e44` | Actions de couverture visibles au tactile et au focus clavier                             |
| `0a84e005` | Panneau d’annotation refondu : bandeau, citation, zone d’écriture et actions séparées     |

Vérifications passées à chaque étape :

```bash
pnpm --filter @qoe/studio typecheck
pnpm --filter @qoe/ui typecheck
pnpm exec eslint apps/studio/src/features/editor
pnpm --filter @qoe/studio exec vitest run src/features/editor
pnpm --filter @qoe/studio exec vitest run src/features/editor/lib/__tests__/toolbar-navigation.test.ts
pnpm --filter @qoe/ui exec vitest run src/annotations/__tests__/canonical-article-body.test.tsx
git diff --check
```

Les tests éditeur comptent **11 fichiers / 53 tests**. La lettrine a été
contrôlée visuellement dans le CSS partagé (flottant à gauche, texte qui
l’épouse, `text-indent: 0` avec alinéa) ; les gestes tactiles et les
combinaisons clavier réelles restent à valider.

## 3. Audit d’ergonomie

### A. Clavier et focus

- **A1 — ✅ `Tab` libéré dans les listes.** `97e71e0a` remplace `ListItem` et
  `ListKeymap` par des variantes sans `Tab`/`Shift-Tab` ; l’imbrication passe
  par deux boutons. `CodeBlock` était déjà sans capture par défaut
  (`enableTabIndentation: false`) et reste configuré ainsi. Les autres
  raccourcis de liste sont conservés.
- **A2 — Plus de raccourci clavier pour l’alinéa.** C’est cohérent avec A1, mais
  les utilisateurs qui travaillaient au clavier perdent le geste. Il faut un
  raccourci dédié, autre que `Tab`, ou une entrée de menu claire.
- **A3 — La barre d’outils est une longue suite d’arrêts de tabulation.**
  `role="toolbar"` est présent, mais il n’y a ni tabindex roving ni navigation
  par flèches. Environ trente boutons doivent être traversés au clavier.
- **A4 — Les libellés de raccourcis sont mac-centric.** `⌘S`, `⌘K` et
  `⌘ + Entrée` sont affichés en dur alors que les handlers acceptent aussi
  `Ctrl`. Sur Windows/Linux, l’aide est fausse.
- **A5 — Aide clavier peu découvrable.** Les raccourcis existent (lien, note,
  enregistrement), mais aucun panneau ne les rassemble dans l’éditeur.

### B. Médias et accessibilité

- **B1 — ✅ Les images de galerie sont éditables.** `2412f4b4` ajoute la
  sélection, l’édition de l’alt, le déplacement et le retrait d’un
  `galleryImage`. Le panneau n’affiche que l’alt pour une galerie. Les cas de
  galerie imbriquée et de sélection purement clavier restent à vérifier.
- **B2 — L’alt manquant n’est signalé qu’à la publication.** Le contrôle
  `countImagesWithoutAlt` vit dans la modale de publication ; dans l’éditeur,
  rien ne distingue une image correctement décrite d’une image muette.
- **B3 — ✅ Les actions de couverture sont accessibles.** `fcf13e44` les rend
  visibles sur petit écran, au survol sur ordinateur et au focus clavier.
- **B4 — L’alt de la couverture est le titre de l’article.** `alt={title || …}`
  fait répéter le titre par le lecteur d’écran au lieu de décrire l’image. Il
  faut soit un vrai champ alt, soit une option « image décorative ».
- **B5 — Remplacer une image impose de la supprimer puis de la réuploader.**
  Un geste « Remplacer » conservant la légende, le crédit et l’alt serait plus
  sûr pour les corrections.

### C. Annotations et tactile

- **C0 — ✅ Panneau d’annotation refondu.** `0a84e005` élargit le panneau,
  ajoute un bandeau ambre, un passage cité plus lisible et sépare les actions.
- **C1 — L’aide de l’annotation est figée et non traduite.** `AnnotationMark`
  écrit `Option/Alt+clic pour modifier` en français dans l’attribut `title`,
  même sur mobile où le geste est un tap. Il faut un libellé i18n et adapté au
  pointeur.
- **C2 — Le tap ouvre la note, mais rendre le texte à nouveau éditable n’est
  pas explicite.** Une fois le panneau fermé, l’utilisateur tactile doit
  comprendre comment replacer le curseur dans le passage annoté. Une action
  « Modifier le texte » ou un appui long documenté éviterait l’ambiguïté.
- **C3 — La détection tactile est globale, pas liée à l’événement.** Le code
  utilise `(pointer: coarse)` pour ouvrir les notes et désactiver le snap de
  début de ligne. Sur un appareil hybride, une souris peut donc être traitée
  comme un doigt. Le type de pointeur de l’événement serait plus juste.
- **C4 — La citation est limitée à deux lignes.** Les retours à la ligne sont
  conservés depuis `fd56f4f7`, mais une citation longue reste tronquée sans
  moyen de la déplier. Amélioration de confort, non bloquante.

### D. Divers

- **D1 — L’upload d’images n’a pas de progression par fichier ni d’annulation.**
  Le compteur global suffit pour de petits lots, pas pour une galerie lourde.
- **D2 — Les actions d’image dépendent d’une sélection de nœud.** Le clic sur
  une image et la sélection au clavier méritent d’être vérifiés ensemble pour
  que « Légende et crédit » soit réellement atteignable sans souris.

## 4. Backlog

### Lot A — clavier (priorité haute)

- [x] **A1.** `Tab` navigable dans les listes ; `ListItem` et `ListKeymap`
      remplacés par des variantes sans tabulation, imbrication via les boutons
      de la barre d’outils (commit `97e71e0a`). Les tests clavier restent à
      ajouter.
- [x] **A2.** Raccourci `Mod+Alt+A` + bouton de barre avec infobulle
      (`63cf082f`).
- [x] **A3.** Motif ARIA toolbar : un seul arrêt de tabulation pour la barre,
      flèches, `Home`/`End`, focus visible conservé ; helper testé
      (`8495cb3d`).
- [ ] **A4.** Centraliser l’affichage `⌘` / `Ctrl` pour l’enregistrement, le lien
      et l’annotation, comme le fait déjà `useModKey` dans la barre d’outils.
- [ ] **A5.** Ajouter une aide des raccourcis de l’éditeur (panneau `?` ou menu).

### Lot B — médias (priorité haute)

- [x] **B1.** Images de galerie sélectionnables et éditables : alt,
      déplacement et retrait (commit `2412f4b4`).
- [ ] **B2.** Afficher un repère « Alt manquant » sur chaque image concernée
      dans l’éditeur, avec accès direct au panneau de détails.
- [x] **B3.** Actions de couverture accessibles au tactile et au focus clavier
      (commit `fcf13e44`).
- [ ] **B4.** Permettre un vrai alt de couverture ou une option « décorative ».
- [ ] **B5.** Ajouter « Remplacer l’image » en conservant alt, légende et crédit.

### Lot C — annotations et tactile (priorité moyenne)

- [x] **C0.** Panneau d’annotation refondu : bandeau, citation et actions
      séparées (commit `0a84e005`).
- [ ] **C1.** Traduire et adapter le `title` de la marque : tap sur tactile,
      `Alt`/`Option` à la souris.
- [ ] **C2.** Rendre explicite le retour à l’édition du texte annoté (action
      dédiée ou appui long documenté).
- [ ] **C3.** Détecter le type de pointeur par événement pour préserver le snap
      de début de ligne à la souris sur les appareils hybrides.
- [ ] **C4.** Permettre de déplier une citation d’annotation longue.

### Lot D — confort (priorité basse)

- [ ] **D1.** Progression par fichier et annulation d’un upload de galerie.
- [ ] **D2.** Vérifier la sélection d’image au clavier et l’accès aux détails
      sans souris.

## 5. Décisions ouvertes

- **Tap sur annotation** : ouvrir la note directement, ou d’abord sélectionner
  la marque puis proposer « Modifier la note » / « Modifier le texte » ?
- **Galerie** : alt uniquement, ou aussi légende et crédit par image ?
- **Couverture** : champ alt dédié, ou case « image décorative » ?

## 6. Comment vérifier

```bash
pnpm --filter @qoe/studio typecheck
pnpm --filter @qoe/ui typecheck
pnpm exec eslint apps/studio/src/features/editor
pnpm --filter @qoe/studio exec vitest run src/features/editor
pnpm --filter @qoe/studio exec vitest run src/features/editor/lib/__tests__/toolbar-navigation.test.ts
pnpm --filter @qoe/ui exec vitest run src/annotations/__tests__/canonical-article-body.test.tsx
git diff --check
```

À ajouter au fil des lots :

- test `Tab`/`Shift-Tab` dans une liste et un bloc de code ;
- test d’édition d’une image de galerie ;
- test du repère alt manquant ;
- vérification navigateur des gestes souris/tactile (à faire plus tard, comme convenu).

## 7. Protocole de reprise

1. Lire ce plan, `git status` et `git log --oneline -5`.
2. Lire la section « 📝 Instructions » : elle prime sur le backlog.
3. Prendre la première case non cochée du lot le plus prioritaire.
4. Coder, vérifier (§6), committer, puis cocher la case et noter le hash ici.
5. Ne pas élargir le périmètre sans l’inscrire d’abord dans ce plan.

---

## 8. Souveraineté de l’auteur — garantie backend (00083)

- La copie souveraine est créée par le trigger PostgreSQL
  `trg_provision_author_sovereign_copy`, dans la transaction de la
  soumission/publication : un échec annule l’écriture au lieu d’être avalé.
- `ensure_author_sovereign_copy()` est partagée par le trigger et par
  `ForkToPersonal` ; un auteur exclu peut toujours récupérer sa copie, mais
  ne peut plus modifier l’article média.
- Index unique partiel `(originArticleId, authorId)` et contrainte de
  cohérence `isAuthorSovereignCopy ⇔ canonicalType = 'PERSONAL_FORK'`.
- Backfill des articles média déjà soumis/publiés dans la même migration.

### État du déploiement

- `00083` appliquée sur la base dev partagée le 2026-11-10 : version **83**,
  `OK 00083_author_sovereignty_guarantee.sql (355 ms)`.
- Contrôlé après migration : contrainte `Article_sovereign_copy_check`
  validée, index unique `Article_origin_author_sovereign_key` présent, trigger
  `trg_provision_author_sovereign_copy` actif, 5 fonctions présentes.
- Backfill constaté : 1 article média soumis/publié, 1 éligible, 0 sans copie,
  1 copie, 0 incohérence, 0 doublon, 1 archive média, 1 attribution
  `PRIMARY_AUTHOR`, 1 événement `CREATED` ; `canonicalUrl` de la copie =
  `https://media-test.qoe.fi/societe/deserts-information-france`.
- Aucune sauvegarde préalable : choix explicite de l’utilisateur. Aucune
  écriture de test laissée sur la base dev.

### P1 tranché et implémenté (00084)

Deux règles, dérivées de l’invariant « chaque auteur possède sa copie
souveraine » :

1. **Co-auteurs `ACCEPTED`** : ils reçoivent la même copie que l’auteur
   principal — `DRAFT` dans leur espace personnel, publiée seulement s’ils le
   décident. Elle est créée à la soumission/publication, et au moment où leur
   consentement passe à `ACCEPTED` (trigger `ArticleAttribution`). Un
   co-auteur `PENDING` n’a rien : sans accord, pas de copie. Le brouillon
   apparaît dans la liste d’articles du studio comme celui de l’auteur
   principal — pas de contenu caché, pas de publication automatique.
2. **Transfert média → personnel** : si l’article possède déjà une copie
   souveraine, le transfert est **refusé** — la copie est le lieu de vie,
   l’archive reste au média. Cela évite deux vivants identiques et préserve
   l’URL canonique publiée. Sans copie, l’article qui entre dans un espace
   personnel redevient `ORIGINAL` : plus aucun `MEDIA_ARCHIVE` dans un espace
   personnel. La garde existe aussi en base (`trg_guard_sovereign_transfer`)
   pour couvrir un `UPDATE` SQL direct.

### Clôture du P1 (2026-11-10)

- `00084` appliquée en dev : version **84**, 3 triggers actifs
  (`trg_provision_author_sovereign_copy`,
  `trg_provision_coauthor_sovereign_copy`, `trg_guard_sovereign_transfer`),
  4 fonctions présentes, boucle co-auteur confirmée dans la fonction.
- Invariants dev : 1 copie, 1 archive média, 0 archive en espace personnel,
  0 doublon, 0 co-auteur `ACCEPTED` sans copie.
- Suite complète `go test ./...` sur base éphémère, timeout de 180 s par
  paquet : **58 paquets OK, 9 en échec, 8 sans test**, run terminé seul. Les
  9 échecs restants (`abuse`, `middleware`, `creator`, `feed`, `highlights`,
  `posts`, `publishers`, `settings`, `users`) sont reproduits à l’identique
  sur un worktree propre à HEAD — mêmes tests, mêmes messages. Aucune
  régression imputable au P1.
- Harnais des paquets lents (2026-11-11) : `adminauthz` migre une base
  gabarit une fois par processus puis la clone (`CREATE DATABASE … TEMPLATE`),
  avec un gabarit à 52 pour les tests de déploiement ; `seed` et `devtools`
  regroupent leurs INSERT par lots (`pgx.Batch`), y compris `RunWorld` et les
  commentaires, arrêtent le repli d’`EmbedTop` quand le service est
  injoignable et factorisent la requête auteurs d’`AddTop`. Résultat sous la
  limite de 180 s : `adminauthz` 88 s, `seed` 52 s, `devtools` 167 s — sans
  `-short`, sans test désactivé, sans relèvement de timeout.
- Réparation des 9 paquets rouges (2026-11-11) : causes corrigées sans
  contourner les tests — vocabulaire `burst.signup.publisher`, colonne
  `"updatedAt"`, déstructurage de `seedFollows`, visibilité `MEDIA` du fil,
  propriétaire de publication absent (`COALESCE` → garde), brouillons du fil
  rendus opt-in (`IncludeOwnDrafts`, seuls `posts.Get` les demandent),
  surlignage privé vérifié après l’upvote public, auteur tiers pour le
  fallback d’attribution, `fx.OwnerID` pour la publication de settings,
  colonne `"isRead"` des notifications. Run complet final sur base neuve :
  **67 paquets OK, 0 échec, 0 timeout**, **27 min 23 s** (1643 s). Les 7
  autres paquets des 9 (`abuse`, `middleware`, `creator`, `highlights`,
  `publishers`, `settings`, `users`) étaient déjà verts ; `feed` 97 s,
  `posts` 4,6 s et `devtools` 135 s. **Les 9 sont verts.** Devtools
  réduit le volume de ses deux tests de branches (80 utilisateurs / 20
  articles / 120 pensées / 200 sessions), le test handler conservant le
  volume complet.

### Correctifs éditeur (2026-11-11)

- **A2** : `Mod+Alt+A` bascule l'alinéa, avec garde `paragraph` et infobulle
  du bouton de barre (`63cf082f`) ; `Mod+Alt+I` a été écarté car il ouvre
  les DevTools de Chrome sur macOS.
- **A3** : la toolbar n'a plus qu'un arrêt de tabulation ; les flèches
  parcourent les boutons et `Home`/`End` vont aux extrémités. Le calcul est
  testé dans `toolbar-navigation.test.ts` (`8495cb3d`).
- **Lettrine** : le corps canonique émet `data-drop-cap="true"` en plus de
  `has-drop-cap` ; le CSS neutralise l'alinéa et `text-wrap: pretty` sur ces
  paragraphes, pour que la première ligne épouse le flottant dans le core
  comme dans les tenants (`8495cb3d`).
- **Clic début de ligne** : toute la gouttière gauche du padding desktop est
  captée (plus seulement 32 px), et un simple clic est distingué d'un glisser
  pour ne pas écraser une sélection (`8495cb3d`).
- Vérifié : `pnpm --filter @qoe/studio test` (107 tests), canonical body
  (22 tests), typechecks studio/ui, eslint, prettier.
- Contrôle visuel : lettrine rendue dans `article-prose` via le UI lab du
  studio (capture), flottant à gauche et texte qui l’épouse ; les pages core
  et tenants utilisent la même feuille et le même conteneur.

---

## 📝 Instructions

<!--
Zone de communication. Les consignes écrites ici sont prioritaires sur le
reste du plan.
-->

_(vide pour l’instant)_
