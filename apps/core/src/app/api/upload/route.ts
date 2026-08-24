// =====================================================================
// 📤 API Upload Sécurisée — apps/core/src/app/api/upload/route.ts
// =====================================================================
// 1. Validation binaire des Magic Bytes
// 2. Modération multimodale OpenAI (Zéro-NSFW sur les pensées et profils)
// 3. Protection Anti-Bomb / Stripping EXIF / Transcodage WebP
// 4. Dédoublonnage CAS par hachage SHA-256
// 5. Enregistrement sous MediaAsset (DRAFT_ORPHAN, TTL: 3 jours)
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@qoe/supabase/server';
import { uploadAndProcessMedia, IMAGE_FOLDERS, type ImageFolder } from '@qoe/supabase/media-engine';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';

const ALLOWED_FOLDERS = new Set(Object.values(IMAGE_FOLDERS));

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 🔐 Authentification
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = ((formData.get('folder') as ImageFolder | null) ||
      IMAGE_FOLDERS.thoughts) as ImageFolder;

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    if (!ALLOWED_FOLDERS.has(folder)) {
      return NextResponse.json({ error: 'Dossier de destination invalide' }, { status: 400 });
    }

    // Extraction du buffer binaire pour inspection approfondie
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // 🚀 Pipeline de Sécurité, Modération NSFW & Transcodage Sharp
    const result = await uploadAndProcessMedia(supabase, fileBuffer, file.type, {
      folder,
      ownerId: user.id,
    });

    // 📝 Enregistrement dans le registre de cycle de vie MediaAsset (TTL 3j orphan)
    // Go-first : POST /v1/media-assets (dédoublonnage CAS par SHA-256).
    const targetType: 'USER_AVATAR' | 'THOUGHT_ATTACHMENT' =
      folder === IMAGE_FOLDERS.avatars ? 'USER_AVATAR' : 'THOUGHT_ATTACHMENT';
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
    // Go (backend-of-record, requis en Phase 3) : POST /v1/media-assets
    // (dédoublonnage CAS par SHA-256, TTL 3j orphan).
    await goFetch('/v1/media-assets', { method: 'POST', body: assetPayload });

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
    console.error('❌ Erreur Upload Core:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
