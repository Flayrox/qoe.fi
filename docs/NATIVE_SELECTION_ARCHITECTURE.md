# Sélection native + ancrage unifié (web, mobile, iOS, Android) — Architecture cible

> Décision du 2026-09-03 (rév. 6 — version définitive, sans rustine).
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

### 2.4 Réglages technologiques de la passe finale (rév. 6)

Revue « dernières technologies » avant lancement — cinq précisions qui évitent
les pièges classiques :

1. **Unité d'offset unique, définie une fois** : les offsets canoniques sont des
   **code points (scalaires Unicode)**. Go manipule des octets, JS/Swift/Kotlin des
   unités UTF-16 → conversion **aux frontières seulement** (NSRange/UITextView,
   index JS), jamais dans le stockage. Un passage contenant emojis/accents ne doit
   jamais dépendre de l'unité de la plateforme qui l'a créé.
2. **Ré-ancrage par diff (Myers), pas seulement par re-recherche** : quand le
   contenu d'un article est ré-édité, on diff l'ancien texte canonique vs le
   nouveau (algorithme type git) et on re-mappe **tous** les offsets d'un coup ;
   la recherche « texte + préfixe/suffixe » (type Hypothesis) ne sert que de repli
   quand le diff échoue (lourd remaniement).
3. **Empreinte de contenu** : colonne `contentSha` (hash du texte canonique) sur
   l'article. Chaque ancre porte le `contentSha` du moment de sa création ; à la
   lecture, sha différent → passe de ré-ancrage déclenchée une seule fois. Pas de
   scan de toutes les ancres à chaque rendu.
4. **IDs de blocs stables** : le document canonique donne un `id` stable à chaque
   bloc (dérivé du contenu), pour ancrer par `blockId + offset` quand c'est utile
   et pour que les exportés (studio, API) référencent des blocs stables, pas des
   positions muettes.
5. **Deep-link aux passages** : web = **Text Fragments API** (`#:~:text=…`,
   gratuit et natif) en complément des ancres ; mobile = deep link `qoe://` avec
   paramètre de passage, scroll + surlignage à l'ouverture (tranche 6).

Vérification faite (revue 2025-2026) : aucune lib native récente ne change le
choix des couches (Bluesky `UITextView` iOS / module maison Android / surface
Reanimated) ; `react-native-enriched-html` reste disqualifié (pas d'événements
ni de `contextMenuItems` sur son composant lecture seule).

---

## 3. Inventaire complet : toutes les surfaces qui touchent un passage

L'ancre canonique ne sert pas qu'au lecteur. **Toute** surface qui crée, stocke
ou affiche un passage d'article est concernée — avec des mécanismes différents
aujourd'hui, mais **le même défaut d'ancre par re-recherche de texte** :

| # | Surface | Aujourd'hui (vérifié) | Cible canonique |
|---|---|---|---|
| 1 | **Lecteur web tenant** (`apps/tenants/.../TenantArticleHighlighter` → `TextHighlighter`) | Re-scan TreeWalker + mutation DOM en `<mark>` | Rend le doc canonique, peint par offsets ; `quote-anchor.ts` décommissionné |
| 2 | **Lecteur du feed** (`apps/core/src/components/social/ArticleAnnotatorView.tsx`) | **Même** `TextHighlighter` partagé (`@qoe/ui/annotations`) → hérite de tous les bugs | Aucun correctif séparé : un seul moteur corrigé, les deux lecteurs suivent |
| 3 | **Lecteur mobile** (`html-blocks-core.ts`) | Re-parse HTML + re-scan de tokens | Consomme le doc canonique (rendu natif iOS/Android, §4) |
| 4 | **Studio créateur — annotations officielles** (`apps/studio/src/features/editor/extensions/AnnotationMark.ts`, TipTap) | Le créateur écrit `<mark data-annotation-note data-is-official>` **dans le HTML source** au moment de l'édition — positionnel à l'édition, mais la ligne DB reste `text + quoteOrdinal` → **deux sources de vérité** qui divergent dès qu'on reformate | Le studio **produit** le doc canonique (tranche 5) : l'annotation officielle devient une entité ancrée (`id` + offsets), une seule source de vérité ; les `<mark>` hérités sont canonicalisés comme le reste du HTML |
| 5 | **Citations / pensées (feed web + mobile)** | `createThought(quotedArticleId, quotedExcerpt)` — **ni ordinal ni offsets** ; l'affichage (`packages/ui/src/social/QuotedArticleCard.tsx`) re-cherche l'extrait par `indexOf` dans le contenu vidé de ses balises par regex (`replace(/<[^>]*>/g…)`) → échec silencieux dès que les blancs/entités diffèrent, repli sur un chip sans contexte | La citation stocke l'**ancre canonique** du passage (offsets + version de doc, ou `id` de passage) ; la carte du feed demande **au serveur** le contexte avant/après stable (fini le strip HTML côté client) et le deep-link ouvre l'article **sur le passage exact** |
| 6 | **Drawer / fils (upvotes, commentaires) + filtres `all`/`official`/`none`** | Consomment les mêmes marques re-scanées | Consomment les mêmes entités ancrées — les commentaires/upvotes s'attachent à l'`id` du passage, pas à une position retrouvée |
| 7 | **API créateur (export externe)** (`apps/api/internal/modules/creator/api_highlights.go` + `api_content.go`, clé API, scope READ) | L'article et les surlignages sont exposés **séparément** : article complet (déjà `contentHtml` + `contentMarkdown` dans `apiArticleFull`) d'un côté, surlignages `{text, …, quoteOrdinal}` — **sans offsets** — de l'autre | **Export groupé** : `GET /v1/creator/articles/{slug}/annotations` renvoie l'article ET ses surlignages **dans le même payload**, ancrés par offsets dans le document inclus — le front du créateur peint les marques avec son propre code, **zéro re-fetch, zéro recherche** ; `text + quoteOrdinal` reste servi (déprécié), **champs additifs, jamais cassants** |

**Conséquence d'architecture** : un seul schéma de stockage sert l'auteur (studio),
le lecteur et le social (citation) — offsets canoniques + texte cité + contexte
préfixe/suffixe conservé comme filet de ré-ancrage. Une seule passe de
ré-ancrage serveur, quel que soit le client qui a créé le passage.

---

## 4. Les options de rendu évaluées et leurs verdicts

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

## 5. Séquence d'interaction cible (le morph avec le texte)

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

## 6. Déroulement recommandé (tranches — livrable et testable après chacune)

| # | Tranche | Contenu | Durée |
|---|---|---|---|
| 0 | **Canonicalisation serveur** (fondation — rien d'autre ne dépend d'elle) | Parser Go HTML→document canonique (référence croisée avec `html-blocks-core.ts`, tests de parité) ; texte canonique ; création de surlignage résolue en offsets ; colonnes offsets + migration/back-compat `quoteOrdinal` ; passe de ré-ancrage post-édition ; **canonicalise aussi les `<mark data-annotation-note>` officiels du studio** | 1–1,5 sem |
| 1 | **Web : consommer le document** | Lecteur tenant rendu depuis les blocs, marques par offsets ; décommission de `quote-anchor.ts` + mutation DOM `<mark>` (pont CSS Custom Highlight le temps de la migration seulement) | ~1 sem |
| 2 | **Morph mobile** (moteur actuel) | Pill → formulaire en shared transition Reanimated, ancrée sur la bande ; indépendant du natif — peut démarrer en parallèle de 0/1 | 3–4 j |
| 3 | **iOS natif** | Couche `UITextView` (lib Bluesky ou fork) branchée sur le document canonique ; surface + morph inchangés | ~1 sem |
| 4 | **Android natif** | Module `TextView`/`Spannable` maison, mêmes contrats TS | 1–1,5 sem |
| 5 | **(Option) Édition studio** | L'éditeur TipTap produit le doc canonique (remplace le HTML à la source) ; annotations officielles = entités ancrées, plus de `<mark>` ambigus dans le HTML | à chiffrer |
| 6 | **(Option) Citations** | `createThought` accepte l'ancre canonique ; `QuotedArticleCard` résout via le serveur ; deep-link au passage exact | 3–5 j |
| 7 | **(Option) Exposition API créateur** | **Export groupé** `articles/{slug}/annotations` : article (HTML/MD, déjà servis par `api_content.go`) + surlignages ancrés (offsets dans le document inclus, contexte avant/après, fichier `“openapi”` pour les tiers) — additif, versionné | 3–5 j |

Total : ~4–5 semaines pour 0→4. L'ordre est volontaire : **la canonicalisation
d'abord** (elle supprime les divergences web/mobile et débloque proprement le
natif), le natif ensuite.

---

## 7. Risques

- **Ré-ancrage après édition du contenu** : des offsets bruts deviennent invalides
  si l'article est ré-édité → la stratégie « texte cité + contexte préfixe/suffixe »
  (type Hypothesis) est conservée comme filet dans la passe serveur ; jamais de
  résolution best-effort côté client.
- **Migration web du lecteur tenant** : le HTML hérité peut contenir du markup
  arbitraire → la canonicalisation doit couvrir (ou dégrader proprement) figures,
  captions, embeds ; tests de parité de rendu avant bascule.
- **Studio : deux sources de vérité** (marks `<mark>` dans le HTML ET lignes DB) :
  la migration doit associer chaque mark hérité à sa ligne officielle avant que
  l'éditeur ne produise le doc canonique.
- **Citations héritées sans ancre** : pas d'offsets ni d'ordinal stockés → la passe
  de ré-ancrage serveur (texte exact + contexte) est le seul chemin ; les cartes
  dont l'extrait n'est plus retrouvé doivent se dégrader proprement (chip seul).
- **Parité de rendu natif** (attribué iOS vs Spannable Android) : mitigée par le
  modèle de blocs simple et partagé + style envoyé depuis TS (une seule source).
- **Fork éventuel de la lib Bluesky** (marques `backgroundColor`) : petit mais à
  maintenir ; alternative = marques en overlay au-dessus du texte natif.
- **Rebuilds natifs** à chaque itération (dev build `expo run:*`), JDK 17 requis
  côté Gradle (le JBR d'Android Studio fait échouer CMake — voir historique).
- **Compatibilité API** : l'endpoint highlights continue de servir `text +
  quoteOrdinal` pendant la migration ; les nouveaux champs offsets sont ajoutés,
  jamais substitués brutalement.
- **API créateur = contrat externe** : les tiers ne peuvent pas re-scanner avec
  notre moteur ; l'ancre canonique dans le payload est le seul moyen de leur
  garantir un rendu exact. Versioning strict (champs additifs, docs de
  migration), car on ne corrige pas un tiers à chaud.

---

## 8. Références code actuelles

| Élément | Chemin |
|---|---|
| Modèle de blocs + moteur pur mobile (référence de canonicalisation) | `apps/mobile/src/components/article/html-blocks-core.ts` |
| Rendu tokens + gestes + bandes (mobile actuel) | `apps/mobile/src/components/article/html-blocks.tsx` |
| Surface d'actions mobile (pill actuelle) | `apps/mobile/src/components/article/selection-popover.tsx` |
| Web : moteur d'annotations (TreeWalker → à décommissionner) | `packages/ui/src/annotations/TextHighlighter.tsx`, `quote-anchor.ts` |
| Web : page article tenant (consommateur) | `apps/tenants/src/app/tenant/[domain]/article/[slug]/` (+ `TenantArticleHighlighter.tsx`) |
| Web : lecteur du feed (même moteur partagé) | `apps/core/src/components/social/ArticleAnnotatorView.tsx` |
| Studio : annotations officielles (marks dans le HTML source) | `apps/studio/src/features/editor/extensions/AnnotationMark.ts` |
| Feed : carte de citation (re-cherche par `indexOf` → à remplacer) | `packages/ui/src/social/QuotedArticleCard.tsx`, `ThoughtCard.tsx` |
| Feed : composer de pensée citant un article | `apps/core/src/app/(reader)/home/components/ThoughtComposer.tsx`, `packages/sdk/src/client.ts` (createThought) |
| API créateur : export des surlignages publics aux tiers (sans offsets) | `apps/api/internal/modules/creator/api_highlights.go` |
| API créateur : article complet exporté (HTML + Markdown) — base de l'export groupé | `apps/api/internal/modules/creator/api_content.go` |
| Serveur : stockage des surlignages (`text + quoteOrdinal`, sans offsets) | `apps/api/sql/schema/schema.sql`, `apps/api/internal/modules/highlights/` |
| Morph de référence web (layoutId + spring) | `packages/ui/src/annotations/TextHighlighter.tsx` (l. ~566–582, 693+) |
| Haptics mobile (Light/Heavy branchés) | `apps/mobile/src/lib/haptics.ts` |
