// =====================================================================
// 📤 API Upload Sécurisée — apps/core/src/app/api/upload/route.ts
// =====================================================================

import { createClient } from '@qoe/supabase/server';
import { uploadAndProcessMedia, IMAGE_FOLDERS } from '@qoe/supabase/media-engine';
import { createUploadHandler } from '@qoe/supabase/next-upload-handler';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export const POST = createUploadHandler({
  createClient,
  uploadAndProcessMedia,
  goFetch,
  defaultFolder: IMAGE_FOLDERS.thoughts,
  allowedFolders: Object.values(IMAGE_FOLDERS),
  resolveTargetType: (folder) =>
    folder === IMAGE_FOLDERS.avatars ? 'USER_AVATAR' : 'THOUGHT_ATTACHMENT',
  logLabel: 'Upload Core',
  errorMessage500: "Erreur interne lors de l'upload",
});
