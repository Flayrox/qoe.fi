"use server"

import { createClient as createServerClient } from "@qoe/supabase/server"
import { prisma } from "@qoe/db/client"
import { revalidatePath } from "next/cache"
import DOMPurify from "isomorphic-dompurify"

async function getAuthenticatedCreator() {
  const supabase = await createServerClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) throw new Error("Non authentifié")

  const dbUser = await prisma.user.findUnique({ where: { id: authUser.id } })
  if (!dbUser) throw new Error("Utilisateur introuvable")

  return dbUser
}

/**
 * 📦 Importer des abonnés depuis un fichier CSV (Substack / Mailchimp / Ghost)
 */
export async function importSubscribersCsvAction(csvText: string) {
  try {
    const creator = await getAuthenticatedCreator()

    if (!csvText || typeof csvText !== "string") {
      return { success: false, error: "Contenu CSV vide ou invalide" }
    }

    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) {
      return { success: false, error: "Fichier CSV vide" }
    }

    // Auto-detect header column index for email
    const headerLine = lines[0].toLowerCase()
    const headers = headerLine.split(/[,;\t]/).map(h => h.trim().replace(/^["']|["']$/g, ""))
    
    let emailIdx = headers.findIndex(h => h.includes("email") || h.includes("mail") || h.includes("adresse"))
    if (emailIdx === -1) {
      emailIdx = 0 // Fallback to first column
    }

    const startRow = headers.some(h => h.includes("email")) ? 1 : 0
    const emailsToImport: string[] = []

    for (let i = startRow; i < lines.length; i++) {
      const cols = lines[i].split(/[,;\t]/).map(c => c.trim().replace(/^["']|["']$/g, ""))
      const email = cols[emailIdx]
      if (email && email.includes("@") && email.includes(".")) {
        emailsToImport.push(email.toLowerCase())
      }
    }

    if (emailsToImport.length === 0) {
      return { success: false, error: "Aucune adresse email valide trouvée dans le CSV" }
    }

    // Deduplicate emails
    const uniqueEmails = Array.from(new Set(emailsToImport))
    let importedCount = 0

    for (const email of uniqueEmails) {
      await prisma.subscriber.upsert({
        where: {
          email_creatorId: {
            email,
            creatorId: creator.id
          }
        },
        update: {
          isActive: true
        },
        create: {
          email,
          creatorId: creator.id,
          isActive: true,
          status: "ACTIVE"
        }
      })
      importedCount++
    }

    revalidatePath("/audience")
    return { success: true, count: importedCount }
  } catch (err: any) {
    console.error("[CSV Import Error]", err)
    return { success: false, error: err.message || "Échec de l'importation CSV" }
  }
}

/**
 * 📰 Importer des articles depuis un flux RSS / Substack / Ghost URL
 */
export async function importRssFeedAction(rssUrl: string) {
  try {
    const creator = await getAuthenticatedCreator()

    if (!rssUrl || !rssUrl.startsWith("http")) {
      return { success: false, error: "URL de flux RSS invalide" }
    }

    const res = await fetch(rssUrl, {
      headers: {
        "User-Agent": "qoe-fi-importer/1.0 (+https://qoe.fi)"
      }
    })

    if (!res.ok) {
      return { success: false, error: `Impossible de récupérer le flux RSS (Statut ${res.status})` }
    }

    const xmlText = await res.text()

    // Extract items using regex matches for RSS/Atom tags
    const itemRegex = /<item[\s\S]*?<\/item>/gi
    const itemMatches = xmlText.match(itemRegex) || []

    if (itemMatches.length === 0) {
      return { success: false, error: "Aucun article trouvé dans ce flux RSS" }
    }

    let importedArticlesCount = 0

    for (const itemXml of itemMatches) {
      const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)
      const title = titleMatch ? titleMatch[1].trim() : "Article sans titre"

      const contentMatch =
        itemXml.match(/<content:encoded>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/i) ||
        itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)
      
      const rawContent = contentMatch ? contentMatch[1].trim() : ""
      if (!rawContent) continue

      // Sanitize HTML with DOMPurify
      const safeHtml = DOMPurify.sanitize(rawContent, {
        ALLOWED_TAGS: [
          "p", "br", "b", "i", "em", "strong", "a", "h1", "h2", "h3", "h4", "h5", "h6",
          "ul", "ol", "li", "blockquote", "code", "pre", "img", "figure", "figcaption", "hr"
        ],
        ALLOWED_ATTR: ["href", "src", "alt", "title", "target", "class"],
        ALLOW_DATA_ATTR: true
      })

      // Generate slug
      const slug = title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || `article-${Date.now()}`

      // Check if article with this slug already exists for creator
      const existing = await prisma.article.findUnique({
        where: {
          authorId_slug: {
            authorId: creator.id,
            slug
          }
        }
      })

      if (!existing) {
        await prisma.article.create({
          data: {
            title,
            slug,
            content: safeHtml,
            published: true,
            visibility: "PUBLIC",
            authorId: creator.id,
            readingTime: Math.max(1, Math.ceil(safeHtml.replace(/<[^>]+>/g, "").split(/\s+/).length / 200))
          }
        })
        importedArticlesCount++
      }
    }

    revalidatePath("/articles")
    return { success: true, count: importedArticlesCount }
  } catch (err: any) {
    console.error("[RSS Import Error]", err)
    return { success: false, error: err.message || "Échec de l'importation RSS" }
  }
}
