'use client';

import React from 'react';
import { cn } from '@qoe/utils';

interface TextParserProps {
  content: string;
  className?: string;
  onMentionClick?: (username: string) => void;
}

export function TextParser({ content, className, onMentionClick }: TextParserProps) {
  if (!content) return null;

  // Split by mentions and hashtags, keeping the matched string in the array
  const parts = content.split(/(@[a-zA-Z0-9_.-]+|#[a-zA-Z0-9_-]+)/g);

  return (
    <p className={cn('whitespace-pre-line', className)}>
      {parts.map((part, i) => {
        if (part.startsWith('@') && part.length > 1) {
          const username = part.slice(1);
          return (
            <span
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                if (onMentionClick) {
                  onMentionClick(username);
                } else {
                  window.location.href = `/profile/${username}`;
                }
              }}
              className="text-[#EE4B2B] font-semibold hover:underline cursor-pointer"
            >
              {part}
            </span>
          );
        }

        if (part.startsWith('#') && part.length > 1) {
          return (
            <span key={i} className="text-[#EE4B2B]/80 font-mono font-medium">
              {part}
            </span>
          );
        }

        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}
