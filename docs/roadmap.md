# Plan de Développement & Feuille de Route (Roadmap) - Qoe.fi

Ce document définit les étapes opérationnelles restantes pour mener à bien le développement de la plateforme **qoe.fi** de manière modulaire, souveraine et hautement performante.

---

## 🗺️ Phase 1 : Système Multi-Tenant Dynamique (`app/[domain]`)

Pour permettre aux créateurs de disposer de leur propre espace média accessible via un sous-domaine (ex: `manifeste.qoe.fi`) ou un domaine personnalisé (ex: `www.militant.fr`), Next.js doit intercepter l'URL hôte de la requête.

### Tâches à accomplir :
1. **Middleware Next.js pour le Multi-Tenancy** :
   - Modifier `src/middleware.ts` pour détecter le header `host`.
   - Exclure les domaines internes (`qoe.fi`, `localhost`, `vercel.app`).
   - Réécrire dynamiquement la route de manière transparente vers `src/app/[domain]/...`.
2. **Base de Données (Schéma de configuration média)** :
   - Ajouter un modèle `MediaConfig` (ou enrichir le modèle `User` dans `schema.prisma`) contenant :
     - `subdomain` (ex: `manifeste`) - Unique.
     - `customDomain` (ex: `www.militant.fr`) - Unique, optionnel.
     - `accentColor` (valeur hexadécimale de style brutbaliste/chaleureux).
     - `fontFamily` (choix restreint de polices comme Lora, Merriweather, Geist).
     - `logoUrl` et `heroText`.
3. **Routeur Dynamique `app/[domain]`** :
   - Implémenter la page d'accueil publique d'un média à l'adresse `src/app/[domain]/page.tsx`.
   - Implémenter la vue de lecture d'un article à l'adresse `src/app/[domain]/article/[slug]/page.tsx`.
   - Utiliser `prisma.user.findFirst` en filtrant sur `subdomain` ou `customDomain` pour extraire la configuration thématique et les articles du créateur.

---

## ✍️ Phase 2 : Enrichissement du Rich-Text Editor (TipTap)

Bien que l'éditeur brutbaliste TipTap soit fonctionnel, il doit intégrer des blocs avancés indispensables pour la mise en page d'articles de presse et de revues.

### Tâches à accomplir :
1. **Gestion des Médias (Upload direct dans Supabase Storage)** :
   - Configurer un bucket de stockage public `articles-media` dans Supabase.
   - Ajouter une extension TipTap `Image` personnalisée permettant d'uploader des images via Drag-and-Drop ou sélecteur de fichiers.
   - Implémenter une API Route Next.js (`src/app/api/articles/upload/route.ts`) sécurisée vérifiant la session Supabase avant d'écrire dans le stockage et de retourner l'URL de l'image.
2. **Blocs Spécifiques (Citations & Signatures)** :
   - Personnaliser les blocs de citation (`blockquote`) pour adopter un style éditorial (police Serif, bordures d'accent épaisses).
   - Intégrer un bloc "Appel à l'action" (CTA) dynamique incitant à s'abonner à la newsletter du média à la fin de l'article.
3. **Enregistrement des Brouillons (Auto-Save)** :
   - Implémenter un système d'auto-sauvegarde automatique côté client (debounce de 3 secondes) qui appelle le Server Action de mise à jour d'article pour éviter les pertes accidentelles d'écriture.

---

## 📬 Phase 3 : Campagnes & Système de Newsletters (Brevo)

Un média indépendant dépend de sa relation directe avec son audience via email, affranchi des algorithmes des réseaux sociaux.

### Tâches à accomplir :
1. **Intégration de l'API Brevo** :
   - Connecter le SDK Brevo avec la clé d'API.
   - Créer des listes d'audience dynamiques sous Brevo pour chaque créateur (par exemple, chaque créateur dispose de sa propre liste d'abonnés).
2. **Collecte d'Abonnés (Widget d'Inscription)** :
   - Créer un formulaire d'inscription minimaliste réutilisable sur les pages de lecture du média.
   - Envoyer les adresses email collectées vers la base de données PostgreSQL de Supabase (pour notre réputation d'audience locale) et synchroniser en arrière-plan vers la liste Brevo du créateur.
3. **Campagne Dispatcher (Envoi depuis l'Éditeur)** :
   - Ajouter une action "Publier & Envoyer par Email" dans l'éditeur.
   - Générer un modèle d'email HTML propre à partir du contenu JSON de l'éditeur TipTap.
   - Déclencher l'envoi de la campagne via l'API Brevo à tous les membres de la liste d'audience du créateur.

---

## 💳 Phase 4 : Monétisation Directe & Juste (Stripe Connect)

Pour permettre le bootstrapping et la rémunération des créateurs sans frais intermédiaires disproportionnés.

### Tâches à accomplir :
1. **Stripe Connect Express** :
   - Permettre aux créateurs de lier leur compte Stripe depuis l'onglet `Settings` (`src/app/(dashboard)/dashboard/settings/page.tsx`).
   - Utiliser Stripe Connect en mode Standard ou Express pour rediriger l'utilisateur vers son onboarding de facturation Stripe.
2. **Plans d'Abonnement (Paywall)** :
   - Ajouter un flag `premium` sur les articles.
   - Permettre aux créateurs de configurer un tarif mensuel/annuel pour leur lectorat.
   - Mettre en place un paywall dynamique côté public (`src/app/[domain]/article/[slug]/page.tsx`) masquant le contenu complet de l'article si l'utilisateur n'est pas authentifié avec un abonnement actif Stripe.
3. **Webhooks Stripe** :
   - Gérer les événements Stripe (`customer.subscription.created`, `customer.subscription.deleted`) pour mettre à jour les droits d'accès au niveau de notre table d'abonnements Supabase en temps réel.

---

## 📈 Phase 5 : Observabilité & Analyses Éthiques (Umami)

Une mesure saine du succès d'un média centrée sur la qualité et non sur la rétention addictive.

### Tâches à accomplir :
1. **Intégration d'Umami** :
   - Configurer le script léger Umami sur les pages publiques sans cookies intrusifs pour assurer la conformité RGPD par défaut.
2. **Visualisation des Métriques Créateur** :
   - Connecter le dashboard analytique (`src/app/(dashboard)/dashboard/analytics/page.tsx`) aux APIs de collecte d'Umami pour afficher les visiteurs uniques, les pages vues, et surtout le **Temps de lecture moyen (Time Well Spent)**.
   - Structurer les graphiques de performance avec Recharts en utilisant la charte graphique premium.
