# Politique d'envoi des communications (fiche 04, socle)

> Le moteur répond : « cette personne peut-elle recevoir ce message
> maintenant, et pourquoi ? » — `allow | defer | needs_review | suppress |
> cancel`, chacune avec un code de raison.

## Registre des types (`MessageTypePolicy`, migration 00034)

Chaque type émis est enregistré : famille, propriétaire métier, règle de base,
priorité, tracking, approbation staff requise ou non. Seed initial = les 11
types réellement émis (auth, confirm, welcome, newsletter, légal, staff,
produit, événements, support). Règle anti-détournement : le traitement dépend
du type enregistré, jamais d'une étiquette choisie dans l'interface.

**Tracking par défaut à `none` partout** : aucun pixel sans décision explicite
ni revue juridique (fiche 04 §8). Activer un tracking est une migration de
données, pas un interrupteur.

## Moteur (`internal/comms`, pur et testé sans DB)

Ordre : opposition (définitive) → suspension → approbation → budget.
Un type inconnu annule — on n'envoie jamais une finalité non enregistrée.
Opposition non consultée sur un envoi de liste = revue humaine, jamais
d'autorisation aveugle.

Point de conception : les messages de sécurité et de service lié partent dans
le cadre d'une relation existante — une désinscription newsletter ne les
neutralise jamais (sinon, signaler les e-mails de quelqu'un verrouillerait
son compte). Seule une suspension explicite les bloque.

## Opposition unifiée

`LookupSuppression` centralise la lecture (globale OU publication), réutilisée
par tous les chemins. Branchée à la matérialisation des campagnes
(`InsertNewsletterDeliveries`) et au claim de l'envoi encadré (écart avec
motif, sans réservation budget). La reconfirmation la revérifiait déjà à
l'envoi. Une erreur de lecture n'autorise jamais : la tranche échoue et
retente avec backoff plutôt que d'envoyer vers une opposition non vérifiée.

## Reste du chantier fiche 04 (ordre de la fiche §17)

1. Fiabilité : outbox transactionnelle + idempotence, files prioritaires,
   statuts honnêtes (`unknown` ≠ délivré), ingest DSN/plaintes async vers les
   compteurs existants, arrêt d'urgence global.
2. Centre de campagnes staff (catégories fermées, audience serveur, double
   validation, audience figée).
3. i18n par destinataire + modèles versionnés par langue (aujourd'hui FR/EN en
   dur dans `email_content.go`, blocage si traduction légale manquante).
4. Avis légaux 30 jours (rattacher le module `legal` existant, jamais
   d'acceptation auto).
5. Pixels : finalité délivrabilité séparée de l'éditorial, consentement
   distinct, retrait effectif — après revue juridique uniquement.
