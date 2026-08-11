import { describe, expect, it } from "vitest";

process.env.SKIP_ENV_VALIDATION = "true";
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres";
process.env.DIRECT_URL = "postgresql://postgres:postgres@localhost:5432/postgres";

export interface TestNotification {
  id: string;
  senderId: string;
  type: "LIKE" | "FOLLOW" | "REPOST" | "REPLY";
  thoughtId?: string;
  starterPackId?: string;
  createdAt: Date;
}

export interface GroupedNotificationResult {
  primary: TestNotification;
  senders: string[];
  count: number;
  starterPackId?: string;
}

/**
 * Moteur d'agrégation de notifications (groupNotifications by starterPack & type).
 */
export function groupNotificationsWithStarterPacks(notifications: TestNotification[]): GroupedNotificationResult[] {
  const groups: GroupedNotificationResult[] = [];

  for (const notif of notifications) {
    if (notif.type === "FOLLOW" && notif.starterPackId) {
      // Group follows originating from the SAME starter pack
      const existingPackGroup = groups.find(
        (g) => g.primary.type === "FOLLOW" && g.starterPackId === notif.starterPackId
      );
      if (existingPackGroup) {
        if (!existingPackGroup.senders.includes(notif.senderId)) {
          existingPackGroup.senders.push(notif.senderId);
        }
        existingPackGroup.count += 1;
        continue;
      }
    }

    if (notif.type === "LIKE" && notif.thoughtId) {
      // Group likes for the SAME thought
      const existingLikeGroup = groups.find(
        (g) => g.primary.type === "LIKE" && g.primary.thoughtId === notif.thoughtId
      );
      if (existingLikeGroup) {
        if (!existingLikeGroup.senders.includes(notif.senderId)) {
          existingLikeGroup.senders.push(notif.senderId);
        }
        existingLikeGroup.count += 1;
        continue;
      }
    }

    // Default standalone group
    groups.push({
      primary: notif,
      senders: [notif.senderId],
      count: 1,
      starterPackId: notif.starterPackId,
    });
  }

  return groups;
}

describe("Notification Grouping & Starter Pack Aggregation", () => {
  it("does not group a starter pack follow with an organic follow", () => {
    const packId = "sp-tech-1";

    const notifs: TestNotification[] = [
      { id: "n-1", senderId: "user-a", type: "FOLLOW", createdAt: new Date() },
      { id: "n-2", senderId: "user-b", type: "FOLLOW", starterPackId: packId, createdAt: new Date() },
    ];

    const grouped = groupNotificationsWithStarterPacks(notifs);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].starterPackId).toBeUndefined();
    expect(grouped[1].starterPackId).toBe(packId);
  });

  it("groups follows originating from the same starter pack together", () => {
    const packA = "sp-tech-1";
    const packB = "sp-ai-2";

    const notifs: TestNotification[] = [
      { id: "n-1", senderId: "user-a", type: "FOLLOW", starterPackId: packA, createdAt: new Date() },
      { id: "n-2", senderId: "user-b", type: "FOLLOW", starterPackId: packB, createdAt: new Date() },
      { id: "n-3", senderId: "user-c", type: "FOLLOW", starterPackId: packA, createdAt: new Date() },
      { id: "n-4", senderId: "user-d", type: "FOLLOW", createdAt: new Date() }, // organic follow
      { id: "n-5", senderId: "user-e", type: "FOLLOW", starterPackId: packB, createdAt: new Date() },
    ];

    const grouped = groupNotificationsWithStarterPacks(notifs);

    expect(grouped).toHaveLength(3); // Pack A group, Pack B group, Organic group
    expect(grouped[0].senders).toEqual(["user-a", "user-c"]);
    expect(grouped[0].count).toBe(2);
    expect(grouped[1].senders).toEqual(["user-b", "user-e"]);
    expect(grouped[1].count).toBe(2);
    expect(grouped[2].senders).toEqual(["user-d"]);
    expect(grouped[2].count).toBe(1);
  });

  it("groups multiple likes on the same thought into a single aggregated item", () => {
    const notifs: TestNotification[] = [
      { id: "n-1", senderId: "user-a", type: "LIKE", thoughtId: "t-100", createdAt: new Date() },
      { id: "n-2", senderId: "user-b", type: "LIKE", thoughtId: "t-100", createdAt: new Date() },
      { id: "n-3", senderId: "user-c", type: "LIKE", thoughtId: "t-100", createdAt: new Date() },
    ];

    const grouped = groupNotificationsWithStarterPacks(notifs);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].senders).toEqual(["user-a", "user-b", "user-c"]);
    expect(grouped[0].count).toBe(3);
  });
});
