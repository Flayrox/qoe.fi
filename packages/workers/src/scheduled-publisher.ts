import { prisma } from "@qoe/db/client"

/**
 * ⏰ Scheduled Article Publisher Worker
 * Inspects database every minute for articles whose scheduledAt date has arrived,
 * updates them to published = true, status = "PUBLISHED", and triggers fan-out.
 */
export async function publishScheduledArticles() {
  try {
    const now = new Date()

    const pendingArticles = await prisma.article.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: {
          lte: now
        }
      },
      select: {
        id: true,
        title: true,
        authorId: true
      }
    })

    if (pendingArticles.length === 0) {
      return { publishedCount: 0 }
    }

    let publishedCount = 0

    for (const article of pendingArticles) {
      await prisma.article.update({
        where: { id: article.id },
        data: {
          published: true,
          status: "PUBLISHED"
        }
      })
      publishedCount++
      console.log(`[SCHEDULED PUBLISHER] Published article "${article.title}" (ID: ${article.id})`)
    }

    return { publishedCount }
  } catch (error) {
    console.error("[SCHEDULED PUBLISHER ERROR]", error)
    throw error
  }
}
