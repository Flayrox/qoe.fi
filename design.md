---
title: "Système de Design - qoe.fi"
description: "Documentation officielle du système de design de la plateforme souveraine qoe.fi, structurée selon les normes getdesign.md"
version: "1.0.0"
date: "2026-05-27"
---

# Design System : qoe.fi

Bienvenue dans le `design.md` officiel de **qoe.fi**. Ce document centralise les principes directeurs, l'identité visuelle, l'architecture des composants et les règles d'interaction de la plateforme. Il est conçu pour être la source de vérité absolue pour tout développeur ou designer intervenant sur le projet, garantissant une cohérence parfaite et une esthétique "Premium" et "Souveraine".

---

## 1. Philosophie & Principes Fondamentaux

L'interface de qoe.fi s'inscrit en faux contre les standards du Web 2.0 hyper-stimulant. Elle est pensée comme un **sanctuaire numérique**.

- **Minimalisme Intentionnel ("Anti-IA" & "Zéro Bruit")** : L'interface élimine le superflu (pas de pop-ups agressives, pas d'ombres artificielles lourdes). Le vide ("whitespace") est utilisé comme un élément structurel guidant la concentration.
- **Temps Long & Calme Visuel** : Les contrastes sont adoucis, les animations sont fluides et prédictibles. L'architecture encourage la réflexion profonde plutôt que la consommation frénétique.
- **Dualité Conceptuelle** : Le design sépare distinctement le mode "Création" (interface technique, sombre, monastique favorisant le flow) du mode "Lecture" (interface lumineuse, apaisante, aérée).

---

## 2. Identité de Marque & Le Concept "Bento Plateau"

L'élément signature de qoe.fi est son approche visuelle du "Bento Plateau", directement inspirée par l'anatomie de son logo.

### Le Logo (Le "Q" / La Tasse de Café / L'Interrupteur)
Le logo incarne l'éveil intellectuel. Sa forme extérieure rouge et sa découpe interne blanche symbolisent à la fois la tasse de café (le rituel) et un interrupteur abstrait (l'effort de la pensée).

### Le "Bento Plateau"
Le "Bento Plateau" est la traduction de ce logo en un conteneur d'interface universel.
- **Enveloppe Externe** : Un grand conteneur, souvent coloré (Rouge Vermillon ou Noir Profond), avec un rayon de courbure extrême (`rounded-[36px]`).
- **Enveloppe Interne (Les Cartes)** : Des sous-conteneurs blancs ou clairs, insérés avec un `padding` minimal (2 à 3px) et un rayon de courbure légèrement inférieur (`rounded-[24px]` ou `rounded-[28px]`) pour créer un effet d'emboîtement (nested radius) mathématiquement parfait.

---

## 3. Couleurs (La Flamme Souveraine)

La palette de couleurs rejette le noir pur brutal au profit de tons neutres nuancés, rehaussés par un rouge identitaire fort.

### Couleurs de Marque
- **Primaire (Vermillon "Crimson")** : `#EE4B2B`
  - *Usage* : Éléments distinctifs de la marque, CTAs principaux, coques des Bento Plateaus.
- **Secondaire (Orange d'Accent)** : `#F97316`
  - *Usage* : Survol (hover states), micro-interactions, sections immersives spécifiques.

### Surfaces & Fonds (Thème Clair)
- **Fond Principal** : `#FFFFFF` ou `#FAFAFA` (Blanc et Gris très clairs pour préserver les yeux lors de longues lectures).
- **Surfaces Élevées (Cartes)** : `bg-white/92` avec glassmorphism (`backdrop-blur-md`) pour la navigation.
- **Texte Primaire (Titres)** : `text-neutral-900`
- **Texte Secondaire (Corps)** : `text-neutral-600` à `text-neutral-700`
- **Métadonnées** : `text-neutral-400`

### Surfaces & Fonds (Thème Sombre / Mode Éditeur)
- **Fond Principal** : `#09090B` (Zinc-950) pour les interfaces nécessitant une concentration absolue (Éditeur, Super-Admin).
- **Surfaces Élevées** : `#18181B` (Zinc-900).
- **Texte** : `#FAFAFA` (Zinc-50) pour les titres, `#A1A1AA` (Zinc-400) pour le corps.

---

## 4. Typographie

Le système typographique repose sur les polices natives pour garantir des performances optimales et une sensation d'appartenance organique au système de l'utilisateur.

### Typographie d'Interface (Dashboard, UI, Boutons)
- **Famille** : System Sans-Serif (`-apple-system`, `BlinkMacSystemFont`, `SF Pro Display`, `Inter`).
- **Poids & Styles** :
  - **Titres UI** : `font-bold` avec un tracking resserré (`tracking-tight`).
  - **Boutons & Actions** : `font-medium` ou `font-semibold`.
  - **Tags & Micro-labels** : `text-[10px] uppercase tracking-[0.2em]` (Espacement généreux pour l'élégance technique).

### Typographie Éditoriale (Articles, Publications)
- **Famille** : Polices Serif élégantes (`Lora`, `Merriweather`, `Georgia`).
- **Poids & Styles** :
  - **Corps de texte** : `font-normal` avec un interlignage généreux (`leading-relaxed` ou `leading-loose`).
  - **Titres de contenu** : Fort contraste de taille par rapport au corps pour hiérarchiser visuellement la lecture sans effort.

---

## 5. Composants Structuraux & UI (Basés sur Shadcn & 21st.dev)

Tous les composants interactifs doivent refléter la qualité "Premium" de la plateforme.

### Boutons & Inputs
- **Bordures** : Les angles pointus sont proscrits. Utilisation de `rounded-xl` ou `rounded-lg`.
- **États de Focus** : La navigation au clavier ou le clic déclenchent des anneaux de focus subtils : `focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30`.
- **Glassmorphism** : La navbar et les headers persistants utilisent un léger flou d'arrière-plan pour s'intégrer au défilement du contenu sans le masquer brutalement.

### Cartes & Conteneurs
- **Ombres (Shadows)** : Jamais d'ombres dures. Utilisation d'ombres diffuses, colorées ou extrêmement douces.
  - Grandes enveloppes : `shadow-2xl`
  - Éléments internes : `shadow-sm` ou `shadow-md`
- **Borders** : Bordures de 1px très légères (`border-border` ou `border-neutral-200/60`) pour délimiter délicatement les espaces dans les tableaux de bord.

---

## 6. Animation & Motion Design

L'animation sur qoe.fi obéit aux lois de la physique. Rien n'est abrupte, tout simule la masse et l'inertie.

- **Courbe de Référence (Bézier)** : `ease: [0.16, 1, 0.3, 1]`. Cette courbe (similaire à l'écosystème Apple) offre une impulsion de départ rapide suivie d'une décélération très douce.
- **Durées** :
  - Micro-interactions (Hovers, Active states) : `0.2s` à `0.3s`.
  - Transitions structurelles (Ouverture de modale, Déploiement de Bento) : `0.55s`.
- **Transitions de Texte** : Fondu enchaîné délicat (`opacity` et légère translation `y`) plutôt qu'un remplacement brutal de chaîne de caractères.

---

## 7. Iconographie

- **Bibliothèque** : **Lucide React** (exclusivement).
- **Style** : Traits fins et uniformes (Stroke Width de `1.5` ou `2.0` max).
- **Règle absolue** : Les icônes ne sont jamais remplies (pas de fill solide) pour conserver un rendu aérien et minimaliste.

---

## 8. Standards de Développement Frontend

Ce projet s'appuie massivement sur des générateurs de composants de haute volée :
1. **Shadcn UI** : Base architecturale robuste pour les primitives (boutons, inputs, popovers).
2. **21st.dev** : Injection de composants d'UI avancés, expérimentaux et hautement polis pour les éléments distinctifs de la marque.

*L'intégration d'un nouveau composant doit systématiquement passer par une vérification de sa conformité avec les règles de courbure (nested radius), de couleur et de comportement au clavier définies ci-dessus.*
