# Import de listes d'abonnés — quarantaine et revue staff

> **Importer n'est pas envoyer.** Déposer un CSV ne crée aucun contact, ne
> rattache rien à une publication et n'envoie aucun email. Le fichier part en
> quarantaine ; le staff décide du mode de traitement.

Ce document décrit la Tranche 4 (fiche 03). La construction suit l'ordre de
migration de la fiche : **fermer d'abord l'accès direct d'un import non revu à
l'envoi**, puis la quarantaine et les décisions, et seulement ensuite la
reconfirmation et l'envoi encadré.

## Ce qui a été corrigé (et pourquoi c'était grave)

`importSubscribersCsvAction` (Studio) lisait un CSV envoyé par le navigateur et
appelait `POST /v1/home/subscribe` **une fois par adresse**. Or cet endpoint
crée un abonné avec `confirmedAt = now()` et `receiveArticles = true`.

Conséquences cumulées :

- déposer un fichier suffisait à rendre des milliers d'adresses **immédiatement
  destinataires** de la prochaine campagne ;
- `confirmedAt` était renseigné alors que **personne n'avait confirmé** chez
  qoe.fi — un consentement fabriqué, non démontrable ;
- aucun contrôle de provenance, aucune permission dédiée, aucune trace, aucune
  revue ;
- la sélection d'envoi (`InsertNewsletterDeliveries`) filtre
  `confirmedAt IS NOT NULL` : ces adresses passaient donc le filtre.

L'action dépose désormais **un seul** appel vers la quarantaine. Un test verrouille
l'invariant : plus aucune référence à `/v1/home/subscribe` dans ce chemin.

## Modèle

| Table | Rôle |
|---|---|
| `SubscriberImportBatch` | Le lot : publication, demandeur, provenance déclarée, empreinte et version du fichier, état, bilan agrégé. |
| `SubscriberImportRow` | Une ligne par adresse, avec son verdict de quarantaine. Unique par `(batchId, email)`. |
| `SubscriberImportDecision` | Décision **immuable** (trigger `BEFORE UPDATE OR DELETE`), portant sur une version exacte du fichier. |
| `SubscriberImportEvent` | Journal du lot : dépôt, soumission, examen, décision. Base du futur chantier de recours. |
| `EmailSuppression` | Opposition durable : portée `global` ou `publication`. Survit à la suppression de l'abonné. |

Provenance conservée dans `SubscriberImportRow.subscriberId` : `Subscriber`
n'est **pas** modifié, donc aucune colonne nouvelle ne peut être confondue avec
une preuve de consentement.

## Quarantaine : ordre de priorité des verdicts

1. **Opposition** — présente dans `EmailSuppression` (globale ou pour la
   publication), ou abonné qoe.fi avec `isActive = false` /
   `receiveArticles = false` → `suppressed`. Dans ce second cas, l'opposition
   est **rendue durable** (`EmailSuppression`) : un réimport ultérieur du même
   CSV la retrouve même si l'abonné a été supprimé entre-temps.
2. **Contact déjà présent** → `already_subscribed`, jamais réécrit.
3. **Adresse nouvelle** → `pending_confirmation`.

Le point 3 est délibéré : une adresse nouvelle n'est **jamais** classée
`eligible_direct` d'office. Seule une décision staff peut élever un segment, ce
qui traduit dans la donnée le principe « confiance graduée, jamais automatique ».

Autres verdicts : `invalid` (adresse non exploitable), `duplicate` (compté dans
le bilan, sans ligne supplémentaire), `excluded` (retirée par le staff).

Limites : 8 Mio et 50 000 lignes par lot, 5 lots ouverts par publication, 2 000
exclusions par décision. Les cellules affichées à la revue sont neutralisées
(`=`, `+`, `-`, `@` préfixés) : un export de prestataire n'est pas une source
fiable pour un tableur.

## Machine à états du lot

```
draft ──▶ submitted ──▶ reviewing ─┬─▶ needs_info ──▶ submitted (nouvelle version)
                                  ├─▶ rejected
                                  ├─▶ approved_reconfirm ─┐
                                  └─▶ approved_direct ────┴─▶ running ──▶ completed
tout lot approuvé ──▶ suspended ──▶ reprise vers l'état approuvé précédent
```

`canTransition` est une table fermée : une transition absente est refusée, y
compris depuis l'API. Une décision qui ne désigne pas la **version courante**
du fichier (`fileVersion` + `fileFingerprint`) est rejetée : remplacer le CSV
après approbation réexamine le lot au lieu d'hériter de l'accord.

## Autorisation

- **Garde `import_request`** (`internal/authz`) : téléphone vérifié, step-up
  frais (N2), et permission média `subscribers:import_request`.
- Cette permission est **dédiée** : elle n'est pas impliquée par
  `media:manage_newsletter`, `media:publish:any` ni `api_keys:manage`. Seul le
  propriétaire l'a par défaut ; elle s'accorde ou se retire par override.
- Le service vérifie lui-même la permission sur la publication, la complétude
  des déclarations et les limites : le garde juge le **niveau de preuve**, le
  service juge ce que le garde ne peut pas savoir. Aucune politique n'est
  écrite deux fois.

## Routes

| Méthode | Chemin | Accès |
|---|---|---|
| `POST` | `/v1/import/publications/{publicationId}/subscribers` | demandeur autorisé (garde `import_request`) |
| `GET` | `/v1/import/subscribers` | demandeur — ses lots |
| `GET` | `/v1/import/subscribers/{id}` | demandeur — bilan et décisions communicables |
| `GET` | `/v1/admin/import/subscribers` | superadmin — file de revue |
| `GET` | `/v1/admin/import/subscribers/{id}` | superadmin — dossier complet |
| `POST` | `/v1/admin/import/subscribers/{id}/claim` | superadmin — « en examen » |
| `POST` | `/v1/admin/import/subscribers/{id}/decide` | superadmin — décision |

La publication figure dans le **chemin** du dépôt, et non dans le corps, pour que
le garde puisse résoudre la permission média depuis l'URL. Un identifiant qui ne
voyagerait que dans le corps ne serait résolu par personne, et le refus par
défaut s'appliquerait faute de permission connue.

## Délibérément non construit

Aucun chemin d'envoi n'existe pour un lot importé, et c'est l'état visé à ce
stade. `approved_reconfirm` et `approved_direct` sont des décisions
enregistrées **sans effet d'envoi** : le modèle d'éligibilité reste
`confirmedAt IS NOT NULL`, donc aucun contact importé n'est destinataire tant
qu'il n'a pas confirmé lui-même, et **aucune décision staff ne peut fabriquer
cette confirmation**.

## Branche de reconfirmation individuelle (migration 00032, construite)

Un lot `approved_reconfirm` ne rend aucun contact destinataire : chaque adresse
doit confirmer elle-même via le lien existant (`/v1/newsletters/confirm`).

| Brique | Rôle |
|---|---|
| `SubscriberImportReconfirmWave` | Vague plafonnée (taille bornée, une seule active par lot). |
| `SubscriberImportReconfirmRequest` | Une adresse, une empreinte de jeton unique, un état (`pending` → `sent` → `confirmed`, ou `expired`/`skipped`). |
| File asynq dédiée `reconfirm` | Les reconfirmations ne partagent ni la file ni le rythme du bulk/newsletter ; tranches de 100 avec 60 s entre tranches. |
| `POST /v1/admin/import/subscribers/{id}/reconfirm` | Ouvre une vague (idempotent : renvoie la vague active au lieu de doubler). |
| `GET .../reconfirm`, `POST .../reconfirm/purge` | Suivi et purge des demandes échues. |

Garanties : jeton 256 bits à usage unique rattaché à (publication, email) —
le lien vérifie déjà ce triplet et consomme le jeton ; activation uniquement au
clic (la vague crée des abonnés **inactifs**, seul `ConfirmSubscriber` franchit
`confirmedAt`, imputé ensuite aux compteurs de vague) ; opposition et état de
l'abonné **revérifiés au moment de l'envoi** (une plainte entre-temps gagne
contre la vague) ; vague en pause si le lot est suspendu/rejeté ; purge efface
les jetons des non-confirmés sans créer d'opposition (ne pas répondre ≠
refuser).

## Envoi encadré `approved_direct` (construit, migration 00033)

Un lot `approved_direct` autorise une campagne initiale plafonnée, sans clic
individuel — l'opération la plus dangereuse du plan, qui n'existe que parce que
la quarantaine, la décision immuable et la reconfirmation existent déjà.

- **Budget atomique** (`ImportSendBudget`, un seul par lot) : le plafond est
  consommé par `UPDATE ... WHERE consumed + n <= cap` en une seule requête.
  Deux workers concurrents ne dépassent jamais, même en course.
- **Vagues plafonnées** (`ImportSendWave`, une seule active par lot) : snapshot
  du segment `eligible_direct`, tranches de 100 avec 60 s entre tranches, file
  asynq dédiée `import_send`. Rejeu idempotent (contrainte unique par vague et
  email, `FOR UPDATE SKIP LOCKED`).
- **`confirmedAt` jamais écrit par ce chemin** : l'approbation est une preuve
  séparée (lot + décision). Le lien « confirmer » de l'e-mail reste la seule
  voie vers `confirmedAt`, via le chemin normal — et chaque envoi crée
  l'abonné inactif porteur d'un jeton frais pour que ce clic fonctionne.
- **Éligibilité revérifiée à l'envoi** : opposition, état de l'abonné (jamais
  d'écrasement d'un contact devenu connu), lot non suspendu, budget restant.
- **Suspension automatique** sur seuils (rejets durs, plaintes, échecs,
  échantillon minimum) : vague en pause, lot suspendu, décision système tracée,
  reprise staff explicite uniquement. Les retours async (DSN/plaintes, fiche 04)
  brancheront les mêmes compteurs plus tard — en attendant, les rejets durs
  SMTP synchrones alimentent déjà la suspension.
- **Quotas séparés** : tables, compteurs et file propres aux listes fraîches —
  jamais mélangés aux campagnes créateur normales (`NewsletterDelivery`).
- **Arrêt d'urgence** : le flag `workers-newsletter-dispatch` coupe tout, et
  chaque tranche revérifie le statut du lot (un lot suspendu met sa vague en
  pause au lieu d'envoyer).
- L'e-mail est un message de présentation standard et versionné (bilingue FR/EN
  dans le même corps — la langue du destinataire est inconnue, l'inventer
  serait malhonnête), qui dit pourquoi la personne le reçoit, propose de
  confirmer, et offre une désinscription évidente.

| Méthode | Chemin | Accès |
|---|---|---|
| `POST` | `/v1/admin/import/subscribers/{id}/send-wave` | superadmin — ouvre une vague (idempotent) |
| `GET` | `/v1/admin/import/subscribers/{id}/send-waves` | superadmin — suivi, budget, compteurs |
| `POST` | `/v1/admin/import/subscribers/{id}/send-waves/{waveId}/cancel` | superadmin — annule (les `queued` sont écartés, jamais repris) |

Console staff (`apps/admin/imports`, superadmin uniquement) : file des lots en
attente, dossier complet (bilan de quarantaine, provenance et signaux,
historique des décisions avec motifs internes, journal), formulaire de décision
(version + empreinte pré-remplies, motifs séparés, plafonds, exclusions),
ouverture de vagues de reconfirmation et d'envoi, purge des demandes échues,
annulation de vague. Les lectures passent par `admin-data.ts`, les écritures
par des server actions SDK (`safeAction`, `revalidatePath`) — jamais d'appel
direct au backend depuis les composants.

Reste à construire : le rattachement du dispositif au chantier support et
recours (les décisions ont déjà identifiant, motifs séparés, auteur et
chronologie — les points d'ancrage prévus par la fiche 03 §11).

## Vérifications

```bash
cd apps/api
go test ./internal/modules/imports/ ./internal/authz/ ./internal/middleware/
go run ./cmd/migrate up     # migration 00031

cd apps/studio
pnpm vitest run src/app/\(creator\)/import/__tests__/actions.test.ts
```

Les tests Go couvrent le parsing CSV (en-tête, déduplication, adresses
douteuses), la neutralisation des cellules, l'empreinte de version, la machine à
états et les déclarations obligatoires. Les tests Studio verrouillent
l'invariant : un seul appel, vers la quarantaine, et aucune activation
d'abonné.
