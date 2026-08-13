import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

process.env.SKIP_ENV_VALIDATION = 'true';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.DIRECT_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder_anon_key';

import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  deleteNotification,
} from '../repositories/notifications';
import { prisma } from '../client';

vi.mock('../client', () => ({
  prisma: {
    notification: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    notificationPreference: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe('@qoe/db - Notifications Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not create notification if recipient is sender', async () => {
    const res = await createNotification({
      recipientId: 'user-1',
      senderId: 'user-1',
      type: 'LIKE',
      thoughtId: 'post-1',
    });

    expect(res).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('should create a notification if preferences allow and no unread duplicate exists', async () => {
    (prisma.notificationPreference.findUnique as unknown as Mock).mockResolvedValue({
      userId: 'user-2',
      pushLikes: true,
      emailLikes: true,
    });
    (prisma.notification.findFirst as unknown as Mock).mockResolvedValue(null);
    (prisma.notification.create as unknown as Mock).mockResolvedValue({
      id: 'notif-1',
      recipientId: 'user-2',
      senderId: 'user-1',
      type: 'LIKE',
      thoughtId: 'post-1',
    });

    const res = await createNotification({
      recipientId: 'user-2',
      senderId: 'user-1',
      type: 'LIKE',
      thoughtId: 'post-1',
    });

    expect(res).toEqual({
      id: 'notif-1',
      recipientId: 'user-2',
      senderId: 'user-1',
      type: 'LIKE',
      thoughtId: 'post-1',
    });
    expect(prisma.notification.create).toHaveBeenCalled();
  });

  it('should group notifications for same thought within 48h', async () => {
    const now = new Date();
    const mockRawNotifs = [
      {
        id: 'n-1',
        type: 'LIKE',
        isRead: false,
        createdAt: now,
        thoughtId: 'post-1',
        sender: { id: 'u-1', name: 'User 1', username: 'user1', logoUrl: null, isCertified: false },
        thought: { id: 'post-1', content: 'Hello world', createdAt: now },
      },
      {
        id: 'n-2',
        type: 'LIKE',
        isRead: false,
        createdAt: new Date(now.getTime() - 1000 * 60 * 30), // 30 mins ago
        thoughtId: 'post-1',
        sender: { id: 'u-2', name: 'User 2', username: 'user2', logoUrl: null, isCertified: false },
        thought: { id: 'post-1', content: 'Hello world', createdAt: now },
      },
    ];

    (prisma.notification.findMany as unknown as Mock).mockResolvedValue(mockRawNotifs);

    const { notifications } = await getNotifications('user-recipient', 'all', 30);

    expect(notifications).toHaveLength(1);
    expect(notifications[0].senders).toHaveLength(2);
    expect(notifications[0].totalCount).toBe(2);
  });

  it('should get unread count and mark notifications as read', async () => {
    (prisma.notification.count as unknown as Mock).mockResolvedValue(5);
    (prisma.notification.updateMany as unknown as Mock).mockResolvedValue({ count: 5 });

    const count = await getUnreadCount('user-1');
    expect(count).toBe(5);

    const marked = await markAsRead('user-1');
    expect(marked).toBe(true);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { recipientId: 'user-1', isRead: false },
      data: { isRead: true },
    });
  });

  it('should delete notification on unlike or unfollow', async () => {
    (prisma.notification.deleteMany as unknown as Mock).mockResolvedValue({ count: 1 });

    const deleted = await deleteNotification({
      recipientId: 'user-2',
      senderId: 'user-1',
      type: 'LIKE',
      thoughtId: 'post-1',
    });

    expect(deleted).toBe(true);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        recipientId: 'user-2',
        senderId: 'user-1',
        type: 'LIKE',
        thoughtId: 'post-1',
        articleId: null,
      },
    });
  });
});
