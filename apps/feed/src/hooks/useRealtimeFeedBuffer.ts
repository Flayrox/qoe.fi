"use client";

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@qoe/supabase/client";
import { feedKeys } from "@qoe/api-client";
import type { ThoughtData } from "@qoe/api-client";

export interface UseRealtimeFeedBufferOptions {
  enabled?: boolean;
  type?: "for-you" | "following" | "highlights";
}

export function useRealtimeFeedBuffer({
  enabled = true,
  type = "for-you",
}: UseRealtimeFeedBufferOptions = {}) {
  const queryClient = useQueryClient();
  const [unreadPostsBuffer, setUnreadPostsBuffer] = useState<ThoughtData[]>([]);

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`realtime-feed:${type}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "Thought" },
        (payload) => {
          const newThought = payload.new as any;
          if (!newThought || newThought.isDraft || newThought.deletedAt) return;

          const formattedThought: ThoughtData = {
            id: newThought.id,
            content: newThought.content,
            authorId: newThought.authorId,
            author: newThought.author || {
              id: newThought.authorId,
              username: "author",
              name: "Creator",
              subdomain: "creator",
            },
            createdAt: newThought.createdAt || new Date().toISOString(),
            likeCount: newThought.likeCount || 0,
            repostCount: newThought.repostCount || 0,
            replyCount: newThought.replyCount || 0,
            imageUrl: newThought.imageUrl || null,
          };

          // Append to unreadPostsBuffer — NEVER mutate visible array directly
          setUnreadPostsBuffer((prev) => [formattedThought, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "Thought" },
        (payload) => {
          const updated = payload.new as any;
          if (!updated?.id) return;

          // Update cached counts in TanStack Query
          queryClient.setQueriesData({ queryKey: feedKeys.all }, (oldData: any) => {
            if (!oldData || typeof oldData !== "object") return oldData;

            if (Array.isArray(oldData.pages)) {
              return {
                ...oldData,
                pages: oldData.pages.map((page: any) => ({
                  ...page,
                  data: Array.isArray(page.data)
                    ? page.data.map((post: any) =>
                        post.id === updated.id
                          ? {
                              ...post,
                              likeCount: updated.likeCount ?? post.likeCount,
                              replyCount: updated.replyCount ?? post.replyCount,
                              repostCount: updated.repostCount ?? post.repostCount,
                            }
                          : post
                      )
                    : page.data,
                })),
              };
            }
            return oldData;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, type, queryClient]);

  // Flush buffer into TanStack Query cache and clear buffer
  const flushBuffer = useCallback(() => {
    if (unreadPostsBuffer.length === 0) return;

    queryClient.setQueriesData({ queryKey: feedKeys.timeline(type) }, (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.pages) || oldData.pages.length === 0) {
        return oldData;
      }

      const firstPage = oldData.pages[0];
      const updatedFirstPage = {
        ...firstPage,
        data: [...unreadPostsBuffer, ...(firstPage.data || [])],
      };

      return {
        ...oldData,
        pages: [updatedFirstPage, ...oldData.pages.slice(1)],
      };
    });

    setUnreadPostsBuffer([]);

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [unreadPostsBuffer, queryClient, type]);

  return {
    unreadCount: unreadPostsBuffer.length,
    unreadPostsBuffer,
    flushBuffer,
  };
}
