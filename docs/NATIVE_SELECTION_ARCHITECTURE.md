# Sélection native + morphing surface (mobile) — Note d'architecture

> Décision du 2026-09-03. Objectif : **sélection de texte au niveau natif sur iOS
> ET Android, sans sacrifier le morphing surface « pill → formulaire »** qui est la
> signature visuelle du produit (équivalent mobile du `layoutId="rauno-morphing-surface"`
> du web, spring `stiffness: 500, damping: 32`).

---

## 1. Le principe directeur : trois couches, deux technologies

Le menu système natif est le **seul endroit qu'on ne peut ni animer ni styler**
(pas de morph, pas d'icônes couleur, ordre dépendant du constructeur sur Android).
Y injecter nos actions tuerait la signature morph du produit. On ne le fait donc
**jamais**.

À la place, on coupe le problème en trois couches indépendantes :

| Couche | Technologie | Fournit |
|---|---|---|
| **1. Texte + geste** | Native (`UITextView` iOS / `TextView` Android) | Loupe (iOS), poignées, double-tap, layout des glyphes au pixel, `onSelectionChange` (offsets) |
| **2. Action + morph** | Notre surface Reanimated, **au-dessus** du texte natif | Pill compacte → formulaire, ancrée sur la géométrie de sélection, identique aux deux plateformes |
| **3. Données** | Modèle de blocs typés (JSON) | Un seul contrat consommé par les deux renderers natifs + le web |

Le natif ne remplace que la couche 1. Nos vues RN/Reanimated vivent au-dessus du
texte natif sans le toucher : animations, morph, toasts, composer restent 100 %
sous notre contrôle.

**Conséquence** : l'option « actions dans le menu système » (native pure) est
écartée par choix de produit, pas par faisabilité.

---

## 2. Le format : sortir du HTML comme contrat de rendu

**Constat** : aujourd'hui le pipeline est `API Go → HTML (data.content) →
htmlToBlocks() en JS sur l'appareil → tokens `<Text>` mesurés par onLayout → gestes`.

Le HTML n'est pas un problème en soi (il reste la **source** : le serveur et le
`TextHighlighter` web — TreeWalker DOM — en dépendent). Ce qui bride, c'est un
**moteur de rendu JS** qui re-parse du HTML à chaque écran et ne peut pas offrir
loupe/poignées natives.

**Décision** : séparer *transport* (HTML, inchangé) de *rendu* (document structuré).
Le modèle existe déjà et est unit-testé dans
`apps/mobile/src/components/article/html-blocks-core.ts` :

```ts
type Block =
  | { type: 'p' | 'h1' | 'h2' | 'h3' | 'h4'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'blockquote'; text: string }
  | { type: 'img'; src: string; alt?: string }
  | { type: 'hr' }
  | { type: 'code'; text: string };
```

À terme, ce document de blocs (avec les marques `{start, end, couleur}` en offsets
par segment) devient le **contrat versionné** consommé par :
- le renderer natif iOS (→ `NSAttributedString`),
- le renderer natif Android (→ `Spannable`),
- le web (optionnel, pour remplacer le TreeWalker DOM).

Gains : offsets de sélection stables (sûrs multi-octets), plus de re-parse, rendu
natif direct, base prête pour l'édition future.

> **Non-goal immédiat** : changer le contrat API Go. On peut commencer par
> exporter les blocs depuis le client (déjà calculés) ; l'endpoint serveur qui
> renvoie le document normalisé viendra quand le web en aura besoin aussi.

---

## 3. Les options évaluées et leurs verdicts

### ❌ `react-native-enriched-html` (Software Mansion) — disqualifié

Vérifié dans la doc API (référence `EnrichedText`, page « Supported tags », « Known
limitations ») :
- Le composant **lecture seule** n'expose **ni `onChangeSelection`, ni
  `contextMenuItems`** (ceux-ci n'existent que sur `EnrichedTextInput`, l'éditeur).
- Ensemble de tags **fixe et fermé** (b, i, u, s, code, a, mention, img, h1–h6,
  ul/ol, blockquote, codeblock, p, br) : **pas de `<mark>`**, tags hors-ensemble
  **strippés** (nos images/citations d'article web).
- Impossible de brancher Surligner/Citer/Annoter sur le menu natif du lecteur.

### ✅ iOS — `@bsky.app/react-native-uitextview` (la lib de Bluesky, en production)

- Remplaçant direct de `<Text>` : `selectable + uiTextView` → vrai `UITextView`
  (loupe, poignées, double-tap, glisser). Retombe sur `<Text>` RN hors iOS.
- **`onSelectionChange(start, end)`** : offsets caractères sûrs multi-octets,
  événements continus pendant le drag, **et événement de désélection au tap
  dehors** (`start === end`) → fermeture de la surface gratuite.
- v2.4.0 testée contre **RN 0.86.2** (notre version exacte, Expo 57, New
  Architecture ✓ — vérifié dans `apps/mobile/app.json`).
- Text imbriqué + vues inline supportés → nos segments par bloc s'y mappent.
- **Points à valider en spike** :
  1. `backgroundColor` sur spans imbriqués (rendu des marques continues) — non
     documenté ; sinon petit fork Swift (~30 lignes, attribut `.backgroundColor`).
  2. Le menu système Copy apparaît (non configurable par la lib) → coexister avec
     notre surface, ou masquer via fork (`UIMenuController`).

### ✅ Android — module natif maison (`TextView` + `Spannable`)

- `isTextSelectable` → poignées, double-tap, long-press natifs.
- `customSelectionActionModeCallback` → nos actions dans la barre système **si on
  le veut** (⚠️ choix produit ci-dessus : plutôt notre surface, la barre système
  étant neutralisée).
- Marques = `BackgroundColorSpan` (continues, sans l'effet « pills »).
- Pas de loupe sur Android (n'existe pas) → le gain natif = poignées + layout
  parfait + zéro mesure JS.
- Vrai travail natif : composant Fabric + codegen + pont (~1–1,5 semaine).

### 🅿️ Statu quo amélioré (roue de secours)

Le moteur actuel (bandes continues, tap-pour-fermer, haptics distincts, hit-test
absolu) + double-tap mot, poignées dessinées en JS, auto-scroll en bord d'écran.
~2–3 jours, cohérent sur les deux plateformes, **mais jamais de loupe**.

---

## 4. Séquence d'interaction cible (le morph avec le texte)

1. **Appui long** → le premier mot se sélectionne (texte natif, haptic Light).
2. **Drag** → la sélection s'étend nativement ; bande peinte native (iOS) / nos
   bandes continues (Android). La sélection s'ajuste par glyphe, pas par mot.
3. **Relâchement** → haptic Heavy. La bande du passage sélectionné **se rétracte
   et se transforme** (spring, stiffness ~500) en **pill compacte** ancrée au bord
   de la sélection : ✍️ Surligner · ❝ Citer · 💬 Annoter · ⧉ Copier (état actuel).
4. **« Annoter » / « Citer »** → la pill **morph en formulaire** (shared
   transition Reanimated — équivalent mobile du `layoutId` Framer Motion du web) :
   extrait cité en chip, zone de texte, contrôle privé/public.
5. **Poignée draguée pendant qu'une sélection est affichée** → `onSelectionChange`
   en continu → la bande et la pill se repositionnent en live.
6. **Tap dehors** → la native désélectionne (`start === end`) → sortie animée de
   la surface (fondu + glissé, déjà en place dans `selection-popover.tsx`).

Reanimated **4.5.1** (vérifié dans `apps/mobile/package.json`) : ses shared
transitions reproduisent le morphing `layoutId` du web sur mobile, natif ou non —
**le morph ne dépend donc pas de la couche native** et peut être prototypé dès
maintenant sur le moteur actuel.

---

## 5. Déroulement recommandé (tranches)

| # | Tranche | Contenu | Durée |
|---|---|---|---|
| 0 | **Spike iOS** (branche) | 1 paragraphe en `UITextView` via la lib Bluesky : valider marques `backgroundColor` continues, mappage offsets → ancres, coexistence menu système/surface | 1–2 j |
| 1 | **Morph mobile** (moteur actuel) | Pill → formulaire en shared transition, ancrage sur la bande, fidèle au web ; **indépendant du natif** | 3–4 j |
| 2 | **iOS natif** | Brancher la couche UITextView sur les blocs (si spike OK) ; garder surface + morph tels quels | ~1 sem |
| 3 | **Android natif** | Module `TextView`/`Spannable` maison, mêmes contrats TS | 1–1,5 sem |
| 4 | **(Option) Contrat serveur** | Endpoint renvoyant le document de blocs normalisé (quand le web en voudra) | 2–3 j |

Total : ~3 semaines en tranches, livrable et testable après chacune.

---

## 6. Risques

- **Parité de rendu** entre iOS (attribué natif) et Android (Spannable) : mitigé
  par un modèle de blocs simple et partagé (p/h/ul/quote/code/img), style envoyé
  depuis TS (une seule source).
- **Fork de la lib Bluesky** si le `backgroundColor` des marques manque : petit
  mais à maintenir ; alternative = peindre nos marques en overlay au-dessus du
  texte natif (on connaît la géométrie via les offsets + mesures natives).
- **Rebuilds natifs** à chaque itération (dev build `expo run:*`), JDK 17 requis
  côté Gradle (voir historique — le JBR d'Android Studio fait échouer CMake).
- **Menu système iOS** : choix à trancher au spike (garder Copy natif + notre
  surface, ou le masquer).

---

## 7. Références code actuelles

| Élément | Chemin |
|---|---|
| Modèle de blocs + moteur pur (tests) | `apps/mobile/src/components/article/html-blocks-core.ts` |
| Rendu tokens + gestes + bandes | `apps/mobile/src/components/article/html-blocks.tsx` |
| Surface d'actions (pill actuelle) | `apps/mobile/src/components/article/selection-popover.tsx` |
| Écran article (HTML entrant) | `apps/mobile/src/features/article/article-screen.tsx` |
| Référence web du morph (layoutId + spring) | `packages/ui/src/annotations/TextHighlighter.tsx` (l. ~566–582, 693+) |
| Haptics (Light/Heavy déjà branchés) | `apps/mobile/src/lib/haptics.ts` |
