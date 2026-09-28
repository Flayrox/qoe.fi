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

Restent à construire, dans cet ordre : la branche de reconfirmation individuelle
(vagues plafonnées, file dédiée, jeton à usage unique par publication), puis
l'exception d'envoi encadré (quotas atomiques, surveillance des rejets et
plaintes, suspension automatique), et enfin le rattachement du dispositif au
chantier support et recours.

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
