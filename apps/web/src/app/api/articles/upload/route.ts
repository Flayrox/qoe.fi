// =====================================================================
// 📤 API Upload — apps/web/src/app/api/articles/upload/route.ts
// =====================================================================
// 📖 Upload d'images vers Supabase Storage (bucket "articles-media").
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@qoe/supabase/server';
import { uploadImage, IMAGE_FOLDERS, type ImageFolder } from '@qoe/supabase/storage';
import { getCurrentUser } from '@qoe/auth/current-user';
import { LIMITS } from '@qoe/config';

const MAX_SIZE_BYTES = LIMITS.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const ALLOWED_FOLDERS = new Set(Object.values(IMAGE_FOLDERS));

export async function POST(request: NextRequest) {
  try {
    // 🔐 Vérifie l'auth
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // 📥 Parse le multipart
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as ImageFolder | null) || IMAGE_FOLDERS.articles;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // ✅ Validation type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // ✅ Validation taille
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File size exceeds ${LIMITS.MAX_UPLOAD_SIZE_MB}MB limit` },
        { status: 400 }
      );
    }

    if (!ALLOWED_FOLDERS.has(folder)) {
      return NextResponse.json({ error: 'Invalid folder' }, { status: 400 });
    }

    // 📤 Upload vers Supabase Storage via le helper partagé
    const url = await uploadImage(supabase, file, {
      folder,
      ownerId: user.id,
    });

    return NextResponse.json({ url }, { status: 200 });
  } catch (error) {
    console.error('Upload API Route Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
