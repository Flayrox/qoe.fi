// =====================================================================
// 📦 @qoe/social — Algorithmes sociaux universels (facets, sondages, threads)
// =====================================================================

export {
  segmentText,
  extractMentions,
  extractHashtags,
  extractUrls,
  URL_REGEX,
  MENTION_REGEX,
  TAG_REGEX,
  type TextSegment,
} from './facets';

export {
  formatPollData,
  type RawPollOption,
  type RawPollVote,
  type RawPoll,
  type FormattedPollOption,
  type FormattedPoll,
} from './polls';

export {
  buildThreadTree,
  flattenThread,
  findThreadAncestors,
  countThreadDescendants,
  type ThreadNode,
  type BaseThreadItem,
} from './threads';

export {
  normalizeThought,
  normalizeAuthor,
  resolveDisplay,
  isNormalizedThought,
  type NormalizedThought,
  type NormalizedAuthor,
} from './normalize';
