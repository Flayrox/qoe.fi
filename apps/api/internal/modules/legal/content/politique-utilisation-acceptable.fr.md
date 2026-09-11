# Politique d'utilisation acceptable

*Dernière mise à jour : {{updatedAt}}*

Cette politique précise ce qui est **interdit** sur qoe.fi, que ce soit via l'interface, l'API, les newsletters ou tout autre canal du service. Elle complète les Conditions générales d'utilisation et s'applique à tous les comptes, y compris les médias et les intégrations tierces.

## 1. Contenus interdits

Sont interdits, en publication comme en message privé :

1. **Sécurité des personnes** : incitation à la violence, menaces crédibles, harcèlement, doxxing (publication de données permettant d'identifier ou de localiser une personne), apologie du terrorisme ou de crimes contre l'humanité.
2. **Mineurs** : tout contenu d'exploitation sexuelle, y compris les représentations générées par IA. Tolérance zéro : signalement immédiat aux autorités et fermeture du compte.
3. **Haine et discrimination** : propos déshumanisants, promotion de la supériorité d'un groupe, négation de crimes reconnus.
4. **Atteintes aux droits** : contrefaçon, violation du droit d'auteur ou des marques, atteinte à la vie privée, diffamation.
5. **Fraude** : escroqueries, faux avis, fausses promesses d'investissement, schémas pyramidaux, usurpation d'identité, faux badges de certification.
6. **Manipulation de l'information** : contenus délibérément falsifiés diffusés comme authentiques, réseaux de faux comptes, faux engagement acheté.
7. **Contenus réglementés** : vente de médicaments, d'armes, de drogues, d'espèces protégées ou de services sexuels, sans base légale.
8. **Malveillance** : logiciels malveillants, hameçonnage, chaînes de messages, exploitation de vulnérabilités.

## 2. Comportements interdits

- Créer plusieurs comptes pour contourner une sanction, un quota ou un blocage.
- Usurper l'identité d'un créateur, d'un média, d'une institution ou d'une personne réelle.
- Extraire massivement des données (scraping) ou reconstituer une base de données à partir du service.
- Perturber le service : déni de service, requêtes automatisées hors quotas, tests d'intrusion sans autorisation écrite.
- Contourner la facturation, les limitations de débit, l'authentification ou les contrôles d'accès.
- Revendre l'accès, ouvrir un service concurrent à partir des données de qoe.fi.
- Utiliser l'API pour du spam, du phoning, de l'enrichissement de bases tierces ou du profilage publicitaire.

## 3. Règles spécifiques à l'API et aux intégrations

- **Clés personnelles et clés média** : une clé n'agit que pour sa publication. La partager avec un tiers non habilité est interdit.
- **Scopes** : utiliser une clé `WRITE` là où une clé `READ` suffit constitue une mauvaise pratique ; en cas de compromission, la clé doit être **révoquée immédiatement**.
- **Rotation** : lors d'une rotation, l'ancienne clé doit être retirée après la période de grâce.
- **CORS public** : le point d'inscription public (`/v1/publications/{slug}/subscribe`) doit être utilisé pour recueillir des **consentements volontaires**. Y injecter des listes achetées est interdit.
- **Quotas** : respecter les limites documentées. Les dépassements répétés peuvent entraîner un blocage de la clé, puis du compte.
- **Webhooks** : valider systématiquement la signature HMAC et ne jamais réutiliser un secret compromis.

## 4. Emails et audience

- Consentement préalable obligatoire pour tout envoi marketing (opt-in), preuve conservée.
- Lien de **désabonnement en un clic** fonctionnel dans chaque message (RFC 8058) et traitement immédiat.
- Interdiction d'importer des adresses achetées, louées ou collectées sans base légale.
- Taux de plainte élevé, adresses pièges ou rebonds excessifs entraînent une suspension de l'envoi.

## 5. Signalement et traitement

- Tout utilisateur peut signaler un contenu (bouton **Signaler** ou [EMAIL SIGNALEMENT]).
- L'équipe accuse réception sans délai et applique des **mesures graduées** : avertissement, réduction de visibilité, retrait, restriction temporaire, suspension.
- Les mesures sont **motivées** et notifiées, avec un recours possible à [EMAIL RECOURS] (réponse sous 15 jours ouvrés).
- Les cas graves (contenus d'exploitation de mineurs, menace imminente) sont transmis aux autorités compétentes.

## 6. Sanctions

| Gravité | Exemple | Mesure |
|---------|---------|--------|
| Mineure | spam ponctuel, mention commerciale non déclarée | avertissement + retrait |
| Modérée | harcèlement ciblé, contournement de quota d'API | restriction temporaire (7 à 30 jours) |
| Grave | fraude, atteinte aux droits répétée | suspension du compte, versements gelés |
| Critique | exploitation de mineurs, terrorisme | fermeture définitive + signalement aux autorités |

Les revenus issus d'une activité frauduleuse ne sont pas versés et peuvent être remboursés aux lecteurs.

## 7. Coopération avec les autorités

qoe.fi répond aux réquisitions légales valides. Les demandes concernant des données hébergées pour le compte d'un créateur sont transmises à ce dernier, sauf interdiction légale.

## 8. Contact

Signalements : **[EMAIL SIGNALEMENT]** · Recours : **[EMAIL RECOURS]** · Sécurité (vulnérabilités) : **[EMAIL SECURITY]** (divulgation responsable, aucune action judiciaire contre un chercheur agissant de bonne foi).
