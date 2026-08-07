import { Job } from "bullmq";
import { MeiliSearch } from "meilisearch";
import { prisma } from "@qoe/db/client";

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
  apiKey: process.env.MEILI_MASTER_KEY || "qoe_master_key_123",
});

export const MEILI_INDEX = "articles";

export async function setupMeilisearch() {
  try {
    const index = client.index(MEILI_INDEX);
    await index.updateSettings({
      searchableAttributes: ["title", "content", "seoTitle", "seoDescription"],
      filterableAttributes: ["authorId", "categoryId", "isPremium", "published"],
      sortableAttributes: ["createdAt", "updatedAt"],
      typoTolerance: {
        enabled: true,
        minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 },
      },
    });
    console.log("[Meilisearch] Index settings configured successfully.");
  } catch (error) {
    console.error("[Meilisearch] Error configuring index:", error);
  }
}

interface SyncJobData {
  articleId: string;
  action: "upsert" | "delete";
}

export async function processMeilisearchSyncJob(job: Job<SyncJobData>) {
  const { articleId, action } = job.data;
  const index = client.index(MEILI_INDEX);

  try {
    if (action === "delete") {
      await index.deleteDocument(articleId);
      console.log(`[Meilisearch] Deleted document ${articleId}`);
      return { success: true, action };
    }

    if (action === "upsert") {
      const article = await prisma.article.findUnique({
        where: { id: articleId },
      });

      if (!article) {
        console.warn(`[Meilisearch] Article ${articleId} not found for upsert.`);
        await index.deleteDocument(articleId);
        return { success: true, action: "delete" };
      }

      await index.addDocuments([
        {
          id: article.id,
          title: article.title,
          content: article.content,
          slug: article.slug,
          authorId: article.authorId,
          categoryId: article.categoryId,
          published: article.published,
          isPremium: article.isPremium,
          seoTitle: article.seoTitle,
          seoDescription: article.seoDescription,
          createdAt: article.createdAt.getTime(),
          updatedAt: article.updatedAt.getTime(),
        },
      ]);
      console.log(`[Meilisearch] Upserted document ${articleId}`);
      return { success: true, action };
    }
  } catch (error) {
    console.error(`[Meilisearch] Error processing job for article ${articleId}:`, error);
    throw error;
  }
}
