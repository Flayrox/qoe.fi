// =====================================================================
// 📤 API Upload Sécurisée — apps/admin/src/app/api/articles/upload/route.ts
// =====================================================================
// Miroir de la route studio : même pipeline (Magic Bytes, modération
// OpenAI, anti-bomb / strip EXIF / transcodage WebP, dédoublonnage CAS
// SHA-256). Restreinte aux superadmins (console admin).
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@qoe/supabase/server';
import { uploadAndProcessMedia, IMAGE_FOLDERS, type ImageFolder } from '@qoe/supabase/media-engine';
import { getCurrentUser } from '@qoe/auth/current-user';
import { ROLES } from '@qoe/config';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

const ALLOWED_FOLDERS = new Set(Object.values(IMAGE_FOLDERS));

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (user.role !== ROLES.SUPERADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = await createClient();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = ((formData.get('folder') as ImageFolder | null) ||
      IMAGE_FOLDERS.articles) as ImageFolder;

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    if (!ALLOWED_FOLDERS.has(folder)) {
      return NextResponse.json({ error: 'Dossier de destination invalide' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // 🚀 Pipeline unifiée de Sécurité, Modération & Transcodage Sharp
    const result = await uploadAndProcessMedia(supabase, fileBuffer, file.type, {
      folder,
      ownerId: user.id,
    });

    // 📝 Enregistrement dans le registre de cycle de vie MediaAsset (TTL 3j orphan)
    await goFetch('/v1/media-assets', {
      method: 'POST',
      body: {
        sha256: result.sha256,
        url: result.url,
        storagePath: result.storagePath,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        sizeBytes: result.sizeBytes,
        blurhash: result.blurhash,
        ownerId: user.id,
        targetType: 'ARTICLE_BODY',
      },
    });

    return NextResponse.json(
      {
        url: result.url,
        blurhash: result.blurhash,
        width: result.width,
        height: result.height,
        sha256: result.sha256,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erreur interne lors de l'upload";
    console.error('❌ Erreur Upload Admin:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
