import type { QuotedArticleData } from '@qoe/ui/social';
import { uploadComposerImages } from '../composer-upload';
import type { ComposedPost, CreatedPostRecord, ThreadNode } from './types';

export function toComposedPost(
  firstCreatedPost: CreatedPostRecord,
  quotedExcerpt: string | null,
  quotedArticle: QuotedArticleData | null
): ComposedPost {
  return {
    id: firstCreatedPost.id,
    title: '',
    slug: `post-${firstCreatedPost.id}`,
    content: firstCreatedPost.content,
    imageUrl: firstCreatedPost.imageUrl || null,
    quotedExcerpt: quotedExcerpt || null,
    articleQuote: quotedArticle,
    published: true,
    isPremium: false,
    readingTime: 1,
    createdAt: firstCreatedPost.createdAt ?? new Date().toISOString(),
    author: {
      id: firstCreatedPost.author?.id ?? '',
      name: firstCreatedPost.author?.name ?? null,
      username: firstCreatedPost.author?.username ?? null,
      subdomain: firstCreatedPost.author?.subdomain ?? null,
      customDomain: null,
      logoUrl: firstCreatedPost.author?.logoUrl ?? null,
      heroText: null,
      isCertified: firstCreatedPost.author?.isCertified || false,
    },
    repost: firstCreatedPost.repost
      ? {
          ...firstCreatedPost.repost,
          createdAt: firstCreatedPost.repost.createdAt || firstCreatedPost.createdAt,
          author: {
            ...firstCreatedPost.repost.author,
            isCertified: firstCreatedPost.repost.author?.isCertified || false,
          },
        }
      : null,
    parent: firstCreatedPost.parent
      ? {
          ...firstCreatedPost.parent,
          author: {
            ...firstCreatedPost.parent.author,
            isCertified: firstCreatedPost.parent.author?.isCertified || false,
          },
        }
      : null,
    category: { name: 'Thought' },
    tags: firstCreatedPost.tags || [],
  };
}

export async function buildThoughtsPayload(
  finalNodes: ThreadNode[],
  quotedArticleId: string | null,
  quotedExcerpt: string | null,
  onProgress: (message: string) => void
) {
  const thoughtsPayload = [];

  for (let i = 0; i < finalNodes.length; i++) {
    const node = finalNodes[i];
    const textContent = node.text.trim();

    onProgress(`Préparation et envoi des images (${i + 1}/${finalNodes.length})...`);

    const uploadedUrls = await uploadComposerImages(node.images);
    const imagePayload = uploadedUrls.length > 0 ? JSON.stringify(uploadedUrls) : null;
    const attachmentPayload = node.images.map((img, idx) => ({
      url: uploadedUrls[idx] || img.url,
      type: 'IMAGE' as const,
      altText: img.altText || undefined,
      order: idx,
    }));

    const tags = textContent.match(/#[a-zA-Z0-9_-]+/g) || [];
    const validPollOptions = node.pollOptions.map((o) => o.trim()).filter(Boolean);
    const pollPayload =
      node.showPollEditor && validPollOptions.length >= 2
        ? { options: validPollOptions, durationHours: node.pollDurationHours }
        : null;

    thoughtsPayload.push({
      content: textContent,
      tags,
      imageUrl: imagePayload,
      quotedArticleId: i === 0 ? quotedArticleId : null,
      quotedExcerpt: i === 0 ? quotedExcerpt : null,
      attachments: attachmentPayload,
      triggerWarning:
        node.isTriggerWarning && node.triggerWarning.trim() ? node.triggerWarning.trim() : null,
      poll: pollPayload,
    });
  }

  return thoughtsPayload;
}
