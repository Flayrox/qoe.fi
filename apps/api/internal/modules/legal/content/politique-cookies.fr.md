# Politique de cookies et traceurs

*Dernière mise à jour : {{updatedAt}}*

Cette page explique comment qoe.fi utilise des cookies et technologies similaires (stockage local, pixels, identifiants d'appareil). Elle a changé de nature : **aucun traceur non essentiel n'est plus déposé aujourd'hui**, la mesure d'audience est devenue anonyme et sans cookie, et il n'existe donc plus de bannière de consentement bloquante. Le droit de **s'opposer** à la mesure, lui, reste entier.

## 1. Ce qu'est un cookie

Un cookie est un petit fichier déposé sur votre terminal par un site web. Il permet de reconnaître votre navigateur, de maintenir votre session ouverte, de mémoriser vos préférences ou de mesurer l'audience. Les technologies équivalentes (localStorage, sessionStorage, identifiants d'appareil) suivent les mêmes règles.

## 2. Ce qui est déposé aujourd'hui

### 2.1. Strictement nécessaires — **sans consentement**

Ces traceurs sont indispensables au fonctionnement du service et ne peuvent pas être désactivés.

| Nom | Rôle | Durée |
|-----|------|-------|
| Session d'authentification | maintenir la connexion à votre compte | durée de la session / 30 jours si « rester connecté » |
| Jeton CSRF | protéger les formulaires contre les requêtes forgées | session |
| `qoe.theme` / `qoe.locale` | mémoriser le thème clair/sombre et la langue | jusqu'à effacement |
| `qoe_cookie_consent` | conserver votre éventuelle opposition à la mesure d'audience | 6 mois |
| Équilibrage et sécurité | répartir la charge, détecter les abus | session |

### 2.2. Mesure d'audience — **exemptée de consentement**

La mesure d'audience fonctionne **sans aucun cookie** et **sans lire ni écrire dans le stockage de votre navigateur**. L'adresse IP que votre connexion rend techniquement nécessaire est **anonymisée avant tout enregistrement** : elle est transformée à sens unique, n'est jamais écrite dans nos bases et n'est jamais conservée, même tronquée. Les paramètres de requête et les fragments d'URL ne sont pas collectés, et le réglage « Do Not Track » de votre navigateur est respecté.

Cette combinaison de garanties (finalité unique, pas d'accès au terminal, anonymisation préalable, aucun croisement avec un autre traitement, aucune transmission à un tiers, statistiques agrégées) la place dans le régime de dispense de consentement prévu à l'**article 82, II de la loi Informatique et Libertés** : vous n'avez donc pas à cliquer sur quoi que ce soit pour en bénéficier.

| Nom | Finalité | Durée |
|-----|----------|-------|
| Mesure d'audience (auto-hébergée en UE) | compter les visites, pages vues et provenances | 12 mois (agrégé) |
| Agrégats de lecture | alimenter les statistiques **des créateurs** sur leurs propres publications | 12 mois (agrégé) |

Les statistiques présentées aux créateurs sont **agrégées** et ne permettent pas de réidentifier un lecteur individuel.

### 2.3. Préférences de confort — **parce que vous les demandez**

| Nom | Finalité | Durée |
|-----|----------|-------|
| Langue, devise, fuseau | afficher le contenu dans la bonne langue et la bonne devise | 12 mois |
| Préférences de lecture (taille, police, lecteur audio) | confort de lecture | 12 mois |

Ces préférences ne sont enregistrées que parce que **vous les choisissez** (thème, langue, taille de texte) : elles servent la fonctionnalité que vous avez demandée et non une finalité de suivi.

### 2.4. Aucune publicité comportementale

qoe.fi **ne diffuse pas de publicité comportementale** et ne dépose aucun traceur publicitaire tiers. Aucun profil publicitaire n'est constitué ni transmis à des courtiers en données. Une catégorie « publicité et réseaux sociaux » reste décrite dans « Gérer mes traceurs » **vide**, uniquement pour qu'un futur traceur de ce type y soit rattaché — et exige alors, lui, un consentement préalable.

## 3. Information, opposition, et pourquoi il n'y a plus de bannière

- Il n'y a **plus de bannière de consentement**, parce qu'il n'y a plus aucun traceur dont le dépôt en dépende. Une bannière qui demanderait d'autoriser ce qui ne nécessite aucune autorisation serait un faux choix.
- Un **avis d'information** s'affiche au premier passage : il explique la mesure anonyme en une phrase et propose **« M'y opposer »** en un clic.
- **S'opposer est aussi simple que consulter** : l'opposition coupe immédiatement le script côté navigateur *et* le rend côté serveur ; aucune donnée n'est plus transmise.
- Votre opposition est conservée **6 mois** ; passé ce délai, la mesure anonyme reprend et l'avis est reproposé.
- Vous gardez la main à tout moment via **« Gérer mes cookies »** en pied de page, où figure la liste des traceurs réellement déposés.
- Une **opposition exprimée du temps de l'ancienne bannière reste effective** : elle n'est pas convertie en accord par le changement de régime.

Chaque décision (information lue, opposition, retour en arrière) est journalisée avec sa date, la version de cette politique et les catégories concernées : c'est votre preuve autant que la nôtre.

## 4. Paramétrage du navigateur

Vous pouvez également bloquer ou supprimer les traceurs depuis les réglages de votre navigateur :

- **Chrome** : Paramètres → Confidentialité et sécurité → Cookies et autres données des sites
- **Safari** : Réglages → Safari → Confidentialité et sécurité
- **Firefox** : Paramètres → Vie privée et sécurité → Cookies et données des sites
- **Edge** : Paramètres → Cookies et autorisations de site

Le blocage des cookies strictement nécessaires empêche la connexion à votre compte.

## 5. Traceurs tiers

Certains services tiers déposent des traceurs lorsque la fonctionnalité correspondante est utilisée :

| Service | Usage | Traceur | Base |
|---------|-------|---------|------|
| Stripe | paiement sécurisé des abonnements | cookies de fraude et de session de paiement | nécessaire à la transaction |
| Fournisseur d'envoi d'e-mails | acheminement des e-mails de service | aucun traceur de suivi | — |
| Hébergeur / CDN | diffusion des fichiers statiques | aucun traceur persistant | — |

La mesure d'audience n'est **pas** un service tiers : elle est auto-hébergée sur notre propre infrastructure, dans l'Union européenne.

## 6. Durées de vie

Aucun traceur non essentiel n'existe aujourd'hui. Les agrégats de mesure d'audience sont conservés **12 mois**, puis supprimés. Les durées sont revues automatiquement à chaque échéance réglementaire par notre outillage de conformité.

## 7. Vos droits

Vous pouvez à tout moment demander l'accès, la rectification ou l'effacement des données issues de la mesure d'audience, vous opposer à cette mesure, ou retirer un consentement donné le cas échéant. Contact : **[EMAIL DPO]**. Réclamation possible auprès de la **CNIL** ou de l'autorité de contrôle compétente.

## 8. Modifications

Toute évolution significative de cette politique est publiée comme une nouvelle version, avec son historique public. Nous ne la modifions pas en silence : le compteur de version est visible dans le centre de préférences.
