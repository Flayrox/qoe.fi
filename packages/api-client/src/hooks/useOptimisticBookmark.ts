import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedKeys } from '../query-keys';
import { isUnauthorizedError, notifyUnauthorized } from '../utils/authError';

export interface ToggleBookmarkVariables {
  articleId: string;
  isBookmarkedCurrent: boolean;
  bookmarkMutationFn: (articleId: string, isBookmarkedCurrent: boolean) => Promise<{ success: boolean; message?: string }>;
}

export interface UseOptimisticBookmarkOptions {
  onError?: (error: Error) => void;
}

export function createOptimisticBookmarkMutationOptions(
  queryClient: ReturnType<typeof useQueryClient>,
  options?: UseOptimisticBookmarkOptions
) {
  return {
    mutationFn: async ({ articleId, isBookmarkedCurrent, bookmarkMutationFn }: ToggleBookmarkVariables) => {
      const response = await bookmarkMutationFn(articleId, isBookmarkedCurrent);
      if (!response.success) {
        throw new Error(response.message || 'Failed to update bookmark');
      }
      return response;
    },

    onMutate: async ({ articleId, isBookmarkedCurrent }: ToggleBookmarkVariables) => {
      await queryClient.cancelQueries({ queryKey: feedKeys.all });
      const previousQueries = queryClient.getQueriesData({ queryKey: feedKeys.all });

      queryClient.setQueriesData({ queryKey: feedKeys.all }, (oldData: unknown) => {
        if (!oldData || typeof oldData !== 'object') return oldData;
        const dataObj = oldData as Record<string, unknown>;

        if (Array.isArray(dataObj.pages)) {
          return {
            ...dataObj,
            pages: dataObj.pages.map((page: unknown) => {
              if (!page || typeof page !== 'object') return page;
              const pageObj = page as Record<string, unknown>;
              if (!Array.isArray(pageObj.data)) return page;

              return {
                ...pageObj,
                data: pageObj.data.map((article: unknown) => {
                  if (!article || typeof article !== 'object') return article;
                  const a = article as Record<string, unknown>;
                  if (a.id === articleId) {
                    return {
                      ...a,
                      isBookmarked: !isBookmarkedCurrent,
                      bookmarked: !isBookmarkedCurrent,
                    };
                  }
                  return article;
                }),
              };
            }),
          };
        }

        if (Array.isArray(oldData)) {
          return oldData.map((article: unknown) => {
            if (!article || typeof article !== 'object') return article;
            const a = article as Record<string, unknown>;
            if (a.id === articleId) {
              return {
                ...a,
                isBookmarked: !isBookmarkedCurrent,
                bookmarked: !isBookmarkedCurrent,
              };
            }
            return article;
          });
        }

        return oldData;
      });

      return { previousQueries };
    },

    onError: (err: Error, _variables: ToggleBookmarkVariables, context?: { previousQueries?: Array<[readonly unknown[], unknown]> }) => {
      if (context?.previousQueries) {
        context.previousQueries.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (isUnauthorizedError(err)) {
        notifyUnauthorized(err);
      }
      options?.onError?.(err);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: feedKeys.all });
    },
  };
}

export function useOptimisticBookmark(options?: UseOptimisticBookmarkOptions) {
  const queryClient = useQueryClient();
  return useMutation(createOptimisticBookmarkMutationOptions(queryClient, options));
}
