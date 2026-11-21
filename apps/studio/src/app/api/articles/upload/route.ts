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
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

const ALLOWED_FOLDERS = new Set(Object.values(IMAGE_FOLDERS));

/**
 * Un `File` sans `instanceof` : le handler peut recevoir un `File` d'un autre
 * royaume (runtime edge, polyfill, test), et `instanceof File` le refuserait
 * à tort. On reconnaît la forme dont on se sert réellement. Les gardes `type`
 * évitent aussi qu'un champ texte nommé `file` aille jusqu'à `arrayBuffer`.
 */
function isUploadedFile(value: unknown): value is File {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as File;
  return (
    typeof candidate.arrayBuffer === 'function' &&
    typeof candidate.type === 'string' &&
    typeof candidate.size === 'number'
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const supabase = await createClient();

    const formData = await request.formData();
    const rawFile = formData.get('file');
    const rawFolder = formData.get('folder');
    const folder = (
      typeof rawFolder === 'string' && rawFolder ? rawFolder : IMAGE_FOLDERS.articles
    ) as ImageFolder;

    if (!isUploadedFile(rawFile)) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }
    const file = rawFile;

    if (!ALLOWED_FOLDERS.has(folder)) {
      return NextResponse.json({ error: 'Dossier de destination invalide' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // 🚀 Pipeline unifiée de Sécurité, Modération & Transcodage Sharp
    let result: Awaited<ReturnType<typeof uploadAndProcessMedia>>;
    try {
      result = await uploadAndProcessMedia(supabase, fileBuffer, file.type, {
        folder,
        ownerId: user.id,
      });
    } catch (error: unknown) {
      // Le moteur média parle à l'utilisateur (format refusé, modération,
      // taille) : ses messages sont la seule erreur explicable ici. Tout le
      // reste (parsing, stockage, panne inconnue) est journalisé et remplacé
      // par une réponse générique — voir le `catch` extérieur.
      const message =
        error instanceof Error && error.message ? error.message : "Import de l'image impossible.";
      console.error('❌ Erreur Upload Studio (moteur média):', message);
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // 📝 Enregistrement dans le registre de cycle de vie MediaAsset (TTL 3j orphan)
    // Go-first : POST /v1/media-assets (dédoublonnage CAS par SHA-256).
    const targetType: 'PUBLISHER_BANNER' | 'ARTICLE_BODY' =
      folder === IMAGE_FOLDERS.banners ? 'PUBLISHER_BANNER' : 'ARTICLE_BODY';
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
    // Registre de cycle de vie (TTL des orphelins) : l'image est DÉJÀ stockée
    // et servie. Une panne du registre ne doit donc pas transformer un envoi
    // réussi en 400 — le client relancerait l'envoi et créerait un orphelin.
    try {
      await goFetch('/v1/media-assets', { method: 'POST', body: assetPayload });
    } catch (error: unknown) {
      console.warn('[upload] registre des médias indisponible :', error);
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
    // Détail réservé aux journaux : un message de parsing multipart ou de
    // stockage nomme des chemins et des bibliothèques internes.
    console.error('❌ Erreur Upload Studio:', error);
    return NextResponse.json(
      { error: 'Import impossible. Réessayez dans un instant.' },
      { status: 500 }
    );
  }
}
