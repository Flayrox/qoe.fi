"use server"

import * as feedActions from "@/features/feed/actions"

export async function toggleFollowCreatorHome(creatorId: string) {
  return feedActions.toggleFollowCreatorHome(creatorId)
}

export async function toggleFollowCreator(creatorId: string) {
  return feedActions.toggleFollowCreatorHome(creatorId)
}

export async function toggleBookmarkArticleHome(articleId: string) {
  return feedActions.toggleBookmarkArticleHome(articleId)
}

export async function createThought(input: Parameters<typeof feedActions.createThought>[0]) {
  return feedActions.createThought(input)
}

/** @deprecated Utiliser createThought */
export async function createMicroPost(input: Parameters<typeof feedActions.createMicroPost>[0]) {
  return feedActions.createMicroPost(input)
}

export async function toggleLikePost(postId: string) {
  return feedActions.toggleLikePost(postId)
}

export async function replyToPost(input: Parameters<typeof feedActions.replyToPost>[0]) {
  return feedActions.replyToPost(input)
}

export async function getPostThread(postId: string) {
  return feedActions.getPostThread(postId)
}

export async function getArticleThread(slug: string) {
  return feedActions.getArticleThread(slug)
}

export async function repostPost(postId: string) {
  return feedActions.repostPost(postId)
}

export async function deletePost(postId: string) {
  return feedActions.deletePost(postId)
}

export async function getProfileData(username: string) {
  return feedActions.getProfileData(username)
}

export async function getUserDrafts() {
  return feedActions.getUserDrafts()
}

export async function pinPost(postId: string) {
  return feedActions.pinPost(postId)
}

export async function unpinPost(postId: string) {
  return feedActions.unpinPost(postId)
}

export async function unfurlUrl(urlStr: string) {
  return feedActions.unfurlUrl(urlStr)
}
