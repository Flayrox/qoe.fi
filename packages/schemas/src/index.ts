// =====================================================================
// 📦 @qoe/schemas — Schémas de validation Zod universels (web & mobile)
// =====================================================================

export {
  MAX_EMAIL_LENGTH,
  MAX_ID_LENGTH,
  MAX_SLUG_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  centsSchema,
  emailSchema,
  hasForbiddenMultiLineChars,
  hasForbiddenSingleLineChars,
  idSchema,
  multiLineText,
  normalizeUsername,
  singleLineText,
  slugSchema,
  usernameSchema,
  uuidSchema,
} from './common';

export {
  postContentSchema,
  createThoughtSchema,
  replyToPostSchema,
  type CreateThoughtInput,
  type ReplyToPostInput,
} from './thought';

export { updateProfileSchema, type UpdateProfileInput } from './profile';

export { createReportSchema, type CreateReportInput } from './moderation';

export { articleTitleSchema } from './article';
