# Éditeur studio — plan vivant

> **Ce fichier est la mémoire du chantier.** À chaque reprise, le lire avant de
> coder, puis le mettre à jour après chaque lot : ce qui est fait, ce qui reste,
> dans quel ordre et comment vérifier.
>
> **Instructions utilisateur :** la section [« 📝 Instructions »](#-instructions)
> est prioritaire sur le reste.

Dernière mise à jour : 2026-11-09 · branche `dev` · dernier commit éditeur `000f4393`.

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

| Commit     | Contenu                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `0bfccbe8` | Tolérance de 32 px autour du début de ligne visuelle, y compris sur les lignes coupées            |
| `403ada88` | `Tab` libéré pour les paragraphes ; l’alinéa reste dans les barres d’outils                       |
| `4193684a` | Ouverture tactile des annotations + bouton « Modifier la note d’auteur » dans le bandeau          |
| `fd56f4f7` | Retours à la ligne conservés dans les citations d’annotation multi-paragraphes                    |
| `000f4393` | Bouton « Légende et crédit de l’image » désactivé tant qu’aucune image n’est sélectionnée          |

Vérifications passées à chaque étape :

```bash
pnpm --filter @qoe/studio typecheck
pnpm exec eslint apps/studio/src/features/editor
pnpm --filter @qoe/studio exec vitest run src/features/editor
git diff --check
```

Les tests éditeur comptent **10 fichiers / 49 tests**. Le rendu navigateur, les
gestes tactiles et les combinaisons clavier réelles n’ont pas encore été validés
visuellement.

## 3. Audit d’ergonomie

### A. Clavier et focus

- **A1 — `Tab` reste piégé dans les listes et les blocs de code.** `403ada88` a
  retiré le raccourci de `ParagraphFormatting`, mais Tiptap garde ses propres
  raccourcis : `List.Item` intercepte `Tab`/`Shift-Tab` pour imbriquer les
  éléments, et `CodeBlock` intercepte `Tab` pour l’indentation. Le clavier ne
  peut donc toujours pas sortir de ces blocs. C’est le point le plus urgent.
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

- **B1 — Les images de galerie ne sont pas éditables.** `GalleryImage` accepte
  un `alt`, mais l’upload les crée avec `alt: ''`, et `ImageDetailsPanel` ne
  modifie que le nœud `image`. Une galerie est comptée dans l’avertissement
  « images sans alt » à la publication sans qu’on puisse corriger. Il manque
  aussi la sélection, la suppression et la réorganisation d’un élément.
- **B2 — L’alt manquant n’est signalé qu’à la publication.** Le contrôle
  `countImagesWithoutAlt` vit dans la modale de publication ; dans l’éditeur,
  rien ne distingue une image correctement décrite d’une image muette.
- **B3 — Les actions sur la couverture n’apparaissent qu’au survol.** Le bloc
  `opacity-0 group-hover:opacity-100` de `CoverUploader` est peu fiable au
  tactile : « Changer » et « Supprimer » peuvent rester invisibles.
- **B4 — L’alt de la couverture est le titre de l’article.** `alt={title || …}`
  fait répéter le titre par le lecteur d’écran au lieu de décrire l’image. Il
  faut soit un vrai champ alt, soit une option « image décorative ».
- **B5 — Remplacer une image impose de la supprimer puis de la réuploader.**
  Un geste « Remplacer » conservant la légende, le crédit et l’alt serait plus
  sûr pour les corrections.

### C. Annotations et tactile

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

- [ ] **A1.** Rendre `Tab` navigable dans les listes et les blocs de code :
      désactiver les raccourcis Tiptap concernés, conserver l’imbrication des
      listes et l’indentation du code via une commande explicite, puis couvrir
      `Tab` et `Shift-Tab` par des tests.
- [ ] **A2.** Ajouter un raccourci clavier dédié à l’alinéa (proposition à
      valider, par exemple `Mod+Alt+I`) ou une entrée de menu « Format ».
- [ ] **A3.** Appliquer le motif ARIA toolbar : un seul bouton tabbable par
      groupe, navigation aux flèches, `Home`/`End`, focus visible conservé.
- [ ] **A4.** Centraliser l’affichage `⌘` / `Ctrl` pour l’enregistrement, le lien
      et l’annotation, comme le fait déjà `useModKey` dans la barre d’outils.
- [ ] **A5.** Ajouter une aide des raccourcis de l’éditeur (panneau `?` ou menu).

### Lot B — médias (priorité haute)

- [ ] **B1.** Rendre les images de galerie sélectionnables et éditables :
      alt, suppression, réorganisation ; réutiliser ou étendre
      `ImageDetailsPanel` sans casser le cas image seule.
- [ ] **B2.** Afficher un repère « Alt manquant » sur chaque image concernée
      dans l’éditeur, avec accès direct au panneau de détails.
- [ ] **B3.** Rendre les actions de couverture accessibles au tactile et au
      clavier (boutons toujours visibles ou menu d’actions).
- [ ] **B4.** Permettre un vrai alt de couverture ou une option « décorative ».
- [ ] **B5.** Ajouter « Remplacer l’image » en conservant alt, légende et crédit.

### Lot C — annotations et tactile (priorité moyenne)

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
- **Raccourci alinéa** : `Mod+Alt+I`, autre combinaison, ou uniquement menu ?

## 6. Comment vérifier

```bash
pnpm --filter @qoe/studio typecheck
pnpm exec eslint apps/studio/src/features/editor
pnpm --filter @qoe/studio exec vitest run src/features/editor
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

## 📝 Instructions

<!--
Zone de communication. Les consignes écrites ici sont prioritaires sur le
reste du plan.
-->

_(vide pour l’instant)_
