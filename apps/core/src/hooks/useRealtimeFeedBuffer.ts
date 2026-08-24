'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@qoe/supabase/client';
import { feedKeys } from '@qoe/sdk';
import type { ThoughtData } from '@qoe/sdk';

export interface UseRealtimeFeedBufferOptions {
  enabled?: boolean;
  type?: 'for-you' | 'following' | 'highlights';
}

interface RealtimeThoughtRecord {
  id?: string;
  content?: string | null;
  authorId?: string;
  author?: {
    id?: string;
    username?: string | null;
    name?: string | null;
    subdomain?: string | null;
  } | null;
  createdAt?: string | null;
  likeCount?: number | null;
  repostCount?: number | null;
  replyCount?: number | null;
  imageUrl?: string | null;
  isDraft?: boolean;
  deletedAt?: string | null;
}

interface FeedQueryPost {
  id?: string;
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
}

interface FeedQueryPage {
  data?: FeedQueryPost[];
}

interface FeedQueryData {
  pages?: FeedQueryPage[];
}

export function useRealtimeFeedBuffer({
  enabled = true,
  type = 'for-you',
}: UseRealtimeFeedBufferOptions = {}) {
  const queryClient = useQueryClient();
  const [unreadPostsBuffer, setUnreadPostsBuffer] = useState<ThoughtData[]>([]);

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`realtime-feed:${type}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'Thought' },
        (payload) => {
          const newThought = payload.new as RealtimeThoughtRecord;
          if (!newThought || newThought.isDraft || newThought.deletedAt) return;

          const formattedThought: ThoughtData = {
            id: newThought.id || '',
            content: newThought.content || '',
            authorId: newThought.authorId || '',
            author: newThought.author
              ? {
                  id: newThought.author.id || newThought.authorId || '',
                  username: newThought.author.username || null,
                  name: newThought.author.name || null,
                  subdomain: newThought.author.subdomain || null,
                }
              : {
                  id: newThought.authorId || '',
                  username: 'author',
                  name: 'Creator',
                  subdomain: 'creator',
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
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'Thought' },
        (payload) => {
          const updated = payload.new as RealtimeThoughtRecord;
          if (!updated?.id) return;

          // Update cached counts in TanStack Query
          queryClient.setQueriesData({ queryKey: feedKeys.all }, (oldData: unknown) => {
            if (!oldData || typeof oldData !== 'object') return oldData;

            const data = oldData as FeedQueryData;

            if (Array.isArray(data.pages)) {
              return {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  data: Array.isArray(page.data)
                    ? page.data.map((post) =>
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

    queryClient.setQueriesData({ queryKey: feedKeys.timeline(type) }, (oldData: unknown) => {
      if (
        !oldData ||
        !Array.isArray((oldData as FeedQueryData).pages) ||
        (oldData as FeedQueryData).pages!.length === 0
      ) {
        return oldData;
      }

      const data = oldData as FeedQueryData;
      const firstPage = data.pages![0];
      const updatedFirstPage = {
        ...firstPage,
        data: [...unreadPostsBuffer, ...(firstPage.data || [])],
      };

      return {
        ...data,
        pages: [updatedFirstPage, ...data.pages!.slice(1)],
      };
    });

    setUnreadPostsBuffer([]);

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [unreadPostsBuffer, queryClient, type]);

  return {
    unreadCount: unreadPostsBuffer.length,
    unreadPostsBuffer,
    flushBuffer,
  };
}
