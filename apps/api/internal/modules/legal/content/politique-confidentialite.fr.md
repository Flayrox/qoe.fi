# Politique de confidentialité

*Dernière mise à jour : {{updatedAt}}* · *Entrée en vigueur : {{effectiveAt}}*

Cette politique explique **quelles données qoe.fi collecte, pourquoi, pendant combien de temps et avec qui**, conformément au Règlement général sur la protection des données (règlement (UE) 2016/679, « **RGPD** ») et à la loi Informatique et Libertés.

## 1. Responsable du traitement

Le responsable de traitement est :

**[RAISON SOCIALE]** — [ADRESSE]
Représentée par [REPRÉSENTANT LÉGAL]
Point de contact protection des données : **[EMAIL DPO]**

Un délégué à la protection des données (DPO) [est désigné / n'est pas désigné] et peut être contacté à l'adresse ci-dessus.

> **Créateurs et médias** : lorsqu'un créateur collecte lui-même des données auprès de son audience (formulaire externe, base CRM, newsletter envoyée depuis son propre outil), il agit comme **responsable de traitement indépendant**. L'Accord de traitement des données et la liste des Sous-traitants encadrent alors la relation.

## 2. Données collectées

| Catégorie | Données | Finalité |
|-----------|---------|----------|
| **Compte** | email, mot de passe (haché), nom affiché, pseudonyme, avatar, préférences de langue et de thème | créer et sécuriser le compte, personnaliser l'interface |
| **Profil public** | bio, site web, réseaux sociaux, logo, bannière, sous-domaine, publications | afficher l'identité publique choisie |
| **Contenus** | articles, réflexions, surlignages, commentaires, brouillons, fichiers envoyés | publier, sauvegarder, synchroniser |
| **Audience** | adresses email des abonnés, statut d'abonnement, préférences d'envoi, listes de désabonnement | livrer les newsletters, gérer les consentements |
| **Paiement** | identifiant client Stripe, identifiant d'abonnement, montants, devise, statut, dernier chiffre et marque de carte ; **jamais le numéro complet** | encaisser les abonnements et verser les revenus |
| **Navigation** | adresse IP (tronquée quand c'est possible), agent utilisateur, pages consultées, durée de lecture, référent | sécurité, mesure d'audience agrégée, anti-abus |
| **Technique** | journaux applicatifs, erreurs, identifiants de requête, empreinte d'appareil pour la sécurité | diagnostic, prévention de la fraude et du scraping |
| **Support** | contenu des échanges avec l'équipe support | traiter la demande |
| **Légal** | horodatage et version exacte des documents acceptés (CGU, confidentialité, cookies) | prouver le consentement (obligation de preuve) |

Nous ne collectons **pas** de données de catégories particulières (santé, origine, opinions politiques, orientation sexuelle) et n'encourageons pas leur publication. Nous ne vendons **jamais** vos données.

## 3. Bases légales

| Traitement | Base légale (art. 6 RGPD) |
|------------|---------------------------|
| Création et gestion du compte, fourniture du service | exécution du contrat (6.1.b) |
| Paiement des abonnements et versement des revenus | exécution du contrat (6.1.b) + obligation légale comptable (6.1.c) |
| Emails transactionnels (confirmation, réinitialisation, reçus, alertes de sécurité) | exécution du contrat (6.1.b) |
| Newsletters et notifications marketing | consentement (6.1.a), révocable à tout moment |
| Mesure d'audience agrégée | intérêt légitime (6.1.f) à connaître l'usage du service, avec minimisation |
| Lutte contre la fraude, le scraping et les abus | intérêt légitime (6.1.f) + obligation de sécurité (art. 32) |
| Conservation des preuves d'acceptation légale | obligation légale (6.1.c) |
| Modération et traitement des signalements | obligation légale DSA (6.1.c) + intérêt légitime |

## 4. Durées de conservation

| Donnée | Durée |
|--------|-------|
| Compte actif | tant que le compte existe |
| Compte inactif (sans connexion ni publication) | suppression ou anonymisation après **36 mois** d'inactivité, après un email d'avertissement |
| Contenus publiés | jusqu'à leur suppression par l'auteur ou la fermeture du compte |
| Sauvegardes | 30 jours glissants maximum |
| Journaux techniques et sécurité | 12 mois |
| Preuves de consentement légal | **5 ans** après la fin de la relation (prescription civile) |
| Pièces comptables et fiscales | 10 ans (obligation légale) |
| Signalements et décisions de modération | 3 ans |
| Données de paiement | selon Stripe Payments Europe et les obligations comptables |

## 5. Destinataires et sous-traitants

Les données sont accessibles uniquement :

- aux membres habilités de l'équipe qoe.fi, selon le principe du moindre privilège ;
- aux **sous-traitants** techniques listés publiquement dans la page *Sous-traitants* (hébergement, stockage, email, paiement, envoi de notifications), chacun lié par un accord de traitement (art. 28 RGPD) ;
- aux créateurs, pour les données de **leur propre** audience (abonnés, statistiques de lecture de leurs publications), dans la limite de ce qui est nécessaire ;
- aux autorités administratives ou judiciaires, sur réquisition légale.

Aucune donnée n'est cédée, louée ou échangée à des fins publicitaires.

## 6. Transferts hors Union européenne

L'hébergement principal est situé dans l'**Union européenne**. Si un sous-traitant implique un transfert hors UE, celui-ci est encadré par :

- une **décision d'adéquation** de la Commission européenne, ou
- les **clauses contractuelles types** (2021/914) complétées, le cas échéant, par des mesures techniques supplémentaires (chiffrement en transit et au repos, minimisation, pseudonymisation).

La liste des sous-traitants précise, pour chacun, la localisation et le mécanisme de transfert.

## 7. Sécurité

Mesures mises en œuvre, proportionnées aux risques :

- chiffrement en transit (TLS 1.2+) et au repos ;
- mots de passe stockés avec un algorithme de dérivation résistant (bcrypt/argon2) ;
- cloisonnement multi-locataire des publications, isolation par identifiant de publication ;
- authentification à clé API avec scopes (`READ`, `WRITE`, `ANALYTICS`), rotation et révocation immédiate ;
- journal d'audit des actions sensibles d'administration ;
- limitation de débit, protection contre les injections et les accès non autorisés ;
- sauvegardes chiffrées et procédures de restauration testées ;
- principe du moindre privilège pour les accès internes.

En cas de violation de données susceptible d'engendrer un risque élevé pour les droits et libertés, les personnes concernées sont informées **sans délai injustifié**, et la notification à l'autorité de contrôle ([CNIL] ou autorité compétente) est effectuée dans les **72 heures**.

## 8. Vos droits

Vous disposez des droits suivants :

| Droit | Ce que cela signifie |
|-------|----------------------|
| **Accès** (art. 15) | obtenir une copie des données vous concernant |
| **Rectification** (art. 16) | corriger des données inexactes |
| **Effacement** (art. 17) | demander la suppression, sous réserve des obligations légales |
| **Portabilité** (art. 20) | recevoir vos données dans un format structuré et lisible par machine |
| **Limitation** (art. 18) | geler un traitement contesté |
| **Opposition** (art. 21) | vous opposer aux traitements fondés sur l'intérêt légitime, dont la prospection |
| **Retrait du consentement** | à tout moment, pour les traitements qui en dépendent, sans rétroactivité |
| **Directives post-mortem** | définir le sort de vos données après votre décès (droit français) |

**Exercice** : écrivez à **[EMAIL DPO]** ou depuis les réglages du compte (export et suppression en libre-service). Réponse sous **1 mois**, prolongeable de 2 mois en cas de demande complexe, avec information préalable.

**Réclamation** : vous pouvez saisir l'autorité de contrôle de votre lieu de résidence, notamment la **CNIL** (France) — cnil.fr — ou l'autorité de l'État membre où se situe l'établissement concerné.

## 9. Mineurs

Le service n'est pas destiné aux personnes de moins de 16 ans. Si nous apprenons qu'un compte a été créé par un mineur de moins de 16 ans sans autorisation du représentant légal, il est suspendu et les données sont supprimées.

## 10. Cookies et traceurs

Les cookies et technologies similaires sont décrits dans la **Politique de cookies**, qui précise leur finalité, leur durée et la manière de retirer son consentement à tout moment.

## 11. Emails et délivrabilité

- Les emails **transactionnels** (sécurité, reçus, confirmations) sont indispensables au service et ne peuvent être désactivés qu'en fermant le compte.
- Les emails **d'audience** (newsletters, notifications de publication) sont envoyés sur la base du consentement ou de l'intérêt légitime selon le canal, avec un **lien de désabonnement en un clic** conforme à la RFC 8058 dans chaque message.
- Les statistiques d'ouverture et de clic sont agrégées ; les créateurs y accèdent uniquement pour leur propre audience.

## 12. Modifications

Toute modification substantielle est notifiée au moins **30 jours** avant son entrée en vigueur, avec la possibilité de refuser en fermant son compte. L'historique des versions reste consultable sur la page publique du document.
