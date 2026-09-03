# Sélection native + ancrage unifié (web, mobile, iOS, Android) — Architecture cible

> Décision du 2026-09-03 (rév. 2 — **version définitive, sans rustine**).
> Objectif : sélection de texte **au niveau natif** sur iOS ET Android, une
> **expérience et un moteur convergents avec le web**, et un modèle de données
> qui restera sain quand le contenu sera édité, quand l'édition arrivera, et quand
> de nouveaux clients (API publiques, embeds) consommeront les articles.
>
> Principe directeur du produit : le **morphing surface « pill → formulaire »**
> (équivalent mobile du `layoutId="rauno-morphing-surface"` du web,
> spring `stiffness: 500, damping: 32`) est la signature visuelle — il n'est
> **jamais** sacrifié à la « nativerie » système.

---

## 1. Les trois couches, deux technologies, un seul contrat

Le menu système natif est le seul endroit qu'on ne peut ni animer ni styler.
On n'y injecte **jamais** nos actions. Le natif sert le geste ; notre surface
sert l'action ; le serveur sert le document.

| Couche | Technologie | Fournit |
|---|---|---|
| **1. Texte + geste** | Native : `UITextView` (iOS) / `TextView`+`Spannable` (Android) | Loupe (iOS), poignées, double-tap, layout des glyphes au pixel, événements de sélection (offsets) |
| **2. Action + morph** | Surface Reanimated au-dessus du texte natif (web : Framer Motion) | Pill compacte → formulaire, ancrée sur la géométrie de sélection, identique partout |
| **3. Données** | **Document canonique serveur** (blocs typés + texte canonique + ancres à offsets) | Un seul contrat consommé par web, mobile, iOS, Android — plus aucun client ne « cherche » du texte |

Le morph (couche 2) ne dépend pas du natif : Reanimated 4.5.1 fait les shared
transitions (équivalent mobile du `layoutId` Framer Motion). Il peut être
prototypé sur le moteur actuel dès maintenant, puis le natif (couche 1) se glisse
dessous sans y toucher.

---

## 2. Le vrai problème : l'ancre par recherche de texte — et sa disparition

### 2.1 Constat (vérifié dans le code, pas théorique)

Aujourd'hui, un surlignage est stocké **sans offset** : `text + quoteOrdinal`
(`apps/api/sql/schema/schema.sql`, colonnes `"quoteOrdinal"`), et **chaque client
relocalise le passage en re-scannant** :

- **Web** (`packages/ui/src/annotations/quote-anchor.ts`) : `TreeWalker` sur les
  nœuds texte, `indexOf` par nœud, comptage d'occurrences, puis mutation du DOM
  en `<mark>`.
- **Mobile** (`html-blocks-core.ts`) : re-scan du texte normalisé dans l'index de
  tokens, avec le mapping display→raw.

Cette ancre par recherche est la source réelle des fragilités — **sur toutes les
plateformes** :

1. **Divergence de blancs** : le web matche après `normalize()` + `trim()`, le
   mobile après réduction des blancs ; ils s'accordent la plupart du temps, mais
   toute divergence tue silencieusement une marque ou déplace un ordinal.
2. **Coupure inline = échec silencieux sur le web** : `indexOf` opère nœud par
   nœud ; une citation qui traverse `<em>`, `<a>`, `<strong>` n'apparaît jamais de
   façon contiguë dans un nœud → le surlignage est enregistré mais **ne se peint
   pas sur le web**, alors que le mobile (index plat, balises strippées) le peint.
3. **Ordinal dépendant de l'ordre** : toute édition du corps d'article renumérote
   les occurrences ; le repli « première occurrence » pointe alors en silence au
   mauvais endroit.
4. **Re-scan + mutation DOM à chaque rendu** (web) : changement de filtre
   (`all`/`official`/`none`) ou ajout/suppression → re-parcours complet + réécriture
   de `<mark>` dans le DOM vivant (nœuds texte découpés, conflit avec React,
   sélection utilisateur détruite).

### 2.2 La cible : le serveur possède le document canonique

**Décision (rév. 2)** : le HTML n'est qu'un **format d'import** (ce que fournissent
les éditeurs/scrapers) et un format de lecture **hérité**. L'artefact de référence
est un **document canonique normalisé, produit une seule fois par le serveur** :

```
HTML entrant ──canonicalisation──▶ Document canonique
                                   ├─ blocs typés  (p, h1–h4, ul/ol, blockquote,
                                   │                code, img, hr — même modèle
                                   │                que html-blocks-core.ts)
                                   ├─ texte canonique (blancs réduits à un espace,
                                   │                défini une fois pour toutes —
                                   │                la forme sur laquelle web et
                                   │                mobile s'accordent DÉJÀ)
                                   └─ index : offset canonique → bloc/segment
```

- **Création d'un surlignage** : le client envoie le passage + son contexte de
  sélection ; le serveur résout **immédiatement** en offsets canoniques
  (`start`, `end` — et si besoin `blockId`), qu'il stocke **avec** le texte cité.
- **Lecture** : chaque client reçoit le document + les surlignages à offsets et
  **peint des plages** — plus personne ne cherche, plus d'ordinal, plus de
  dépendance aux blancs du HTML.
- **Contenu édité après coup** : le serveur exécute **une** passe de ré-ancrage
  (texte + préfixe/suffixe de contexte, repli progressif — l'approche éprouvée de
  Hypothesis) au lieu de laisser trois clients bricoler chacun.
- **Compatibilité** : les surlignages hérités `text + quoteOrdinal` restent
  servis et migrés par le serveur (une passe en écriture), avec repli documenté.

**Conséquences** :
- Le mobile **abandonne** le re-parse HTML et le re-scan (il consomme le document).
- iOS/Android natifs consomment le même document (→ `NSAttributedString` /
  `Spannable`), offsets stables et sûrs multi-octets.
- Le web **abandonne** le TreeWalker de mutation DOM (voir §2.3).
- Le terrain est prêt pour l'édition future : un éditeur produit déjà ce format.

### 2.3 Côté web : pas de rustine, on converge

Sur le web, le DOM est la couche native (sélection navigateur réelle) — on n'y
touche pas. Mais l'implémentation actuelle (TreeWalker + `<mark>` mutés dans
`packages/ui/src/annotations/TextHighlighter.tsx`, consommé par
`apps/tenants/.../TenantArticleHighlighter.tsx`) est **la** source des bugs de la
classe 2.1. La cible :

1. Le lecteur tenant rend l'article **depuis le document canonique** (blocs) —
   même modèle que le mobile — avec les marques peintes **par offsets** ;
2. `quote-anchor.ts` / la mutation DOM en `<mark>` sont **décommissionnés**
   (les marques deviennent des éléments React par plage, ou, en transition
   interne seulement, le CSS Custom Highlight API — **jamais** comme destination,
   uniquement comme pont le temps de la migration) ;
3. Le morphing surface web reste Framer Motion au-dessus — inchangé.

---

## 3. Les options de rendu évaluées et leurs verdicts

### ❌ `react-native-enriched-html` (Software Mansion) — disqualifié

Vérifié dans la doc API : le composant **lecture seule** (`EnrichedText`)
n'expose **ni `onChangeSelection`, ni `contextMenuItems`** (réservés à l'éditeur
`EnrichedTextInput`), l'ensemble de tags est **fixe et fermé** (**pas de
`<mark>`**, tags hors-ensemble strippés). Impossible d'y brancher nos actions ou
nos marques. C'est un couple éditeur/lecteur de son propre HTML, pas un lecteur
généraliste.

### ✅ iOS — `@bsky.app/react-native-uitextview` (la lib de Bluesky, en production)

- Remplaçant direct de `<Text>` : `selectable + uiTextView` → vrai `UITextView`
  (loupe, poignées, double-tap, glisser) ; retombe sur `<Text>` RN hors iOS.
- `onSelectionChange(start, end)` : offsets caractères sûrs multi-octets, en
  continu pendant le drag, **et événement de désélection au tap dehors**
  (`start === end`) → fermeture de la surface gratuite.
- v2.4.0 testée contre **RN 0.86.2** (notre version, Expo 57, New Arch ✓).
- **Points à valider en spike** : (1) `backgroundColor` des marques sur spans
  imbriqués (sinon petit fork Swift, ~30 lignes) ; (2) coexistence avec le menu
  système Copy (garder ou masquer via fork).

### ✅ Android — module natif maison (`TextView` + `Spannable`)

- `isTextSelectable` → poignées, double-tap natifs ; `BackgroundColorSpan` pour
  des marques **continues** (fini l'effet « pills ») ; pas de loupe sur Android
  (n'existe pas) → le gain = poignées + layout au pixel + zéro mesure JS.
- La barre système d'ActionMode est neutralisée (choix produit §1) ; nos actions
  vivent dans la surface morphée.

### 🅿️ Statu quo amélioré — rejeté comme destination (utile seulement en cours de route)

Double-tap, poignées dessinées, auto-scroll sur le moteur JS actuel : utile pour
valider le morph (tranche 2) mais **jamais de loupe ni de layout natif** → pas le
« top du top ».

---

## 4. Séquence d'interaction cible (le morph avec le texte)

1. **Appui long** → premier mot sélectionné (natif), haptic Light.
2. **Drag** → extension par glyphe (natif), bande continue.
3. **Relâchement** → haptic Heavy ; la bande **se rétracte et se transforme**
   (spring ~500) en **pill compacte** ancrée au bord de la sélection :
   ✍️ Surligner · ❝ Citer · 💬 Annoter · ⧉ Copier.
4. **Annoter / Citer** → la pill **morph en formulaire** (shared transition) :
   extrait en chip, zone de texte, contrôle privé/public.
5. **Poignée draguée** pendant l'affichage → `onSelectionChange` en continu →
   bande + pill repositionnées en live.
6. **Tap dehors** → désélection native → sortie animée (fondu + glissé).

Web : la même séquence avec la sélection navigateur native + Framer Motion.

---

## 5. Déroulement recommandé (tranches — livrable et testable après chacune)

| # | Tranche | Contenu | Durée |
|---|---|---|---|
| 0 | **Canonicalisation serveur** (fondation — rien d'autre ne dépend d'elle) | Parser Go HTML→document canonique (référence croisée avec `html-blocks-core.ts`, tests de parité) ; texte canonique ; création de surlignage résolue en offsets ; colonnes offsets + migration/back-compat `quoteOrdinal` ; passe de ré-ancrage post-édition | 1–1,5 sem |
| 1 | **Web : consommer le document** | Lecteur tenant rendu depuis les blocs, marques par offsets ; décommission de `quote-anchor.ts` + mutation DOM `<mark>` (pont CSS Custom Highlight le temps de la migration seulement) | ~1 sem |
| 2 | **Morph mobile** (moteur actuel) | Pill → formulaire en shared transition Reanimated, ancrée sur la bande ; indépendant du natif — peut démarrer en parallèle de 0/1 | 3–4 j |
| 3 | **iOS natif** | Couche `UITextView` (lib Bluesky ou fork) branchée sur le document canonique ; surface + morph inchangés | ~1 sem |
| 4 | **Android natif** | Module `TextView`/`Spannable` maison, mêmes contrats TS | 1–1,5 sem |
| 5 | **(Option) Édition** | Un éditeur qui produit le document canonique (remplace le HTML à la source) | à chiffrer |

Total : ~4–5 semaines pour 0→4. L'ordre est volontaire : **la canonicalisation
d'abord** (elle supprime les divergences web/mobile et débloque proprement le
natif), le natif ensuite.

---

## 6. Risques

- **Ré-ancrage après édition du contenu** : des offsets bruts deviennent invalides
  si l'article est ré-édité → la stratégie « texte cité + contexte préfixe/suffixe »
  (type Hypothesis) est conservée comme filet dans la passe serveur ; jamais de
  résolution best-effort côté client.
- **Migration web du lecteur tenant** : le HTML hérité peut contenir du markup
  arbitraire → la canonicalisation doit couvrir (ou dégrader proprement) figures,
  captions, embeds ; tests de parité de rendu avant bascule.
- **Parité de rendu natif** (attribué iOS vs Spannable Android) : mitigée par le
  modèle de blocs simple et partagé + style envoyé depuis TS (une seule source).
- **Fork éventuel de la lib Bluesky** (marques `backgroundColor`) : petit mais à
  maintenir ; alternative = marques en overlay au-dessus du texte natif.
- **Rebuilds natifs** à chaque itération (dev build `expo run:*`), JDK 17 requis
  côté Gradle (le JBR d'Android Studio fait échouer CMake — voir historique).
- **Compatibilité API** : l'endpoint highlights continue de servir `text +
  quoteOrdinal` pendant la migration ; les nouveaux champs offsets sont ajoutés,
  jamais substitués brutalement.

---

## 7. Références code actuelles

| Élément | Chemin |
|---|---|
| Modèle de blocs + moteur pur mobile (référence de canonicalisation) | `apps/mobile/src/components/article/html-blocks-core.ts` |
| Rendu tokens + gestes + bandes (mobile actuel) | `apps/mobile/src/components/article/html-blocks.tsx` |
| Surface d'actions mobile (pill actuelle) | `apps/mobile/src/components/article/selection-popover.tsx` |
| Web : moteur d'annotations (TreeWalker → à décommissionner) | `packages/ui/src/annotations/TextHighlighter.tsx`, `quote-anchor.ts` |
| Web : page article tenant (consommateur) | `apps/tenants/src/app/tenant/[domain]/article/[slug]/` (+ `TenantArticleHighlighter.tsx`) |
| Serveur : stockage des surlignages (`text + quoteOrdinal`, sans offsets) | `apps/api/sql/schema/schema.sql`, `apps/api/internal/modules/highlights/` |
| Morph de référence web (layoutId + spring) | `packages/ui/src/annotations/TextHighlighter.tsx` (l. ~566–582, 693+) |
| Haptics mobile (Light/Heavy branchés) | `apps/mobile/src/lib/haptics.ts` |
