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

### 3-a · Spike d'éligibilité (½–1 j) — À VALIDER AVANT D'ENGAGER LE RESTE

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

### 3-b · Rendu attribué par blocs (1–2 j)

- `IOSNativeArticleBody` rend chaque bloc du document :
  - Blocs texte (p, h1–h4, blockquote, code, li) → **un `UITextView`
    lecture seule par bloc**, `attributedText` construit depuis
    `documentToStyleRuns` (§1.1.2) — même typographie (font scaling, poids,
    interligne) que les styles `kindStylesFor` actuels.
  - Blocs non-texte (img, hr) → les composants RN actuels (`BlockView`),
    inchangés, entre les UITextView.
  - Listes : le marqueur (puce/chiffre) peut être un run dédié dans le même
    UITextView (parité visuelle avec le moteur actuel).
- **Sélection multi-paragraphes** : chaque UITextView sélectionne
  indépendamment. La plage peut enjamber 2 blocs via les offsets canoniques
  (le serveur l'accepte déjà) — la surface affiche une sélection « double
  plage » si besoin (à trancher en 3-f selon le ressenti).
- **Gate** : parité visuelle par bloc (captures côte à côte vs moteur tokens)
  sur l'article témoin.

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

### 3-f · Décision produit — sélection continue (si exigée)

- Option A (v1 par défaut) : sélection bornée au bloc — le plus rapide, la
  grande majorité des passages cités/surlignés tient dans un bloc.
- Option B : un **seul** UITextView par « run continu » (séquence de blocs
  texte sans img/hr intercalé) — la sélection traverse les paragraphes d'une
  même séquence ; les images cassent la continuité (rare). À évaluer si le
  ressenti A n'est pas acceptable. La lib supporte les inline views (v2.6.0)
  → l'option B est faisable sans fork massif.
- **Recommandation** : livrer A d'abord (valeur immédiate), évaluer B en
  phase 2 selon le test device.

---

## 3. Tranche 4 — Android natif (`TextView` + `Spannable`)

### 4-a · Spike module natif minimal (1 j)

- RN core `<Text selectable>` Android **n'expose pas** `onSelectionChange`
  (issue #23147, ouverte depuis 2019 — vérifié) → module natif requis.
- Construire un **composant natif Fabric** minimal `ArticleTextView`
  (Kotlin) : un `TextView` avec `isTextSelectable = true`, recevant du JS :
  texte + runs de styles + marques ; exposant `onSelectionChange(start, end)`
  (offsets char UTF-16) en continu + désélection au tap dehors.
- Dev build : `expo run:android` (Expo Go ne charge pas de module natif
  custom) — le process de build local est déjà en place (dossier `android/`).
- **Sorties du spike** :
  - Codegen Fabric OK avec Expo 57 / RN 0.86.2 (CLI `create-react-native-library`
    ou template module maison) ?
  - Le `TextView` multi-lignes dans une ScrollView RN garde sa hauteur
    intrinsèque (wrap) sans scroll interne ?
  - Poignées Android, double-tap, magnifying absent (normal, pas de loupe
    Android) — attendu.
- **Gate** : spike validé sur émulateur → on continue.

### 4-b · Spannable + marques (1–2 j)

- Rendu attribué : `SpannableStringBuilder` depuis `documentToStyleRuns` —
  `StyleSpan` (bold/italic), `UnderlineSpan`, `URLSpan` (liens), fond
  `BackgroundColorSpan` pour les marques **continues** (privé/public/officiel/
  spotlight) ; styles de bloc par paragraphe (marges blockquote/code, listes).
- Neutraliser l'ActionMode système (la barre de menu Android) — nos actions
  vivent dans la surface morphée (décision rév. 6, non négociable).
- **Gate** : parité visuelle iOS ↔ Android sur l'article témoin.

### 4-c · Sélection → `SelectionInfo` → surface (1 j)

- Même contrat que 3-d : conversion UTF-16 → offsets canoniques →
  `SelectionInfo` → `SelectionPopover` inchangé. Géométrie de sélection pour
  ancrer la pill (sortie du spike 4-a : layout du range via
  `Layout.getSelectionPath` ou mesure des bounds).

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
| C2 | Spike 3-a | lib iOS installée, preuve sur simulateur (rapport spike dans le commit) | C1 |
| C3 | Tranche 3-b | `NativeArticleBody.ios.tsx` : rendu attribué par blocs, `ArticleBody` choisit le moteur | C2 |
| C4 | Tranche 3-c | Marques peintes par plages (privé/public/officiel/spotlight) | C3 |
| C5 | Tranche 3-d | Sélection → `SelectionInfo` → surface morphée, haptics | C4 |
| C6 | Tranche 3-e | Deep-link spotlight iOS | C5 |
| C7 | (Option) 3-f | Sélection continue multi-blocs si décidée | C6 |
| C8 | Spike 4-a | Module Fabric `ArticleTextView` Android minimal, preuve émulateur | C1 |
| C9 | Tranche 4-b | Spannable + marques, parité iOS | C8 |
| C10 | Tranche 4-c | Sélection → surface, ActionMode neutralisé | C9 |
| C11 | Tranche 4-d | Deep-link spotlight Android | C10 |

Chaque commit garde la suite verte + la checklist device du gate.

---

## 6. Décisions produit à trancher

### 6.1 Menu système (iOS) — recommandations

- **Recommandation** : garder le menu Copy système tel quel ; nos actions
  vivent exclusivement dans la surface morphée (rév. 6 : on n'injecte jamais
  d'action dans le menu système). La désélection native au tap dehors ferme
  la surface.
- Fork Swift uniquement si le produit exige de masquer Copy (petit, ~30
  lignes, à maintenir).

### 6.2 Sélection continue multi-paragraphes (3-f)

- **Recommandation** : v1 = sélection par bloc (option A) ; l'option B
  (un UITextView par run continu, inline views pour img/hr) n'est engagée que
  si le test device la juge indispensable.

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
