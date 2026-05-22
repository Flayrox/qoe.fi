# Prochaines Étapes (Next Steps)

Ce document liste les tâches restantes ou les chantiers à prioriser pour le prochain agent.

## 1. Intégration de l'API Brevo (Newsletter)
*   **Objectif** : Connecter l'infrastructure d'envoi d'emails.
*   **Actions** :
    *   Configurer l'API key Brevo via les variables d'environnement.
    *   Créer un service ou un module `features/newsletter/` pour gérer la création de contacts, l'envoi de campagnes et les webhooks (bounce, unsubscribe).
    *   Créer un widget d'inscription public pour collecter les emails depuis la page de lecture d'un article.

## 2. Monétisation (Stripe Connect)
*   **Objectif** : Mettre en place le moteur économique de qoe.fi (bootstrapping).
*   **Actions** :
    *   Configurer Stripe Connect Express pour que les créateurs puissent lier leur compte bancaire.
    *   Mettre en place le système de "Paywall Custom" avec Stripe Checkout.
    *   Gérer les webhooks d'abonnement pour attribuer le statut `isPremium` aux `Subscriber`.

## 3. Déploiement Multi-Tenant (Caddy Server)
*   **Objectif** : Finaliser l'infrastructure d'hébergement.
*   **Actions** :
    *   S'assurer que le middleware Next.js de gestion des sous-domaines (et domaines personnalisés) fonctionne parfaitement en production avec Vercel ou Coolify/Hetzner.
    *   Gérer la création dynamique des certificats SSL (On-Demand TLS).

## 4. Finalisation Tolgee (Localisation)
*   **Objectif** : Finaliser le support multilingue.
*   **Actions** :
    *   S'assurer que toutes les nouvelles clés ajoutées manuellement dans `messages/en.json` et `messages/fr.json` sont bien poussées/synchronisées sur le cloud Tolgee.
    *   Mettre en place un script npm local ou une intégration CI/CD avec le CLI Tolgee pour uploader et télécharger automatiquement les traductions avant le build de production.

## 5. Tests E2E et QA (Optionnel mais recommandé)
*   **Objectif** : Garantir la robustesse de l'architecture.
*   **Actions** :
    *   Déployer Playwright ou Cypress pour tester le tunnel de création de compte, l'éditeur d'articles, et le passage du paywall.
