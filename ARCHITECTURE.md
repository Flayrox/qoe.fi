# 📖 L'Encyclopédie Absolue de qoe.fi : Guide d'Architecture et de Fonctionnement

Ce document est le **plan détaillé de la matrice** de l'application `qoe.fi`. Il a été rédigé de manière chirurgicale pour qu'une personne n'ayant **jamais programmé** puisse comprendre l'entièreté du système, tout en offrant le contexte global et la rigueur technique nécessaires à une **Intelligence Artificielle** (Agent IA) pour intervenir sur le code sans jamais briser sa cohérence ni son niveau d'exigence extrême.

---

## 🧭 Sommaire

1. [La Philosophie Fondatrice : Anti-IA, Sanctuaire et Craft](#1-la-philosophie-fondatrice--anti-ia-sanctuaire-et-craft)
2. [La Philosophie du Design (Le Manifeste Visuel)](#2-la-philosophie-du-design-le-manifeste-visuel)
3. [La Boîte à Outils (Stack Technique)](#3-la-boîte-à-outils-stack-technique)
4. [La Carte du Monde : Que fait chaque dossier ?](#4-la-carte-du-monde--que-fait-chaque-dossier-)
5. [La Mémoire (Base de Données) : Qui retient quoi ?](#5-la-mémoire-base-de-données--qui-retient-quoi-)
6. [Plongée Chirurgicale : Le Moteur du Lecteur (`/home`)](#6-plongée-chirurgicale--le-moteur-du-lecteur-home)
7. [Plongée Chirurgicale : Les Réglages (`/settings`)](#7-plongée-chirurgicale--les-réglages-settings)
8. [Plongée Chirurgicale : L'Authentification (`/login`)](#8-plongée-chirurgicale--lauthentification-login)
9. [Internationalisation Globale : Le Moteur Tolgee](#9-internationalisation-globale--le-moteur-tolgee)
10. [Les Différents Visages : Le Tenant et l'Admin](#10-les-différents-visages--le-tenant-et-ladmin)
11. [État des Lieux : Ce qui n'est PAS opérationnel](#11-état-des-lieux--ce-qui-nest-pas-opérationnel)
12. [Axes Architecturaux à Creuser (Analytics & Open Source)](#12-axes-architecturaux-à-creuser-analytics--open-source)
13. [Directives Chirurgicales pour un Agent IA (CTO Prompt)](#13-directives-chirurgicales-pour-un-agent-ia-cto-prompt)

---

## 1. La Philosophie Fondatrice : Anti-IA, Sanctuaire et Craft

Imaginons un hybride entre **Substack**, **Medium** et un **sanctuaire zen**. `qoe.fi` (prononcé "Coffee") est une plateforme permettant à des auteurs d'écrire, de publier et de monétiser leurs écrits auprès de leurs lecteurs. 

Mais au-delà du produit, **qoe.fi a une ambition colossale** et un positionnement idéologique fort :
*   **Totalement Anti-IA et "Anti Vibe-coding"** : Aujourd'hui, internet est inondé de sites web générés par IA qui se ressemblent tous, froids, plastiques. qoe.fi prend le contre-pied absolu. Aucune interface ne doit donner la sensation d'avoir été vomie par un générateur. Chaque détail doit respirer le "craft", l'obsession du détail. C'est l'artisanat numérique face à l'usine.
*   **Le Sanctuaire** : Une alternative calme au bruit d'Internet. Pas de publicités, pas d'algorithmes de dopamine toxiques.
*   **Transparence Totale et Synchronicité** : L'expérience doit être "magique". Aucun décalage entre l'action d'un créateur et l'affichage chez le lecteur. Rien de caché.

---

## 2. La Philosophie du Design (Le Manifeste Visuel)

Pour atteindre l'excellence "Anti-IA", l'interface obéit à des lois mathématiques et visuelles strictes inspirées des meilleurs (Rauno Freiberg, Vercel, Linear) :

*   **La Règle du "Nested Radius" (Emboîtement Parfait)** : Le design principal utilise le concept du **Bento Plateau**. Pour qu'une carte à l'intérieur d'un plateau paraisse visuellement parfaite, le rayon interne suit cette formule : `Radius Externe - Padding = Radius Interne`. (Ex: Plateau externe `rounded-[32px]`, padding `p-2` (8px), donc carte interne `rounded-[24px]`).
*   **L'Asymétrie et le Vide** : Le vide ("whitespace") n'est pas un manque à remplir, c'est la structure porteuse. Les paddings uniformes (`p-4` de partout) sont interdits. On joue sur l'asymétrie pour guider l'œil.
*   **La Mort des Ombres Dures** : Utilisation exclusive d'ombres diffuses, douces ou colorées (`shadow-2xl shadow-neutral-200/40`). Rien ne doit agresser l'œil.
*   **La Couleur Sang** : Le Rouge Vermillon (`#EE4B2B`) est utilisé avec parcimonie pour les CTA ultimes ou les grands plateaux.
*   **Les Typographies Natives** : `Geist`, `Inter`, `JetBrains Mono` pour le Dashboard (densité, tracking resserré) et polices Serif haut de gamme pour la lecture.

---

## 3. La Boîte à Outils (Stack Technique)

*   **Next.js 15+ (App Router)** *[Le Chef de Chantier]*
*   **React 19** *[Les Briques]*
*   **Zustand** *[La Mémoire Courte]*
*   **TypeScript** *[Le Plan d'Architecte]*
*   **Tailwind CSS 4 & Framer Motion** *[La Peinture et la Physique]* 
*   **Prisma & PostgreSQL (pgvector)** *[Le Cadastre]* 
*   **Supabase** *[L'Authentification et l'Hébergement DB]* 
*   **Tolgee** *[Le Bureau des Traductions]*

---

## 4. La Carte du Monde : Que fait chaque dossier ?

### 📂 `src/app/` (Le Routage)
*   `/(admin)` : **Le Cockpit.** Tableau de bord global.
*   `/(dashboard)` : **L'Atelier du Créateur.** Espace privé d'un auteur.
*   `/(main)` : **Le Salon du Lecteur.** `/home`, `/settings`.
*   `/tenant/[domain]` : **La Vitrine Personnalisée.** Le sous-domaine du créateur.
*   `/[locale]` : **La Landing Page traduite.**
*   `/login/` : La page d'authentification.

### 📂 `src/features/editor` (Le Moteur d'Écriture)
Contient l'implémentation de Tiptap et ses extensions sur-mesure (ex: `PaywallDivider`).

---

## 5. La Mémoire (Base de Données) : Qui retient quoi ?

Le fichier `prisma/schema.prisma` gère :
1.  **User** : Balance (`walletBalanceCents`), sous-domaine (`subdomain`).
2.  **Article & Post** : Les contenus longs et courts.
3.  **Subscriber** : Pont monétaire et relationnel entre lecteur et créateur.
4.  **Bookmark & Highlight** : Engagement des lecteurs.
5.  **WalletTransaction** : Comptabilité (Dépôts, Abonnements).

---

## 6. Plongée Chirurgicale : Le Moteur du Lecteur (`/home`)

L'application `/home` est gérée par un **système d'onglets (Zustand)** redoutable (`use-tab-store.ts`).
*   **Sécurité Mémoire** : Ne garde jamais plus de 10 onglets ouverts.
*   **Mémorisation du Scroll** : Sauvegarde le `scrollPosition` instantanément.
*   **Synchronisation URL** : L'URL change avec l'onglet (`?tab=article-slug`). En cas de F5, l'onglet est recréé.
*   **Cache DOM** : Les onglets inactifs passent en CSS `display: hidden`.

---

## 7. Plongée Chirurgicale : Les Réglages (`/settings`)

Géré via un "Bento Plateau" asymétrique. L'onglet actif ("pilule" glissante `layoutId` via Framer Motion) modifie le Bento principal : Upload d'image direct (`/api/articles/upload`), Toggles de newsletters granulaires, Police Dyslexique (`localStorage`).

---

## 8. Plongée Chirurgicale : L'Authentification (`/login`)

Le middleware Supabase `src/lib/supabase/middleware.ts` protège les routes. L'Interface (`login-form.tsx`) gère 3 états (`magic-link`, `password`, `signup`) sans rechargement, adossés à un Manifeste poétique qui s'anime avec Framer Motion.

---

## 9. Internationalisation Globale : Le Moteur Tolgee

Injecté **à la racine absolue** via `<TolgeeNextProvider>`. Zéro texte statique n'est toléré dans l'application. `useTranslate()` permet un changement de langue instantané sans F5.

---

## 10. Les Différents Visages : Le Tenant et l'Admin

### Le Tenant Domain (La Vitrine Hyper-Personnalisée)
Situé dans `src/app/tenant/[domain]`. Le code scrute l'URL (ex: `hugo.qoe.fi`).
Le créateur personnalise son design, mais la plateforme permettra de **personnaliser les extensions d'éditeur** pour rendre sa page unique.

### L'Admin Dashboard (Le Cockpit Monastique)
Terminal Zinc-950 épuré. Lignes séparatrices quasi-invisibles (`border-white/5`). Navigation via `⌘+K`.

---

## 11. État des Lieux : Ce qui n'est PAS opérationnel

À ce jour, beaucoup d'éléments sont mockés visuellement :
1.  **La Timeline (`FeedDashboard`)** : Le flux est visuel, l'algorithme n'existe pas encore.
2.  **Les Notifications** : La cloche est là, le backend temps-réel (webhooks) ne l'est pas.
3.  **Les Statistiques** : Les graphiques sont fictifs.
4.  **Newsletters** : L'envoi physique d'emails n'est pas branché.

---

## 12. Axes Architecturaux à Creuser (Analytics & Open Source)

L'architecture analytique de qoe.fi est redoutable car elle couvre l'écosystème global ET les sous-domaines :
*   **Umami (Créateurs)** : Intégration sans cookie. Permettra à un créateur de savoir si quelqu'un a lu son Post, **même si vu sur le Feed Global (`/home`)** et pas sur son profil. Réconciliation totale de la donnée.
*   **PostHog (Admin qoe.fi)** : L'arme lourde (Funnels de conversion, Session Replay pour voir les créateurs galérer sur l'éditeur, Feature Flags pour activer des modules à 10% des users, User Paths).
*   **Supabase Realtime** : Rendre la Synchronicité absolue.

---

## 13. Directives Chirurgicales pour un Agent IA (CTO Prompt)

**À l'attention de l'Agent IA lisant cette documentation :**

L'ambition de `qoe.fi` est colossale. Nous refusons le code "Vibe-codé" générique. Si tu interviens, tu **DOIS** respecter ces protocoles martiaux :

### A. RÈGLE ABSOLUE : UTILISATION ET CONFIGURATION DES SERVEURS MCP
En tant qu'Agent IA, tu es équipé de "Serveurs MCP" (Model Context Protocol). **Tu as l'obligation contractuelle de les utiliser.**
*   Si tu dois intégrer un composant standard, invoque le MCP **`shadcn`** pour lire la doc ou générer la commande `add`.
*   Si tu as besoin d'un composant de pointe, interroge le MCP **`21st.dev`** pour extraire du code UI "Pro Max".
*   Si tu interviens sur la base de données ou l'authentification, interroge le MCP **`supabase`**.
*   **ORDRE FORMEL :** Si ces serveurs MCP ne sont pas configurés dans ton environnement ou s'il en manque un pour accomplir correctement la tâche, **TU DOIS LES CONFIGURER TOI-MÊME** (si tu en as les droits) ou demander explicitement et formellement à l'utilisateur de les installer/activer avant de commencer à coder à l'aveugle. Ne devine jamais un schéma Supabase ou un composant Shadcn si tu peux te connecter à la source de vérité.

### B. L'ÉTAPE ZÉRO : Configuration et Installation (Avant de Coder)
Tu ne peux pas faire de la magie sans outils. Si on te demande d'utiliser un composant externe (ex: un sheet Shadcn, Next Themes, Framer Motion), **tu dois impérativement configurer le projet en premier** :
1.  Vérifie `package.json` ou `components.json`.
2.  Installe les dépendances via le terminal (`npm install framer-motion next-themes` ou `npx shadcn@latest add dialog`).
3.  Configure les providers dans `layout.tsx` si nécessaire.
*Ne donne jamais un code utilisant une librairie externe sans t'assurer qu'elle est installée et paramétrée.*

### C. LE PROTOCOLE DE L'EXCELLENCE EXTERNE (Ne réinvente pas la roue)
Le CTO te l'ordonne : **Interdiction de concevoir from-scratch un élément complexe si une solution world-class existe déjà.** 
1.  **L'Architecture UI** : Utilise les *Templates Vercel* et *Linear (`linear.app`)* comme références mentales pour l'UX.
2.  **Les Composants** : Pille **Shadcn UI**, **UI-Layouts (`ui-layouts.com/components`)**, et **UIW (`uiw.tf`)**. 
3.  **Les Moteurs Spécifiques** :
    *   **Framer Motion (`motiondivision/motion`)** : Obligatoire pour l'inertie et le `AnimatePresence`.
    *   **Next Themes (`pacocoursey/next-themes`)** : Obligatoire pour le dark/light mode.
    *   **CMDK (`pacocoursey/cmdk` / `dip/cmdk`)** : Obligatoire pour les Command Palettes (le `⌘+K`).
4.  **Le Mindset** : Calibre ton cerveau sur `skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max`.

### D. LA LOI DE L'EXHAUSTIVITÉ IMPLICITE (Le Bon Sens Architecte)
**Le CTO n'a pas besoin de te donner 10 000 instructions pour que tu livres quelque chose de parfait.** Tu dois *impliquer* et développer l'écosystème entier d'une fonctionnalité.
*   *Exemple "Micro-posts Twitter"* : Tu dois coder l'UI, le backend complet (commentaires, vues, likes), le menu modération (les 3 points) PARTOUT, et assurer l'Ubiquité du composant (Timeline, Recommandations, Onglet Profil).
*   *Exemple "Settings"* : Tu codes les loaders, les Toasts, la mise à jour optimiste.
*   *Exemple "Draft"* : Tu codes l'auto-save, l'historique, la prévisualisation.

### E. Règle Front-end : MODULARITÉ ET REFUS DU HARDCODAGE
*   **INTERDICTION ABSOLUE DE HARDCODER DE LA DONNÉE, DES COULEURS OU DU TEXTE.** Chaque élément doit être dynamique, relié à la BDD, ou traduit via Tolgee (`useTranslate`). 
*   **Modulable par défaut** : Pense que chaque composant sera manipulé par le Créateur sur son propre domaine.

### F. Règle d'Or de l'UX : SYNCHRONICITÉ (Zéro F5)
*   Aucun lecteur ni créateur ne doit avoir besoin de rafraîchir la page. Utilise `revalidatePath`, `revalidateTag` ou `Supabase Realtime`.

### G. Règles d'Architecture Strictes
*   **Tab System (`useTabStore`)** : Ne casse JAMAIS le système d'onglets de `/home`. Appelle `addTab()` pour changer de page.
*   **Composants interactifs** : Ajoute `"use client"`.
*   **Prisma & Auth** : Interdiction d'attaquer Prisma depuis le client. Utilise des Server Actions (`actions.ts`). Fie-toi au **middleware** pour l'Auth.

---
*Ce document souverain a été généré via une analyse microscopique de la codebase de qoe.fi.*