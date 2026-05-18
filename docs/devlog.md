# Qoe.fi - Developer Log (Devlog)

Ce document sert de journal de bord technique (Devlog) pour tracer les décisions architecturales, les corrections de bugs complexes et l'évolution de la stack technique. Le `manifest.md` reste le document de référence pour la vision, tandis que ce fichier documente l'implémentation.

## Journal des modifications

### Session 1 - Mise en place de l'Architecture Dashboard
*Date : 18 Mai 2026*

**1. Structure du Routing (Next.js App Router)**
- **Problème** : Conflit de route sur `/`. Le fichier `app/(dashboard)/page.tsx` mappait directement sur la racine (`/`), écrasant potentiellement la landing page existante `app/page.tsx` ou retournant une erreur 404 lors de l'accès à `/dashboard`.
- **Solution** : Création d'un vrai sous-dossier de route `app/(dashboard)/dashboard/page.tsx`. Le groupe de route `(dashboard)` permet d'isoler le layout du dashboard, tandis que le dossier `dashboard/` définit formellement l'URL.

**2. Compatibilité React 19 & Radix UI (`asChild`)**
- **Problème** : Erreurs TypeScript signalant que la propriété `asChild` n'existe pas sur `SidebarMenuButton` ou `DropdownMenuTrigger`. Cela est dû à un problème de typage récurrent entre React 19 et le composant `Slot` de Radix UI.
- **Solution** : Ajout temporaire de `// @ts-expect-error React 19 Radix UI type mismatch` pour forcer le passage de TypeScript. L'attribut `asChild` est sémantiquement correct et fonctionne au runtime, mais les définitions TS de `@radix-ui/react-slot` doivent être mises à jour par la communauté.

**3. Composants Clients vs Serveurs**
- **Problème** : Erreur 500 sur la landing page car le composant `ProductPreview.tsx` utilisait un Hook (`useState`) sans la directive `"use client"`.
- **Solution** : Ajout de la directive `"use client"` en haut de `src/components/sections/ProductPreview.tsx`.

**4. Syntaxe Tailwind CSS v4**
- **Problème** : Warning sur `supports-[backdrop-filter]` dans le layout du dashboard.
- **Solution** : Mise à jour de la syntaxe vers `supports-backdrop-filter` en adéquation avec les nouvelles spécifications Tailwind v4.

---
