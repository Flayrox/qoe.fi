"use server"

import {
  toggleFollowCreatorHomeAction,
  toggleBookmarkArticleHomeAction,
  createThoughtAction,
  toggleLikePostAction,
  replyToPostAction,
  getPostThreadAction,
  getArticleThreadAction,
  reportTargetAction as rawReportTargetAction,
  toggleRepostPostAction,
  repostPostAction,
  deletePostAction,
  getProfileDataAction,
  getUserDraftsAction,
  pinPostAction,
  unpinPostAction,
  unfurlUrlAction,
  updateProfileAction,
} from "@qoe/api-client/actions/feed"

export async function toggleFollowCreatorHome(creatorId: string) {
  return toggleFollowCreatorHomeAction(creatorId)
}

export async function toggleBookmarkArticleHome(articleId: string) {
  return toggleBookmarkArticleHomeAction(articleId)
}

export async function createThought(input: Parameters<typeof createThoughtAction>[0]) {
  return createThoughtAction(input)
}

export async function createMicroPost(input: Parameters<typeof createThoughtAction>[0]) {
  return createThoughtAction(input)
}

export async function toggleLikePost(postId: string) {
  return toggleLikePostAction(postId)
}

export async function replyToPost(input: Parameters<typeof replyToPostAction>[0]) {
  return replyToPostAction(input)
}

export async function getPostThread(postId: string) {
  return getPostThreadAction(postId)
}

export async function getArticleThread(slug: string) {
  return getArticleThreadAction(slug)
}

export async function reportTargetAction(input: Parameters<typeof rawReportTargetAction>[0]) {
  return rawReportTargetAction(input)
}

export async function toggleRepostPost(postId: string) {
  return toggleRepostPostAction(postId)
}

export async function repostPost(postId: string) {
  return repostPostAction(postId)
}

export async function deletePost(postId: string) {
  return deletePostAction(postId)
}

export async function getProfileData(username: string) {
  return getProfileDataAction(username)
}

export async function getUserDrafts() {
  return getUserDraftsAction()
}

export async function pinPost(postId: string) {
  return pinPostAction(postId)
}

export async function unpinPost(postId: string) {
  return unpinPostAction(postId)
}

export async function unfurlUrl(urlStr: string) {
  return unfurlUrlAction(urlStr)
}

export async function updateProfile(input: Parameters<typeof updateProfileAction>[0]) {
  return updateProfileAction(input)
}
