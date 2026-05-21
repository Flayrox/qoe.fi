# Direction Artistique & Design System (qoe.fi)

Ce document définit de manière exhaustive les principes visuels, les règles de typographie, la palette de couleurs et les normes d'interaction de la plateforme **qoe.fi**. Il sert de référence unique pour maintenir une esthétique "Premium", "Souveraine" et cohérente.

---

## 1. Philosophie Globale : Le Minimalisme "Anti-IA"

L'interface de qoe.fi doit être le contraire d'un outil Web 2.0 ou d'un agrégateur de contenus boosté à l'algorithme. Elle doit inspirer le calme, la réflexion et le "Temps long".

*   **L'Étymologie du Rituel (qoe.fi)** : Le nom se prononce "Coffee" (café). L'idée fondamentale est d'offrir une véritable alternative saine : au lieu d'ouvrir TikTok ou Twitter pour son pic de dopamine vide, le lecteur vient "prendre son café intellectuel" sur qoe.fi pour stimuler sa noradrénaline et sa curiosité.
*   **Zéro Bruit Visuel** : Aucun espace publicitaire, aucune bordure inutile, aucune ombre excessive. Le vide ("whitespace") est une composante structurelle.
*   **Design Anti-IA** : Refus des interfaces bavardes (pas de chatbots flottants, pas de modales pop-up agressives). Les interactions sont intentionnelles et déclenchées par l'utilisateur.
*   **Dualité Éditeur / Lecteur** : Le design sépare visuellement le mode "Création" (concentration absolue, interface sombre/technique) et le mode "Lecture" (sanctuaire apaisant, contrastes doux).

---

## 2. Le Logo et l'Identité Visuelle (Plus qu'un Bento)

Le logo de la plateforme (le fameux "Q" stylisé qui a donné naissance au "Bento Plateau") possède une double lecture symbolique extrêmement puissante :

1.  **La Tasse de Café** : Historiquement, la forme extérieure (rouge) et la découpe interne (blanche) dessinent une tasse de café vue de profil ou du dessus, dont la partie blanche figure **l'anse** de la tasse.
2.  **L'Interrupteur "On / Off" (L'Éveil Intellectuel)** : Le logo évoque la forme physique d'un interrupteur à bascule. Cependant, rien n'indique de quel côté se trouve le "On" ou le "Off". Cette absence de repère facile symbolise le travail intellectuel, l'effort d'allumer son propre cerveau, exigé aussi bien de l'écrivain (qui produit) que du lecteur (qui se cultive activement).

---

## 3. Palette de Couleurs (La Flamme Souveraine)

La charte colorimétrique abandonne le noir brutaliste au profit de tons neutres ultra-raffinés, rehaussés par une couleur de marque puissante.

### Couleurs de Marque (Brand)
*   **Vermillon "Crimson" (Primaire)** : `#EE4B2B`
    *   *Usage* : Logos, boutons d'action principaux (CTA), fonds des "Plateaux Bento" de marque. C'est le sang de la plateforme.
*   **Orange d'Accent (Secondaire)** : `#F97316`
    *   *Usage* : Sections immersives (ex: `FeaturedPublications`), hover states, micro-interactions chaleureuses.

### Neutres & Fonds (Apple-esque)
*   **Fond Principal** : `#FFFFFF` (Blanc pur pour les interfaces d'écriture et de lecture).
*   **Surfaces et Cartes** : `bg-neutral-50` ou `bg-white/92` (Glassmorphism).
*   **Zincs Profonds** : `#09090B` (zinc-950) pour les boutons contrastés, les menus super-admin, et l'interface "Éditeur".
*   **Textes** : 
    *   Titres (H1/H2) : `text-neutral-900`
    *   Corps de texte : `text-neutral-600` ou `text-neutral-700`
    *   Métadonnées (dates, petits labels) : `text-neutral-400`

---

## 4. Typographie (Le Socle Narratif)

La plateforme repose sur l'écrit, la typographie est donc la clé de voûte de l'UX. Nous utilisons les polices natives des systèmes d'exploitation pour une intégration organique et des performances maximales.

### Interfaces (Dashboard, Navigation, Boutons)
*   **Famille** : System Sans-Serif (`-apple-system`, `BlinkMacSystemFont`, `SF Pro Display`, `Inter`).
*   **Poids** : 
    *   Titres d'UI : `font-bold` avec `tracking-tight` (lettres resserrées).
    *   Labels et boutons : `font-semibold` ou `font-medium`.
    *   Micros-labels (Tags, Catégories) : `text-[10px] uppercase tracking-[0.2em]` (très espacé pour l'élégance).

### Contenu Editorial (Lecture d'articles)
*   **Famille** : Serif haut de gamme (type `Lora`, `Merriweather` ou `Georgia`).
*   **Poids** : Régulier pour le corps (`leading-relaxed`), fort contraste de taille pour les titres et sous-titres afin de guider l'œil sans effort.

---

## 5. Composants Structuraux & "Bento Plateau"

L'évolution majeure du design est l'abstraction de la forme du logo "Q" vers un composant d'interface réutilisable : le **Bento Plateau**.

### Le "Bento Plateau"
*   **Principe** : Un conteneur englobant coloré (souvent Rouge `#EE4B2B` ou Noir) avec un rayon de courbure extrême (`rounded-[36px]`).
*   **L'Intérieur** : Il accueille deux ou plusieurs "cartes" (`BentoItem`) avec un rayon interne légèrement inférieur (`rounded-[24px]` ou `[28px]`) pour créer un effet d'emboîtement ("nested radius") parfait mathématiquement.
*   **Padding** : `p-2` ou `p-3` (espace très fin entre la coque colorée externe et la carte interne blanche).
*   **Usage** : Squelette de la page de Connexion (`/login`), visualisation du Split-Screen Lecteur/Éditeur (`Hero.tsx`).

### Boutons et Inputs
*   **Formes** : Finis les angles agressifs. Les inputs et boutons utilisent un `rounded-xl` ou `rounded-lg`.
*   **Glassmorphism & Focus** : Les barres de navigation (`NavbarPremium`) utilisent un flou `backdrop-blur-md` sur un fond `bg-white/92`. Les états de focus (au clavier) affichent un anneau coloré discret : `focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30`.
*   **Boutons OAuth (Google/Apple)** : Style "Mini Bento". Un fond gris très clair (`bg-neutral-100`), contenant un carré blanc central (`bg-white shadow-sm rounded-xl`) qui isole et met en valeur le logo de l'entreprise.

---

## 6. Animations & "Fluidité Matérielle" (Framer Motion)

Rien ne doit apparaître ou disparaître d'un coup sec (sauf cas d'urgence/erreur). Les animations doivent simuler une physique réelle ("Spring").

### Courbes de Bézier (Ease)
*   La courbe de transition de référence de qoe.fi est : `ease: [0.16, 1, 0.3, 1]`.
*   Elle simule une poussée rapide au démarrage qui ralentit très doucement à l'arrivée (effet signature d'Apple).
*   **Durées standard** : 
    *   Micro-interactions (survol, boutons) : `duration: 0.2` ou `0.3s`.
    *   Transformations structurelles (redimensionnement du Bento) : `duration: 0.55s`.

### Effets Spécifiques
*   **Hover States** : Un léger grossissement `group-hover:scale-105` ou une translation d'icône `group-hover:translate-x-0.5`.
*   **Typewriter / Text Cycling** : Fondu enchaîné doux (`AnimatePresence` avec `opacity` et `y: 10`) pour ne pas stresser l'œil.
*   **L'Effet Génie** : Les grands composants (comme le Hero) se réduisent en une bille (`borderRadius: 50%, scale: 0.05`) et sont "aspirés" vers le logo pour quitter l'écran élégamment.

---

## 7. Iconographie & Ombres

*   **Ombres (Shadows)** : Refus des ombres dures. Nous utilisons des ombres diffuses, douces et colorées.
    *   Conteneur global : `shadow-2xl`
    *   Cartes internes : `shadow-sm`
    *   Curseurs ou éléments flottants critiques : Filtre CSS `drop-shadow(0px 10px 15px rgba(0,0,0,0.3))` pour un détachement physique.
*   **Icônes** : Utilisation exclusive de la librairie **Lucide React**. Traits uniformes (`strokeWidth="1.5"` ou `"2"` maximum), jamais de remplissage plein, pour un rendu aéré et consistant.

---

*L'objectif final de cette charte est simple : s'effacer. Le design ne doit pas voler la vedette au contenu. Le lecteur doit oublier l'interface pour ne se souvenir que des mots de l'écrivain.*