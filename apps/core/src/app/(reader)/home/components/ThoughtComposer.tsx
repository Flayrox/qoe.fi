'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Trash2,
  Loader2,
  Image,
  AlertCircle,
  Globe,
  Calendar as CalendarIcon,
  AlertTriangle,
  FileText,
  Crop as CropIcon,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  X,
  Users,
  AtSign,
  BarChart2,
  Plus,
} from 'lucide-react';
import NextImage from 'next/image';

import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import type { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';

import { Popover, PopoverTrigger, PopoverContent } from '@qoe/ui/ui/popover';
import { Calendar } from '@qoe/ui/ui/calendar';
import { TimePickerInput } from '@qoe/ui/ui/time-picker-input';
import { toast } from '@qoe/ui/toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@qoe/ui/ui/sheet';
import { ProfileHoverCard } from '@qoe/ui/social/ProfileHoverCard';

interface ComposerImage {
  id: string;
  url: string;
  file?: File;
  isUploading?: boolean;
  altText?: string;
}

export type DbUser = {
  id?: string;
  name?: string | null;
  email?: string;
  walletBalanceCents?: number;
  onboardingText?: string | null;
  role?: string;
  logoUrl?: string | null;
  username?: string | null;
  isCertified?: boolean;
};

interface ComposedPostAuthor {
  id?: string;
  name?: string | null;
  username?: string | null;
  subdomain?: string | null;
  isCertified?: boolean;
}

export interface ComposedPost extends FeedArticleDTO {
  repost?: {
    id?: string;
    content?: string | null;
    createdAt?: Date | string;
    author?: ComposedPostAuthor | null;
  } | null;
  parent?: {
    id?: string;
    content?: string | null;
    createdAt?: Date | string;
    author?: ComposedPostAuthor | null;
  } | null;
}

interface ThoughtDraft {
  id: string;
  content?: string | null;
  imageUrl?: string | null;
  visibility?: string;
  scheduledAt?: Date | string | null;
  triggerWarning?: string | null;
  updatedAt?: Date | string;
}

interface CreatedPostAuthor {
  id?: string;
  name?: string | null;
  username?: string | null;
  subdomain?: string | null;
  customDomain?: string | null;
  logoUrl?: string | null;
  heroText?: string | null;
  isCertified?: boolean;
}

interface CreatedPostRecord {
  id: string;
  content: string;
  imageUrl?: string | null;
  createdAt?: Date | string;
  author?: CreatedPostAuthor | null;
  repost?: CreatedPostRecord | null;
  parent?: CreatedPostRecord | null;
  tags?: string[] | null;
  quotedExcerpt?: string | null;
  quotedArticle?: QuotedArticleData | null;
}

interface MentionSuggestion {
  id: string;
  name?: string | null;
  _type: 'profile' | 'tag' | 'emoji';
  username?: string | null;
  subdomain?: string | null;
  logoUrl?: string | null;
  isCertified?: boolean;
  value?: string;
  char?: string;
}

const getImages = (url: string | null | undefined): string[] => {
  if (!url) return [];
  if (url.startsWith('[')) {
    try {
      return JSON.parse(url);
    } catch {
      return [url];
    }
  }
  return [url];
};

import { QuotedThoughtCard } from '@/components/social/QuotedThoughtCard';
import { QuotedArticleCard, type QuotedArticleData } from '@qoe/ui/social';
import type { ThoughtData } from '@/components/social/ThoughtCard';
import type { FeedArticleDTO } from '@/lib/feed-types';
import { AuthorAvatar } from '@qoe/ui/ui/AuthorAvatar';
import { CertifiedBadge } from '@qoe/ui/ui/CertifiedBadge';

interface ThoughtComposerProps {
  dbUser: DbUser | null;
  tagsList: string[];
  quotedThought?: ThoughtData | null;
  replyToThought?: ThoughtData | null;
  quotedArticle?: QuotedArticleData | null;
  quotedExcerpt?: string | null;
  parentId?: string | null;
  initialText?: string;
  placeholder?: string;
  onPostCreated?: (post: ComposedPost) => void;
  onLoginRequired?: () => void;
}

const generateUUID = (): string => {
  if (
    typeof window !== 'undefined' &&
    window.crypto &&
    typeof window.crypto.randomUUID === 'function'
  ) {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export interface ThreadNode {
  id: string;
  text: string;
  images: ComposerImage[];
  isTriggerWarning: boolean;
  triggerWarning: string;
  showPollEditor: boolean;
  pollOptions: string[];
  pollDurationHours: number;
}

export function ThoughtComposer({
  dbUser,
  tagsList,
  quotedThought: initialQuotedThought = null,
  replyToThought: initialReplyToThought = null,
  quotedArticle: initialQuotedArticle = null,
  quotedExcerpt: initialQuotedExcerpt = null,
  parentId = null,
  initialText = '',
  placeholder,
  onPostCreated,
  onLoginRequired,
}: ThoughtComposerProps) {
  const [quotedThought, setQuotedThought] = useState<ThoughtData | null>(initialQuotedThought);
  const [replyToThought, setReplyToThought] = useState<ThoughtData | null>(initialReplyToThought);
  const [quotedArticle, setQuotedArticle] = useState<QuotedArticleData | null>(
    initialQuotedArticle
  );
  const [quotedExcerpt, setQuotedExcerpt] = useState<string | null>(initialQuotedExcerpt);

  const [isComposerExpanded, setIsComposerExpanded] = useState<boolean>(false);
  const [postText, setPostText] = useState<string>('');
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Drafts states
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);
  const [isDraftsOpen, setIsDraftsOpen] = useState(false);
  const [drafts, setDrafts] = useState<ThoughtDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);

  // Popover controls
  const [showVisibilityDropdown, setShowVisibilityDropdown] = useState<boolean>(false);
  const [showReplyRestrictionDropdown, setShowReplyRestrictionDropdown] = useState<boolean>(false);
  const [showScheduleDropdown, setShowScheduleDropdown] = useState<boolean>(false);
  const [showWarningDropdown, setShowWarningDropdown] = useState<boolean>(false);
  const [overflowStyle, setOverflowStyle] = useState<'hidden' | 'visible'>('hidden');

  // Publishing options state
  const [visibility, setVisibility] = useState<string>('public');
  const [replyRestriction, setReplyRestriction] = useState<string>('everyone');
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [isTriggerWarning, setIsTriggerWarning] = useState<boolean>(false);
  const [triggerWarning, setTriggerWarning] = useState<string>('');
  const [isDraft, setIsDraft] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replacingImageId, setReplacingImageId] = useState<string | null>(null);
  const [croppingImage, setCroppingImage] = useState<ComposerImage | null>(null);
  const [showDraftPopover, setShowDraftPopover] = useState<boolean>(false);
  const [showPollEditor, setShowPollEditor] = useState<boolean>(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollDurationHours, setPollDurationHours] = useState<number>(24);

  // Brique 3 States & Refs
  const createEmptyNode = (): ThreadNode => ({
    id: generateUUID(),
    text: '',
    images: [],
    isTriggerWarning: false,
    triggerWarning: '',
    showPollEditor: false,
    pollOptions: ['', ''],
    pollDurationHours: 24,
  });

  const [threadNodes, setThreadNodes] = useState<ThreadNode[]>([]);
  const [activeNodeIndex, setActiveNodeIndex] = useState<number>(0);
  const isSwitchingRef = useRef<boolean>(false);
  const [submitProgress, setSubmitProgress] = useState<string | null>(null);

  useEffect(() => {
    setQuotedThought(initialQuotedThought);
    setReplyToThought(initialReplyToThought);
    setQuotedArticle(initialQuotedArticle);
    setQuotedExcerpt(initialQuotedExcerpt);
    if (initialText) {
      setPostText(initialText);
      setIsComposerExpanded(true);
    }
    if (initialReplyToThought || initialQuotedThought || initialQuotedArticle) {
      setIsComposerExpanded(true);
    }

    setThreadNodes((prev) => {
      if (prev.length > 0 && (prev[0].text !== '' || prev.length > 1)) return prev;
      return [
        {
          id: generateUUID(),
          text: initialText || '',
          images: [],
          isTriggerWarning: false,
          triggerWarning: '',
          showPollEditor: false,
          pollOptions: ['', ''],
          pollDurationHours: 24,
        },
      ];
    });
    setActiveNodeIndex(0);
  }, [
    initialQuotedThought,
    initialReplyToThought,
    initialQuotedArticle,
    initialQuotedExcerpt,
    initialText,
  ]);

  // 1. Synchroniser le buffer actif vers threadNodes en continu
  useEffect(() => {
    if (isSwitchingRef.current) return;
    if (threadNodes.length === 0) return;

    setThreadNodes((prev) => {
      const copy = [...prev];
      if (copy[activeNodeIndex]) {
        copy[activeNodeIndex] = {
          ...copy[activeNodeIndex],
          text: postText,
          images,
          isTriggerWarning,
          triggerWarning,
          showPollEditor,
          pollOptions,
          pollDurationHours,
        };
      }
      return copy;
    });
  }, [
    postText,
    images,
    isTriggerWarning,
    triggerWarning,
    showPollEditor,
    pollOptions,
    pollDurationHours,
    activeNodeIndex,
  ]);

  // 2. Sauvegarde automatique des brouillons locaux de fils
  useEffect(() => {
    if (threadNodes.length <= 1 && !postText.trim() && images.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      const finalNodes = [...threadNodes];
      if (finalNodes[activeNodeIndex]) {
        finalNodes[activeNodeIndex] = {
          id: threadNodes[activeNodeIndex].id,
          text: postText,
          images,
          isTriggerWarning,
          triggerWarning,
          showPollEditor,
          pollOptions,
          pollDurationHours,
        };
      }
      localStorage.setItem('qoe_multi_thought_drafts', JSON.stringify(finalNodes));
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    postText,
    images,
    isTriggerWarning,
    triggerWarning,
    showPollEditor,
    pollOptions,
    pollDurationHours,
    activeNodeIndex,
    threadNodes,
  ]);

  // 3. Ajouter une pensée au fil
  const addThreadNode = () => {
    const currentNodes = [...threadNodes];
    currentNodes[activeNodeIndex] = {
      id: threadNodes[activeNodeIndex].id,
      text: postText,
      images,
      isTriggerWarning,
      triggerWarning,
      showPollEditor,
      pollOptions,
      pollDurationHours,
    };

    const newNode = createEmptyNode();
    const nextNodes = [...currentNodes, newNode];
    const nextIndex = nextNodes.length - 1;

    setThreadNodes(nextNodes);

    isSwitchingRef.current = true;
    setPostText('');
    setImages([]);
    setIsTriggerWarning(false);
    setTriggerWarning('');
    setShowPollEditor(false);
    setPollOptions(['', '']);
    setPollDurationHours(24);

    setActiveNodeIndex(nextIndex);

    setTimeout(() => {
      isSwitchingRef.current = false;
    }, 50);

    toast.success(t`Nouvelle pensée ajoutée au fil.`);
  };

  // 4. Retirer une pensée du fil
  const removeThreadNode = (nodeId: string) => {
    if (threadNodes.length <= 1) return;

    const indexToRemove = threadNodes.findIndex((n) => n.id === nodeId);
    if (indexToRemove === -1) return;

    const targetNode = threadNodes[indexToRemove];
    if (
      (targetNode.text.trim().length > 0 || targetNode.images.length > 0) &&
      indexToRemove === activeNodeIndex
    ) {
      if (!confirm(t`Voulez-vous vraiment supprimer cette pensée et son contenu ?`)) {
        return;
      }
    }

    const nextNodes = threadNodes.filter((n) => n.id !== nodeId);

    let nextIndex = activeNodeIndex;
    if (activeNodeIndex === indexToRemove) {
      nextIndex = Math.max(0, indexToRemove - 1);
    } else if (activeNodeIndex > indexToRemove) {
      nextIndex = activeNodeIndex - 1;
    }

    const nextActiveNode = nextNodes[nextIndex];
    isSwitchingRef.current = true;
    setPostText(nextActiveNode.text);
    setImages(nextActiveNode.images);
    setIsTriggerWarning(nextActiveNode.isTriggerWarning);
    setTriggerWarning(nextActiveNode.triggerWarning);
    setShowPollEditor(nextActiveNode.showPollEditor);
    setPollOptions(nextActiveNode.pollOptions);
    setPollDurationHours(nextActiveNode.pollDurationHours);

    setThreadNodes(nextNodes);
    setActiveNodeIndex(nextIndex);

    setTimeout(() => {
      isSwitchingRef.current = false;
    }, 50);

    toast.success(t`Pensée retirée du fil.`);
  };

  // 5. Basculer de nœud d'édition
  const handleSwitchNode = (targetIndex: number) => {
    if (targetIndex === activeNodeIndex) return;

    setThreadNodes((prev) => {
      const copy = [...prev];
      if (copy[activeNodeIndex]) {
        copy[activeNodeIndex] = {
          id: threadNodes[activeNodeIndex].id,
          text: postText,
          images,
          isTriggerWarning,
          triggerWarning,
          showPollEditor,
          pollOptions,
          pollDurationHours,
        };
      }

      const targetNode = copy[targetIndex];
      if (targetNode) {
        isSwitchingRef.current = true;
        setPostText(targetNode.text);
        setImages(targetNode.images);
        setIsTriggerWarning(targetNode.isTriggerWarning);
        setTriggerWarning(targetNode.triggerWarning);
        setShowPollEditor(targetNode.showPollEditor);
        setPollOptions(targetNode.pollOptions);
        setPollDurationHours(targetNode.pollDurationHours);

        setTimeout(() => {
          isSwitchingRef.current = false;
        }, 50);
      }

      return copy;
    });

    setActiveNodeIndex(targetIndex);
  };

  // 6. Charger un brouillon local de fil entier
  const handleLoadLocalThreadDraft = () => {
    try {
      const raw = localStorage.getItem('qoe_multi_thought_drafts');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return;

      setThreadNodes(parsed);

      const node0 = parsed[0];
      isSwitchingRef.current = true;
      setPostText(node0.text);
      setImages(node0.images);
      setIsTriggerWarning(node0.isTriggerWarning);
      setTriggerWarning(node0.triggerWarning);
      setShowPollEditor(node0.showPollEditor);
      setPollOptions(node0.pollOptions);
      setPollDurationHours(node0.pollDurationHours);

      setActiveNodeIndex(0);
      setIsComposerExpanded(true);
      setIsDraftsOpen(false);

      setTimeout(() => {
        isSwitchingRef.current = false;
      }, 50);

      toast.success(t`Fil de discussion restauré avec succès !`);
    } catch {
      toast.error('Impossible de restaurer le fil.');
    }
  };

  // Universal Typeahead State (@mentions, #hashtags, :emojis:)
  const [typeaheadType, setTypeaheadType] = useState<'profile' | 'tag' | 'emoji' | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion[]>([]);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState<number>(0);
  const [mentionPosition, setMentionPosition] = useState<{ start: number; end: number } | null>(
    null
  );

  const EMOJI_MAP: Record<string, string> = {
    fire: '🔥',
    heart: '❤️',
    rocket: '🚀',
    sparkles: '✨',
    '100': '💯',
    thumbsup: '👍',
    check: '✅',
    star: '⭐',
    smile: '😊',
    laughing: '😂',
    clap: '👏',
    eyes: '👀',
  };

  const checkMentionTrigger = (text: string, selectionStart: number) => {
    const textBeforeCursor = text.substring(0, selectionStart);

    // 1. @Profile match
    const profileMatch = textBeforeCursor.match(/@([a-zA-Z0-9_.-]*)$/);
    if (profileMatch) {
      setTypeaheadType('profile');
      setMentionQuery(profileMatch[1]);
      setMentionPosition({ start: selectionStart - profileMatch[0].length, end: selectionStart });
      setMentionSelectedIndex(0);
      return;
    }

    // 2. #Hashtag match
    const tagMatch = textBeforeCursor.match(/#([a-zA-Z0-9_-]*)$/);
    if (tagMatch) {
      setTypeaheadType('tag');
      setMentionQuery(tagMatch[1]);
      setMentionPosition({ start: selectionStart - tagMatch[0].length, end: selectionStart });
      setMentionSelectedIndex(0);
      return;
    }

    // 3. :Emoji: match
    const emojiMatch = textBeforeCursor.match(/:([a-zA-Z0-9_+-]*)$/);
    if (emojiMatch) {
      setTypeaheadType('emoji');
      setMentionQuery(emojiMatch[1]);
      setMentionPosition({ start: selectionStart - emojiMatch[0].length, end: selectionStart });
      setMentionSelectedIndex(0);
      return;
    }

    setTypeaheadType(null);
    setMentionQuery(null);
    setMentionPosition(null);
    setMentionSuggestions([]);
  };

  useEffect(() => {
    if (mentionQuery === null || typeaheadType === null) {
      setMentionSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      if (typeaheadType === 'profile') {
        try {
          const { searchUsersAction } = await import('@qoe/sdk/actions/feed');
          const res = await searchUsersAction(mentionQuery);
          if (res.ok && res.data?.users) {
            setMentionSuggestions(res.data.users.map((u) => ({ ...u, _type: 'profile' })));
          }
        } catch (err) {
          console.error('Mention search error:', err);
        }
      } else if (typeaheadType === 'tag') {
        const q = mentionQuery.toLowerCase();
        const defaultTags =
          tagsList.length > 0 ? tagsList : ['design', 'tech', 'qoe', 'dev', 'crypto', 'ia'];
        const matches = defaultTags.filter((t) => t.toLowerCase().includes(q));
        setMentionSuggestions(
          matches.map((tag) => ({ id: tag, name: `#${tag}`, _type: 'tag', value: tag }))
        );
      } else if (typeaheadType === 'emoji') {
        const q = mentionQuery.toLowerCase();
        const matches = Object.entries(EMOJI_MAP).filter(([name]) => name.includes(q));
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
    }, 100);

    return () => clearTimeout(timer);
  }, [mentionQuery, typeaheadType, tagsList]);

  const insertMention = (item: MentionSuggestion) => {
    if (!mentionPosition || !textareaRef.current) return;
    let textToInsert = '';
    if (item._type === 'profile') {
      const handle = item.username || item.subdomain || item.id.slice(0, 8);
      textToInsert = `@${handle} `;
    } else if (item._type === 'tag') {
      textToInsert = `#${item.value} `;
    } else if (item._type === 'emoji') {
      textToInsert = `${item.char} `;
    }

    const before = postText.substring(0, mentionPosition.start);
    const after = postText.substring(mentionPosition.end);
    const newText = `${before}${textToInsert}${after}`;
    setPostText(newText);
    setTypeaheadType(null);
    setMentionQuery(null);
    setMentionPosition(null);
    setMentionSuggestions([]);
    localStorage.setItem('qoe_thought_draft', newText);

    setTimeout(() => {
      if (textareaRef.current) {
        const newCursor = mentionPosition.start + textToInsert.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 10);
  };

  // Load draft from localStorage on mount
  useEffect(() => {
    if (!dbUser) return;
    const saved =
      localStorage.getItem('qoe_thought_draft') || localStorage.getItem('qoe_micro_post_draft');
    if (saved) {
      setPostText(saved);
      setIsComposerExpanded(true);
    }
  }, [dbUser]);

  // Auto-grow height logic
  useEffect(() => {
    if (textareaRef.current && isComposerExpanded) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [postText, isComposerExpanded]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!dbUser) {
      if (onLoginRequired) {
        onLoginRequired();
      }
      return;
    }
    const val = e.target.value;
    setPostText(val);
    localStorage.setItem('qoe_thought_draft', val);
    if (val.trim()) {
      setIsComposerExpanded(true);
    }
    checkMentionTrigger(val, e.target.selectionStart || val.length);
  };

  const CHAR_LIMIT = 500;
  const getUrls = (text: string) => {
    const urlRegex = /https?:\/\/[^\s]+/gi;
    return text.match(urlRegex) || [];
  };
  const calculateCharacters = (text: string) => {
    const urls = getUrls(text);
    let len = text.length;
    for (const url of urls) {
      len -= url.length;
      const isInternal = url.includes('/post/') || url.includes('/article/');
      if (!isInternal) {
        len += 20;
      }
    }
    return len;
  };

  const currentLength = calculateCharacters(postText);
  const isOverLimit = currentLength > CHAR_LIMIT;
  const charsRemaining = CHAR_LIMIT - currentLength;

  // Client-side premium image compression
  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          const MAX_WIDTH = 1600;
          const MAX_HEIGHT = 1600;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                resolve(file);
              }
            },
            'image/jpeg',
            0.82
          );
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const processAndAddFile = async (file: File, replaceId?: string) => {
    if (file.size > 8 * 1024 * 1024) {
      toast.error(`L'image ${file.name} dépasse la limite de 8 Mo.`);
      return;
    }

    const tempId = replaceId || generateUUID();
    const initialBlobUrl = URL.createObjectURL(file);

    if (replaceId) {
      setImages((prev) =>
        prev.map((img) => (img.id === replaceId ? { ...img, url: initialBlobUrl, file } : img))
      );
    } else {
      setImages((prev) => [...prev, { id: tempId, url: initialBlobUrl, file }]);
    }

    try {
      const compressedBlob = await compressImage(file);
      const compressedFile = new File(
        [compressedBlob],
        file.name.replace(/\.[^/.]+$/, '') + '.jpg',
        {
          type: 'image/jpeg',
        }
      );
      const compressedBlobUrl = URL.createObjectURL(compressedBlob);

      setImages((prev) =>
        prev.map((img) => {
          if (img.id === tempId) {
            if (img.url.startsWith('blob:')) {
              URL.revokeObjectURL(img.url);
            }
            return { ...img, url: compressedBlobUrl, file: compressedFile };
          }
          return img;
        })
      );
    } catch (err) {
      console.error('Compression error:', err);
    }
  };

  const handlePostImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (images.length + files.length > 4) {
      toast.error(t`Vous pouvez ajouter jusqu'à 4 images maximum par post.`);
      return;
    }

    setSubmitError(null);

    for (const file of files) {
      await processAndAddFile(file);
    }
    e.target.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      if (images.length + files.length > 4) {
        toast.error(t`Vous pouvez ajouter jusqu'à 4 images maximum par post.`);
        return;
      }
      setSubmitError(null);
      for (const file of files) {
        await processAndAddFile(file);
      }
    }
  };

  const handleReplaceImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && replacingImageId) {
      await processAndAddFile(file, replacingImageId);
      setReplacingImageId(null);
    }
    e.target.value = '';
  };

  const moveImage = (index: number, direction: 'left' | 'right') => {
    const nextIndex = direction === 'left' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= images.length) return;

    setImages((prev) => {
      const newImages = [...prev];
      const temp = newImages[index];
      newImages[index] = newImages[nextIndex];
      newImages[nextIndex] = temp;
      return newImages;
    });
  };

  const getScheduledDateTimeString = () => {
    if (!scheduledDate) return null;
    return scheduledDate.toISOString();
  };

  const handleLoadDraft = (draft: ThoughtDraft) => {
    setPostText(draft.content || '');

    const imageUrls = getImages(draft.imageUrl);
    const composerImages = imageUrls.map((url) => ({
      id: generateUUID(),
      url,
      isUploading: false,
    }));
    setImages(composerImages);

    setVisibility(draft.visibility || 'public');
    setIsScheduled(!!draft.scheduledAt);
    setScheduledDate(draft.scheduledAt ? new Date(draft.scheduledAt) : undefined);
    setIsTriggerWarning(!!draft.triggerWarning);
    setTriggerWarning(draft.triggerWarning || '');

    setLoadedDraftId(draft.id);
    setIsComposerExpanded(true);
    setIsDraftsOpen(false);

    localStorage.setItem('qoe_micro_post_draft', draft.content || '');
    toast.success(t`Brouillon chargé dans l'éditeur.`);
  };

  const handleDeleteDraft = async (draftId: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    if (loadedDraftId === draftId) {
      setLoadedDraftId(null);
    }

    try {
      const { deletePostAction } = await import('@qoe/sdk/actions/feed');
      const res = await deletePostAction(draftId);
      if (res.ok) {
        toast.success(t`Brouillon supprimé.`);
      } else {
        toast.error('Impossible de supprimer le brouillon.');
        loadDrafts();
      }
    } catch (err) {
      console.error(err);
      toast.error(t`Erreur réseau lors de la suppression.`);
      loadDrafts();
    }
  };

  const loadDrafts = async () => {
    setLoadingDrafts(true);
    try {
      const { getUserDraftsAction } = await import('@qoe/sdk/actions/feed');
      const res = await getUserDraftsAction();
      if (res.ok && res.data?.drafts) {
        setDrafts(res.data.drafts);
      } else {
        setDrafts([]);
      }
    } catch (err) {
      console.error(err);
      toast.error(t`Erreur lors de la récupération des brouillons.`);
    } finally {
      setLoadingDrafts(false);
    }
  };

  useEffect(() => {
    if (isDraftsOpen) {
      loadDrafts();
    }
  }, [isDraftsOpen]);

  const uploadComposerImages = async (composerImages: ComposerImage[]): Promise<string[]> => {
    const uploadedUrls: string[] = [];
    for (const img of composerImages) {
      if (!img.file) {
        uploadedUrls.push(img.url);
        continue;
      }
      const formData = new FormData();
      formData.append('file', img.file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        throw new Error("Erreur lors de l'envoi d'une image au serveur.");
      }
      const data = await res.json();
      if (!data.url) {
        throw new Error(t`L'upload de l'image a échoué.`);
      }
      uploadedUrls.push(data.url);
    }
    return uploadedUrls;
  };

  const handlePostSubmit = async (e: React.FormEvent, forceDraft?: boolean) => {
    e.preventDefault();

    // 1. Sauvegarder d'abord les modifications du nœud d'édition actif dans le tableau threadNodes
    const finalNodes = [...threadNodes];
    if (finalNodes[activeNodeIndex]) {
      finalNodes[activeNodeIndex] = {
        id: threadNodes[activeNodeIndex].id,
        text: postText,
        images,
        isTriggerWarning,
        triggerWarning,
        showPollEditor,
        pollOptions,
        pollDurationHours,
      };
    }

    const isDraftSubmit = forceDraft !== undefined ? forceDraft : isDraft;

    // Validation : Au moins un nœud doit contenir du texte ou une image
    const hasContent = finalNodes.some((n) => n.text.trim().length > 0 || n.images.length > 0);
    if (!hasContent || !dbUser || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);
    setSubmitProgress(t`Préparation de la publication du fil...`);

    try {
      const { createThoughtThreadAction, deletePostAction } = await import('@qoe/sdk/actions/feed');

      const thoughtsPayload = [];
      let firstCreatedPost: CreatedPostRecord | null = null;

      // 1. Upload des images associées à chaque nœud du fil
      for (let i = 0; i < finalNodes.length; i++) {
        const node = finalNodes[i];
        const textContent = node.text.trim();

        setSubmitProgress(`Préparation et envoi des images (${i + 1}/${finalNodes.length})...`);

        const uploadedUrls = await uploadComposerImages(node.images);
        const imagePayload = uploadedUrls.length > 0 ? JSON.stringify(uploadedUrls) : null;
        const attachmentPayload = node.images.map((img, idx) => ({
          url: uploadedUrls[idx] || img.url,
          type: 'IMAGE',
          altText: img.altText || undefined,
          order: idx,
        }));

        // Tags spécifiques
        const tags = textContent.match(/#[a-zA-Z0-9_-]+/g) || [];

        // Sondage spécifique
        const validPollOptions = node.pollOptions.map((o) => o.trim()).filter(Boolean);
        const pollPayload =
          node.showPollEditor && validPollOptions.length >= 2
            ? { options: validPollOptions, durationHours: node.pollDurationHours }
            : null;

        // La citation est stockée séparément du texte du post : le feed pourra
        // reconstruire la carte et surligner l'extrait sans afficher l'URL source.
        const contentToSubmit = textContent;

        thoughtsPayload.push({
          content: contentToSubmit,
          tags,
          imageUrl: imagePayload,
          quotedArticleId: i === 0 ? quotedArticle?.id || null : null,
          quotedExcerpt: i === 0 ? quotedExcerpt?.trim() || null : null,
          attachments: attachmentPayload,
          triggerWarning:
            node.isTriggerWarning && node.triggerWarning.trim() ? node.triggerWarning.trim() : null,
          poll: pollPayload,
        });
      }

      // 2. Publication atomique du fil entier côté serveur
      setSubmitProgress(
        isDraftSubmit
          ? 'Enregistrement du brouillon de fil...'
          : 'Publication de votre fil de discussion...'
      );

      const res = await createThoughtThreadAction({
        thoughts: thoughtsPayload,
        visibility, // thread-level
        isDraft: isDraftSubmit, // thread-level
        scheduledAt: isScheduled && scheduledDate ? getScheduledDateTimeString() : null, // thread-level
        replyRestriction, // thread-level
        parentId: replyToThought?.id || parentId || null,
      });

      if (!res.ok) {
        throw new Error(res.error?.message || 'Impossible de publier le fil de discussion.');
      }
      if (!res.data?.posts || res.data.posts.length === 0) {
        throw new Error(t`Impossible de publier le fil (données de publication manquantes).`);
      }

      firstCreatedPost = res.data.posts[0];

      // Nettoyer les objets blobs
      finalNodes.forEach((node) => {
        node.images.forEach((img) => {
          if (img.url.startsWith('blob:')) {
            URL.revokeObjectURL(img.url);
          }
        });
      });

      // Supprimer le brouillon d'origine s'il était chargé
      if (loadedDraftId) {
        try {
          await deletePostAction(loadedDraftId);
        } catch (err) {
          console.error('Failed to delete original draft post after publishing:', err);
        }
        setLoadedDraftId(null);
      }

      // Réinitialiser les états
      setShowPollEditor(false);
      setPollOptions(['', '']);

      const isFuture =
        isScheduled && scheduledDate && new Date(getScheduledDateTimeString() || '') > new Date();

      // Déclencher le callback feed local (seulement si publié immédiatement, et on injecte le premier post)
      if (!isDraftSubmit && !isFuture && onPostCreated && firstCreatedPost) {
        onPostCreated({
          id: firstCreatedPost.id,
          title: '',
          slug: `post-${firstCreatedPost.id}`,
          content: firstCreatedPost.content,
          imageUrl: firstCreatedPost.imageUrl || null,
          quotedExcerpt: quotedExcerpt || null,
          articleQuote: quotedArticle,
          published: true,
          isPremium: false,
          readingTime: 1,
          createdAt: firstCreatedPost.createdAt,
          author: {
            ...firstCreatedPost.author,
            isCertified: firstCreatedPost.author?.isCertified || false,
          },
          repost: firstCreatedPost.repost
            ? {
                ...firstCreatedPost.repost,
                createdAt: firstCreatedPost.repost.createdAt || firstCreatedPost.createdAt,
                author: {
                  ...firstCreatedPost.repost.author,
                  isCertified: firstCreatedPost.repost.author?.isCertified || false,
                },
              }
            : null,
          parent: firstCreatedPost.parent
            ? {
                ...firstCreatedPost.parent,
                author: {
                  ...firstCreatedPost.parent.author,
                  isCertified: firstCreatedPost.parent.author?.isCertified || false,
                },
              }
            : null,
          category: { name: 'Thought' },
          tags: firstCreatedPost.tags || [],
        } as unknown as ComposedPost);
      }

      toast.success(
        isDraftSubmit ? t`Brouillon de fil enregistré.` : t`Fil de discussion publié !`
      );

      // Remise à zéro complète
      setPostText('');
      setImages([]);
      setQuotedThought(null);
      setQuotedArticle(null);
      setQuotedExcerpt(null);
      setVisibility('public');
      setIsScheduled(false);
      setScheduledDate(undefined);
      setIsTriggerWarning(false);
      setTriggerWarning('');
      setIsDraft(false);
      setShowVisibilityDropdown(false);
      setShowScheduleDropdown(false);
      setShowWarningDropdown(false);
      setOverflowStyle('hidden');

      // Nettoyage des brouillons en cache local
      localStorage.removeItem('qoe_multi_thought_drafts');
      localStorage.removeItem('qoe_thought_draft');
      localStorage.removeItem('qoe_micro_post_draft');

      // Réinitialisation des nœuds du fil
      setThreadNodes([
        {
          id: generateUUID(),
          text: '',
          images: [],
          isTriggerWarning: false,
          triggerWarning: '',
          showPollEditor: false,
          pollOptions: ['', ''],
          pollDurationHours: 24,
        },
      ]);
      setActiveNodeIndex(0);
      setIsComposerExpanded(false);
    } catch (err: unknown) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : t`Erreur de publication du fil. Veuillez réessayer.`;
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
      setSubmitProgress(null);
    }
  };

  const defaultPlaceholder =
    placeholder ||
    (replyToThought || parentId ? t`Poster votre réponse` : t`Quelle est votre pensée du jour ?`);

  return (
    <div className="pb-4 border-b border-border/30 flex flex-col gap-2 font-sans transition-all duration-200">
      {/* Reply Context Header (Twitter/X Style) */}
      {replyToThought && (
        <div className="flex flex-col gap-0 mb-2 font-sans">
          <div className="flex items-start gap-3 relative">
            <div className="flex flex-col items-center shrink-0">
              <AuthorAvatar user={replyToThought.author} size="sm" showBadge={false} />
              {/* Continuous vertical line extending down to current user avatar */}
              <div className="w-[2px] bg-border/50 flex-1 my-1 rounded-full min-h-[28px]" />
            </div>

            <div className="flex-1 min-w-0 pb-2 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs flex-wrap">
                  <ProfileHoverCard user={replyToThought.author}>
                    <span className="font-bold text-foreground hover:text-brand transition-colors cursor-pointer">
                      {replyToThought.author?.name || 'Auteur'}
                    </span>
                  </ProfileHoverCard>
                  {replyToThought.author?.isCertified && <CertifiedBadge />}
                  <ProfileHoverCard user={replyToThought.author}>
                    <span className="text-muted-foreground text-[11px] hover:text-brand transition-colors cursor-pointer">
                      @
                      {replyToThought.author?.username ||
                        replyToThought.author?.subdomain ||
                        'utilisateur'}
                    </span>
                  </ProfileHoverCard>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyToThought(null)}
                  className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title={t`Annuler la réponse`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-xs text-foreground/90 leading-relaxed font-sans line-clamp-3">
                {replyToThought.content}
              </p>

              <div className="text-[11px] text-muted-foreground pt-1">
                En réponse à{' '}
                <span className="text-brand font-medium">
                  {[
                    replyToThought.author?.username || replyToThought.author?.subdomain || 'auteur',
                    replyToThought.parent?.author?.username ||
                      replyToThought.parent?.author?.subdomain,
                  ]
                    .filter(Boolean)
                    .filter((val, idx, arr) => arr.indexOf(val) === idx)
                    .map((handle) => `@${handle}`)
                    .join(', ')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Composer Row */}
      <form onSubmit={(e) => handlePostSubmit(e)} className="space-y-4 font-sans">
        <div className="flex flex-col gap-4">
          {threadNodes.map((node, idx) => {
            const isActive = idx === activeNodeIndex;
            const isLast = idx === threadNodes.length - 1;

            // On récupère soit l'état "buffer actif" (si actif), soit l'état gelé stocké dans threadNodes
            const displayText = isActive ? postText : node.text;
            const displayImages = isActive ? images : node.images;

            return (
              <div key={node.id} className="flex gap-3 items-start relative group">
                {/* Left Column: Avatar & Continuous Connecting Thread Line */}
                <div className="flex flex-col items-center shrink-0 w-10 relative">
                  <AuthorAvatar user={dbUser} size="md" showBadge={false} />

                  {/* Vertical connector line (Bluesky style) */}
                  {!isLast && (
                    <div className="absolute top-10 bottom-[-24px] left-[19px] w-[2px] bg-border/40" />
                  )}
                </div>

                {/* Right Column: Text editor / static content */}
                <div className="flex-1 min-w-0 pb-1">
                  {isActive ? (
                    // 1. ACTIVE NODE (Editable Textarea + Active Attachments)
                    <div className="space-y-2">
                      <textarea
                        ref={textareaRef}
                        placeholder={
                          idx === 0 ? defaultPlaceholder : t`Ajouter une autre pensée à ce fil...`
                        }
                        value={displayText}
                        onChange={handleTextChange}
                        onFocus={() => {
                          if (!dbUser) {
                            textareaRef.current?.blur();
                            if (onLoginRequired) {
                              onLoginRequired();
                            }
                            return;
                          }
                          setIsComposerExpanded(true);
                        }}
                        onKeyDown={(e) => {
                          if (mentionSuggestions.length > 0) {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setMentionSelectedIndex(
                                (prev) => (prev + 1) % mentionSuggestions.length
                              );
                              return;
                            }
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setMentionSelectedIndex(
                                (prev) =>
                                  (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length
                              );
                              return;
                            }
                            if (e.key === 'Enter' || e.key === 'Tab') {
                              e.preventDefault();
                              insertMention(mentionSuggestions[mentionSelectedIndex]);
                              return;
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              setMentionSuggestions([]);
                              setMentionQuery(null);
                              return;
                            }
                          }

                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault();
                            handlePostSubmit(e);
                          } else if (e.key === 'Escape') {
                            setIsComposerExpanded(false);
                            setImages([]);
                            setPostText('');
                            setVisibility('public');
                            setIsScheduled(false);
                            setScheduledDate(undefined);
                            setIsTriggerWarning(false);
                            setTriggerWarning('');
                            setIsDraft(false);
                            setShowVisibilityDropdown(false);
                            setShowScheduleDropdown(false);
                            setShowWarningDropdown(false);
                            setOverflowStyle('hidden');
                            setMentionSuggestions([]);
                            setMentionQuery(null);
                            localStorage.removeItem('qoe_micro_post_draft');
                          }
                        }}
                        onPaste={handlePaste}
                        disabled={isSubmitting}
                        className={cn(
                          'w-full font-sans text-sm focus:outline-none resize-none transition-all duration-200',
                          'placeholder:text-muted-foreground/60 text-foreground font-normal p-0',
                          'bg-transparent border-0 focus:ring-0 leading-relaxed min-h-[44px]'
                        )}
                        style={{ height: 'auto' }}
                      />

                      {/* Universal Typeahead Suggestions Dropdown */}
                      {mentionSuggestions.length > 0 && (
                        <div className="relative font-sans z-[100]">
                          <div className="absolute top-1 left-0 w-72 max-h-56 overflow-y-auto bg-popover text-popover-foreground border border-border/80 rounded-xl shadow-2xl p-1 font-sans animate-in fade-in-0 zoom-in-95 duration-100">
                            {mentionSuggestions.map((item, idx) => {
                              const isSelected = idx === mentionSelectedIndex;
                              return (
                                <div
                                  key={item.id || idx}
                                  onClick={() => insertMention(item)}
                                  className={cn(
                                    'flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors text-xs select-none',
                                    isSelected
                                      ? 'bg-accent text-accent-foreground font-semibold'
                                      : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                                  )}
                                >
                                  {item._type === 'profile' && (
                                    <>
                                      <AuthorAvatar user={item} size="xs" showBadge={false} />
                                      <div className="flex flex-col min-w-0 flex-1">
                                        <div className="flex items-center gap-1">
                                          <span className="font-bold truncate text-foreground">
                                            {item.name || 'Auteur'}
                                          </span>
                                          {item.isCertified && <CertifiedBadge />}
                                        </div>
                                        <span className="text-[11px] truncate text-muted-foreground">
                                          @{item.username || item.subdomain}
                                        </span>
                                      </div>
                                    </>
                                  )}
                                  {item._type === 'tag' && (
                                    <div className="flex items-center gap-2 font-medium">
                                      <span className="font-bold text-primary">#</span>
                                      <span className="text-foreground">{item.value}</span>
                                    </div>
                                  )}
                                  {item._type === 'emoji' && (
                                    <div className="flex items-center gap-2 font-medium">
                                      <span className="text-base">{item.char}</span>
                                      <span className="text-muted-foreground text-xs">
                                        {item.name}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    // 2. INACTIVE NODE (Static Preview + Switching onClick)
                    <div
                      onClick={() => handleSwitchNode(idx)}
                      className="cursor-pointer py-1.5 min-h-[44px] text-foreground/85 hover:text-foreground transition-all text-sm font-sans"
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {displayText || (
                          <span className="text-muted-foreground/35 italic">
                            Ajouter un post au fil...
                          </span>
                        )}
                      </p>

                      {/* Static images for inactive nodes */}
                      {displayImages.length > 0 && (
                        <div
                          className={cn(
                            'grid gap-1.5 mt-2 max-w-md pointer-events-none opacity-80',
                            displayImages.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                          )}
                        >
                          {displayImages.map((img) => (
                            <div
                              key={img.id}
                              className="relative aspect-video bg-muted/20 border border-border/20 overflow-hidden rounded-xl"
                            >
                              <NextImage
                                src={img.url}
                                fill
                                className="object-cover"
                                alt=""
                                sizes="(max-width: 768px) 100vw, 640px"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quote Post and Article Quote Previews (Only applicable on the root post / idx === 0) */}
                  {idx === 0 && quotedThought && (
                    <div className="relative my-2">
                      <button
                        type="button"
                        onClick={() => setQuotedThought(null)}
                        className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-foreground/80 text-background hover:bg-foreground transition-colors cursor-pointer"
                        title="Retirer la citation"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <QuotedThoughtCard post={quotedThought} />
                    </div>
                  )}

                  {idx === 0 && quotedArticle && (
                    <div className="relative my-2">
                      <button
                        type="button"
                        onClick={() => {
                          setQuotedArticle(null);
                          setQuotedExcerpt(null);
                        }}
                        className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-foreground/80 text-background hover:bg-foreground transition-colors cursor-pointer shadow-md"
                        title="Retirer la citation"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <QuotedArticleCard
                        article={quotedArticle}
                        quotedExcerpt={quotedExcerpt || undefined}
                      />
                    </div>
                  )}
                </div>

                {/* Individual Trash Node Action (only if thread is multi-node) */}
                {threadNodes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeThreadNode(node.id)}
                    className="p-1.5 rounded-full text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 cursor-pointer shrink-0 self-start mt-0.5 transition-all outline-none"
                    title={t`Supprimer cette pensée du fil`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Global Thread Bottom Controls (Expandable Toolbar, Character Counter, Submit, + Add thread node) */}
        <AnimatePresence>
          {(isComposerExpanded || threadNodes.length > 1) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onAnimationStart={() => setOverflowStyle('hidden')}
              onAnimationComplete={() => {
                if (isComposerExpanded || threadNodes.length > 1) setOverflowStyle('visible');
              }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="flex flex-col gap-3.5 mt-2"
              style={{ overflow: overflowStyle }}
            >
              {/* Submit Error message */}
              {submitError && (
                <div className="bg-destructive/10 text-destructive text-[11px] font-semibold p-3 rounded-lg flex items-center gap-2 border border-destructive/20">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Progress message for multi-post publication */}
              {submitProgress && (
                <div className="bg-primary/10 text-primary text-[11px] font-semibold p-3 rounded-lg flex items-center gap-2.5 border border-primary/20 animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                  <span>{submitProgress}</span>
                </div>
              )}

              {/* ACTIVE IMAGES PREVIEW GRID (Only for currently active node index) */}
              {images.length > 0 && (
                <div
                  className={cn('grid gap-2', images.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}
                >
                  <AnimatePresence initial={false}>
                    {images.map((img, idx) => (
                      <motion.div
                        key={img.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        className="relative aspect-video bg-muted/40 border border-border/40 group overflow-hidden rounded-xl"
                      >
                        <NextImage
                          src={img.url}
                          className={cn(
                            'w-full h-full object-cover transition-all duration-500',
                            img.isUploading ? 'blur-md scale-95' : 'blur-0 scale-100'
                          )}
                          alt=""
                          sizes="(max-width: 768px) 100vw, 640px"
                        />

                        {/* Hover Actions Overlay */}
                        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2.5 z-10">
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-1">
                              {idx > 0 && (
                                <button
                                  type="button"
                                  onClick={() => moveImage(idx, 'left')}
                                  className="bg-black/60 hover:bg-black/85 text-white p-1.5 rounded-[var(--radius-button)] cursor-pointer transition-colors"
                                  title={t`Déplacer vers la gauche`}
                                >
                                  <ArrowLeft className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {idx < images.length - 1 && (
                                <button
                                  type="button"
                                  onClick={() => moveImage(idx, 'right')}
                                  className="bg-black/60 hover:bg-black/85 text-white p-1.5 rounded-[var(--radius-button)] cursor-pointer transition-colors"
                                  title={t`Déplacer vers la droite`}
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const newAlt = prompt(
                                    "Saisissez la description Alt-Text d'accessibilité pour cette image :",
                                    img.altText || ''
                                  );
                                  if (newAlt !== null) {
                                    setImages((prev) =>
                                      prev.map((i) =>
                                        i.id === img.id ? { ...i, altText: newAlt.trim() } : i
                                      )
                                    );
                                  }
                                }}
                                className={cn(
                                  'px-2 py-1 rounded-[var(--radius-button)] text-[11px] font-bold cursor-pointer transition-colors border',
                                  img.altText
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-black/60 hover:bg-black/85 text-white border-white/20'
                                )}
                                title={
                                  img.altText
                                    ? `Alt-text: ${img.altText}`
                                    : t`Ajouter un texte d'accessibilité`
                                }
                              >
                                ALT
                              </button>
                              <button
                                type="button"
                                onClick={() => setCroppingImage(img)}
                                className="bg-black/60 hover:bg-black/85 text-white p-1.5 rounded-[var(--radius-button)] cursor-pointer transition-colors"
                                title="Recadrer l'image"
                              >
                                <CropIcon className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReplacingImageId(img.id);
                                  replaceInputRef.current?.click();
                                }}
                                className="bg-black/60 hover:bg-black/85 text-white p-1.5 rounded-[var(--radius-button)] cursor-pointer transition-colors"
                                title="Remplacer l'image"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                if (img.url.startsWith('blob:')) {
                                  URL.revokeObjectURL(img.url);
                                }
                                setImages((prev) => prev.filter((i) => i.id !== img.id));
                              }}
                              className="bg-destructive/80 hover:bg-destructive text-background p-1.5 rounded-[var(--radius-button)] cursor-pointer transition-colors"
                              title="Supprimer l'image"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Hidden file inputs */}
              <input
                type="file"
                ref={replaceInputRef}
                onChange={handleReplaceImage}
                accept="image/*"
                className="hidden"
              />

              {/* ACTIVE POLL EDITOR */}
              {showPollEditor && (
                <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 space-y-3 font-sans my-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <BarChart2 className="w-4 h-4" />
                      Créer un sondage
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPollEditor(false);
                        setPollOptions(['', '']);
                      }}
                      className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                      title="Retirer le sondage"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder={`Option ${idx + 1}`}
                          value={opt}
                          onChange={(e) => {
                            const updated = [...pollOptions];
                            updated[idx] = e.target.value;
                            setPollOptions(updated);
                          }}
                          maxLength={80}
                          className="flex-1 bg-background/80 border border-border/60 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                        />
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                            title="Supprimer cette option"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    {pollOptions.length < 4 ? (
                      <button
                        type="button"
                        onClick={() => setPollOptions([...pollOptions, ''])}
                        className="text-primary font-semibold hover:underline flex items-center gap-1 text-[11px] cursor-pointer"
                      >
                        + Ajouter une option
                      </button>
                    ) : (
                      <span />
                    )}

                    <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                      <span>{t`Durée :`}</span>
                      <select
                        value={pollDurationHours}
                        onChange={(e) => setPollDurationHours(Number(e.target.value))}
                        className="bg-background border border-border/60 rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none cursor-pointer"
                      >
                        <option value={1}>1 heure</option>
                        <option value={6}>6 heures</option>
                        <option value={24}>1 jour</option>
                        <option value={72}>3 jours</option>
                        <option value={168}>7 jours</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Threadgate & Visibility settings */}
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)]/60 text-xs">
                {/* Reply Restriction Dropdown (Threadgate) */}
                <Popover
                  open={showReplyRestrictionDropdown}
                  onOpenChange={setShowReplyRestrictionDropdown}
                >
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        className={cn(
                          'px-2.5 py-1 rounded-full border transition-all cursor-pointer flex items-center gap-1.5 text-[11px] font-semibold',
                          replyRestriction !== 'everyone'
                            ? 'bg-primary/10 border-primary/40 text-primary'
                            : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        )}
                        title={t`Qui peut répondre`}
                      >
                        <Globe className="w-3 h-3 text-primary" />
                        <span>
                          {replyRestriction === 'everyone' && t`Tout le monde peut répondre`}
                          {replyRestriction === 'subscribers' && t`Abonnés uniquement`}
                          {replyRestriction === 'following' && t`Personnes suivies`}
                          {replyRestriction === 'mentioned' && t`Personnes mentionnées`}
                        </span>
                      </button>
                    }
                  />
                  <PopoverContent
                    align="start"
                    className="w-56 p-1.5 space-y-0.5 bg-popover border border-border rounded-xl shadow-xl z-[150]"
                  >
                    <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Qui peut répondre ?
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyRestriction('everyone');
                        setShowReplyRestrictionDropdown(false);
                      }}
                      className={cn(
                        'w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 cursor-pointer',
                        replyRestriction === 'everyone'
                          ? 'bg-accent text-accent-foreground font-semibold'
                          : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Tout le monde</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyRestriction('subscribers');
                        setShowReplyRestrictionDropdown(false);
                      }}
                      className={cn(
                        'w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 cursor-pointer',
                        replyRestriction === 'subscribers'
                          ? 'bg-accent text-accent-foreground font-semibold'
                          : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>{t`Abonnés uniquement`}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyRestriction('following');
                        setShowReplyRestrictionDropdown(false);
                      }}
                      className={cn(
                        'w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 cursor-pointer',
                        replyRestriction === 'following'
                          ? 'bg-accent text-accent-foreground font-semibold'
                          : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Personnes suivies</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyRestriction('mentioned');
                        setShowReplyRestrictionDropdown(false);
                      }}
                      className={cn(
                        'w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 cursor-pointer',
                        replyRestriction === 'mentioned'
                          ? 'bg-accent text-accent-foreground font-semibold'
                          : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <AtSign className="w-3.5 h-3.5" />
                      <span>{t`Personnes mentionnées`}</span>
                    </button>
                  </PopoverContent>
                </Popover>

                {/* Visibility Dropdown */}
                <Popover open={showVisibilityDropdown} onOpenChange={setShowVisibilityDropdown}>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        className={cn(
                          'px-2.5 py-1 rounded-full border transition-all cursor-pointer flex items-center gap-1.5 text-[11px] font-semibold',
                          visibility !== 'public'
                            ? 'bg-primary/10 border-primary/40 text-primary'
                            : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        )}
                      >
                        <Globe className="w-3 h-3" />
                        <span>{visibility === 'public' ? 'Public' : 'Followers'}</span>
                      </button>
                    }
                  />
                  <PopoverContent
                    align="start"
                    className="w-44 p-1.5 space-y-0.5 bg-popover border border-border rounded-xl shadow-xl z-[150]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setVisibility('public');
                        setShowVisibilityDropdown(false);
                      }}
                      className={cn(
                        'w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer',
                        visibility === 'public'
                          ? 'bg-accent text-accent-foreground font-semibold'
                          : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      Tout le monde
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVisibility('followers');
                        setShowVisibilityDropdown(false);
                      }}
                      className={cn(
                        'w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer',
                        visibility === 'followers'
                          ? 'bg-accent text-accent-foreground font-semibold'
                          : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      Followers uniquement
                    </button>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Main Bottom Toolbar Row */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
                {/* Left Media Tools */}
                <div className="flex items-center gap-1.5">
                  <label
                    className="cursor-pointer p-2 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all flex items-center justify-center active:scale-95"
                    title="Ajouter des images"
                  >
                    <Image className="w-4 h-4" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      multiple
                      onChange={handlePostImageUpload}
                      disabled={isSubmitting || images.length >= 4}
                    />
                  </label>

                  {/* Poll Toggle Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowPollEditor(!showPollEditor);
                      if (!showPollEditor && pollOptions.length < 2) {
                        setPollOptions(['', '']);
                      }
                    }}
                    className={cn(
                      'p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center text-xs active:scale-95',
                      showPollEditor
                        ? 'bg-primary/15 border-primary text-primary font-bold'
                        : 'border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    )}
                    title="Ajouter un sondage"
                  >
                    <BarChart2 className="w-4 h-4" />
                  </button>

                  {/* Schedule Dropdown */}
                  <Popover
                    open={showScheduleDropdown}
                    onOpenChange={(open: boolean) => {
                      setShowScheduleDropdown(open);
                      if (open && !scheduledDate) {
                        const now = new Date();
                        setScheduledDate(now);
                        setIsScheduled(true);
                      }
                    }}
                  >
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          className={cn(
                            'p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center text-xs active:scale-95',
                            isScheduled
                              ? 'bg-primary/15 border-primary text-primary font-bold'
                              : 'border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                          )}
                          title="Planifier"
                        >
                          <CalendarIcon className="w-4 h-4" />
                        </button>
                      }
                    />
                    <PopoverContent
                      align="start"
                      className="w-auto p-3.5 flex flex-col gap-3.5 bg-popover border border-border rounded-xl shadow-xl z-[150]"
                    >
                      <div className="space-y-1">
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-bold">
                          Date de publication
                        </span>
                        <Calendar
                          mode="single"
                          selected={scheduledDate}
                          onSelect={(dateVal: Date | undefined) => {
                            if (!dateVal) {
                              setScheduledDate(undefined);
                              return;
                            }
                            if (!scheduledDate) {
                              const now = new Date();
                              const newDate = new Date(dateVal);
                              newDate.setHours(now.getHours());
                              newDate.setMinutes(now.getMinutes());
                              setScheduledDate(newDate);
                            } else {
                              const newDate = new Date(dateVal);
                              newDate.setHours(scheduledDate.getHours());
                              newDate.setMinutes(scheduledDate.getMinutes());
                              newDate.setSeconds(scheduledDate.getSeconds());
                              setScheduledDate(newDate);
                            }
                            setIsScheduled(true);
                          }}
                          disabled={{ before: new Date() }}
                          className="rounded-xl border border-border bg-card"
                        />
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs gap-4">
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                          Heure
                        </span>
                        <div className="flex items-center gap-1">
                          <TimePickerInput
                            picker="hours"
                            date={scheduledDate}
                            setDate={setScheduledDate}
                            ref={hourRef}
                            onRightFocus={() => minuteRef.current?.focus()}
                            className="w-10 h-7 text-xs border-border bg-muted/40 rounded-lg text-center focus:border-primary outline-none"
                          />
                          <span className="text-muted-foreground">:</span>
                          <TimePickerInput
                            picker="minutes"
                            date={scheduledDate}
                            setDate={setScheduledDate}
                            ref={minuteRef}
                            onLeftFocus={() => hourRef.current?.focus()}
                            className="w-10 h-7 text-xs border-border bg-muted/40 rounded-lg text-center focus:border-primary outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
                        <button
                          type="button"
                          onClick={() => {
                            setIsScheduled(false);
                            setScheduledDate(undefined);
                            setShowScheduleDropdown(false);
                          }}
                          className="px-3 py-1.5 border border-border rounded-lg text-[10px] font-semibold hover:bg-muted text-muted-foreground"
                        >
                          Réinitialiser
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowScheduleDropdown(false)}
                          className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[10px] font-bold"
                        >
                          Valider
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Warning Dropdown */}
                  <Popover open={showWarningDropdown} onOpenChange={setShowWarningDropdown}>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          className={cn(
                            'p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center text-xs active:scale-95',
                            isTriggerWarning
                              ? 'bg-highlight/10 border-highlight text-highlight font-bold'
                              : 'border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                          )}
                          title="Avertissement de contenu"
                        >
                          <AlertTriangle className="w-4 h-4" />
                        </button>
                      }
                    />
                    <PopoverContent
                      align="start"
                      className="w-60 p-3.5 space-y-3 bg-popover border border-border rounded-xl shadow-xl z-[150] text-xs"
                    >
                      <label className="flex items-center justify-between cursor-pointer text-xs text-foreground font-medium">
                        <span>Masquer le contenu</span>
                        <input
                          type="checkbox"
                          checked={isTriggerWarning}
                          onChange={(e) => setIsTriggerWarning(e.target.checked)}
                          className="accent-primary cursor-pointer"
                        />
                      </label>
                      {isTriggerWarning && (
                        <input
                          type="text"
                          placeholder="Motif (ex: Spoilers, Sensible)"
                          value={triggerWarning}
                          onChange={(e) => setTriggerWarning(e.target.value)}
                          className="w-full bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary mt-1.5"
                        />
                      )}
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Right Action Tools & Primary Submit Button */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* radial character counter */}
                  {postText.length > 0 && (
                    <div className="flex items-center gap-1 pr-1">
                      {charsRemaining <= 30 && (
                        <span
                          className={cn(
                            'text-[10px] font-mono font-bold transition-colors',
                            isOverLimit ? 'text-destructive' : 'text-highlight'
                          )}
                        >
                          {charsRemaining}
                        </span>
                      )}
                      <svg className="w-4 h-4 transform -rotate-90">
                        <circle
                          cx="8"
                          cy="8"
                          r="6"
                          className="stroke-border/60"
                          strokeWidth="2"
                          fill="transparent"
                        />
                        <circle
                          cx="8"
                          cy="8"
                          r="6"
                          className={cn(
                            'transition-all duration-150',
                            isOverLimit
                              ? 'stroke-destructive'
                              : charsRemaining <= 30
                                ? 'stroke-amber-500'
                                : 'stroke-primary'
                          )}
                          strokeWidth="2"
                          strokeDasharray={2 * Math.PI * 6}
                          strokeDashoffset={
                            2 * Math.PI * 6 - (postText.length / CHAR_LIMIT) * (2 * Math.PI * 6)
                          }
                          strokeLinecap="round"
                          fill="transparent"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Plus Button to add a thread post (Brique 3) */}
                  <button
                    type="button"
                    onClick={addThreadNode}
                    disabled={isSubmitting}
                    className="p-2 rounded-xl border border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all cursor-pointer flex items-center justify-center active:scale-95 shrink-0"
                    title={t`Ajouter une autre pensée à ce fil de discussion`}
                  >
                    <Plus className="w-4 h-4 text-primary" />
                  </button>

                  {/* Unified Drafts Popover */}
                  <Popover open={showDraftPopover} onOpenChange={setShowDraftPopover}>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          className="px-2.5 py-1.5 border border-border/60 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer outline-none transition-colors"
                        >
                          Brouillons
                        </button>
                      }
                    />
                    <PopoverContent
                      align="end"
                      className="w-56 p-1.5 space-y-0.5 bg-popover border border-border rounded-xl shadow-xl z-[150]"
                    >
                      <button
                        type="button"
                        disabled={!postText.trim() && images.length === 0}
                        onClick={(e) => {
                          setShowDraftPopover(false);
                          handlePostSubmit(e, true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-muted/60 text-foreground disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      >
                        Enregistrer le brouillon de fil
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowDraftPopover(false);
                          setIsDraftsOpen(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-muted/60 text-foreground cursor-pointer"
                      >
                        Voir tous les brouillons
                      </button>
                    </PopoverContent>
                  </Popover>

                  {/* PRIMARY ACTION SUBMIT BUTTON */}
                  <button
                    type="submit"
                    disabled={
                      (!postText.trim() && images.length === 0 && threadNodes.length <= 1) ||
                      isSubmitting ||
                      isOverLimit
                    }
                    className="bg-primary text-primary-foreground hover:opacity-95 disabled:bg-muted disabled:text-muted-foreground transition-all duration-150 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer outline-none shadow-sm shrink-0 active:scale-[0.98]"
                  >
                    {isSubmitting ? (
                      <>
                        Envoi... <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      </>
                    ) : (
                      <>
                        {replyToThought || parentId
                          ? 'Répondre'
                          : threadNodes.length > 1
                            ? 'Tout publier'
                            : 'Publier'}{' '}
                        <Send className="w-3 h-3" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      <Sheet open={isDraftsOpen} onOpenChange={setIsDraftsOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md p-0 flex flex-col h-full bg-[var(--surface-0)] border-l border-[var(--border-default)] z-[60]"
        >
          <SheetHeader className="p-6 border-b border-[var(--border-subtle)]">
            <SheetTitle className="text-base font-bold text-[var(--text-primary)]">
              Mes Brouillons
            </SheetTitle>
            <SheetDescription className="text-xs text-[var(--text-tertiary)]">
              Retrouvez et modifiez vos pensées enregistrées.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 font-sans">
            {/* Brouillons de fil locaux (Brique 3) */}
            {typeof window !== 'undefined' && localStorage.getItem('qoe_multi_thought_drafts') && (
              <div className="border border-primary/25 bg-primary/5 rounded-[var(--radius-card)] p-4 space-y-2.5 flex flex-col justify-between mb-4">
                <div className="space-y-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-primary font-bold block">
                    Brouillon de Fil Local (Multi-Post)
                  </span>
                  <p className="text-xs text-[var(--text-primary)] font-serif leading-relaxed line-clamp-3">
                    {(() => {
                      try {
                        const parsed = JSON.parse(
                          localStorage.getItem('qoe_multi_thought_drafts') || '[]'
                        );
                        return (
                          parsed
                            .map((n: ThreadNode) => n.text)
                            .filter(Boolean)
                            .join(' → ') || 'Contenu du fil vide ou images uniquement'
                        );
                      } catch {
                        return 'Restaurer votre brouillon de fil de discussion.';
                      }
                    })()}
                  </p>
                </div>
                <div className="flex justify-between items-center pt-2.5 border-t border-primary/10">
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem('qoe_multi_thought_drafts');
                      toast.success(t`Brouillon local supprimé.`);
                      setThreadNodes([
                        {
                          id: generateUUID(),
                          text: '',
                          images: [],
                          isTriggerWarning: false,
                          triggerWarning: '',
                          showPollEditor: false,
                          pollOptions: ['', ''],
                          pollDurationHours: 24,
                        },
                      ]);
                    }}
                    className="text-[10px] font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-2 py-1 rounded-[var(--radius-button)] transition-colors cursor-pointer"
                  >
                    Effacer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleLoadLocalThreadDraft();
                      setIsDraftsOpen(false);
                    }}
                    className="text-[10px] font-bold text-white bg-primary hover:opacity-95 px-2.5 py-1 rounded-[var(--radius-button)] transition-all cursor-pointer"
                  >
                    Restaurer le fil
                  </button>
                </div>
              </div>
            )}

            {loadingDrafts ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--qoe-vermillion)]" />
                <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                  Chargement des brouillons...
                </span>
              </div>
            ) : drafts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                <FileText className="w-8 h-8 text-[var(--text-quaternary)]" />
                <p className="text-xs text-[var(--text-secondary)] font-serif">
                  Vous n'avez aucun brouillon pour le moment.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {drafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="group border border-[var(--border-default)] rounded-[var(--radius-card)] p-4 bg-[var(--surface-1)] hover:bg-[var(--surface-2)] transition-all duration-300 flex flex-col justify-between gap-3 relative"
                  >
                    <div className="space-y-1 pr-8">
                      <p className="text-[13px] text-[var(--text-primary)] font-serif leading-relaxed line-clamp-3 whitespace-pre-wrap">
                        {draft.content}
                      </p>

                      <div className="flex flex-wrap gap-2 pt-1.5 items-center">
                        <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] font-semibold bg-[var(--surface-2)] px-2 py-0.5 rounded-[var(--radius-button)]">
                          {draft.visibility === 'public' ? 'Public' : 'Followers'}
                        </span>
                        {draft.scheduledAt && (
                          <span className="text-[9px] text-[var(--qoe-vermillion)] bg-[var(--qoe-vermillion-08)] px-2 py-0.5 rounded-[var(--radius-button)] font-medium">
                            Planifié
                          </span>
                        )}
                        {draft.triggerWarning && (
                          <span className="text-[9px] text-highlight bg-highlight/10 px-2 py-0.5 rounded-[var(--radius-button)] font-medium">
                            Warning
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 mt-1">
                      <span className="text-[9px] text-[var(--text-tertiary)]">
                        Mis à jour{' '}
                        {new Date(
                          draft.updatedAt || draft.scheduledAt || new Date()
                        ).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleLoadDraft(draft)}
                        className="text-[10px] font-bold text-[var(--qoe-vermillion)] hover:text-[#d63d20] bg-[var(--qoe-vermillion-08)] px-2.5 py-1 rounded-[var(--radius-button)] transition-all cursor-pointer"
                      >
                        Charger
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(draft.id)}
                      className="absolute top-4 right-4 text-[var(--text-quaternary)] hover:text-[var(--qoe-vermillion)] transition-colors p-1.5 rounded-[var(--radius-button)] cursor-pointer"
                      title="Supprimer le brouillon"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal de Recadrage d'Image Premium */}
      <AnimatePresence>
        {croppingImage && (
          <ImageCropperModal
            image={croppingImage}
            onClose={() => setCroppingImage(null)}
            onConfirm={(croppedUrl, croppedFile) => {
              setImages((prev) =>
                prev.map((img) =>
                  img.id === croppingImage.id ? { ...img, url: croppedUrl, file: croppedFile } : img
                )
              );
              setCroppingImage(null);
              toast.success(t`Image recadrée avec succès.`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// -------------------------------------------------------------
// Sub-component: ImageCropperModal
// -------------------------------------------------------------

interface ImageCropperModalProps {
  image: ComposerImage;
  onClose: () => void;
  onConfirm: (croppedUrl: string, croppedFile: File) => void;
}

function ImageCropperModal({ image, onClose, onConfirm }: ImageCropperModalProps) {
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    x: 10,
    y: 10,
    width: 80,
    height: 80,
  });
  const [aspectRatio, setAspectRatio] = useState<'libre' | '1:1' | '16:9'>('libre');
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const aspect = aspectRatio === '1:1' ? 1 : aspectRatio === '16:9' ? 16 / 9 : undefined;

    if (aspect) {
      const c = makeAspectCrop({ unit: '%', width: 80 }, aspect, width, height);
      setCrop(centerCrop(c, width, height));
    } else {
      setCrop({
        unit: '%',
        x: 10,
        y: 10,
        width: 80,
        height: 80,
      });
    }
  };

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const aspect = aspectRatio === '1:1' ? 1 : aspectRatio === '16:9' ? 16 / 9 : undefined;
    const { width, height } = img;

    if (aspect) {
      const c = makeAspectCrop({ unit: '%', width: 80 }, aspect, width, height);
      setCrop(centerCrop(c, width, height));
    } else {
      setCrop({
        unit: '%',
        x: 10,
        y: 10,
        width: 80,
        height: 80,
      });
    }
  }, [aspectRatio]);

  const handleConfirm = async () => {
    const img = imgRef.current;
    if (!img || !completedCrop) return;

    try {
      const canvas = document.createElement('canvas');
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;

      let targetW = completedCrop.width * scaleX;
      let targetH = completedCrop.height * scaleY;

      const maxDim = 1600;
      if (targetW > maxDim || targetH > maxDim) {
        if (targetW > targetH) {
          targetH = Math.round((targetH * maxDim) / targetW);
          targetW = maxDim;
        } else {
          targetW = Math.round((targetW * maxDim) / targetH);
          targetH = maxDim;
        }
      }

      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(
          img,
          completedCrop.x * scaleX,
          completedCrop.y * scaleY,
          completedCrop.width * scaleX,
          completedCrop.height * scaleY,
          0,
          0,
          targetW,
          targetH
        );

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const croppedUrl = URL.createObjectURL(blob);
              const croppedFile = new File([blob], `cropped-${Date.now()}.jpg`, {
                type: 'image/jpeg',
              });
              onConfirm(croppedUrl, croppedFile);
            }
          },
          'image/jpeg',
          0.9
        );
      }
    } catch (err) {
      console.error('Error cropping image:', err);
      toast.error("Impossible de recadrer l'image.");
    }
  };

  const getAspectValue = () => {
    if (aspectRatio === '1:1') return 1;
    if (aspectRatio === '16:9') return 16 / 9;
    return undefined;
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="bg-[var(--surface-0)] border border-[var(--border-default)] rounded-[var(--radius-card)] w-full max-w-md overflow-hidden shadow-2xl flex flex-col animate-fade-in"
      >
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--text-primary)] font-serif">
            Recadrer l'image
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] p-1 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-[380px] bg-background flex items-center justify-center p-6 select-none relative overflow-hidden">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={getAspectValue()}
            className="max-w-full max-h-[60vh]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={image.url}
              alt="To crop"
              onLoad={handleImageLoad}
              className="max-w-full max-h-[60vh] object-contain"
              draggable={false}
            />
          </ReactCrop>
        </div>

        <div className="p-4 bg-[var(--surface-1)] border-t border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-[var(--text-secondary)] font-medium font-serif">
              Format
            </span>
            <div className="flex gap-1.5">
              {(['libre', '1:1', '16:9'] as const).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspectRatio(ratio)}
                  className={cn(
                    'px-2.5 py-1 rounded-[var(--radius-button)] text-[10px] uppercase font-bold border transition-all cursor-pointer font-serif',
                    aspectRatio === ratio
                      ? 'border-[var(--qoe-vermillion)] bg-[var(--qoe-vermillion-08)] text-[var(--qoe-vermillion)]'
                      : 'border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] bg-[var(--surface-0)]'
                  )}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 border border-[var(--border-default)] rounded-[var(--radius-button)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-2)] cursor-pointer font-serif"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-3.5 py-2 bg-[var(--qoe-vermillion)] hover:bg-[#d63d20] text-white font-bold rounded-[var(--radius-button)] text-xs cursor-pointer font-serif"
            >
              Confirmer
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
