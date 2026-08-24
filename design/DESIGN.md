# 📐 Design System & Apple Music Web Adaptation Spec — qoe.fi

> **Spécification Canonique d'Adaptation Visuelle & Structurelle pour qoe.fi**
>
> Ce document définit l'adaptation produit et design de l'esthétique **Apple Music Web (`music.apple.com`)** à l'écosystème **qoe.fi** (plateforme souveraine d'édition, de réseau social créateur et de lecture multi-tenant).
>
> Il fait foi avec [`STYLE.md`](../apps/dashboard/STYLE.md) et la charte système [`AI_CODEBASE_MAP.md`](../docs/AI_CODEBASE_MAP.md).

---

## 📑 Table des Matières

1. [Principes Fondateurs & Règle Anti-IA Slop](#1-principes-fondateurs--règle-anti-ia-slop)
2. [Structure à 3 Zones (Apple Music Web Structure)](#2-structure-à-3-zones-apple-music-web-structure)
3. [Palette de Couleurs & Rôles des Tokens](#3-palette-de-couleurs--rôles-des-tokens)
4. [Échelle Typographique & Hiérarchie](#4-échelle-typographique--hiérarchie)
5. [Composants Épurés (Réalité qoe.fi)](#5-composants-épurés-réalité-qoefi)
6. [Lignes Directrices d'Interaction & Micro-Animations](#6-lignes-directrices-dinteraction--micro-animations)
7. [Directives Ne Pas Faire (Anti-Patterns)](#7-directives-ne-pas-faire-anti-patterns)

---

## 1. Principes Fondateurs & Règle Anti-IA Slop

### 🚫 Interdiction Formelle des Clichés IA ("AI Slop")

- **Pas de Pill Buttons partout** : Les badges et boutons en pilule arrondie géante sont proscrits par défaut. Préférer des coins légèrement adoucis (`rounded-md` / `rounded-lg`) ou de la typographie directe.
- **Pas de contours complets lourds (Full Stroke)** : Éviter d'entourer chaque composant d'une bordure visible à 100%. Utiliser des séparateurs capillaires extra-fins (`border-zinc-800/30` ou `border-border/40`) ou laisser la couleur de surface marquer la limite.
- **Pas d'Emojis décoratifs** : Les emojis dans les titres, boutons, cartes ou éléments de navigation sont strictement interdits. L'iconographie s'appuie uniquement sur des icônes vectorielles sobres (Lucide React avec `stroke-[1.5]`).
- **Pas de typographie Monospace globale** : Le monospace (`font-mono`) est STRICTEMENT réservé aux données denses et techniques (snippets de code, IDs, logs bruts, horodatages ISO). Titres, corps et boutons sont en typographie neutre (`font-sans`).
- **Pas de dégradés néon flashy** : Interdiction des lueurs néon violet/vert cyber.

### 🍏 Référence Produit : Apple Music Web (`music.apple.com`)

L'interface de qoe.fi s'inspire de l'expérience web d'Apple Music pour :

- Son canvas sombre onyx ultra-pur (`#0a0a0c` / `#000000`).
- Ses rangées fluides compactes (44px à 56px) avec séparateurs capillaires.
- Sa hiérarchie visuelle guidée par la typographie et l'espace blanc plutôt que par la surcharge d'éléments graphiques.
- Ses volets translucides avec flou d'arrière-plan (`backdrop-blur-xl`).

---

## 2. Structure à 3 Zones (Apple Music Web Structure)

Toutes les applications de la plateforme (notamment le **Creator Studio** `apps/dashboard` et le **Reader Feed** `apps/feed`) s'organisent selon la découpe à 3 zones d'Apple Music Web :

```text
┌────────────────────────┬────────────────────────────────────────────────────────┐
│ ZONE 1: SIDEBAR FIXE   │ ZONE 2: SCÈNE PRINCIPALE (MAIN STAGE)                  │
│ Largeur ~230px         │ Fond Onyx Sombre (#0a0a0c)                             │
│ Translucide / Frosted  │ - Titres imposants (text-3xl font-bold tracking-tight) │
│                        │ - Rayonnages d'articles / Écrits récents              │
│                        │ - Rangées fluides 44px-56px avec hairlines             │
├────────────────────────┴────────────────────────────────────────────────────────┤
│ ZONE 3: BARRE CONTEXTUELLE / EN-TÊTE SUPÉRIEUR (Header Fixe ou Sticky)          │
│ Recherche rapide, profil créateur, accès direct à la création                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Zone 1 : Sidebar Gauche Fixe

- **Largeur** : 220px à 240px.
- **Surface** : Translucide dépolie (`bg-zinc-950/80 backdrop-blur-xl` en dark, `bg-white/80 backdrop-blur-xl` en light).
- **Titres de Section** : Micro-typographie discrète (`text-zinc-400 text-[11px] font-bold tracking-wider uppercase`).
- **Items de Navigation** : Hauteur 36px-40px, typographie `text-xs font-medium`, survol très doux (`hover:bg-white/[0.04]`). État actif indiqué par la couleur du texte (`text-foreground`) et une marque optique subtile.

### Zone 2 : Scène Principale (Main Stage)

- **Canvas** : Noir Onyx absolu (`#0a0a0c` ou `#000000`) en mode sombre.
- **En-têtes de Page** : Titre fort (`text-3xl font-bold tracking-tight text-foreground`), suivi d'un sous-titre poétique ou fonctionnel très fluide.
- **Grille & Rayonnages** : Espacement respirant (`space-y-8` à `space-y-12`), permettant au contenu visuel et écrit de respirer.

### Zone 3 : Barre Contextuelle / En-tête Supérieur

- **Barre supérieure discrète** : Sans surcharge, intégrant la recherche, le sélecteur de publication/domaine et le profil.
- **Effet de défilement** : Transparente au sommet, devient légèrement dépolie lors du défilement.

---

## 3. Palette de Couleurs & Rôles des Tokens (`packages/theme`)

qoe.fi s'appuie sur une **architecture de tokens à 2 couches** gérée par le package [`@qoe/theme`](../packages/theme) :

- **Layer 1 (Primitives)** : Échelle zinc et vermillon (`--zinc-950`, `--zinc-900`, `--zinc-0`, etc.). _Ne jamais consommer directement dans les composants._
- **Layer 2 (Sémantiques)** : Variables CSS sémantiques (`--background`, `--foreground`, `--card`, `--muted`, `--border`, `--sidebar`). _C'est ce que TOUS les composants consomment EXCLUSIVEMENT._

> ⚠️ **Règle absolue d'Agnosticisme au Thème** :
> Ne jamais utiliser de classes Tailwind brutes comme `bg-black`, `bg-zinc-950`, `text-white`, `border-zinc-800`.
> Les composants utilisent `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border/40`, `bg-sidebar`.
> Ainsi, l'UI est automatiquement à 100% compatible avec le **Mode Clair (Light Theme actuel)** et le **Mode Sombre Onyx (Dark Apple)** basculé via la classe `.dark`.

### Cartographie des Tokens Sémantiques (Layer 2)

| Role                          | Valeur / Token CSS                       | Usage                                           |
| :---------------------------- | :--------------------------------------- | :---------------------------------------------- |
| **Canvas Onyx**               | `#0a0a0c` / `--background`               | Fond principal de la scène                      |
| **Surface 1**                 | `#121215` / `--card`                     | Carte, panneau relevé, conteneur                |
| **Surface 2**                 | `#1c1c20` / `--muted`                    | Survol de ligne, zones d'entrée                 |
| **Séparateur Capillaire**     | `rgba(255, 255, 255, 0.06)` / `--border` | Hairlines ultra-fines entre les rangées         |
| **Texte Principal**           | `#fafafa` / `--foreground`               | Titres, écrits, éléments actifs                 |
| **Texte Secondaire**          | `#a1a1aa` / `--muted-foreground`         | Métadonnées, sous-titres, dates                 |
| **Texte Discret**             | `#71717a`                                | Horodatages, libellés de section                |
| **Accent Vermillon (Opt-in)** | `#EE4B2B` / `--accent-brand`             | Logo brand, CTA créateur principal (très ciblé) |

### Mode Clair (Light Canvas)

| Role                      | Valeur / Token CSS                 | Usage                 |
| :------------------------ | :--------------------------------- | :-------------------- |
| **Canvas Blanc Pur**      | `#ffffff` / `--background`         | Fond principal clair  |
| **Surface 1**             | `#f4f4f5` / `--card`               | Cartes et conteneurs  |
| **Séparateur Capillaire** | `rgba(0, 0, 0, 0.08)` / `--border` | Hairlines ultra-fines |
| **Texte Principal**       | `#09090b` / `--foreground`         | Texte principal       |
| **Texte Secondaire**      | `#71717a` / `--muted-foreground`   | Métadonnées et labels |

---

## 4. Échelle Typographique & Hiérarchie

Usage exclusif des polices système modernes (**SF Pro**, **Geist Sans**, **Inter**, **Plus Jakarta Sans** via `font-sans`).

| Rôle                     | Taille / Weight             | Tracking                     | Usage                                                |
| :----------------------- | :-------------------------- | :--------------------------- | :--------------------------------------------------- |
| **Large Title**          | 34px / Bold (`700`)         | `-0.02em` (`tracking-tight`) | Titre principal de vue (ex: _Articles_, _Dashboard_) |
| **Title 1**              | 24px / Bold (`700`)         | `-0.015em`                   | Titre de section majeure                             |
| **Title 2**              | 20px / SemiBold (`600`)     | `-0.01em`                    | Titre de carte ou de sous-section                    |
| **Headline / Row Title** | 15px-16px / Medium (`500`)  | `-0.005em`                   | Titre d'article dans une liste 44px                  |
| **Body**                 | 15px-16px / Regular (`400`) | `normal`                     | Corps de texte et descriptions                       |
| **Subheadline**          | 13px-14px / Regular (`400`) | `normal`                     | Nom d'auteur, sous-titre de rangée                   |
| **Micro Caption**        | 11px / Bold (`700`)         | `+0.05em` (`tracking-wider`) | Titres de section sidebar (MAJUSCULES)               |

---

## 5. Composants Épurés (Réalité qoe.fi)

Chaque composant s'adapte à l'activité réelle de qoe.fi (édition d'articles, gestion d'abonnés, lecture de flux) sans fonctionnalités fictives.

### A. Rangée d'Article / Écrit (`ArticleRow`)

Inspirée des rangées de morceaux d'Apple Music Web, adaptée aux publications :

- **Hauteur** : 48px à 56px.
- **Structure** :
  - _Gauche_ : Miniature de couverture carrée à coins adoucis (8px) ou indicateur d'état discrets (`QuietDot` 6px émeraude pour _Publié_, gris pour _Brouillon_).
  - _Centre_ : Titre de l'écrit (`text-sm font-medium text-foreground`) + métadonnées en une ligne (`text-xs text-muted-foreground` : date, temps de lecture).
  - _Droite_ : Actions discrètes au survol (Éditer, Statistiques, Menu `...`).
- **Séparateur** : Trait capillaire semi-transparent au bas de chaque ligne (`border-b border-white/[0.06]`).

### B. Cartes d'Éléments & Rayonnages (`QuietCard`)

- **Coins** : **12px** (`rounded-xl`), signature visuelle d'Apple Music.
- **Bordures** : Pas de contour lourd. Fond de surface subtil (`bg-card`) avec séparateur discret (`border border-white/[0.06]`).
- **Survol** : Transition fluide de l'opacité ou du fond (`hover:bg-white/[0.02]`), sans effet de zoom agressif ni ombre lourde.

### C. Indicateurs d'État Discrets (`QuietDot`)

Au lieu d'empiler des badges en pilule de toutes les couleurs :

- Utiliser un simple point discret de 6px (`h-1.5 w-1.5 rounded-full`).
- Vert Émeraude (`bg-emerald-500`) = Publié / Actif.
- Gris neutre (`bg-zinc-600`) = Brouillon / Inactif.

---

## 6. Lignes Directrices d'Interaction & Micro-Animations

1. **Durée des transitions** : Courte et subtile (150ms à 250ms avec courbe `ease-out`).
2. **États de Survol (Hover)** :
   - Privilégier le changement de contraste typographique (`text-muted-foreground` ➔ `text-foreground`).
   - Pour les lignes interactives : apparition en fond doux (`hover:bg-white/[0.04]`).
3. **Focus Clavier & Accessibilité** :
   - Anneau de focus discret (`focus-visible:ring-1 focus-visible:ring-zinc-400`).
   - Contraste typographique conforme au standard AA (ratio minimum 4.5:1).

---

## 7. Directives Ne Pas Faire (Anti-Patterns)

| ❌ À Ne JAMAIS Faire                                       | ✅ Pratique Exigée                                                   |
| :--------------------------------------------------------- | :------------------------------------------------------------------- |
| Mettre des puces/badges en pilule sur toutes les lignes    | Utiliser des typographies claires et la pastille `QuietDot`          |
| Entourer les cartes de bordures épaisses (`border-2`)      | Préférer le contraste de surface avec hairline `border-white/[0.06]` |
| Ajouter des emojis dans les menus ou boutons               | Utiliser des icônes vectorielles sobres (`stroke-[1.5]`)             |
| Utiliser une police monospace pour les titres ou boutons   | Réserver `font-mono` uniquement au code et données denses            |
| Créer des widgets fictifs sans lien avec l'édition/lecture | Rester ancré dans les fonctionnalités réelles de qoe.fi              |
