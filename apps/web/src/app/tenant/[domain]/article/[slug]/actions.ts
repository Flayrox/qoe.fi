'use server';

import {
  toggleFollowCreatorAction,
  toggleBookmarkArticleAction,
  createHighlightAction,
  toggleHighlightPrivacyAction,
  updateHighlightNoteAction,
  upvoteHighlightAction,
  deleteHighlightAction,
  createAnnotationCommentAction,
  quotePassageToFeedAction,
  unlockArticleWithWalletAction,
  getCurrentUserWalletAction,
} from '@qoe/api-client/actions/tenant';

export {
  createHighlightAction,
  toggleHighlightPrivacyAction,
  updateHighlightNoteAction,
  upvoteHighlightAction,
  deleteHighlightAction,
  createAnnotationCommentAction,
  quotePassageToFeedAction,
};
import {
  postArticleCommentAction as rawPostArticleComment,
  deleteArticleCommentAction as rawDeleteArticleComment,
  getArticleCommentsAction as rawGetArticleComments,
} from '@qoe/api-client/actions/articles';

export async function toggleFollowCreator(creatorId: string) {
  const res = await toggleFollowCreatorAction(creatorId);
  if (!res.ok) return { success: false, error: res.error.code };
  return { success: true, followed: res.data.followed };
}

export async function toggleBookmarkArticle(articleId: string) {
  const res = await toggleBookmarkArticleAction(articleId);
  if (!res.ok) return { success: false, error: res.error.code };
  return { success: true, bookmarked: res.data.bookmarked };
}

export async function createHighlight(
  articleId: string,
  text: string,
  note?: string,
  isPublic: boolean = false
) {
  const res = await createHighlightAction({ articleId, text, note, isPublic });
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}

export async function toggleHighlightPrivacy(highlightId: string, isPublic: boolean) {
  const res = await toggleHighlightPrivacyAction({ highlightId, isPublic });
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}

export async function updateHighlightNote(highlightId: string, note: string | null) {
  const res = await updateHighlightNoteAction({ highlightId, note });
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}

export async function upvoteHighlight(highlightId: string) {
  const res = await upvoteHighlightAction(highlightId);
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}

export async function deleteHighlight(highlightId: string) {
  const res = await deleteHighlightAction(highlightId);
  if (!res.ok) return { success: false, error: res.error.code };
  return { success: true };
}

export async function createAnnotationComment(highlightId: string, content: string) {
  const res = await createAnnotationCommentAction({ highlightId, content });
  if (!res.ok) return { success: false, error: res.error.message };
  return { success: true, comment: res.data };
}

export async function quotePassageToFeed(articleId: string, text: string, commentary?: string) {
  const res = await quotePassageToFeedAction({ articleId, text, commentary });
  if (!res.ok) return { success: false, error: res.error.code };
  return { success: true, post: res.data.post };
}

export async function unlockArticleWithWallet(creatorId: string, costCents: number = 100) {
  const res = await unlockArticleWithWalletAction({ creatorId, costCents });
  if (!res.ok) return { success: false, error: res.error.code };
  return { success: true };
}

export async function getCurrentUserWallet() {
  const res = await getCurrentUserWalletAction();
  if (!res.ok) return null;
  return res.data;
}

export async function getCurrentUser() {
  return getCurrentUserWallet();
}

export async function postArticleComment(
  articleId: string,
  content: string,
  parentId?: string | null
) {
  const res = await rawPostArticleComment({ articleId, content, parentId });
  if (!res.ok) return { success: false, error: res.error.message };
  return { success: true, comment: res.data };
}

export async function postArticleCommentAction(
  articleId: string,
  content: string,
  parentId?: string | null
) {
  return postArticleComment(articleId, content, parentId);
}

export async function deleteArticleComment(commentId: string) {
  const res = await rawDeleteArticleComment(commentId);
  if (!res.ok) return { success: false, error: res.error.message };
  return { success: true };
}

export async function deleteArticleCommentAction(commentId: string) {
  return deleteArticleComment(commentId);
}

export async function getArticleComments(articleId: string) {
  const res = await rawGetArticleComments(articleId);
  if (!res.ok) return { success: false, comments: [] };
  return { success: true, comments: res.data };
}

export async function getArticleCommentsAction(articleId: string) {
  return getArticleComments(articleId);
}
