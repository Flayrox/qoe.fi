# Politique de cookies et traceurs

*Dernière mise à jour : {{updatedAt}}*

Cette page explique comment qoe.fi utilise des cookies et technologies similaires (stockage local, pixels, identifiants d'appareil), et comment **accepter, refuser ou retirer** votre consentement à tout moment.

## 1. Ce qu'est un cookie

Un cookie est un petit fichier déposé sur votre terminal par un site web. Il permet de reconnaître votre navigateur, de maintenir votre session ouverte, de mémoriser vos préférences ou de mesurer l'audience. Les technologies équivalentes (localStorage, sessionStorage, identifiants d'appareil) suivent les mêmes règles de consentement.

## 2. Catégories utilisées

### 2.1. Strictement nécessaires — **sans consentement**

Ces traceurs sont indispensables au fonctionnement du service et ne peuvent pas être désactivés.

| Nom | Rôle | Durée |
|-----|------|-------|
| Session d'authentification | maintenir la connexion à votre compte | durée de la session / 30 jours si « rester connecté » |
| Jeton CSRF | protéger les formulaires contre les requêtes forgées | session |
| `qoe-docs-theme` | mémoriser le thème clair/sombre | persistant (localStorage) |
| `qoe_cookie_consent` | conserver votre choix sur les traceurs (nécessaire pour ne pas vous le redemander à chaque page) | 6 mois |
| Équilibrage et sécurité | répartir la charge, détecter les abus | session |

### 2.2. Mesure d'audience

| Nom | Finalité | Durée | Base |
|-----|----------|-------|------|
| Identifiant d'audience anonymisé | compter les visiteurs uniques, mesurer les pages vues et le temps de lecture | 13 mois maximum | consentement (traceur non essentiel) |
| Agrégats de lecture | alimenter les statistiques **des créateurs** sur leurs propres publications | 25 mois (agrégé) | consentement |

Les statistiques présentées aux créateurs sont **agrégées** et ne permettent pas de réidentifier un lecteur individuel.

### 2.3. Préférences fonctionnelles

| Nom | Finalité | Durée |
|-----|----------|-------|
| Langue, devise, fuseau | afficher le contenu dans la bonne langue et la bonne devise | 12 mois |
| Préférences de lecture (taille, police, lecteur audio) | confort de lecture | 12 mois |

### 2.4. Aucune publicité comportementale

qoe.fi **ne diffuse pas de publicité comportementale** et ne dépose aucun traceur publicitaire tiers. Aucun profil publicitaire n'est constitué ni transmis à des courtiers en données.

## 3. Consentement

- Lors de votre première visite, une bannière vous permet d'**accepter** ou de **refuser** les traceurs non essentiels, avec la même simplicité pour les deux choix.
- **Refuser est aussi simple qu'accepter** : un bouton unique « Tout refuser » est proposé au même niveau visuel.
- Aucun traceur non essentiel n'est déposé avant votre choix : le cookie `qoe_cookie_consent` est relu côté serveur et conditionne le chargement effectif de la mesure d'audience.
- Votre choix est conservé **6 mois** ; il vous est ensuite redemandé.
- Vous pouvez modifier votre choix à tout moment via **« Gérer mes cookies »** en pied de page.

Le consentement est enregistré avec sa date, sa version et votre choix, afin de pouvoir le prouver (obligation de preuve, art. 7 RGPD).

## 4. Paramétrage du navigateur

Vous pouvez également bloquer ou supprimer les cookies depuis les réglages de votre navigateur :

- **Chrome** : Paramètres → Confidentialité et sécurité → Cookies et autres données des sites
- **Safari** : Réglages → Safari → Confidentialité et sécurité
- **Firefox** : Paramètres → Vie privée et sécurité → Cookies et données des sites
- **Edge** : Paramètres → Cookies et autorisations de site

Le blocage des cookies strictement nécessaires empêche la connexion à votre compte.

## 5. Cookies tiers

Certains services tiers déposent des traceurs uniquement lorsque la fonctionnalité correspondante est utilisée :

| Service | Usage | Traceur | Consentement |
|---------|-------|---------|--------------|
| Stripe | paiement sécurisé des abonnements | cookies de fraude et de session de paiement | nécessaire à la transaction |
| Fournisseur d'envoi d'emails | mesure d'ouverture agrégée des newsletters | pixel de suivi | consentement (audience) |
| Hébergeur / CDN | diffusion des fichiers statiques | aucun traceur persistant | — |

## 6. Durées de vie

Aucun traceur non essentiel n'excède **13 mois**. Les données collectées via les traceurs sont conservées **25 mois** maximum, puis supprimées ou anonymisées.

## 7. Vos droits

Vous pouvez à tout moment demander l'accès, la rectification ou l'effacement des données issues des traceurs, et retirer votre consentement. Contact : **[EMAIL DPO]**. Réclamation possible auprès de la **CNIL** ou de l'autorité de contrôle compétente.

## 8. Modifications

Toute évolution significative de cette politique entraîne une nouvelle demande de consentement. L'historique des versions est public.
