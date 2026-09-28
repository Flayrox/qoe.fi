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

## Arrêt d'urgence global (`workers-email-kill`)

En plus du coupe-feu campagnes (`workers-newsletter-dispatch`), un arrêt
global coupe **tous** les envois d'e-mails portés par des workers :
newsletters (avec le même repli que le coupe-feu : retour DRAFT, SENT
conservés), confirmations, bienvenues et vagues (reconfirmation et envoi
encadré : mise en pause + événement tracé, reprise manuelle staff).

- Sémantique inversée et documentée aux deux endroits (Go + TS) : `true` =
  tout stopper, `false` (défaut) = envois autorisés.
- Les codes d'authentification ne passent par aucun worker (GoTrue direct) :
  ils ne sont jamais concernés — une suspension newsletter n'interrompt pas
  la récupération de compte, et un arrêt global non plus.
- Défaut sûr : sans pool, table absente ou erreur de lecture, les envois
  restent autorisés (même défaut que le coupe-feu existant ; quand la base
  est injoignable, les workers ne peuvent de toute façon rien envoyer).
- Confirmations/bienvenues : tâche consommée sans envoi, demande conservée
  (token intact, nouveau lien possible). Vagues : pause, jamais de clôture
  abusive — une vague en pause n'est pas une vague terminée.

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
