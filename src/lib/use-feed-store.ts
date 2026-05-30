import { create } from "zustand"

export interface PostInteraction {
  liked?: boolean
  likesCount?: number
  repliesCount?: number
  reposted?: boolean
  bookmarked?: boolean
}

interface FeedStore {
  localPosts: any[]
  deletedPostIds: Set<string>
  interactions: Record<string, PostInteraction>
  
  addLocalPost: (post: any) => void
  deletePost: (postId: string) => void
  registerInteraction: (id: string, update: Partial<PostInteraction>) => void
  getInteraction: (id: string) => PostInteraction | undefined
  toggleLike: (id: string, defaultLiked: boolean, defaultLikesCount: number) => void
  toggleBookmark: (id: string, defaultBookmarked: boolean) => void
  incrementReplies: (id: string) => void
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  localPosts: [],
  deletedPostIds: new Set<string>(),
  interactions: {},

  addLocalPost: (post) => set((state) => ({
    localPosts: [post, ...state.localPosts]
  })),

  deletePost: (postId) => set((state) => {
    const nextDeleted = new Set(state.deletedPostIds)
    nextDeleted.add(postId)
    return {
      deletedPostIds: nextDeleted,
      localPosts: state.localPosts.filter((p) => p.id !== postId)
    }
  }),

  registerInteraction: (id, update) => set((state) => ({
    interactions: {
      ...state.interactions,
      [id]: {
        ...state.interactions[id],
        ...update
      }
    }
  })),

  getInteraction: (id) => {
    return get().interactions[id]
  },

  toggleLike: (id, defaultLiked, defaultLikesCount) => set((state) => {
    const current = state.interactions[id] || {}
    const isLiked = current.liked !== undefined ? current.liked : defaultLiked
    const count = current.likesCount !== undefined ? current.likesCount : defaultLikesCount
    
    return {
      interactions: {
        ...state.interactions,
        [id]: {
          ...current,
          liked: !isLiked,
          likesCount: isLiked ? count - 1 : count + 1
        }
      }
    }
  }),

  toggleBookmark: (id, defaultBookmarked) => set((state) => {
    const current = state.interactions[id] || {}
    const isBookmarked = current.bookmarked !== undefined ? current.bookmarked : defaultBookmarked
    
    return {
      interactions: {
        ...state.interactions,
        [id]: {
          ...current,
          bookmarked: !isBookmarked
        }
      }
    }
  }),

  incrementReplies: (id) => set((state) => {
    const current = state.interactions[id] || {}
    const count = current.repliesCount !== undefined ? current.repliesCount : 0
    return {
      interactions: {
        ...state.interactions,
        [id]: {
          ...current,
          repliesCount: count + 1
        }
      }
    }
  })
}))
