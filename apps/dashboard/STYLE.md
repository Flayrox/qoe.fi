# 🎨 Design — qoe.fi Dashboard

> **Document de design canonique pour le dashboard créateur et l'ensemble de la plateforme.**
>
> Ce fichier est la **source unique de vérité** pour les conventions visuelles
> et les patterns d'interface. Tout nouveau composant ou page **doit** s'y
> conformer. Les divergences sont à signaler dans une PR.
>
> Cible : esthétique **épurée, minimaliste, "calme"** — inspiration Apple / Linear.
> Direction retenue : **neutre zinc/noir par défaut**, le vermillon `#EE4B2B`
> est relégué au rôle d'**accent brand optionnel** (jamais par défaut).

---

## 📑 Table des matières

1. [Principes fondateurs](#-principes-fondateurs)
2. [Système de tokens](#-système-de-tokens)
3. [Typographie](#-typographie)
4. [Espacements & densité](#-espacements--densité)
5. [Composants canoniques](#-composants-canoniques)
6. [Patterns d'interaction](#-patterns-dinteraction)
7. [Iconographie](#-iconographie)
8. [Accessibilité](#-accessibilité)
9. [Anti-patterns](#-anti-patterns)

---

## 🧭 Principes fondateurs

### 1. Neutralité d'abord
Les interfaces utilisent **par défaut** la palette zinc. Le vermillon est un
**opt-in** réservé aux éléments brand volontaires (logo, CTA principal d'un
blog tenant, badge créateur). Jamais de vermillon sur les surfaces d'admin
ou de dashboard plateforme.

### 2. Tokens sémantiques > hardcoded
Aucun nouveau composant n'écrit `text-zinc-900`, `bg-zinc-100`, etc. Tout
doit passer par les tokens sémantiques :

```tsx
// ❌ Interdit
<div className="text-zinc-900 bg-zinc-100 border-zinc-200">

// ✅ Correct
<div className="text-foreground bg-muted border-border">
```

### 3. Densité faible, respiration haute
Privilégier l'**espace blanc** aux bordures. Quand une bordure est
indispensable, préférez `border-zinc-100/60` (semi-transparent) à `border-zinc-200`.

### 4. Interactions discrètes
- Pas de hover "lourd" : `opacity-70 group-hover:opacity-100`
- Transitions courtes : `transition-colors` ou `transition-opacity`
- Pas de bordures épaisses sur les états actifs
- Jouer avec la typographie (taille, poids) plutôt qu'avec des backgrounds

### 5. Server Components par défaut
Les pages sont des Server Components qui fetchent via
[`@qoe/db`](../packages/db) + Prisma. Le `"use client"` est réservé à
l'interactivité réelle (formulaires, modales, etc.).

### 6. Typographie poétique
Les sous-titres et textes d'ambiance utilisent des formulations **évocatrices**,
pas fonctionnelles. Exemples :

> *« Un espace souverain pour cultiver le silence. »*
>
> *« Vos écrits n'attendent que vous. »*

Cette convention renforce l'identité sans sacrifier la clarté.

---

## 🎨 Système de tokens

### Source unique : `packages/theme`

Les tokens vivent dans le package [`@qoe/theme`](../packages/theme) (CSS
variables + registre TypeScript). Chaque `apps/*` importe la feuille
unifiée, **pas** un `globals.css` local.

```css
/* Layer 2 — sémantiques (ce que les composants utilisent) */
:root {
  --background:          #ffffff;
  --foreground:          #09090b;
  --primary:             #09090b;
  --primary-foreground:  #fafafa;
  --muted:               #f4f4f5;
  --muted-foreground:    #71717a;
  --border:              #e4e4e7;
  --accent-brand:        #ee4b2b;  /* opt-in, jamais par défaut */
}

.dark {
  --background:          #09090b;
  --foreground:          #fafafa;
  /* …inversion cohérente */
}
```

### Tokens à utiliser (par ordre de préférence)

| Token sémantique | Cas d'usage |
|------------------|-------------|
| `bg-background` / `text-foreground` | Surfaces principales + texte |
| `bg-card` / `text-card-foreground` | Cards / panels élevés |
| `bg-muted` / `text-muted-foreground` | Surfaces secondaires, labels, hints |
| `bg-primary` / `text-primary-foreground` | CTA principal, boutons primaires |
| `text-muted-foreground` | Labels, métadonnées, sous-textes |
| `border-border` | Séparateurs standards |
| `bg-accent-brand` / `text-accent-brand-fg` | ⚠️ **Opt-in uniquement** |

### Lire un token en JS (charts, canvas)

Pour les graphs recharts/visx ou tout ce qui consomme une teinte en JS :

```ts
import { token } from "@qoe/ui";

const primary = token("--primary");   // "#09090b" en light, "#fafafa" en dark
```

Les charts s'alignent **automatiquement** sur le thème actif. Aucune couleur
hardcodée.

---

## ✍️ Typographie

### Échelle de titres

| Rôle | Classes | Exemple |
|------|---------|---------|
| **H1 page** | `text-2xl font-bold tracking-tight` | *Articles* |
| **H2 section** | `text-lg font-semibold tracking-tight` | *Brouillons* |
| **H3 sous-section** | `text-sm font-medium uppercase tracking-wide text-muted-foreground` | *Publiés* |
| **Sous-titre poétique** | `text-xs text-zinc-400 italic` | *Un espace souverain pour cultiver le silence.* |

### Body & UI

- **Body** : classe par défaut héritée du `body` (système stack Inter / SF Pro).
- **Label UI** : `text-sm font-medium`.
- **Petits labels** : `text-xs text-muted-foreground`.
- **Mono (code, IDs)** : `font-mono text-xs`.

### Hiérarchie via typographie, pas via bordures

Sur les listes épurées, on marque le rang **par taille/poids**, pas par
bordure supérieure :

```tsx
// ✅ Pattern "quiet list"
<li className="flex items-center justify-between border-b border-zinc-100/60 py-3">
  <span className="text-sm">Titre de l'article</span>
  <span className="text-xs text-muted-foreground">il y a 3 jours</span>
</li>
```

---

## 📐 Espacements & densité

### Échelle canonique

| Échelle | Usage typique |
|---------|---------------|
| `space-y-1` | Liste dense d'items simples |
| `space-y-2` | Groupes de 2-3 champs |
| `space-y-4` | Sections de page compactes |
| `space-y-8` | Sections principales |
| `space-y-12` | **Une page = un seul bloc respirant** |

### Largeurs de contenu

| Largeur | Usage |
|---------|-------|
| `max-w-3xl` | Lecture (article, formulaire long, bio) |
| `max-w-5xl` | Listes, tables |
| `max-w-6xl` | Dashboard layout shell (sidebar + main) |

⚠️ **Ne pas appliquer** `max-w-6xl` au contenu d'une page depuis le `layout.tsx` :
chaque page gère sa propre largeur (cf. `apps/dashboard/src/app/(creator)/articles/articles-client.tsx`).

### Padding vertical

- **Page** : `py-6` (avec header sticky au-dessus)
- **Section interne** : `py-4` à `py-8`
- **Card** : `p-6` standard, `p-4` dense, `p-8` respirant

---

## 🧩 Composants canoniques

Ces composants sont les **patterns établis** à recopier (ou extraire dans
`packages/ui` quand ils atteignent 2 occurrences).

### 1. `PageHeader`

Titre + sous-titre poétique + slot pour action à droite.

```tsx
<div className="space-y-2">
  <h1 className="text-2xl font-bold tracking-tight">Articles</h1>
  <p className="text-xs text-zinc-400">Vos écrits n'attendent que vous.</p>
</div>
```

### 2. `QuietList`

Liste épurée type "Apple Reminders", séparateurs semi-transparents.

```tsx
<ul className="divide-y divide-zinc-100/60">
  {items.map((item) => (
    <li key={item.id} className="group flex items-center justify-between py-3">
      <span className="text-sm">{item.title}</span>
      <span className="opacity-70 transition-opacity group-hover:opacity-100">
        {item.date}
      </span>
    </li>
  ))}
</ul>
```

### 3. `TextTabs` (navigation par onglets textuels)

Sous-onglets basées sur le soulignement, sans fond actif.

```tsx
// Pattern : layoutId Framer Motion pour underline animée
<Tabs>
  <TabsTrigger value="published">Publiés</TabsTrigger>
  <TabsTrigger value="drafts">Brouillons</TabsTrigger>
  <TabsTrigger value="archived">Archivés</TabsTrigger>
</Tabs>
```

### 4. `QuietDot` (indicateur de statut)

Petite pastille 6×6px, jamais de badge avec fond coloré.

```tsx
<span
  className="inline-block h-1.5 w-1.5 rounded-full"
  style={{ backgroundColor: isPublished ? "var(--quiet-dot-published)" : "var(--quiet-dot-draft)" }}
/>
```

### 5. `EmptyState`

Vide = message poétique + icône discrète + CTA optionnel.

```tsx
<div className="rounded-lg border border-dashed border-zinc-200 p-12 text-center">
  <p className="text-sm text-zinc-400">Aucun article pour l'instant.</p>
  <p className="mt-1 text-xs italic text-zinc-300">
    Le silence précède les grandes œuvres.
  </p>
</div>
```

### 6. Sidebar (`app-sidebar.tsx`)

- Inset variant
- Icônes en `stroke-[1.5]` (jamais `stroke-2`)
- Labels en `text-xs`
- Logo minimaliste en haut
- Pas de bordures lourdes

---

## ⚡ Patterns d'interaction

### Hover
- Sur les liens/labels : `opacity-70 group-hover:opacity-100 transition-opacity`
- Pas de scale-up, pas d'ombre au hover
- Pas de `bg-*` change brutal — préférer `text-foreground` vs `text-muted-foreground`

### Active / Selected
- Tabs : underline animé (`layoutId` Framer Motion)
- Items de liste : `text-foreground` vs `text-muted-foreground`, pas de fond

### Foco / Accessibilité
- Tous les éléments interactifs ont un `focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background`

### Loading
- Skeleton minimalistes : `bg-zinc-100` ou `animate-pulse sur bg-muted`
- Pas de spinners flashy

---

## 🎯 Iconographie

- **Lucide React** (`lucide-react`) — déjà dans les deps.
- **Style** : `stroke-[1.5]` partout, jamais `stroke-2`.
- **Taille par défaut** : `h-4 w-4` (UI), `h-5 w-5` (CTA), `h-3 w-3` (inline labels).
- **Couleur** : `text-muted-foreground` par défaut, `text-foreground` quand actif.
- **Pas d'icônes brand** dans les surfaces admin/dashboard.

---

## ♿ Accessibilité

- Contraste **AA minimum** (4.5:1 pour le body, 3:1 pour le large text).
- Tous les éléments interactifs sont **focusables au clavier** + focus visible.
- Toutes les images décoratives : `alt=""`. Les images porteuses de sens : `alt` descriptif.
- `aria-label` sur les boutons icon-only.
- Page `<html lang="fr">` (ou `en`) — pas de mix.
- Formulaires : `<label>` associé à chaque `<input>`, messages d'erreur avec `aria-invalid` + `aria-describedby`.

---

## 🚫 Anti-patterns

| ❌ Ne pas faire | ✅ Faire plutôt |
|----------------|----------------|
| `text-zinc-900` sur nouveau composant | `text-foreground` |
| `bg-red-500` pour CTA | `bg-primary` (neutre) sauf opt-in brand |
| Card surchargée avec 3 ombres | Card plate + respiration (`p-6`) |
| Border épaisse `border-2` | Border semi-transparent `border-zinc-100/60` |
| Hover avec `scale-105` | Hover avec `opacity-70 → 100` |
| Texte de label : "Liste des articles que vous avez créés" | "Articles" + sous-titre poétique |
| Sidebar avec fond coloré | Sidebar `inset` zinc-50 ou transparent |
| Boutons avec 14 icônes empilées | Un seul CTA principal + actions discrètes |
| Skeleton flashy avec dégradés | `animate-pulse` sur `bg-muted` |
| Mélange de plusieurs typos (Inter + Geist + Arial) | Une seule famille (héritée du `body`) |
| 5 niveaux de headings dans une même vue | 3 max (H1 page, H2 section, H3 sous-section) |

---

## 📚 Ressources internes

- [`packages/theme/src/`](../packages/theme/src/) — implémentation des tokens
- [`packages/theme/src/registry.ts`](../packages/theme/src/registry.ts) — liste type-safe des thèmes/accents
- [`apps/dashboard/src/app/(creator)/articles/articles-client.tsx`](apps/dashboard/src/app/(creator)/articles/articles-client.tsx) — **référence vivante** pour les patterns `QuietList`, `TextTabs`, `PageHeader`
- [`plans/theming-architecture.md`](../plans/theming-architecture.md) — vision long terme des tokens *(interne, non publié)*
- [`plans/dashboard-creator-roadmap.md`](../plans/dashboard-creator-roadmap.md) — refonte dashboard par phases *(interne, non publié)*

---

## 🤝 Contribution

Toute PR qui introduit un nouveau composant doit :

1. **Utiliser les tokens sémantiques** (`text-foreground`, etc.).
2. **Éviter les `globals.css` locaux** dans son app (importer `@qoe/theme/styles` à la place).
3. **Suivre les patterns** documentés ci-dessus (`PageHeader`, `QuietList`, etc.).
4. **Inclure une story/preview** ou un contexte d'usage dans la description.

En cas de doute : copier la page `articles` comme référence.
