'use server';

import { polls } from '@qoe/db';
import { revalidatePath } from 'next/cache';
import { safeAction } from '../utils/safe-action';

export const getPollAction = safeAction<
  { thoughtId: string },
  { poll: Awaited<ReturnType<typeof polls.getPollByThoughtId>> }
>(async (input, user) => {
  const pollData = await polls.getPollByThoughtId(input.thoughtId, user?.id);
  return { poll: pollData };
});

export const votePollAction = safeAction<
  { pollId: string; optionId: string },
  { poll: Awaited<ReturnType<typeof polls.votePoll>> }
>(async (input, user) => {
  const updatedPoll = await polls.votePoll({
    pollId: input.pollId,
    optionId: input.optionId,
    userId: user.id,
  });
  if (updatedPoll?.thoughtId) {
    revalidatePath(`/post/${updatedPoll.thoughtId}`);
  }
  return { poll: updatedPoll };
});
