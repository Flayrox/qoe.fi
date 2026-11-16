# Éditeur studio — plan vivant

> **Ce fichier est la mémoire du chantier.** À chaque reprise, le lire avant de
> coder, puis le mettre à jour après chaque lot : ce qui est fait, ce qui reste,
> dans quel ordre et comment vérifier.
>
> **Instructions utilisateur :** la section [« 📝 Instructions »](#-instructions)
> est prioritaire sur le reste.

Dernière mise à jour : 2026-11-15 · branche `dev` · dernier commit éditeur `5bc54ff2`.

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

Les tests éditeur comptent **19 fichiers / 105 tests** (mesure du 2026-11-15,
commit `5bc54ff2`). La lettrine a été contrôlée visuellement dans le CSS
partagé (flottant à gauche, texte qui l’épouse, `text-indent: 0` avec alinéa) ;
les gestes tactiles réels restent à valider.

Dernier lot vérifié : `tsc` 0 · `eslint` 0 · `vitest src/features/editor`
105/105 · `canonical-article-body` 24/24 · contrôle navigateur sur un banc
`/dev` temporaire (supprimé après la vérification). Le build complet n’a pas
été relancé après ces correctifs.

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
- [x] **A4.** Affichage `⌘` / `Ctrl` centralisé dans `hooks/useModKey.ts` pour
      l’enregistrement, le lien, l’annotation et la barre d’outils (commit
      `433ba30c`).
- [x] **A5.** Aide des raccourcis dans `EditorShortcutsPanel`, ouverte depuis la
      barre de statut (commit `433ba30c`).

### Lot B — médias (priorité haute)

- [x] **B1.** Images de galerie sélectionnables et éditables : alt,
      déplacement et retrait (commit `2412f4b4`).
- [x] **B2.** Repère « Alt manquant » posé par la décoration `AltCoverage`
      (cadre ambre, badge cliquable sur les images seules), compteur dans la
      barre de statut et accès direct au panneau de détails (commits
      `433ba30c`, `6dc8a5e7`).
- [x] **B3.** Actions de couverture accessibles au tactile et au focus clavier
      (commit `fcf13e44`).
- [x] **B4.** Vrai alt de couverture et option « décorative » : colonnes
      `coverAlt` / `coverDecorative` (migration `00092`), contrat Go, SDK,
      Studio et rendu public avec repli sur le titre (commit `ba817987`).
- [x] **B5.** « Remplacer » dans `ImageDetailsPanel` : le fichier est compressé
      et uploadé, seul `src` change ; alt, légende et crédit sont conservés,
      même si la sélection a bougé pendant l’upload (commit `433ba30c`).

### Lot C — annotations et tactile (priorité moyenne)

- [x] **C0.** Panneau d’annotation refondu : bandeau, citation et actions
      séparées (commit `0a84e005`).
- [x] **C1.** Le `title` n’est plus écrit dans le HTML publié : l’éditeur le
      pose au survol, dans la langue active et selon le pointeur (`Touchez…`
      ou `Option/Alt+clic…`). Le lecteur garde son propre libellé (commit
      `433ba30c`).
- [x] **C2.** « Modifier le texte » dans `AnnotationNotePanel` : referme la
      note, replace la sélection sur le passage et rend le focus à l’éditeur
      (commit `433ba30c`).
- [x] **C3.** Type de pointeur lu sur `pointerdown` (`mouse`, `touch`, `pen`)
      et non plus via `matchMedia('(pointer: coarse)')` ; le snap de début de
      ligne reste actif à la souris sur un appareil hybride (commit
      `433ba30c`).
- [x] **C4.** Citation d’annotation longue dépliable/repliable, avec
      `aria-expanded` et remise à zéro à chaque nouvelle sélection.

### Lot D — confort (priorité basse)

- [x] **D1.** Progression par fichier (`n/total` + nom) et annulation d’un
      upload de galerie ; les fichiers déjà envoyés sont conservés et insérés.
- [x] **D2.** `↑`/`↓` aux bords d’un bloc sélectionnent l’image voisine
      (`lib/image-navigation.ts`, testé) ; `Entrée` ouvre ses détails. Le
      badge et le compteur donnent le même accès (commit `433ba30c`).

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
- test de déplacement/suppression d’une image de galerie (le round-trip HTML
  est couvert par `ImageGallery.test.ts`) ;
- test du remplacement d’image (identité du nœud + conservation des champs) ;
- vérification navigateur des gestes tactiles réels (le badge, le compteur,
  le dialogue et le chemin clavier galerie ont été contrôlés le 15/11).

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

- **Souveraineté d'auteur v2 & Coffre-fort invisible (Migration 00085)** :
  - Fin des brouillons fantômes dans Studio : les copies souveraines provisionnées automatiquement restent en veille (`isClaimed = false`) et sont invisibles jusqu'à ce que l'auteur ou co-auteur clique sur « Récupérer ma version » (`isClaimed = true`).
  - Table `ArticleSnapshot` pour figer l'état textuel aux jalons clés : `INITIAL` (création), `AUTHOR_SWITCH` (sauvegarde par un contributeur tiers), `SUBMITTED` (soumission revue), `PUBLISHED` (publication), `BEFORE_REVOCATION` (éviction d'un co-auteur), et `BEFORE_RESTORE` (avant rollback).
  - Protection des co-auteurs (personnels ou médias) révoqués ou exclus : capture automatique d'un snapshot `BEFORE_REVOCATION`, maintien du droit d'accès aux snapshots et droit inaliénable de forker vers leur propre espace personnel.
  - `RecoverArticleModal` : choix clair entre « Votre dernière version rédigée » et « Dernière version collective », avec prévisualisation et diff textuel mot-à-mot.
  - `ArticleHistoryModal` : onglet « Versions du texte » avec historique des jalons, mot-compte, auteur et restauration réversible en 1 clic.
  - Vocabulaire clarifié : remplacement du badge brut « Souverain · [Média] » par « Version personnelle · [Média] », badge « Lecture seule », et raccourci « Ma version ».
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

### Renforcement des tests unitaires & couverture Studio (2026-11-14)

- **Élévation de couverture & ratchet** : passage du seuil de couverture global studio de 6/7% à **9%** (statements: 9%, branches: 9%, functions: 9%, lines: 9%), couverture atteinte **9,31%** (29 fichiers de tests, 151 tests passés).
- **Suites de tests ajoutées** :
  - `article-settings.test.ts` (16 tests) : validation du mapping brouillons/sauvegarde, assainissement des statuts par défaut, synchronisation d'attributions primaire et co-auteurs, détection des payloads sales (fingerprint dirty state).
  - `ImageDetailsPanel.test.tsx` (7 tests) : champs alt/légende/crédit, mode image seule vs image de galerie, recadrage et validation au clavier (`Enter`).
  - `AnnotationNotePanel.test.tsx` (6 tests) : édition de note d'auteur, affichage de citation, compteur de caractères, confirmation de suppression, raccourci `Mod+Enter`.
  - `CoverUploader.test.tsx` (5 tests) : téléversement avec drag & drop, état de chargement, prévisualisation et retrait de couverture.
  - `LinkEditorPanel.test.tsx` (6 tests) : édition de lien hypertexte, gestion des erreurs d'URL invalides et raccourcis.
  - `recommendations.test.tsx` (4 tests) : recherche et maillage de publications partenaires, ajout et retrait avec confirmation.
- **Robustesse du code éditeur** :
  - Correction dans `recommendations.tsx` pour sécuriser l'accès au nom d'éditeur (`publisherName?.slice`).
  - Déclaration explicite des sous-exports server actions manquants dans `@qoe/sdk/package.json`.
  - Exclusion ciblée de `src/app/dev/**` dans la configuration de couverture pour éviter les artefacts de parsing Rolldown/V8.
  - Typage strict validé (`tsc --noEmit` à 0 erreur sur tout le monorepo et `eslint` à 0 erreur).

### Correctifs éditeur (2026-11-15)

Lot `433ba30c` + verrouillage `6dc8a5e7` + revue `5bc54ff2` — clavier, médias et annotations.

- **A4/A5** : `useModKey` partagé (barre d’outils, en-tête, statut, lien,
  annotation) et panneau `EditorShortcutsPanel` ouvert depuis la barre de
  statut. Les raccourcis affichés sont ceux réellement branchés.
- **B2** : extension `AltCoverage` (décoration ProseMirror, aucun nœud ajouté
  au document) : cadre ambre sur les images sans alt, badge « Alt manquant »
  sur les images seules, compteur « N images sans alt » dans la barre de
  statut. Un clic sur le badge ou le compteur sélectionne l’image et ouvre
  `ImageDetailsPanel`. La règle de document est partagée par les trois
  chemins (`lib/alt-coverage.ts`) et testée.
- **B5** : bouton « Remplacer » ; compression + upload, puis
  `updateAttributes` sur `src` **et les champs affichés** (alt, légende,
  crédit). La position et le `src` d’origine sont capturés à l’ouverture : si
  le nœud a bougé ou changé, le remplacement est refusé plutôt que d’appliquer
  le fichier à une autre image.
- **C1** : plus de `title` figé dans le HTML enregistré ; l’éditeur pose un
  titre i18n au survol, adapté au pointeur. Le lecteur garde son libellé.
- **C2** : action « Modifier le texte » dans la note d’auteur.
- **C3** : type de pointeur par événement, avec repli sur la media query
  seulement si aucun `pointerdown` n’a été observé.
- **D2** : navigation clavier vers l’image voisine et ouverture des détails
  par `Entrée`, couvertes par `image-navigation.test.ts`.

Vérifié : `pnpm --filter @qoe/studio typecheck` 0 · `eslint
apps/studio/src/features/editor --max-warnings=0` 0 · `vitest
src/features/editor` 105 tests / 19 fichiers · `canonical-article-body`
24 tests. Le badge, le compteur, le panneau et le dialogue de raccourcis ont
été contrôlés dans un navigateur le 15/11 (voir ci-dessous) ; les gestes
tactiles réels restent à valider.

### Revue du 15/11 — galeries, remplacement et navigateur

- **Galerie (critique)** : la relecture du HTML transformait chaque
  `<div data-image-gallery>` en galerie vide (image sans `src`) suivie d’une
  image dupliquée. `GalleryImage` parse désormais `src`/`alt` explicitement et
  passe avant la règle `img[src]` d’`ArticleImage` (`priority: 60`) ;
  `ArticleImage` exclut `[data-gallery-image]`. `ImageGallery.test.ts` couvre le
  round-trip et l’ordre des images. Sans ce correctif, le compteur affichait
  3 images sans alt au lieu de 2.
- **Remplacement** : vérifie que le nœud capturé est toujours la même image
  (type + `src`) avant d’appliquer le nouveau fichier ; conserve les champs
  alt/légende/crédit en cours de saisie ; refuse proprement si l’image a bougé.
- **Panneau** : `openImageDetails` borne le panneau sous la barre d’outils
  sticky (0 px de chevauchement mesuré).
- **Raccourcis** : `useAltKey` affiche `⌥` sur Apple et `Alt` ailleurs ;
  `Alt + clic` rejoint la liste ; le tooltip « Barré » annonce `⇧S` (keymap
  TipTap), plus `⇧X`.
- **C2** : `handleEditAnnotatedText` réutilise `closeAnnotationPanel` au lieu
  de dupliquer la fermeture.

Contrôle navigateur (banc `/dev/editor-check` temporaire, supprimé depuis,
1280×720) : badge visible sur l’image seule, clic → panneau avec champ alt
focalisé ; compteur « 2 images sans alt » → première image + panneau ;
dialogue de 13 raccourcis, 685 px de haut, entièrement visible, fermeture par
`Échap` ; chemin clavier `↑` puis `Entrée` vérifié sur le DOM de l’éditeur
(galerie sélectionnée, panneau alt-only). Aucun message d’erreur console.
Restent : gestes tactiles réels, course crop/remplacement en co-édition, test
du remplacement.

## Adoption UI (2026-11-16)

Les écrans articles (liste, réglages, dialogue de confirmation partagé),
traduction, sécurité TOTP, stage et réglages (consentements, MFA) utilisent
`@qoe/ui` ; `AnnotationNotePanel` n’a plus de bouton natif. Aucun changement de
règle métier ni de payload. Commits : `ccd08ccf`, `526ac8c5`. Vérifié :
typecheck studio 0, 126/126 tests éditeur+santé, 2/2 Playwright, ESLint 0.

---

## 📝 Instructions

<!--
Zone de communication. Les consignes écrites ici sont prioritaires sur le
reste du plan.
-->

_(vide pour l’instant)_
