# Sélection native mobile — plan d'exécution détaillé (tranches 3 & 4)

> Suite directe de `NATIVE_SELECTION_ARCHITECTURE.md` (rév. 6, décision du
> 2026-09-03) : le présent document découpe les tranches 3 (iOS `UITextView`)
> et 4 (Android `TextView`+`Spannable`) en sous-tranches livrables et
> testables, avec les spikes à valider avant chaque engagement, le contrat
> d'intégration exact et les décisions produit à trancher.
>
> Principe non négociable (rév. 6) : le natif fournit le **geste** (couche 1),
> notre surface morphée (`selection-popover`) fournit l'**action** (couche 2),
> le **document canonique** serveur fournit les **données** (couche 3). Le
> morph ne dépend pas du natif et n'est jamais sacrifié à la nativerie système.

---

## 0. Faits vérifiés le 2026-09-04 (avant d'écrire ce plan)

| Élément | Vérification |
|---|---|
| Stack mobile | `expo ~57.0.13`, `react-native 0.86.2` (New Arch), `react-native-reanimated 4.5.1`, `react-native-gesture-handler 2.32`, `react-native-worklets 0.10.1` — dossiers `ios/` et `android/` **présents** (dev builds possibles) |
| iOS : `@bsky.app/react-native-uitextview` | **Active et maintenue** : v2.7.1 publiée le 2026-08-17. Ajouts récents utiles : `selectionColor` (v2.7.0), inline views (v2.6.0), correctifs `onLongPress` + retour press « Text-like » (v2.5.0), correctif interactions de sélection natives (v2.4.0). Réputée compatible RN 0.8x / New Arch (utilisée en prod par Bluesky) |
| Android : raccourci RN core ? | **Non** : `onSelectionChange` sur `<Text selectable>` Android n'existe toujours pas (issue facebook/react-native#23147 ouverte depuis 2019) → **le module natif maison est justifié**, il n'y a pas de chemin gratuit |
| Moteur actuel (référence & repli) | `apps/mobile/src/components/article/html-blocks.tsx` + `html-blocks-core.ts` : tokens mesurés, gestes, bandes, sélection → `SelectionInfo`. Conserve le mode « HTML hérité » (`htmlToBlocks`) ET le mode document canonique (`canonicalDocumentToBlocks`) |
| Contrat de sélection existant | `SelectionInfo` : `{ text, index (ordinal), canonicalStart, canonicalEnd, from, to (ids de tokens) }` produit par `selectionToInfo` ; consommé par `SelectionPopover` (morph pill → formulaire) |
| Deep-link passage (6-b/6-d) | Web ET mobile peignent/scrollent déjà un `spotlight {start,end,sha}` par offsets (motif à réutiliser tel quel) |
| Paywall | Le lecteur ne charge le document canonique que si l'accès complet est acquis — invariant à conserver en mode natif |

---

## 1. Cible d'intégration : un composant unique `NativeArticleBody`

Le moteur actuel est rendu par `ArticleHtml` (html-blocks.tsx), appelé par
`article-screen.tsx` avec : `html`, `highlights`, `document`, `selection`,
`onSelect`, `onScrollLock`, `spotlight`, `onSpotlightMeasured`.

**Cible** : le même contrat, rendu par plateforme :

```
article-screen.tsx (inchangé)
  └─ ArticleBody (choix du moteur)
       ├─ mode hérité (pas de document)  → ArticleHtml tokens  [inchangé]
       └─ mode document canonique        → NativeArticleBody    [nouveau]
              ├─ index.tsx               → Platform.select (iOS / Android / autre)
              ├─ NativeArticleBody.ios.tsx      (UITextView — tranche 3)
              ├─ NativeArticleBody.android.tsx  (TextView/Spannable — tranche 4)
              └─ NativeArticleBody.shared.ts    (pures : runs, conversion offsets,
                                                 sélection → SelectionInfo)
```

- **Un seul endroit à changer** quand le natif arrive : le choix du moteur
  dans `ArticleBody`. `article-screen.tsx` ne sait pas quel moteur rend.
- **Garde-fou** : un ErrorBoundary autour du rendu natif → repli silencieux
  sur le moteur tokens si une exception native survient (jamais d'écran vide).
- **Le mode hérité (HTML sans document) ne passe PAS au natif** — il reste sur
  le moteur tokens. Le natif ne sert que le document canonique (c'est ce que
  le serveur sert aux clients depuis la tranche 1).

### 1.1 Sous-étapes communes (préalables aux deux tranches)

Ces fonctions sont **pures** → écrites et testées immédiatement, sans device
(c'est le premier commit, valeur immédiate) :

1. `documentToPlainText(doc)` : le texte canonique est DÉJÀ dans `doc.text` ;
   il faut la table segment → offsets de caractères plateforme.
2. `documentToStyleRuns(doc)` : découpe le document en **runs contigus**
   `{ start, end, styles[], block }` où `styles` ∈ bold/italic/underline/code/
   link, et `block` porte le style de paragraphe (p, h1–h4, blockquote, code,
   list-item). **Source unique de vérité du rendu attribué** — sert iOS
   (NSAttributedString), Android (Spannable) et les tests de parité.
3. `marksToRuns(highlights + spotlight, doc)` : plages à peindre avec leur
   classe (privé/public/officiel/spotlight) — déjà calculable par
   `buildSegmentMarks`/`computeSpotlightTokenSet` côté web ; à porter en pur.
4. **Conversion d'offsets aux frontières** (code points ↔ UTF-16) :
   - iOS : `NSRange` est en UTF-16 → convertir via le texte du segment
     (réutiliser la conversion déjà présente dans html-blocks-core).
   - Android : les char offsets Kotlin sont UTF-16 aussi → même conversion.
   - Le STOCKAGE reste en code points (serveur). La conversion n'existe qu'à
     la frontière native. Cas emojis/accents testés.

---

## 2. Tranche 3 — iOS natif (`UITextView`)

### 3-a · Spike d'éligibilité (½–1 j) — ✅ VALIDÉ (rapport ci-dessous)

> **Rapport du spike C2** (binaire de dev construit + écran spike sur
> simulateur iPhone 17 Pro, iOS 26) :
>
> 1. **Rendu** : un seul `UITextView` couvrant tout le corps rend **2
>    paragraphes** (`\n` dans les fragments) + gras/italique/souligné + marques
>    `backgroundColor` par plages — propre, `onTextLayout` natif rapporte les
>    vraies lignes (`"Le chat mange la souris.\n"` | `"Le chat dort."`).
>    → **aucun fork nécessaire pour les marques** (décision §6.1 : marques en
>    `backgroundColor` de spans, pas de calque).
> 2. **Piège d'usage découvert** : ne jamais imbriquer le `<Text>` de
>    react-native dans `<UITextView>` — ces enfants deviennent des
>    *attachments* (sous-vues) et tout fragment contenant `\n` est mal placé
>    (glyphes déplacés, retour à la ligne perdu). Les spans imbriqués doivent
>    être le **composant de la lib** (même import `UITextView`, sans
>    `selectable`/`uiTextView` sur les enfants). Les `<View>` inline de la lib
>    restent le mécanisme prévu pour `img`/`hr` (v2.6).
> 3. **Sélection native confirmée par l'utilisateur** : appui long → loupe,
>    drag → poignées visibles (capture : poignées aux deux bouts), drag d'une
>    poignée pour étendre, menu système Copier / Rechercher etc. affiché.
> 4. **`onSelectionChange`** : UTF-16 `start`/`end`, en continu ; désélection
>    `start === end`. Mappage C1 validé en live : sélection réelle `[3,19)` →
>    « chat mange la so » (texte canonique exact, ordinal, ancre).
> 5. **Largeur** : la vue a besoin d'une largeur explicite (`width`/`maxWidth`
>    du conteneur) pour ne pas se contenter de sa largeur intrinsèque.
> 6. **Géométrie de sélection : NON exposée par la lib** → conditionne 3-d :
>    pour ancrer la pill au-dessus du texte natif, il faut soit un **petit
>    fork** (la lib calcule déjà les rects de plages glyphes pour son
>    highlight press — `enumerateEnclosingRectsForGlyphRange` — exposé en
>    événement `onSelectionChange` + frames), soit ancrer sur les caret rects
>    des bords de la sélection mesurés côté JS. Trancher en 3-d.

- Installer `@bsky.app/react-native-uitextview` (~2.7.x) ; `pod install` ;
  dev build `expo run:ios`.
- Remplacer le rendu d'un article témoin (mode document) par un `UITextView`
  lecture seule, **par bloc**, dans la ScrollView existante.
- Valider sur simulateur, checklist :
  1. Appui long → **loupe** ; drag → **poignées** ; double-tap → mot.
  2. `onSelectionChange` en continu pendant le drag + désélection au tap
     dehors (`start === end`).
  3. `selectionColor` appliqué (v2.7.0) → bande continue visible.
  4. Hauteur intrinsèque du bloc (scroll natif désactivé, `textContainerInset`
     à zéro) : le layout inter-blocs de la ScrollView RN reste correct.
  5. Rendu des liens : tap → navigation (ou au moins non-cassant).
- **Sorties du spike** :
  - La lib couvre-t-elle les marques `backgroundColor` sur plages imbriquées
    (bold ∩ mark) ? Sinon → petit fork Swift (~30 lignes, documenté) — ou
    peinture des marques par calque au-dessus (décision §6.1).
  - Comment obtenir la **géométrie de la sélection** (rect du range) pour
    ancrer la surface morphée ? (prop/événement de la lib, sinon mesure du
    caret/fin de range via le texte) → conditionne 3-d.
  - Menu système Copy : garder tel quel, ou fork pour le masquer (§6.1).
- **Gate** : 3-a validé sur simulateur → on continue. Sinon → retour au plan
  (overlay de sélection natif impossible → statu quo amélioré, à re-décider).

### 3-b · Rendu attribué continu (1–2 j)

- `IOSNativeArticleBody` rend **tout le corps dans un seul `UITextView`
  lecture seule** : `attributedText` construit depuis le modèle continu de
  C1 (`article-text.ts` : texte plat + runs + mapping), avec les styles de
  paragraphe par bloc (h1–h4, blockquote, code, listes via styles de
  paragraphe + puces numériques synthétiques hors mapping) — même
  typographie (font scaling, poids, interligne) que `kindStylesFor` actuel.
- `img`/`hr` → **attachments inline** (lib v2.6.0 « inline views ») aux
  positions marquées par le modèle ; aucun composant RN intercalé.
- **Sélection continue** : un seul geste traverse tous les paragraphes
  (loupe + poignées natives continues). La conversion native ↔ canonique
  passe par la table du modèle (C1) — les synthetiques (puce, retour
  paragraphe, attachement) sont exclus du texte cité.
- **Gate** : parité visuelle par bloc (captures côte à côte vs moteur tokens)
  sur l'article témoin, puis sélection longue de 2 paragraphes validée.

### 3-c · Marques par plages (1 j)

- Peindre les `marksToRuns` (§1.1.3) en `backgroundColor` sur les ranges du
  texte attribué, avec les mêmes classes sémantiques que le web
  (`private`/`public`/`official`) + `spotlight` (deep-link).
- Guard d'empreinte : ne peindre que si `sha` correspond (déjà en place pour
  les tokens → réutiliser le même raisonnement).
- **Gate** : bandes continues (pas de « pills »), marques imbriquées
  correctes, sha périmé → rien.

### 3-d · Sélection → `SelectionInfo` → surface morphée (1–2 j)

- `onSelectionChange(start, end)` (UTF-16) → conversion → offsets canoniques
  → produire **le même `SelectionInfo`** que `selectionToInfo` aujourd'hui
  (texte, ordinal, ancre) pour que `SelectionPopover` (morph) fonctionne
  **sans modification**.
- Ancrage de la surface : positionner la pill depuis la géométrie native de la
  sélection (sortie du spike 3-a). Les bandes d'overlay live du moteur actuel
  ne sont plus nécessaires (le natif peint sa propre sélection) → supprimer
  l'overlay en mode natif, garder le code pour le mode hérité.
- Haptics : conservés (Light au début, Heavy au relâchement) — déjà branchés.
- **Gate** : séquence complète (appui long → drag → relâchement → pill →
  Surligner enregistré et peint) sur simulateur.

### 3-e · Deep-link spotlight (0,5 j)

- `spotlight` (params hlStart/hlEnd/hlSha) → peinture (§3-c) + scroll au
  passage (réutiliser le mécanisme `onSpotlightMeasured` de 6-d, la mesure
  venant du range natif).

### 3-f · Décision produit — sélection continue (ACTÉE : option B)

> Décision du 2026-09-04 (« toujours le plus premium ») : **la sélection doit
> traverser les paragraphes de tout l'article**, comme le web. Pas de v1 par
> bloc : on vise d'emblée le modèle continu.

- **Cible** : un **seul** conteneur texte natif par article (`UITextView` iOS /
  `TextView` Android), texte plat construit par `article-text.ts` (C1) ;
  les `img`/`hr` deviennent des **attachments inline** dans le flux texte
  (la lib iOS le supporte depuis v2.6.0 « inline views » ; Android :
  `ImageSpan`/replacement span). La sélection native traverse ainsi tout le
  corps d'un seul geste (loupe + poignées continues, comme sur le web).
- **C1 est conçu pour ce modèle** : `article-text.ts` produit un texte plat
  continu + une table de mapping (char canonique ↔ position d'affichage),
  pas des fragments par bloc. Les blocs non-texte sont des marqueurs
  d'attachement dans le même texte.
- Le découpage par bloc ne sert que de **repli** si le rendu inline des
  attachments s'avère instable sur une plateforme (rare) — jamais la cible.

---

## 3. Tranche 4 — Android natif (`TextView` + `Spannable`)

### 4-a · Spike module natif minimal (1 j) — ✅ VALIDÉ (rapport ci-dessous)

> **Rapport du spike 4-a** (émulateur Pixel 9, Android 15, RN 0.86.2 / Expo
> 57, JDK 17 Homebrew — le JBR d'Android Studio fait échouer le CMake de
> `react-native-worklets`, voir historique) :
>
> 1. **Voie technique retenue : module Expo local** (`apps/mobile/modules/
>    article-text-view`, autolinké par `expo-modules-core`) plutôt qu'un
>    composant Fabric codegen maison — même résultat (vraie `TextView`
>    native, New Architecture), beaucoup moins de plomberie, et le dossier
>    généré `android/` étant gitignoré, c'est la seule forme qui survit à
>    `expo prebuild`. Vue = sous-classe directe de `android.widget.TextView`
>    (le DSL `View(...)` d'expo-modules accepte n'importe quelle vue avec un
>    ctor `(Context)`, cf. `LinearGradientView`).
> 2. **Rendu validé sur émulateur** : 2 paragraphes (`\n` dans le texte
>    plat) rendus dans une seule `TextView`, gras/italique/souligné par
>    `StyleSpan`/`UnderlineSpan`, marques **continues** par
>    `BackgroundColorSpan` aux bonnes plages (captures : bandes jaune
>    officiel + bleu public sur les 2 lignes). Aucun effet « pills ».
> 3. **Hauteur intrinsèque (le point dur Android)** : un `TextView` dans une
>    ScrollView RN ne peut pas s'auto-mesurer (Yoga donne une taille au
>    style, pas au contenu — ni `ExpoView` ni le DSL n'exposent de measure
>    Yoga). Solution validée dans le spike : un **`<Text>` RN jumeau
>    invisible** (même texte/typo/largeur) mesure la hauteur → on la passe à
>    la vue native (`onLayout` → `height`). Résultat mesuré exact : vue
>    379×53, aucun scroll interne, aucune troncature. Le jumeau et la vue
>    native partagent le même moteur de layout Android (`StaticLayout`), la
>    parité de cassure de ligne est donc structurelle.
> 4. **Sélection native confirmée sur émulateur** : appui long (injecté via
>    `adb input swipe x y x y 900`) → mot sélectionné avec **poignées
>    natives** (capture : poignées teal aux deux bouts), drag d'une poignée →
>    extension multi-mots (sélection passée de `[3,7)` à `[8,24)`). Le menu
>    **ActionMode système** s'affiche (Translate/Copy/Share/Select all) — à
>    neutraliser en 4-b (décision produit). Pas de loupe Android (normal).
> 5. **`onSelectionChange`** : hook framework `onSelectionChanged(int,int)`
>    surchargé dans la vue → événement Expo en UTF-16 `location`/`length`,
>    continu pendant le drag, désélection `location=-1`. Mappage C1 validé en
>    live sur les captures : `[3,7)` → « chat », puis `[8,24)` →
>    « mange la souris. » (texte canonique exact, ordinal, ancre).
> 6. **Contraintes d'environnement notées** : build JDK 17 requis (CMake) ;
>    émulateur headless `-no-window` + `adb reverse tcp:8081` → Metro ;
>    screencap via `adb shell screencap` puis `pull` (le pipe `exec-out`
>    tronque le PNG). Pour la validation sans session, un bypass DEV
>    temporaire des routes `/spike*` dans `_layout.tsx` a été utilisé puis
>    **reverté** — l'écran spike reste accessible une fois connecté (deep
>    link `qoe://spike-articletextview`).

- RN core `<Text selectable>` Android **n'expose pas** `onSelectionChange`
  (issue #23147, ouverte depuis 2019 — vérifié) → module natif requis.
- Construire un **module Expo local** `ArticleTextView` (Kotlin) : un
  `TextView` avec `isTextSelectable = true`, recevant du JS : texte + runs de
  styles + marques ; exposant `onSelectionChange(location, length)` (offsets
  char UTF-16) en continu + désélection (location = −1) au tap dehors.
- Dev build : `expo run:android` (Expo Go ne charge pas de module natif
  custom) — le process de build local est déjà en place (dossier `android/`).
- **Sorties du spike** :
  - Codegen Fabric OK avec Expo 57 / RN 0.86.2 (CLI `create-react-native-library`
    ou template module maison) ? → **résolu** : module Expo local (autolinké),
    vue `TextView` directe, aucun codegen manuel.
  - Le `TextView` multi-lignes dans une ScrollView RN garde sa hauteur
    intrinsèque (wrap) sans scroll interne ? → **résolu** : jumeau `<Text>`
    RN pour la mesure (voir rapport) — mécanisme à industrialiser en 4-b.
  - Poignées Android, double-tap, magnifying absent (normal, pas de loupe
    Android) → **confirmé** (poignées + ActionMode présents, pas de loupe).
- **Gate** : spike validé sur émulateur → on continue.

### 4-b · Spannable + marques (1–2 j) — ✅ LIVRÉ (rapport ci-dessous)

> **Rapport de la tranche 4-b (C9)** — module `ArticleTextView` + pures
> partagées, validé sur émulateur Pixel 9 (Android 15) :
>
> 1. **Pures partagées** (`native/attributed.ts`, 9 tests ; suite native 31
>    verte) : `buildPaintSpans` découpe le texte plat en **runs homogènes**
>    (gras/italique/souligné/mono/lien + fond ARGB unique par caractère —
>    marques fondues dans le run, aucune double-peinture ni « trou ») et
>    `buildParagraphLayouts` décrit chaque paragraphe (kind, étendu à
>    travers le `\n` synthétique, marqueur exact des listes). Mêmes runs sur
>    iOS et Android → **parité par construction**, plus de découpage ad-hoc
>    dupliqué dans le spike iOS.
> 2. **Fixture « article témoin » partagée** (`native/demo-doc.ts`) : h2,
>    paragraphes (gras/italique/lien/code inline + spans officiels),
>    blockquote, ul, ol, bloc code — offsets canoniques CALCULÉS à
>    l'assemblage (zéro désynchronisation doc.text/blocks/segments).
> 3. **Module Android** : props `spans`/`paragraphs` ; spans de bloc =
>    `RelativeSizeSpan` (h1 1.5 / h2 1.28 / h3 1.14 / h4 1.05 + gras h1–h2),
>    `QuoteSpan` (filet + marge, API ≥ 28), bloc code mono + fond,
>    `LeadingMarginSpan` de retrait suspendu **mesuré sur le marqueur**
>    (`•  ` / `1. ` …), lien `URLSpan` (couleur = défaut système, à brancher
>    sur le thème en 4-c) ; marques toujours en `BackgroundColorSpan`
>    continus.
> 4. **Hauteur native mesurée** : `StaticLayout` sur le texte spané (les
>    titres agrandis comptent) → événement `onContentHeight` (500 dp sur le
>    témoin) — le « jumeau » RN de mesure du spike 4-a est supprimé.
> 5. **ActionMode neutralisé — découverte empirique API 35** : renvoyer
>    `false` à `onCreateActionMode` fait **dé-sélectionner** le framework
>    (sélection effacée ~600 ms après, vérifié en log). La technique
>    retenue : ActionMode ACTIF mais menu vidé à la création ET à chaque
>    `onPrepareActionMode` (`menu.clear()` + retour `true`) → sélection et
>    poignées conservées, **aucune barre système affichée** (ni Copier ni
>    Select all — capture).
> 6. **Validation device** (captures) : rendu du témoin = blockquote à
>    filet, listes puces/chiffres, bloc code, marques continues ; sélection
>    d'un mot → `onSelectionChanged` `[40,50)` → mapping live
>    « grouillait » (ordinal 0, ancre 40..50) avec poignées natives et sans
>    barre. Parité visuelle avec le spike iOS (mêmes runs partagés).
> 7. **Restes ouverts** : rendu des `img`/`hr` (attachment → `ImageSpan`
>    réseau) et styles de bloc iOS à trancher avec la tranche 3-b (vrai
>    corps d'article) ; couleur des liens = thème en 4-c.

- Rendu attribué : `SpannableStringBuilder` depuis `documentToStyleRuns` —
  `StyleSpan` (bold/italic), `UnderlineSpan`, `URLSpan` (liens), fond
  `BackgroundColorSpan` pour les marques **continues** (privé/public/officiel/
  spotlight) ; styles de bloc par paragraphe (marges blockquote/code, listes).
- Neutraliser l'ActionMode système (la barre de menu Android) — nos actions
  vivent dans la surface morphée (décision rév. 6, non négociable).
- **Gate** : parité visuelle iOS ↔ Android sur l'article témoin.

### 4-c · Sélection → `SelectionInfo` → surface (1 j) — ✅ LIVRÉ (rapport ci-dessous)

> **Rapport de la tranche 4-c (C10)** — module + spike Android, validé sur
> émulateur Pixel 9 (Android 15) :
>
> 1. **Géométrie native dans l'événement** : `onSelectionChange` transporte
>    désormais `y` (centre vertical de la 1re ligne sélectionnée, dp,
>    relatif à la vue texte — même sémantique que `yCenter` du moteur
>    tokens), `lineHeight` et `x`. Deux mots d'une même ligne → même `y`
>    (vérifié live : « déjà » et « grouillait », même ligne → 52.2 dp).
> 2. **Couleur des liens = thème** (fin de l'item ouvert de 4-b) : prop
>    `linkColor` (ARGB) appliquée aux `URLSpan` via `setLinkTextColor` —
>    même token que le spike iOS (parité).
> 3. **Adapter pur `nativeSelectionToPopoverInfo`** (selection.ts, 3 tests) :
>    produit le `SelectionInfo` EXACT de la surface morphée
>    (`{index, text, y, from, to, canonicalStart, canonicalEnd}` —
>    `from`/`to` vides : en natif, la sélection est peinte par le système),
>    consommé par `SelectionPopover` sans modification du contrat.
> 4. **Spike 4-c** : la VRAIE `SelectionPopover` (morph pill → formulaire) est
>    montée sur la sélection native, ancrée par `y` (même calcul que le
>    moteur tokens : `top = max(8, y − 58)`). HUD live (texte/ordinal/ancre/y
>    + état popover) pour les captures.
> 5. **DÉCOUVERTE Android/New Arch (bug pré-existant de la pill) :** sur
>    Android Fabric, `GlassComposer` en mode `floating` ne rend RIEN quand
>    son conteneur absolu (le wrap de `SelectionPopover`, qui n'a pas de
>    hauteur — seul son `top` le positionne) est de hauteur 0 et n'a que des
>    enfants absolus : le sous-arbre n'est jamais mesuré (vérifié par
>    diag en escalier : bande de contrôle et contenu simple rendus, GC
>    floating invisible, GC bottom rendu ; wrap avec `height:70` → rendu
>    immédiat). Fix : `height: 50` (hauteur repliée du composer) sur
>    `styles.wrap` de selection-popover — le morph déborde sous le top, aucun
>    parent ne clippe — + `minHeight: 50` défensif sur `floatingContainer`
>    de GlassComposer. Effet probable : la pill du moteur legacy ne s'est
>    jamais affichée sur Android (le fix profite aux deux moteurs).
> 6. **Validation device** (captures + dumps uiautomator) : appui long →
>    sélection mot → pill VISIBLE avec ses 4 chips (Surligner/Citer/Annoter/
>    Copier) ancrée au bon endroit (« quand », y 139.0 dp → pill à
>    `y−58` : bounds 772–825 px), action **Copier** → fermeture animée de la
>    pill ; désélection au tap sur le texte → `location=-1` → pill sortie.
> 7. **Restes ouverts** : la désélection au tap EN DEHORS du TextView
>    (Android garde la sélection — à traiter à l'intégration réelle, même
>    geste global que prévu côté iOS) ; presse-papiers non vérifiable ici
>    (pas de `cmd clipboard` sur cet émulateur) ; actions API (Surligner /
>    Citer / Annoter) non testées de bout en bout (spike sans session ni
>    article réel — le contrat API de `SelectionPopover` est déjà validé par
>    le moteur legacy).

### 4-d · Deep-link spotlight (0,5 j) — idem 3-e.

### 4-d · Deep-link spotlight (0,5 j) — idem 3-e.

---

## 4. Tests & validation

### Tests automatisés (sans device — valeur immédiate)

1. **Parité runs canoniques** : `documentToStyleRuns` sur un corpus (p, h1,
   strong/em, a, ul/ol, blockquote, code, img) → runs attendus exacts.
2. **Marques imbriquées** : bold ∩ mark, mark multi-styles → plages de
   peinture correctes (aucun « trou » ni double-paint).
3. **Conversion offsets** : code points ↔ UTF-16 avec emojis/accents
   (👋, é, combinaisons) — mêmes cas que les tests existants du moteur.
4. **Régressions** : la suite `html-blocks.test.ts` (49 tests) reste verte —
   le moteur tokens est la référence du mode hérité et le filet de repli.

### Checklist device (par gate, manuelle)

- [ ] Appui long → loupe (iOS) / poignées (Android), haptic Light
- [ ] Drag → extension continue par glyphe, bande native visible
- [ ] Relâchement → haptic Heavy → pill morphée ancrée au bon endroit
- [ ] Surligner → enregistré → peint au prochain rendu (bande continue)
- [ ] Citer / Annoter → le formulaire morphé reçoit le bon extrait
- [ ] Tap dehors → désélection native + sortie animée de la pill
- [ ] Spotlight deep-link → peint + scroll au passage exact
- [ ] Paywall : pas de document chargé si accès non acquis
- [ ] Repli : si le natif plante → retour moteur tokens sans écran vide
- [ ] Parité iOS ↔ Android sur l'article témoin (captures)

---

## 5. Ordre d'exécution & commits

| # | Commit | Contenu | Dépend de |
|---|---|---|---|
| C1 | Pures partagées (sans device) | `documentToStyleRuns`, `marksToRuns`, conversion offsets + tests (parité, emojis) | — |
| C2 | Spike 3-a | ✅ livré — lib iOS + écran spike, rendu multi-paragraphe validé, sélection native (loupe/poignées/menu) confirmée, mappage offsets validé live | C1 |
| C3 | Tranche 3-b | `NativeArticleBody.ios.tsx` : rendu attribué par blocs, `ArticleBody` choisit le moteur | C2 |
| C4 | Tranche 3-c | Marques peintes par plages (privé/public/officiel/spotlight) | C3 |
| C5 | Tranche 3-d | Sélection → `SelectionInfo` → surface morphée, haptics | C4 |
| C6 | Tranche 3-e | Deep-link spotlight iOS | C5 |
| C7 | (Option) 3-f | Sélection continue multi-blocs si décidée | C6 |
| C8 | Spike 4-a | ✅ livré — module Expo `ArticleTextView` (TextView+Spannable) sur émulateur : rendu multi-paragraphe + marques, jumeau de mesure (hauteur exacte), sélection native (poignées), `onSelectionChange` UTF-16 → C1 validé live ([3,7) puis [8,24)) | C1 |
| C9 | Tranche 4-b | ✅ livré — pures partagées `attributed.ts` (runs homogènes + layout paragraphe), fixture témoin `demo-doc.ts`, module Android `spans`/`paragraphs` (h2/blockquote/code/listes), hauteur native `onContentHeight`, ActionMode neutralisé (menu vidé — `false` à la création dé-sélectionne sur API 35) | C8 |
| C10 | Tranche 4-c | ✅ livré — géométrie native (y = centre 1re ligne) + `linkColor` thème, adapter `nativeSelectionToPopoverInfo` (3 tests), spike : VRAIE `SelectionPopover` montée sur la sélection native et ancrée (top = max(8, y−58)) ; **fix Android/Fabric** : pill invisible quand le wrap absolu de la popover n'a pas de hauteur (`height: 50` sur le wrap + `minHeight` floating) | C9 |
| C11 | Tranche 4-d | Deep-link spotlight Android | C10 |

Chaque commit garde la suite verte + la checklist device du gate.

---

## 6. Décisions produit à trancher

### 6.1 Menu système (iOS) — décision actée

- **Copier système conservé** (acté 2026-09-04) : le menu natif Copy reste
  disponible — c'est le geste système attendu ; nos actions vivent dans la
  surface morphée (rév. 6 : on n'injecte jamais d'action dans le menu
  système). Aucun fork Swift pour masquer Copy.
- La surface morphée s'affiche en plus, ancrée sur la géométrie de sélection
  (elle ne remplace pas le menu Copy, elle le complète).

### 6.2 Sélection continue multi-paragraphes (3-f) — décision actée

- **Option B actée** (2026-09-04, « toujours le plus premium ») : un seul
  conteneur texte natif par article, sélection continue sur tout le corps,
  `img`/`hr` en attachments inline. C1 (le modèle partagé) est construit
  pour ce rendu.

### 6.3 Périmètre de la passe native

- **Recommandation** : le natif ne sert QUE le mode document canonique. Le
  mode hérité (HTML brut sans document — articles legacy, previews) reste sur
  le moteur tokens. Les deux moteurs coexistent, l'utilisateur ne voit pas la
  différence de contrat.

---

## 7. Risques (mise à jour de la rév. 6)

| Risque | Mitigation |
|---|---|
| Fork iOS pour les marques background sur spans imbriqués | Petite extension Swift (~30 lignes) OU marques en calque overlay ; tranché au spike 3-a |
| Géométrie de sélection indisponible pour ancrer la surface | Sortie explicite du spike 3-a (prop de la lib ou mesure du range) — sinon la pill s'ancre sur la dernière frame du range |
| Dev builds natifs longs à chaque itération | Sous-tranches courtes (½–2 j), gates device groupés |
| Rebuilds Gradle / JDK | Process documenté dans DEV.md (JBR d'Android Studio incompatible CMake — connu) |
| Parité iOS ↔ Android | Runs partagés (C1) + captures par gate (checklist) |
| Régression du mode hérité | Le moteur tokens reste la référence ; les 49 tests existants sont le filet |
| Paywall | Le natif ne reçoit le document que si accès complet (invariant conservé dans `article-screen`) |

---

## 8. Code touché (inventaire)

| Fichier | Rôle |
|---|---|
| `apps/mobile/src/components/article/html-blocks-core.ts` | Référence des blocs/offsets — **inchangé** (source des runs) |
| `apps/mobile/src/components/article/html-blocks.tsx` | Moteur tokens — **inchangé** (mode hérité + repli) |
| `apps/mobile/src/components/article/native/…` | **Nouveau** : `ArticleBody` (choix), `NativeArticleBody.ios/android/shared` |
| `apps/mobile/src/features/article/article-screen.tsx` | Fournit doc/highlights/spotlight — léger : passe par `ArticleBody` |
| `apps/mobile/src/components/article/selection-popover.tsx` | Surface morphée — **inchangée** (consomme `SelectionInfo`) |
| `apps/mobile/src/lib/haptics.ts`, `…/selection-popover` | Conservés |
| `apps/mobile/ios/…`, `apps/mobile/android/…` | Pod install / module Kotlin (spike) |
