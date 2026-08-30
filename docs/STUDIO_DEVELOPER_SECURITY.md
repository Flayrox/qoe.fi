# Studio Developer — intégrations et sécurité

## Frontière fonctionnelle

Les paramètres personnels sont dans Settings. Les fonctions techniques liées à
une publication sont dans Studio > Developer :

- clés API ;
- webhooks et événements ;
- applications OAuth 2.1 / OpenID Connect qoe.fi ;
- scopes, rotation et révocation ;
- logs de livraison ;
- documentation d’intégration.

Settings affiche seulement des liens vers ces écrans et l’état de sécurité du
compte. Aucun secret ne doit être recopié dans Settings.

## Clés API

- préfixe `qoe_live_` ;
- secret affiché une seule fois ;
- hash SHA-256 conservé côté API ;
- scopes de moindre privilège (`READ`, `WRITE`, `ANALYTICS`) ;
- révocation explicite et auditée ;
- publication/workspace toujours vérifié côté serveur ;
- réauthentification et MFA recommandées avant création/révocation.

Ne jamais mettre une clé dans une URL, un log, un événement analytics ou une
capture de support. En cas de doute, révoquer puis recréer.

## Webhooks

- URL HTTPS obligatoire en production ;
- secret de signature livré une seule fois ;
- signature vérifiée avec tolérance temporelle limitée ;
- protection anti-rejeu via timestamp et identifiant d’événement ;
- événements idempotents ;
- retries avec backoff ;
- logs de livraison sans payload sensible ni secret ;
- bouton de test séparé et audité ;
- rotation et révocation du secret.

## Applications OAuth qoe.fi

La gestion détaillée reste sur `/developer/oauth`. Le backend Go est l’autorité
pour clients, PKCE, redirect URIs, codes et tokens.

Exigences :

- Authorization Code uniquement ;
- PKCE obligatoire ;
- correspondance exacte des redirect URIs ;
- scopes minimaux ;
- secrets clients hashés ;
- rotation refresh tokens ;
- révocation en cas de replay ;
- secret client affiché une seule fois ;
- réauthentification/MFA avant rotation ou suppression.

Voir `docs/OAUTH_PROVIDER.md` pour le contrat complet.

## Branchement avec Compte & sécurité

Avant toute action critique dans Studio :

1. vérifier que la session est valide ;
2. demander une réauthentification récente ;
3. exiger la MFA si le compte en possède une ;
4. journaliser l’action ;
5. envoyer une alerte de sécurité pour création, rotation ou révocation.

La révocation globale des sessions ou la suppression du compte doit aussi
révoquer les clés API et tokens OAuth associés selon la politique produit.

## Incidents

- clé API compromise : révocation immédiate, rotation et revue des logs ;
- secret webhook compromis : désactiver, régénérer, vérifier les retries ;
- client OAuth compromis : révoquer le client et tous ses tokens ;
- domaine compromis : retirer le domaine, invalider les sessions sensibles,
  vérifier les changements récents ;
- conserver les événements de sécurité 90 jours.

## Variables d’environnement

Les secrets d’API, OAuth et Supabase restent côté serveur. Les variables client
ne doivent contenir que des identifiants publics et URLs nécessaires. Les
secrets sont fournis par l’environnement de déploiement et tournés sans être
commités.
