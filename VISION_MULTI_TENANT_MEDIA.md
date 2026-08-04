# 🚀 Vision Produit & Architecture : Créateur Multi-Médias & Réglages Unifiés — qoe.fi

> **Document de référence pour la vision long-terme de qoe.fi**
> 
> *Ce document consigne la vision stratégique d'indépendance entre l'Identité Créateur/Utilisateur et les Organisations Médias qu'il gère ou pour lesquelles il rédige.*

---

## 1. Concept de Créateur Multi-Médias (Multi-Tenant Media Collaboration)

### 👤 L'Entité Créateur / Utilisateur
- Un utilisateur est une **personne unique** avec une identité propre (`User`).
- Il possède son compte personnel, son e-mail de connexion, son mot de passe et son portefeuille (`qoe.fi/settings`).
- **Création de Médias en 1 Clic** : Un créateur peut **créer un ou plusieurs nouveaux médias** (journal, magazine, revue) directement depuis son compte personnel, sans devoir recréer un compte supplémentaire ni passer par un compte admin spécial.
- **Un créateur peut être propriétaire de son média personnel ET rédacteur/contributeur pour 3 autres médias simultanément**.

### 📰 L'Entité Média / Publication
- Un média est une **organisation / publication indépendante** (`Media / Publication`).
- Un média possède son sous-domaine (`*.qoe.fi`), son domaine personnalisé (`journal.com`), son design system (*Visual Studio*), son SEO, ses abonnés et son équipe de rédacteurs.
- Les réglages du Dashboard Studio (`dashboard.qoe.fi/settings`) sont réservés à la gestion d'un média spécifique.
- Un créateur a des rôles distincts selon le média (*Writer*, *Creator*, *Advanced*).

### 🎛️ Sélecteur de Contexte de Travail
Dans la barre supérieure et la sidebar, le commutateur **[Writer | Creator | Advanced]** permet de basculer instantanément de vue :
- **Writer** : Espace d'écriture et de rédaction d'articles/brouillons pour les médias auxquels le créateur contribue.
- **Creator** : Espace de gestion éditoriale, programmation, newsletters et analytics du média sélectionné.
- **Advanced** : Réglages avancés de la publication (domaines, clés API, membres de l'équipe, monétisation Stripe).

---

## 2. Découpe Canonique des Réglages (Settings)

### A. `qoe.fi/settings` (Hub Compte Utilisateur — Feed Lecteur)
Dédié exclusivement à la **gestion du compte personnel** :
- **Profil Utilisateur** : Nom personnel, photo d'identité, biographie personnelle.
- **Sécurité & Accès** : Adresse e-mail principale, mot de passe, connexions.
- **Portefeuille & Abonnements** : Solde du wallet, transactions, newsletters suivies.
- **Confidentialité & RGPD** : Mots masqués, utilisateurs bloqués, export portable JSON des données.
- **Affichage & Accessibilité** : Mode dys, taille de police, langue globale (Tolgee).

### B. `dashboard.qoe.fi/settings` (Studio du Média Actif)
Dédié exclusivement à la **configuration du Média sélectionné** :
- **Visual Studio & Design Média** : Thèmes de publication, palette de couleurs, typographies, logo du média, image d'en-tête.
- **Identité Web** : Sous-domaine `.qoe.fi`, domaine personnalisé (`customDomain`).
- **SEO & Référencement Média** : Titre SEO, meta description, indexation search engine.
- **Structure Média** : Liens sociaux du média, catégories, menu de navigation.
- **Pont vers le compte** : Redirection directe vers `qoe.fi/settings` pour toute modification du compte personnel (e-mail, mot de passe).

---

## 3. Feuille de Route d'Harmonisation Design System

Actuellement, l'application `apps/feed` et l'application `apps/dashboard` ont été développées à des périodes différentes. 

### Étape 1 : Unification des Réglages & Redirection
- Redirection propre des réglages compte depuis le Studio vers `qoe.fi/settings`.
- Pont de navigation fluide entre le Dashboard Studio et le Hub Compte.

### Étape 2 : Alignement du Design System (`design/DESIGN.md`)
- Adoption de la **Sidebar Apple-Style dépolie et flottante** (`AppleSidebar`) sur les Réglages et sur l'ensemble de `apps/feed`.
- Harmonisation des tokens sémantiques Layer 2 (`bg-background`, `bg-card`, `bg-sidebar`, `border-border/40`).
- Suppression des résidus de styles hétérogènes.
