"use server";

import { threadgates } from "@qoe/db";
import { revalidatePath } from "next/cache";
import { safeAction } from "../utils/safe-action";

export const canUserReplyAction = safeAction<
  { thoughtId: string },
  threadgates.CanReplyResult
>(async (input, user) => {
  return threadgates.canUserReplyToThought(input.thoughtId, user.id);
});

export const hideReplyAction = safeAction<
  { replyId: string },
  { isHiddenByAuthor: boolean }
>(async (input, user) => {
  const result = await threadgates.toggleHideReplyByAuthor(input.replyId, user.id);
  revalidatePath("/post");
  return result;
});
