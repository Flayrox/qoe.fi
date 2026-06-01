# Fichiers archivés — Système d'onglets Zustand (Désactivé)

> **Date d'archivage** : 30 mai 2026
> **Raison** : Migration du système d'onglets Zustand vers un pattern de navigation plus simple (Sheet Overlay locale + navigation classique Next.js)

## Fichiers archivés

| Fichier | Rôle original | Statut |
|---------|--------------|--------|
| `TabBar.tsx` | Barre d'onglets horizontale permettant de naviguer entre Timeline, articles ouverts et profils | ❌ Désactivé |
| `TabViewManager.tsx` | Gestionnaire qui rendait le contenu de chaque onglet (timeline, article reader, profil) avec un effet stack 3D | ❌ Désactivé |
| `ArticleReaderView.tsx` | Vue de lecture d'un article ouverte dans un onglet | ❌ Désactivé |
| `ProfileTabReader.tsx` | Vue d'un profil créateur ouverte dans un onglet | ❌ Désactivé |

## Store Zustand associé

Le fichier `src/lib/use-tab-store.ts` existe toujours mais n'est plus importé par aucun composant actif. Il peut être supprimé ultérieurement si nécessaire.

## Contexte

L'ancien système utilisait `useTabStore` (Zustand) pour gérer un système d'onglets interne à `/home` :
- `addTab()` ouvrait un article ou un profil dans un nouvel onglet
- `TabViewManager` rendait le contenu avec un effet de stack 3D (feuille qui monte par-dessus)
- `TabBar` affichait les onglets en haut

Ce système a été remplacé par :
1. **Sheet Overlay locale** : un `useState` dans `FeedDashboard` + un composant `FeedOverlaySheet` (Framer Motion) pour l'ouverture d'articles/profils
2. **Navigation classique** : `router.push()` ou `window.location.href` pour les profils depuis la sidebar
