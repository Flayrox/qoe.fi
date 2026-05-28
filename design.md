---
title: "Système de Design & Manifeste UI - qoe.fi"
description: "Documentation exhaustive, souveraine et intraitable de la plateforme qoe.fi. De la landing page poétique au cockpit d'administration asymétrique."
version: "3.0.0"
date: "2026-05-28"
---

# Design System & Manifeste UI : qoe.fi

Ce document est la source de vérité absolue pour l'architecture visuelle, conceptuelle et technique de **qoe.fi**. Il définit la tension visuelle entre un vide immense et un détail millimétrique, s'inspirant des standards d'excellence d'artisans du web comme Rauno Freiberg, de l'épuration technique de Cursor, et de l'obsession microscopique de devouringdetails.com.

**Tout développeur ou agent IA intervenant sur ce projet a l'obligation contractuelle d'appliquer ces règles sans la moindre concession.**

---

## 1. Philosophie Globale : Le Rituel et le Sanctuaire

L'interface de qoe.fi refuse catégoriquement la sur-stimulation du Web 2.0 (aggrégateurs frénétiques, pop-ups agressives). Elle s'impose comme un **sanctuaire numérique**.

### L'Étymologie et le Symbole
* **Le Rituel (Coffee / qoe.fi)** : Le nom se prononce "Coffee". La plateforme est une alternative saine à la consommation frénétique de contenu. On y vient pour "prendre son café intellectuel", stimuler sa noradrénaline et sa curiosité par le temps long.
* **Le Logo (La Tasse et l'Interrupteur)** : Le logo (le "Q" stylisé) possède une double lecture. 
    1. Une tasse vue de profil/dessus (la découpe blanche forme l'anse).
    2. Un interrupteur à bascule abstrait. L'absence d'indication "On/Off" symbolise l'effort intellectuel requis : allumer son propre cerveau est un acte volontaire, exigé du lecteur comme de l'écrivain.

### Le Minimalisme "Anti-IA" et le Vide
* **Zéro Bruit Visuel** : Aucun espace publicitaire, aucune bordure inutile, aucune ombre excessive, aucun chatbot flottant. 
* **L'Espace comme Matériau** : Le vide ("whitespace") n'est pas un manque à remplir, c'est la structure porteuse. Les marges sont délibérément gigantesques pour isoler le contenu et forcer la concentration.

---

## 2. L'Architecture Spatiale : Le "Bento Plateau"

Le concept de **Bento Plateau**, abstraction de la forme du logo "Q", régit l'organisation des blocs interactifs majeurs (Landing Page, Auth, modules globaux).

### La Règle du "Nested Radius" (Emboîtement Parfait)
Pour qu'une carte à l'intérieur d'un plateau paraisse visuellement parfaite et organique, le rayon interne doit suivre cette formule mathématique stricte : `Radius Externe - Padding = Radius Interne`.

* **L'Enveloppe Externe (Le Plateau)** :
    * Rayon extrême : `rounded-[32px]` ou `rounded-[36px]`.
    * Fond : Souvent Rouge Vermillon (`#EE4B2B`), Noir absolu, ou Gris très clair.
    * Tension : Un padding interne extrêmement fin (`p-2` ou `p-3`, soit 8 à 12px) pour créer un effet d'enserrage luxueux.
* **L'Enveloppe Interne (Les Cartes / Bento Items)** :
    * Rayon calculé : `rounded-[24px]` ou `rounded-[28px]`.
    * Fond : Blanc pur (`#FFFFFF`) ou Zinc profond (`#09090B`).

---

## 3. La Dualité des Interfaces (Vitrine vs Cockpit)

Le design sépare distinctement deux états cognitifs : la consommation apaisée et la production chirurgicale.

### 3.1. Le Mode Lecteur (Landing Page / Vitrine)
* **Ambiance** : Lumineux, aérien, organique, expansif.
* **Surfaces & Glassmorphism** : Utilisation de fonds blancs ou gris 50 (`#FAFAFA`). Les éléments de navigation (`NavbarPremium`) utilisent un `bg-white/70` à `bg-white/92` combiné à un flou profond (`backdrop-blur-xl` ou `md`) pour s'intégrer au défilement sans masquer le texte brutalement.

### 3.2. L'Admin Dashboard (Le Cockpit Monastique & Asymétrique)
L'espace admin (`/admin`) s'éloigne des dashboards génériques (avec leurs grosses sidebars grises et leurs cartes empilées). C'est un terminal de contrôle épuré à l'extrême.
* **La Sidebar Suspendue** : Elle ne possède *aucune ligne de démarcation* rigide à droite. Elle n'est pas un bloc, mais une colonne de pure typographie suspendue. L'isolation se fait par le vide absolu et des espacements verticaux généreux (`gap-y-8`, `space-y-6`).
* **Mode Sombre Natif** : Fond `#09090B` (Zinc-950) pour une concentration absolue. Surfaces de données en `#18181B` (Zinc-900).
* **L'Obsession du Micro-Détail** :
    * *Hairline Borders* : Les séparateurs de tableaux utilisent des bordures à la limite du perceptible (`border-[0.5px] border-white/5` ou `border-neutral-200/40`).
    * *Puces d'État (Status Dots)* : Pas de gros badges de statut. Juste un micro-point de 4 à 6px (`h-1.5 w-1.5`) avec un halo subtil.
    * *Micro-Badges* : `text-[9px] font-medium tracking-[0.25em] uppercase text-zinc-400`.
* **Clavier d'Abord** : Navigation rapide (Command Palette `⌘+K`), anneaux de focus visibles et nets (`focus-visible:ring-2 focus-visible:ring-neutral-400/50`).

---

## 4. La Flamme et la Toile (Couleurs)

La couleur n'est jamais décorative. Elle signale, hiérarchise et incarne la marque.

### Couleurs de Marque
* **Primaire (Vermillon "Crimson")** : `#EE4B2B`
    * *Usage* : C'est le sang de la plateforme. Utilisé pour le logo, les CTA ultimes, les coques de Bento.
* **Secondaire (Orange d'Accent)** : `#F97316`
    * *Usage* : Sections immersives (`FeaturedPublications`), micro-interactions, gradients thermiques subtils.

### Textes (Hiérarchie)
* **Titres H1/H2** : `text-neutral-900` (Clair) / `text-zinc-50` (Sombre).
* **Corps de texte** : `text-neutral-600` (Clair) / `text-zinc-400` (Sombre).
* **Métadonnées** : `text-neutral-400` (Clair) / `text-zinc-600` (Sombre).

---

## 5. Typographie (Le Socle Narratif)

L'écrit est la clé de voûte de qoe.fi. Les polices natives sont privilégiées pour une appartenance organique au système de l'utilisateur.

* **Typographie d'Interface (Dashboard, UI, Boutons)** :
    * Famille : Sans-Serif Système (`SF Pro Display`, `Inter`).
    * Titres UI : Poids `font-bold` avec un tracking fortement resserré (`tracking-tight` ou `tracking-tighter`) pour un rendu technique et dense.
    * Micros-labels : `text-[10px] uppercase tracking-[0.2em]`.
* **Typographie Éditoriale (Articles, Publications)** :
    * Famille : Serif haut de gamme (`Lora`, `Merriweather`, `Georgia`).
    * Corps : Poids régulier, interlignage très généreux (`leading-relaxed` ou `leading-loose`).
    * Fort contraste de taille entre les titres et le corps pour guider l'œil sans effort.

---

## 6. Motion Design : La Physique de la Matière (Framer Motion)

L'animation sur qoe.fi obéit aux lois de la physique. Rien n'est abrupte, tout simule la masse et l'inertie. Rien ne "clignote".

* **Courbe de Référence (Bézier / Spring)** : `ease: [0.16, 1, 0.3, 1]`.
    * *Signature* : Une impulsion de départ fulgurante (façon écosystème Apple) suivie d'une décélération extrêmement douce à l'arrivée.
* **Transitions de Texte & Typewriter** : Fondu enchaîné délicat (`AnimatePresence`, `opacity: [0, 1]`, `y: [10, 0]`) plutôt qu'un remplacement brutal.
* **Micro-interactions (Hovers)** : Durée de `0.2s` à `0.3s`. Un léger grossissement (`scale-102` à `scale-105`) ou une douce translation.
* **L'Effet Génie (Unmount)** : Les grands composants (comme le Hero ou les Modales) se réduisent en une bille (`borderRadius: 50%, scale: 0.05`) et sont "aspirés" vers leur point d'origine pour quitter l'écran élégamment.

---

## 7. Iconographie & Ombres

* **Ombres (Shadows)** : **Refus total des ombres dures.** Utilisation exclusive d'ombres diffuses, douces, évanescentes ou colorées.
    * Conteneurs globaux : `shadow-2xl shadow-neutral-200/40`.
    * Éléments flottants : Filtre CSS `drop-shadow(0px 10px 15px rgba(0,0,0,0.05))`.
* **Iconographie (Lucide React)** :
    * Traits fins et uniformes : `strokeWidth="1.5"` (ou `2.0` max).
    * **Règle absolue** : Les icônes ne sont *jamais* remplies (pas de `fill` solide) pour conserver un rendu aérien.

---

## 8. Protocole de Développement IA & Standards Frontend (MCP)

Pour garantir un niveau d'excellence mondial, **l'IA (Agent) a l'interdiction formelle de générer des composants d'interface génériques.** Elle doit obligatoirement s'appuyer sur les serveurs MCP configurés dans l'environnement.

### Directives d'utilisation des serveurs MCP (Obligatoire) :
1. **Shadcn UI (Standardisation & Robustesse)** : 
   * Pour toute structure anatomique standard (tableaux de données `data-table`, dropdowns, inputs, formulaires, modales), l'IA doit interroger le MCP `shadcn` pour utiliser ses primitives accessibles et extensibles.
2. **21st.dev (Inspiration & Primitives Avancées)** : 
   * Pour tout composant hautement visuel, expérimental ou animé (Bento cards complexes, `AnimatedBentoCard`, effets de survol magnétiques, text reveals), l'IA doit rechercher des implémentations de pointe via le MCP `21st.dev`.

### Prohibitions Absolues (Code Generators) :
1. **INTERDIT** : Les paddings uniformes et grossiers (`p-4` ou `p-6` partout). L'interface exige une asymétrie intentionnelle et une tension spatiale.
2. **INTERDIT** : Les boutons ou inputs avec des angles à 90° (sauf intention pure brutaliste assumée). Le standard est `rounded-lg`, `rounded-xl` ou `rounded-full`.
3. **INTERDIT** : L'introduction de couleurs non listées dans la charte (pas de bleu système standard, pas de vert flash sauf alerte système stricte).
4. **INTERDIT** : Surcharger le Dashboard Admin de cartes colorées. L'Admin reste monochrome (Zinc), seule la donnée critique a droit à la couleur.