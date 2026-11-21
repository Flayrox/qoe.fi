'use client';

import { useEffect, useState } from 'react';
import { EMOJI_MAP, detectMentionTrigger, formatMentionInsertion } from './composer-text';
import type { MentionSuggestion } from './types';

interface UseThoughtTypeaheadOptions {
  tagsList: string[];
  postText: string;
  onInsertText: (newText: string, newCursor: number) => void;
}

export function useThoughtTypeahead({
  tagsList,
  postText,
  onInsertText,
}: UseThoughtTypeaheadOptions) {
  const [typeaheadType, setTypeaheadType] = useState<'profile' | 'tag' | 'emoji' | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion[]>([]);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState<number>(0);
  const [mentionPosition, setMentionPosition] = useState<{ start: number; end: number } | null>(
    null
  );

  const clearMention = () => {
    setTypeaheadType(null);
    setMentionQuery(null);
    setMentionPosition(null);
    setMentionSuggestions([]);
  };

  const checkMentionTrigger = (text: string, selectionStart: number) => {
    const match = detectMentionTrigger(text, selectionStart);
    if (match) {
      setTypeaheadType(match.type);
      setMentionQuery(match.query);
      setMentionPosition({ start: match.start, end: match.end });
      setMentionSelectedIndex(0);
      return;
    }
    clearMention();
  };

  const moveSelection = (delta: number) => {
    setMentionSelectedIndex((prev) => {
      if (mentionSuggestions.length === 0) return 0;
      return (prev + delta + mentionSuggestions.length) % mentionSuggestions.length;
    });
  };

  useEffect(() => {
    if (mentionQuery === null || typeaheadType === null) {
      setMentionSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (typeaheadType === 'profile') {
        try {
          const { searchUsersAction } = await import('@qoe/sdk/actions/feed');
          const res = await searchUsersAction(mentionQuery);
          if (!cancelled && res.ok && res.data?.users) {
            setMentionSuggestions(res.data.users.map((u) => ({ ...u, _type: 'profile' })));
          }
        } catch (err) {
          console.error('Mention search error:', err);
        }
      } else if (typeaheadType === 'tag') {
        const q = mentionQuery.toLowerCase();
        const defaultTags =
          tagsList.length > 0 ? tagsList : ['design', 'tech', 'qoe', 'dev', 'crypto', 'ia'];
        const matches = defaultTags.filter((tag) => tag.toLowerCase().includes(q));
        if (!cancelled) {
          setMentionSuggestions(
            matches.map((tag) => ({ id: tag, name: `#${tag}`, _type: 'tag', value: tag }))
          );
        }
      } else if (typeaheadType === 'emoji') {
        const q = mentionQuery.toLowerCase();
        const matches = Object.entries(EMOJI_MAP).filter(([name]) => name.includes(q));
        if (!cancelled) {
          setMentionSuggestions(
            matches.map(([name, char]) => ({
              id: name,
              name: `:${name}:`,
              _type: 'emoji',
              char,
              value: char,
            }))
          );
        }
      }
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mentionQuery, typeaheadType, tagsList]);

  const insertMention = (item: MentionSuggestion) => {
    if (!mentionPosition) return;
    const textToInsert = formatMentionInsertion(item);
    const before = postText.substring(0, mentionPosition.start);
    const after = postText.substring(mentionPosition.end);
    const newText = `${before}${textToInsert}${after}`;
    const newCursor = mentionPosition.start + textToInsert.length;

    clearMention();
    onInsertText(newText, newCursor);
  };

  return {
    mentionSuggestions,
    mentionSelectedIndex,
    checkMentionTrigger,
    insertMention,
    clearMention,
    moveSelection,
  };
}
