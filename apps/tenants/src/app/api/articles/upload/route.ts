// =====================================================================
// 📤 API Upload Sécurisée — apps/tenants/src/app/api/articles/upload/route.ts
// =====================================================================

import { createClient } from '@qoe/supabase/server';
import { uploadAndProcessMedia, IMAGE_FOLDERS } from '@qoe/supabase/media-engine';
import { createUploadHandler } from '@qoe/supabase/next-upload-handler';
import { getCurrentUser } from '@qoe/auth/current-user';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export const POST = createUploadHandler({
  createClient,
  uploadAndProcessMedia,
  goFetch,
  resolveUser: getCurrentUser,
  defaultFolder: IMAGE_FOLDERS.articles,
  allowedFolders: Object.values(IMAGE_FOLDERS),
  resolveTargetType: () => 'ARTICLE_BODY',
  logLabel: 'Upload Tenants',
  errorMessage500: "L'upload a échoué. Réessayez dans un instant.",
});
