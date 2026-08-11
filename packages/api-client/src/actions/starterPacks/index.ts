"use server";

import { starterPacks } from "@qoe/db";
import { revalidatePath } from "next/cache";
import { safeAction } from "../utils/safe-action";

export const getStarterPacksAction = safeAction<
  { limit?: number; cursor?: string } | undefined,
  { starterPacks: any[]; nextCursor: string | null }
>(async (rawInput) => {
  const limit = rawInput?.limit || 20;
  const cursor = rawInput?.cursor;
  return starterPacks.getStarterPacks(limit, cursor);
});

export const getStarterPackByIdAction = safeAction<
  { id: string },
  { starterPack: any }
>(async (input) => {
  const pack = await starterPacks.getStarterPackById(input.id);
  return { starterPack: pack };
});

export const createStarterPackAction = safeAction<
  { title: string; description?: string; icon?: string; userIds: string[] },
  { starterPack: any }
>(async (input, user) => {
  if (!input.title || input.title.trim().length === 0) {
    throw new Error("Title is required");
  }
  const pack = await starterPacks.createStarterPack({
    title: input.title,
    description: input.description,
    icon: input.icon,
    creatorId: user.id,
    userIds: input.userIds || [],
  });
  revalidatePath("/starter-packs");
  return { starterPack: pack };
});

export const followAllInStarterPackAction = safeAction<
  { starterPackId: string },
  { followedCount: number }
>(async (input, user) => {
  const result = await starterPacks.followAllInStarterPack(user.id, input.starterPackId);
  revalidatePath("/starter-packs");
  revalidatePath(`/starter-packs/${input.starterPackId}`);
  return result;
});
