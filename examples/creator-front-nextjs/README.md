# 🎨 Exemple — Front personnalisé de créateur (Next.js)

Consomme l'**API créateur qoe.fi** avec une clé API `qoe_live_…` pour
afficher automatiquement les derniers articles publiés sur qoe.fi dans
TON propre front : liste des derniers articles → clic → article complet.

## Démarrage

```bash
cp .env.example .env        # renseigne QOE_API_KEY
pnpm install                # ou npm install / bun install
pnpm dev                    # http://localhost:3005
```

> **Clé API** : Studio → Développeur → Clés API (demande d'accès API
> approuvée par un admin). Scopes nécessaires : `READ`.

## Ce que montre cet exemple

| Route | Appels API utilisés |
|---|---|
| `/` | `GET /v1/creator/me` + `GET /v1/creator/articles?limit=20` |
| `/articles/[slug]` | `GET /v1/creator/articles/{slug}` |

- La clé API reste **côté serveur** (Server Components) — jamais exposée au navigateur.
- Le détail renvoie **`contentHtml` ET `contentMarkdown`** (même contenu,
  deux formats) : cet exemple rend le HTML ; pour du Markdown, branche
  [`react-markdown`](https://github.com/remarkjs/react-markdown) sur
  `contentMarkdown`.
- Les articles co-écrits incluent tous leurs auteurs (`authors[]`).

## Aller plus loin

- `GET /v1/creator/highlights?article=slug` → citations des lecteurs à
  afficher en marge.
- Webhooks sortants (`article.published`, …) pour reconstruire le front
  à chaque publication plutôt qu'en polling.
