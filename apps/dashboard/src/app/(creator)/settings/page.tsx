// =====================================================================
// 🖥️ Server Component — apps/dashboard/src/app/(creator)/dashboard/settings/page.tsx
// =====================================================================
// Page de configuration créateur : récupère l'état initial complet depuis la base de données
// (incluant les articles pour l'édition directe en place) et initialise le QOE Studio.
// =====================================================================

import { redirect } from "next/navigation"
import { prisma } from "@qoe/db/client"
import { createClient } from "@qoe/supabase/server"
import CreatorStudio, { CreatorProfile } from "@/features/settings/components/creator-studio"

export default async function CreatorSettingsPage() {
  // 1. Authentification de l'utilisateur
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/login")
  }

  // 2. Récupération des informations du créateur, de ses liaisons et de ses articles
  const creator = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      navigation: {
        orderBy: { order: "asc" }
      },
      socialLinks: {
        orderBy: { order: "asc" }
      },
      articles: {
        orderBy: { createdAt: "desc" }
      },
      categories: {
        orderBy: { name: "asc" }
      }
    }
  })

  if (!creator) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border rounded-2xl bg-destructive/5 border-destructive/10">
        <h2 className="text-lg font-bold text-destructive">Profil créateur introuvable</h2>
        <p className="text-sm text-muted-foreground mt-1">Veuillez contacter le support si l'erreur persiste.</p>
      </div>
    )
  }

  // 3. Mapping sécurisé vers un objet sérialisable (sans dates ni objets complexes)
  const initialCreatorData: CreatorProfile = {
    id: creator.id,
    email: creator.email,
    username: creator.username,
    name: creator.name,
    heroText: creator.heroText,
    accentColor: creator.accentColor,
    fontFamily: creator.fontFamily,
    themeMode: creator.themeMode || "classic",
    layoutStyle: creator.layoutStyle || "minimal",
    logoUrl: creator.logoUrl,
    headerImageUrl: creator.headerImageUrl,
    footerText: creator.footerText,
    seoTitle: creator.seoTitle,
    seoDescription: creator.seoDescription,
    allowIndexing: creator.allowIndexing,
    supportUrl: creator.supportUrl,
    subdomain: creator.subdomain,
    customDomain: creator.customDomain,
    navigation: creator.navigation.map(nav => ({
      id: nav.id,
      label: nav.label,
      url: nav.url,
      order: nav.order,
      isExternal: nav.isExternal
    })),
    socialLinks: creator.socialLinks.map(social => ({
      id: social.id,
      platform: social.platform,
      url: social.url,
      order: social.order
    })),
    articles: creator.articles.map(article => ({
      id: article.id,
      title: article.title,
      slug: article.slug,
      content: article.content,
      published: article.published,
      isPremium: article.isPremium,
      categoryId: article.categoryId,
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
      createdAt: article.createdAt.toISOString() // Sérialisation sécurisée en string ISO
    })),
    categories: creator.categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug
    })),
    advancedSettingsMode: creator.advancedSettingsMode
  }

  return <CreatorStudio initialCreator={initialCreatorData} />
}
