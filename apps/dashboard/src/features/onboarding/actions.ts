"use server"

import { prisma } from "@qoe/db/client"
import { getCurrentUser } from "@qoe/auth/current-user"
import { revalidatePath } from "next/cache"

const RESERVED_SUBDOMAINS = [
  "admin", "dashboard", "api", "feed", "landing", "auth", "login", 
  "register", "www", "support", "static", "qoe", "qoefi", "mail", 
  "assets", "blog", "help", "dev", "test", "status"
]

export async function checkSubdomainAction(subdomain: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")

  const cleanSubdomain = subdomain.trim().toLowerCase()

  const subdomainRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  if (!subdomainRegex.test(cleanSubdomain)) {
    return { available: false, error: "Format invalide (lettres minuscules, chiffres, tirets uniquement)." }
  }

  if (cleanSubdomain.length < 3 || cleanSubdomain.length > 30) {
    return { available: false, error: "Le sous-domaine doit faire entre 3 et 30 caractères." }
  }

  if (RESERVED_SUBDOMAINS.includes(cleanSubdomain)) {
    return { available: false, error: "Réservé par le système." }
  }

  const existingUser = await prisma.user.findFirst({
    where: { subdomain: cleanSubdomain },
  })

  if (!existingUser || existingUser.id === user.id) {
    return { available: true }
  }

  // Si pris, on génère des suggestions intelligentes
  const suggestions = [
    `the-${cleanSubdomain}`,
    `${cleanSubdomain}-blog`,
    `${cleanSubdomain}-officiel`,
    `${cleanSubdomain}-media`,
    `${cleanSubdomain}-mag`
  ]

  // On vérifie lesquelles sont vraiment disponibles en base
  const existingSuggestions = await prisma.user.findMany({
    where: { subdomain: { in: suggestions } },
    select: { subdomain: true }
  })
  
  const takenSet = new Set(existingSuggestions.map(u => u.subdomain))
  const availableSuggestions = suggestions.filter(s => !takenSet.has(s)).slice(0, 3)

  return { 
    available: false, 
    error: "Ce sous-domaine est déjà pris.",
    suggestions: availableSuggestions
  }
}

export async function completeOnboardingAction(data: {
  name: string
  heroText: string
  subdomain: string
  layoutStyle: string
  advancedSettingsMode: boolean
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")

  const check = await checkSubdomainAction(data.subdomain)
  if (!check.available) {
    throw new Error("Sous-domaine invalide ou indisponible.")
  }

  await prisma.$transaction(async (tx) => {
    // Mettre à jour l'utilisateur
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: data.name,
        heroText: data.heroText,
        subdomain: data.subdomain,
        layoutStyle: data.layoutStyle,
        advancedSettingsMode: data.advancedSettingsMode,
        hasCompletedOnboarding: true
      }
    })

    // Créer un premier brouillon "Bienvenue" si le créateur n'a pas d'articles
    const articleCount = await tx.article.count({ where: { authorId: user.id } })
    if (articleCount === 0) {
      await tx.article.create({
        data: {
          title: `Bienvenue sur l'espace de ${data.name}`,
          slug: "bienvenue-sur-mon-espace",
          content: `<p>Ceci est mon tout premier article sur <strong>qoe.fi</strong> ! Restez à l'écoute pour de prochaines publications.</p>`,
          authorId: user.id,
          published: false,
          seoTitle: `Bienvenue - ${data.name}`,
          seoDescription: data.heroText.slice(0, 150)
        }
      })
    }
  })

  revalidatePath("/dashboard")
  return { success: true }
}
