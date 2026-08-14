'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Heart, Repeat, MessageCircle, AtSign, UserPlus } from 'lucide-react';

interface NotificationItemProps {
  notification: {
    id: string;
    type:
      | 'LIKE'
      | 'REPOST'
      | 'REPLY'
      | 'MENTION'
      | 'FOLLOW'
      | 'MEDIA_INVITE'
      | 'MEDIA_MEMBER_JOINED'
      | 'MEDIA_ARTICLE_PUBLISHED'
      | 'MEDIA_MENTION';
    isRead: boolean;
    createdAt: string | Date;
    thoughtId?: string | null;
    articleId?: string | null;
    commentId?: string | null;
    thought?: {
      id: string;
      content: string;
      createdAt: string | Date;
    } | null;
    article?: {
      id: string;
      title: string;
      slug: string;
    } | null;
    publication?: {
      id: string;
      name: string | null;
    } | null;
    senders: Array<{
      id: string;
      name: string | null;
      username: string | null;
      logoUrl: string | null;
      isCertified: boolean;
    }>;
    totalCount: number;
  };
}

export function NotificationItem({ notification }: NotificationItemProps) {
  const { type, senders, totalCount, thought, article, isRead, createdAt } = notification;

  const firstSender = senders[0];
  const otherSendersCount = totalCount - 1;

  // Configuration selon le type de notification
  let Icon = Heart;
  let iconColorClass = 'text-destructive bg-destructive/10';
  let actionText = '';

  switch (type) {
    case 'LIKE':
      Icon = Heart;
      iconColorClass = 'text-destructive bg-destructive/10';
      actionText = 'a aimé votre pensée';
      break;
    case 'REPOST':
      Icon = Repeat;
      iconColorClass = 'text-success bg-success/10';
      actionText = 'a repartagé votre pensée';
      break;
    case 'REPLY':
      Icon = MessageCircle;
      iconColorClass = 'text-primary bg-primary/10';
      actionText = 'a répondu à votre pensée';
      break;
    case 'MENTION':
      Icon = AtSign;
      iconColorClass = 'text-highlight bg-highlight/10';
      actionText = 'vous a mentionné';
      break;
    case 'FOLLOW':
      Icon = UserPlus;
      iconColorClass = 'text-primary bg-primary/10';
      actionText = "s'est abonné à votre profil";
      break;
    case 'MEDIA_INVITE':
      Icon = UserPlus;
      iconColorClass = 'text-highlight bg-highlight/10';
      actionText = notification.publication?.name
        ? `vous a invité à rejoindre le Média`
        : 'vous a invité à rejoindre un Média';
      break;
    case 'MEDIA_MEMBER_JOINED':
      Icon = UserPlus;
      iconColorClass = 'text-success bg-success/10';
      actionText = notification.publication?.name ? 'a rejoint le Média' : 'a rejoint un Média';
      break;
    case 'MEDIA_ARTICLE_PUBLISHED':
      Icon = MessageCircle;
      iconColorClass = 'text-primary bg-primary/10';
      actionText = 'a publié dans le Média';
      break;
    case 'MEDIA_MENTION':
      Icon = AtSign;
      iconColorClass = 'text-highlight bg-highlight/10';
      actionText = 'vous a mentionné dans le Média';
      break;
  }

  // Calcul du temps relatif
  const dateObj = new Date(createdAt);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - dateObj.getTime()) / 60000);
  let timeAgo = "à l'instant";
  if (diffInMinutes >= 60 * 24) {
    timeAgo = `${Math.floor(diffInMinutes / (60 * 24))}j`;
  } else if (diffInMinutes >= 60) {
    timeAgo = `${Math.floor(diffInMinutes / 60)}h`;
  } else if (diffInMinutes > 0) {
    timeAgo = `${diffInMinutes}m`;
  }

  const targetLink = notification.thoughtId
    ? `/thought/${notification.thoughtId}`
    : notification.article
      ? `/article/${notification.article.slug}`
      : notification.publication
        ? `/m/${notification.publication.id}`
        : firstSender?.username
          ? `/@${firstSender.username}`
          : '#';

  return (
    <Link
      href={targetLink}
      className={`block p-4 border-b border-border transition-colors hover:bg-muted/40 ${
        !isRead ? 'bg-primary/5' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Badge d'action */}
        <div className={`p-2 rounded-full shrink-0 ${iconColorClass}`}>
          <Icon className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Avatar stack */}
          <div className="flex items-center gap-1.5 mb-2 overflow-hidden">
            {senders.slice(0, 5).map((sender, idx) => (
              <div
                key={sender.id || idx}
                className="relative w-8 h-8 rounded-full border-2 border-background overflow-hidden bg-muted shrink-0"
              >
                {sender.logoUrl ? (
                  <Image
                    src={sender.logoUrl}
                    alt={sender.name || sender.username || 'User'}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-xs bg-muted text-muted-foreground">
                    {(sender.name || sender.username || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Description de l'action */}
          <div className="text-sm text-foreground">
            <span className="font-semibold text-foreground">
              {firstSender?.name || firstSender?.username || 'Un utilisateur'}
            </span>
            {otherSendersCount > 0 && (
              <span className="text-muted-foreground">
                {' '}
                et {otherSendersCount} autre{otherSendersCount > 1 ? 's' : ''}
              </span>
            )}{' '}
            <span className="text-muted-foreground">{actionText}</span>
            <span className="text-xs text-muted-foreground ml-2">· {timeAgo}</span>
          </div>

          {/* Snippet de la pensée ou de l'article ciblé */}
          {thought && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2 bg-muted/30 p-2 rounded-lg border border-border/50">
              {thought.content}
            </p>
          )}

          {article && (
            <p className="mt-1 text-sm font-medium text-primary line-clamp-1 bg-muted/30 p-2 rounded-lg border border-border/50">
              📖 {article.title}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
