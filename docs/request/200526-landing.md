# 🌌 ORDRE DE MISSION TECHNIQUE : REFACTORISATION LANDING PAGE & TUNNEL LECTEUR "NEURAL EXPRESSIVE"

## 1. Vision Produit & Refonte Globale du Design System (Hybride Spatial & Féerique)
Nous entamons la refonte complète de la landing page et du flux d'onboarding/inscription des lecteurs (Étape 2 du projet). Les structures géométriques dures sont abandonnées au profit d'une esthétique fluide, organique et haut de gamme ("Neural Expressive") articulée autour d'un double thème asymétrique :

* **Dark Mode (Espace Obsidienne) :** Fond noir absolu (`bg-black`), cartes et panneaux en verre organique profond (`bg-neutral-900/40 backdrop-blur-2xl border-white/5`), traversés par de très subtils halos lumineux radiaux d'arrière-plan mouvants (dégradés fluides discrets dans les tons violets et bleus abyssaux : `from-violet-600/5 via-transparent to-blue-600/5 blur-[150px] animate-pulse`).
* **Light Mode (Sanctuaire Elfique) :** Une déclinaison lumineuse, féerique et magique. Fond parchemin/albâtre doux et mat (`bg-[#fcfbf9]`), textes et éléments de structure couleur vert émeraude profond (`text-emerald-950`, `bg-emerald-900/5`), et lueurs dorées/or rose pour illuminer subtilement les éléments interactifs (`border-amber-500/20 shadow-[0_0_25px_rgba(217,119,6,0.08)]`). Les dalles de verre clair utilisent `bg-white/70 backdrop-blur-xl border-stone-200/60`.

**CONSIGNE CRITIQUE : ABSENCE TOTALE DE HARDCODING.**
Rien ne doit être écrit en dur dans le code TSX (ni les taglines, ni les descriptions de fonctionnalités, ni les listes statiques). 
- Les textes de la structure globale du site doivent passer par notre infrastructure i18n existante (Tolgee via `useTranslate`).
- Les éléments de configuration de la plateforme, les bascules de fonctionnalités (Feature Flags) et les textes modulables de la page d'accueil doivent être lus dynamiquement depuis le modèle `SystemConfig` de la base de données.
- Les thématiques de l'onboarding doivent provenir directement du modèle `Category`.
Tout doit être nativement administrable à l'avenir via le dashboard Super-Admin.

---

## 2. Spécifications Techniques et UX par Composant

### Étape 1 : Alignement et cinématique des thèmes (`src/app/globals.css`)
Configure les variables de thème et les utilitaires Tailwind pour supporter les gradients fluides d'arrière-plan et les bordures "Neural". Assure-toi que les transitions de thèmes (`transition-all duration-500 ease-in-out`) opèrent un fondu enchaîné liquide et magique lors du basculement entre le mode Obsidienne et le mode Féerique Elfique.

### Étape 2 : Section Hero à Double Perspective (`src/components/sections/Hero.tsx`)
* **L'UI/UX :** Épuration maximale centrée sur une typographie Serif haut de gamme. Intègre un commutateur (Switch) magnétique en verre givré au centre de la vue pour segmenter instantanément l'audience : `[ Je veux lire ] <───> [ Je veux publier ]`.
* **Le Dynamisme (Framer Motion) :** * Si l'utilisateur sélectionne *"Je veux lire"*, le texte pivote de manière fluide pour afficher le pitch lecteur : *"Un sanctuaire pour votre esprit. Pas de publicité, pas de pièges à clics. Juste la pensée brute."* Le halo d'arrière-plan vire au bleu nuit/émeraude.
    * S'il sélectionne *"Je veux publier"*, l'interface se métamorphose instantanément pour afficher le pitch créateur : *"Prenez le contrôle de vos outils. Infrastructure souveraine, multi-tenant et portefeuille virtuel."* Le halo vire à l'or chaud/doré.
* **Dynamisme Admin :** Ces deux textes de pitch et les états par défaut doivent être lus depuis le modèle de configuration serveur `SystemConfig`.

### Étape 3 : La Grille Bento des Valeurs Réactives (`src/components/sections/BentoFeatures.tsx`)
Refond la grille bento actuelle pour concevoir un ensemble de dalles de verre translucides réactives illustrant les piliers éthiques de l'écosystème :
* **Dalle 1 (Le Portefeuille Virtuel / Wallet) :** Animation vectorielle simulant la simplification des flux : abonnements en 1 clic sans friction pour les lecteurs, et élimination des frais fixes Stripe sur les micropaiements pour les créateurs (utilisation du modèle `WalletTransaction`).
* **Dalle 2 (L'Éclateur de Bulle Ideologique) :** Représentation graphique abstraite de notre moteur vectoriel `pgvector`. Explique la fonctionnalité "Hors-Piste" permettant de casser les bulles de filtres algorithmiques toxiques pour stimuler l'esprit critique.
* **Dalle 3 (Le Lecteur Monastique) :** Présentation esthétique de l'accessibilité avancée et du carnet personnel de surlignages (`Highlight`).

### Étape 4 : Le Simulateur de Lecture Interactif (`src/components/sections/ProductPreview.tsx`)
Remplace l'image statique par un véritable module de lecture d'article simulé en temps réel. Le visiteur doit pouvoir cliquer sur le menu d'accessibilité (Bouton "Aa") **directement depuis la landing page** pour tester en direct la modification de taille de la police, le passage de l'article en mode "Sépia" ou l'activation du mode "Dyslexia Friendly" (Atkinson Hyperlegible). C'est l'atout de réassurance UX majeur avant l'inscription.

### Étape 5 : Le Flux d'Onboarding Lecteur Haute Fidélité (`src/app/(main)/onboarding/OnboardingFlow.tsx`)
Développe le tunnel d'inscription sous forme d'un assistant (Wizard) multi-étapes avec des transitions horizontales fluides via Framer Motion, connecté à nos Server Actions existantes :
* **Étape 1 (Élever - Intérêts) :** Une constellation de bulles de verre flottantes représentant les thématiques (chargées dynamiquement depuis la table `Category` via Prisma). Cliquer sur une bulle déclenche une lueur "Neural" organique. Sélection de 3 thématiques minimum.
* **Étape 2 (Filtrer - Muted Words) :** Un champ de saisie épuré permettant au lecteur de taper les mots-clés ou sujets qu'il souhaite bannir de sa timeline (ex: *Clash, Buzz*). Les tags créés sont instantanément sauvegardés dans la table `MutedWord` liée à son profil.
* **Étape 3 (Curer - Cold Start Problem) :** L'UI analyse les choix de l'étape 1 et présente une grille de 3 à 5 créateurs certifiés pertinents, évitant le syndrome du réseau vide. Un bouton "Suivre la sélection et accéder au réseau" effectue un `Follow` groupé en base de données et redirige vers le feed personnalisé.

### Étape 4 : Le Flux des Voix Indépendantes (`src/components/sections/DiscoveryFeed.tsx`)
Le feed de découverte doit afficher les cartes d'articles sous forme de dalles de verre en apesanteur. Au survol, la carte s'élève légèrement. Intègre le bouton d'action secondaire **"Bookmark" (Sauvegarder pour plus tard)** directement sur la carte. 
* **Algorithme de Masquage Anti-Brainrot :** Si un article du feed contient un mot banni par l'utilisateur (configuré dans sa table `MutedWord`), la carte de l'article doit être floutée de manière élégante avec un overlay indiquant : *"Cet article contient un mot masqué de votre liste. Cliquez pour l'afficher."*

---

## 📝 DIRECTIVES D'EXÉCUTION DU LEAD TECH :
Procède de manière modulaire, fichier par fichier. Valide chaque composant visuel avec son typage TypeScript strict. Assure-toi qu'aucune chaîne de caractères n'est codée en dur à l'intérieur des balises TSX, utilise les fichiers de configuration de langue Tolgee ou des appels de modèle database propres via Prisma. Dès que le code compile sans erreur et que le build de production est validé, fournis le résumé détaillé des modifications. À toi de jouer !