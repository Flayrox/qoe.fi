// =====================================================================
// 📤 API Upload Sécurisée — apps/studio/src/app/api/articles/upload/route.ts
// =====================================================================
// 1. Validation binaire des Magic Bytes
// 2. Modération multimodale OpenAI (Zéro-NSFW sur les articles & médias)
// 3. Protection Anti-Bomb / Stripping EXIF / Transcodage WebP
// 4. Dédoublonnage CAS par hachage SHA-256
// 5. Enregistrement sous MediaAsset (DRAFT_ORPHAN, TTL: 3 jours)
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@qoe/supabase/server';
import { uploadAndProcessMedia, IMAGE_FOLDERS, type ImageFolder } from '@qoe/supabase/media-engine';
import { getCurrentUser } from '@qoe/auth/current-user';
import { goFetch, isGoEnabled } from '@qoe/api-client/actions/utils/go-client';
import { registerMediaAsset } from '@qoe/db/repositories/media';

const ALLOWED_FOLDERS = new Set(Object.values(IMAGE_FOLDERS));

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
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
    // Go-first : POST /v1/media-assets (dédoublonnage CAS par SHA-256).
    const targetType: 'PUBLICATION_BANNER' | 'ARTICLE_BODY' =
      folder === IMAGE_FOLDERS.banners ? 'PUBLICATION_BANNER' : 'ARTICLE_BODY';
    const assetPayload = {
      sha256: result.sha256,
      url: result.url,
      storagePath: result.storagePath,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      sizeBytes: result.sizeBytes,
      blurhash: result.blurhash,
      ownerId: user.id,
      targetType,
    };
    if (isGoEnabled()) {
      await goFetch('/v1/media-assets', { method: 'POST', body: assetPayload });
    } else {
      // 🐢 Fallback dev (sans QOE_API_URL) : repository Prisma.
      await registerMediaAsset(assetPayload);
    }

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
    console.error('❌ Erreur Upload Studio:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
