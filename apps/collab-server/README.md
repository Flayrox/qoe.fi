# 🧵 @qoe/collab-server — Serveur de collaboration temps réel

Serveur **Hocuspocus (Yjs)** qui synchronise la co-édition des articles du
dashboard (extension TipTap `Collaboration`). Chaque article est un document
Yjs nommé `article:{id}`, persisté en binaire dans Postgres
(table `collab_documents`).

## Lancement

```bash
# Dev (avec pnpm + turbo) :
DATABASE_URL="postgresql://…" SUPABASE_URL="https://….supabase.co" \
  pnpm --filter @qoe/collab-server dev

# Ou via le monorepo (il lit le .env copié par scripts/copy-env.js) :
pnpm dev
```

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `COLLAB_PORT` | Port WebSocket (défaut `1234`) |
| `DATABASE_URL` | Postgres/Supabase — persistance des documents Yjs |
| `SUPABASE_URL` | Introspection JWT (`GET /auth/v1/user`) |
| `COLLAB_MAX_DOCUMENT_BYTES` | Taille max d'un document (défaut 8 Mo) |

Sans `DATABASE_URL`, le serveur démarre avec une persistance **mémoire**
(perdue au redémarrage) — pratique pour tester.

## Sécurité

- Chaque connexion WebSocket est authentifiée par **JWT Supabase**
  (validation par introspection, même source de vérité que l'API Go).
- Les noms de documents contiennent l'UUID d'article (non devinable).
- La taille de document est plafonnée.

## Intégration dashboard

Le client (`@hocuspocus/provider`) est branché dans
`apps/dashboard/src/features/editor/components/Editor.tsx` :

- URL du serveur : `NEXT_PUBLIC_COLLAB_URL` (ex: `ws://localhost:1234`)
- Token : session Supabase du navigateur
- Curseurs : `@tiptap/extension-collaboration-cursor`
- Compteur d'éditeurs : awareness Yjs

## Limites / prochaines étapes

- **Permissions** : pour l'instant tout utilisateur authentifié peut éditer un
  document dont il connaît le nom. À durcir : vérifier l'appartenance à la
  publication dans `onLoadDocument` (via Prisma).
- **Backup/export** : l'état canonique pour le public reste le JSON TipTap
  sauvegardé par le dashboard ; le document Yjs est un brouillon de travail.
