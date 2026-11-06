# Import d’articles — plan de reprise

**Statut : suspendu.** Aucune route HTTP d’import d’articles n’est exposée.
Le code métier Go est conservé comme base de réflexion, mais il ne doit pas
être rebranché tel quel.

## 1. Pourquoi la fonctionnalité est coupée

La première version présentait trois défauts incompatibles avec une mise en
production :

- elle créait des articles avec `published = true` et `status = DRAFT`, alors
  que le feed, la page article et le sitemap ne filtraient que `published`.
  Des brouillons importés pouvaient donc être publics ;
- le chemin synchrone n’avait aucun plafond de volume. Un appel pouvait créer
  un nombre illimité d’articles ;
- l’interface promettait RSS/Atom, dates et couvertures, mais le parseur ne
  lisait que des `<item>` avec des expressions régulières et ne conservait ni
  date ni image. Les erreurs étaient silencieuses ou globales, jamais par
  article.

Le retrait des routes est volontairement brutal : aucun mode dégradé ne doit
laisser croire que l’import est simplement limité.

## 2. Résultat attendu de la refonte

Un créateur doit pouvoir importer un flux ou une archive, voir exactement ce
qui sera créé, corriger les erreurs, puis confirmer. Avant confirmation, aucun
article, aucun abonné et aucun email ne doit être produit.

La promesse produit est :

1. **Aperçu d’abord** : lecture du flux, normalisation et rapport avant toute
   écriture.
2. **Brouillons privés ensuite** : les articles créés restent invisibles
   jusqu’à validation explicite du créateur.
3. **Volume borné** : un plafond clair par import et par période, appliqué
   côté serveur, jamais seulement dans l’interface.
4. **Erreurs actionnables** : chaque entrée rejetée a une raison lisible et
   un index dans le fichier ou le flux.

## 3. Modèle de données cible

Ne pas réutiliser le job actuel sans le durcir. Prévoir :

- `ArticleImportJob` : publication, demandeur, source, statut, plafond,
  compteurs, date de création, date de fin, version du parseur ;
- `ArticleImportItem` : job, index source, URL canonique, titre, date,
  contenu normalisé, statut (`valid`, `duplicate`, `invalid`, `imported`),
  code d’erreur, message court ;
- un identifiant d’idempotence fourni par le client pour qu’un retry réseau
  ne crée pas deux jobs ;
- une empreinte de contenu (URL canonique + hash du corps) pour la
  déduplication par publication.

Les statuts du job doivent être explicites : `queued`, `fetching`, `parsing`,
`review`, `importing`, `completed`, `failed`, `cancelled`. Un job terminé ne
peut plus être repris ; un nouveau job est créé.

## 4. API cible

Un seul chemin asynchrone, avec des routes authentifiées et autorisées sur la
publication :

- `POST /v1/import/publications/{publicationId}/article-jobs` : crée un job
  avec `sourceUrl` ou une archive bornée. Réponse `202` + `jobId` ;
- `GET /v1/import/publications/{publicationId}/article-jobs/{jobId}` : état,
  compteurs et erreurs agrégées ;
- `GET .../{jobId}/items?cursor=...` : page d’aperçu, taille maximale fixe ;
- `POST .../{jobId}/confirm` : crée les articles sélectionnés en brouillons
  privés, de façon idempotente ;
- `POST .../{jobId}/cancel` : arrête le traitement et purge les données
  temporaires.

Contraintes obligatoires :

- plafond serveur (par exemple 500 articles par job, 3 jobs ouverts par
  publication, 20 000 entrées lues avant rejet) ;
- taille de réponse et durée de fetch bornées ;
- pas de mode synchrone, pas de route « import million » ;
- une seule confirmation possible ; un second appel renvoie le résultat du
  premier sans dupliquer ;
- le serveur ne fait jamais confiance au `published`, au `status` ou au
  `publicationId` fournis par le client.

## 5. Pipeline d’ingestion

1. **Création** : valider la publication et l’URL, réserver le quota, créer le
   job en `queued`.
2. **Fetch** : télécharger avec timeout, taille maximale, nombre de
   redirections borné et protection SSRF (pas d’IP privée, de loopback ni de
   métadonnées cloud).
3. **Parsing** : parseur XML en streaming, RSS 2.0 et Atom, encodages
   déclarés, `content:encoded`, dates normalisées en UTC.
4. **Normalisation** : titre, résumé, HTML nettoyé, URL canonique, image
   distante autorisée ou ignorée ; jamais de HTML arbitraire injecté.
5. **Déduplication** : URL canonique et empreinte de contenu, y compris face
   aux articles déjà présents dans la publication.
6. **Aperçu** : persister les items et leurs erreurs, calculer les compteurs,
   passer le job en `review`.
7. **Confirmation** : créer les articles sélectionnés en une transaction par
   lots, toujours en brouillon privé, puis passer le job en `completed`.

Le worker doit être reprenable : un job interrompu ne laisse pas d’articles
à moitié créés. Les étapes qui écrivent des articles sont idempotentes.

## 6. Interface Studio

L’onglet Import garde deux entrées : **Abonnés** (déjà encadré) et
**Articles** (suspendu). Quand la refonte sera prête :

1. écran de saisie de l’URL ou dépôt d’archive, avec le plafond affiché ;
2. écran d’aperçu paginé : compteurs, doublons, erreurs par ligne, sélection ;
3. bouton de confirmation unique, puis suivi du job et lien vers les
   brouillons créés.

Ne jamais afficher un bouton d’import avant que l’aperçu et le plafond soient
réellement disponibles côté serveur.

## 7. Sécurité et conformité

- autorisation `ActionImportRequest` sur la publication, pas seulement
  authentification ;
- quotas par publication et par utilisateur, journalisés ;
- aucune URL interne, aucun fichier local, aucun schéma autre que HTTP(S) ;
- taille maximale avant lecture complète en mémoire ;
- nettoyage HTML et URLs d’images ;
- suppression des données temporaires à la fin, à l’annulation ou après un
  délai maximal ;
- journaux sans contenu d’article ni données personnelles inutiles.

## 8. Déploiement progressif

1. **Interne** : feature flag serveur désactivé par défaut, tests sur une
   publication de test.
2. **Design partners** : 5 à 10 créateurs, plafond bas, feedback sur les
   erreurs de parsing.
3. **Général** : ouverture seulement si les métriques de sécurité et de
   qualité sont au vert.

Le flag doit pouvoir couper l’entrée **et** le worker sans redéploiement.
Conserver un bouton d’annulation et une alerte si le taux d’erreur dépasse un
seuil.

## 9. Tests d’acceptation

- un brouillon importé n’apparaît ni dans le feed, ni sur la page article, ni
  dans le sitemap ;
- 501 entrées dépassent le plafond et sont refusées avant toute écriture ;
- un flux lent, une réponse énorme, une IP privée et une redirection vers
  `localhost` sont refusés ;
- RSS et Atom, dates absentes ou invalides, HTML sale et doublons produisent
  un rapport par item ;
- un retry de confirmation ne crée pas de doublon ;
- un job annulé ne laisse aucun article et purge ses items ;
- un utilisateur sans droit sur la publication reçoit `403`.

## 10. Critères de réactivation

La fonctionnalité ne peut être rallumée que si :

- les routes ci-dessus existent et sont couvertes par des tests ;
- le plafond et l’aperçu sont visibles dans l’interface ;
- le parseur gère réellement RSS et Atom ;
- la visibilité des brouillons est prouvée par un test d’intégration ;
- le flag est désactivé par défaut et le plan de rollback est testé.

## 11. Hors périmètre

- import d’abonnés (déjà livré et encadré) ;
- import depuis une API tierce propriétaire ;
- synchronisation continue d’un flux ;
- republication automatique d’articles importés.

La synchronisation continue, si elle est demandée un jour, sera un produit
distinct : elle doit avoir ses propres quotas, son propre consentement et sa
propre gestion des mises à jour.
