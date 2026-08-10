"use server"

import { createClient as createServerClient } from "@qoe/supabase/server"
import { prisma } from "@qoe/db/client"
import { revalidatePath } from "next/cache"

async function getAuthenticatedUser() {
  const supabase = await createServerClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) throw new Error("Non authentifié")

  const dbUser = await prisma.user.findUnique({ where: { id: authUser.id } })
  if (!dbUser) throw new Error("Utilisateur introuvable")

  return dbUser
}

/**
 * 🤝 Envoyer une demande de collaboration/co-rédaction sur un article
 */
export async function sendCollaborationRequestAction(articleId: string, inviteeEmail: string) {
  try {
    const inviter = await getAuthenticatedUser()

    if (!inviteeEmail || !inviteeEmail.includes("@")) {
      return { success: false, error: "Adresse email invalide" }
    }

    const article = await prisma.article.findUnique({ where: { id: articleId } })
    if (!article) {
      return { success: false, error: "Article non trouvé" }
    }

    if (article.authorId !== inviter.id) {
      return { success: false, error: "Seul l'auteur principal de l'article peut inviter des co-auteurs" }
    }

    const invitee = await prisma.user.findUnique({ where: { email: inviteeEmail } })
    if (!invitee) {
      return { success: false, error: "Aucun utilisateur trouvé avec cet email" }
    }

    if (invitee.id === inviter.id) {
      return { success: false, error: "Vous ne pouvez pas vous envoyer une invitation à vous-même" }
    }

    const request = await prisma.collaborationRequest.upsert({
      where: {
        articleId_inviteeId: {
          articleId,
          inviteeId: invitee.id
        }
      },
      update: {
        status: "PENDING",
        inviterId: inviter.id
      },
      create: {
        articleId,
        inviterId: inviter.id,
        inviteeId: invitee.id,
        status: "PENDING",
        showOnPublicProfile: true
      }
    })

    revalidatePath("/advanced")
    return { success: true, request }
  } catch (err: any) {
    console.error("[Send Collaboration Request Error]", err)
    return { success: false, error: err.message || "Échec de l'envoi de l'invitation" }
  }
}

/**
 * 📩 Répondre à une demande de collaboration (Accepter / Refuser + Option Profil Public)
 */
export async function respondToCollaborationRequestAction(
  requestId: string,
  accept: boolean,
  showOnPublicProfile: boolean = true
) {
  try {
    const user = await getAuthenticatedUser()

    const request = await prisma.collaborationRequest.findUnique({
      where: { id: requestId },
      include: { article: true }
    })

    if (!request) {
      return { success: false, error: "Demande introuvable" }
    }

    if (request.inviteeId !== user.id) {
      return { success: false, error: "Vous n'êtes pas le destinataire de cette invitation" }
    }

    const nextStatus = accept ? "ACCEPTED" : "DECLINED"

    await prisma.collaborationRequest.update({
      where: { id: requestId },
      data: {
        status: nextStatus,
        showOnPublicProfile
      }
    })

    if (accept) {
      // Add user to article coAuthors relation
      await prisma.article.update({
        where: { id: request.articleId },
        data: {
          coAuthors: {
            connect: { id: user.id }
          }
        }
      })
    } else {
      // Disconnect user from article coAuthors
      await prisma.article.update({
        where: { id: request.articleId },
        data: {
          coAuthors: {
            disconnect: { id: user.id }
          }
        }
      })
    }

    revalidatePath("/advanced")
    return { success: true }
  } catch (err: any) {
    console.error("[Respond Collaboration Error]", err)
    return { success: false, error: err.message }
  }
}

/**
 * 📥 Récupérer les demandes de collaboration reçues et envoyées
 */
export async function getCollaborationRequestsAction() {
  try {
    const user = await getAuthenticatedUser()

    const received = await prisma.collaborationRequest.findMany({
      where: { inviteeId: user.id },
      include: {
        article: {
          select: { id: true, title: true, slug: true }
        },
        inviter: {
          select: { id: true, name: true, email: true, username: true }
        }
      },
      orderBy: { createdAt: "desc" }
    })

    const sent = await prisma.collaborationRequest.findMany({
      where: { inviterId: user.id },
      include: {
        article: {
          select: { id: true, title: true, slug: true }
        },
        invitee: {
          select: { id: true, name: true, email: true, username: true }
        }
      },
      orderBy: { createdAt: "desc" }
    })

    return { success: true, received, sent }
  } catch (err: any) {
    console.error("[Get Collaboration Requests Error]", err)
    return { success: false, error: err.message, received: [], sent: [] }
  }
}
