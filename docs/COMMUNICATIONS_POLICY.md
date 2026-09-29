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

## Centre de campagnes administratives (construit, migrations 00035–00036)

Avant lui, aucun moyen d'envoyer un message officiel ciblé — et surtout
aucune barrière contre un `sendAnyEmail(to, html)`. Ce centre est cette
barrière : catégories fermées (`legal.version_notice`, `staff.direct`,
`product.announcement`), audience générée côté serveur (jamais de CSV libre :
`all_active_users` ou abonnés actifs confirmés non supprimés d'une
publication), rédacteur ≠ approbateur (deux superadmins distincts, vérifié en
base), audience figée à l'approbation (snapshot critères + compteurs),
tranches de 100 avec délai sur file `default`, arrêt possible à tout moment
(pause, annulation avec motif, kill global).

- Variables sur liste blanche (`publication_name`, `unsubscribe_url`),
  substituées avec échappement ; toute autre forme `{{...}}` rejetée.
- Anglais obligatoire pour le légal (pas d'envoi si la traduction requise
  manque) ; FR par défaut documenté, EN si connue — pas de langue inventée.
- Désinscription en un clic réelle quand il y a une publication ; sans
  publication, pas d'en-tête mensonger (mention des préférences du compte).
- Opposition revérifiée à la matérialisation ET au claim ; `confirmedAt`
  jamais écrit par ce chemin.
- Note de réconciliation : la 00035 appliquée en base venait d'une version
  sans traductions ni compteur d'écartées ; la 00036 additive et idempotente
  apporte exactement ce delta (colonnes EN, `skippedCount`, contraintes).
  On ne réécrit jamais une migration appliquée.

| Méthode | Chemin | Accès |
|---|---|---|
| `GET/POST` | `/v1/admin/campaigns` | superadmin — liste / crée (brouillon) |
| `GET/PATCH` | `/v1/admin/campaigns/{id}` | superadmin — dossier / modifie (brouillon seul) |
| `POST` | `.../{id}/submit`, `.../approve`, `.../start` | superadmin — revue, approbation (second), envoi |
| `POST` | `.../{id}/pause`, `.../cancel` | superadmin — arrêt |

## Avis légaux : refus explicite (migration 00037)

Exiger une acceptation sans permettre un refus, c'est un consentement forcé :
le silence n'est ni un consentement ni un refus. `POST /v1/legal/decline-batch`
enregistre le refus d'une version publiée dans `legal_refusal` (qui, quelle
version, quand), idempotent, audité comme les acceptations — sans toucher aux
acceptations (refuser n'est pas « désaccepter ») et sans rien bloquer : export
de données et suppression de compte restent accessibles sans accepter.

`GET /v1/me/legal-pending` distingue désormais l'attente simple, le
dépassement de date d'effet sans acceptation (`pastEffective`, jamais une
valeur « accepted » créée par un cron) et le refus antérieur (`declinedAt`) :
un document refusé reste « sans acceptation » (pas de contournement) mais le
refus est visible (pas de relance aveugle).

## Langue par destinataire (`internal/comms`, pur et testé)

Chaîne de la fiche 04 §12, dans l'ordre : choix explicite → compte → abonnement
→ session/formulaire → défaut publication → défaut qoe.fi. Un Accept-Language
brut n'est qu'un repli de niveau session, jamais une préférence définitive.
Tags normalisés (`fr-FR` → `fr`), locale non supportée = descente de chaîne
(jamais de blocage), provenance conservée dans le résultat (la personne doit
pouvoir comprendre et changer la langue de ses e-mails).

État d'application : les inscriptions stockent déjà la locale de session
(`Subscriber.locale`, bornée fr/en) et les workers l'utilisent — conforme.
Les niveaux explicite/compte n'ont pas encore de source (aucune préférence de
langue côté compte) : le résolveur les appliquera dès qu'elle existera, sans
changer les appelants. Limite connue : `T()` retombe sur l'anglais pour toute
locale ≠ fr — sans effet tant que les locales restent fr/en, à revoir à
l'ajout d'une troisième langue, avec les modèles versionnés par langue qui
restent à construire (contenus FR/EN aujourd'hui en dur dans le moteur).

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
