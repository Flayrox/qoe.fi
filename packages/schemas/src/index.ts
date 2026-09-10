// =====================================================================
// 📦 @qoe/schemas — Schémas de validation Zod universels (web & mobile)
// =====================================================================

export { emailSchema, slugSchema, uuidSchema, usernameSchema, centsSchema } from './common';

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
