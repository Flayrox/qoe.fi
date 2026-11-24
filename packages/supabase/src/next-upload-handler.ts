import { NextRequest, NextResponse } from 'next/server';
import type { ImageFolder, UploadMediaOptions, UploadMediaResult } from './media-engine';

export type MediaAssetTargetType =
  'USER_AVATAR' | 'THOUGHT_ATTACHMENT' | 'PUBLISHER_BANNER' | 'ARTICLE_BODY';

export interface UploadHandlerUser {
  id: string;
  role?: string | null;
}

export interface UploadHandlerConfig<TSupabase> {
  createClient: () => Promise<TSupabase>;
  uploadAndProcessMedia: (
    supabase: TSupabase,
    fileBuffer: Buffer,
    declaredMime: string,
    options?: UploadMediaOptions
  ) => Promise<UploadMediaResult>;
  goFetch: <T = Record<string, unknown>>(
    path: string,
    init?: { method?: string; body?: unknown }
  ) => Promise<T>;
  /** Fourni par studio/admin/tenants (`getCurrentUser`). Omis sur core → lit `supabase.auth.getUser()`. */
  resolveUser?: () => Promise<UploadHandlerUser | null>;
  requiredRole?: string;
  defaultFolder: ImageFolder;
  allowedFolders: readonly string[];
  resolveTargetType: (folder: ImageFolder) => MediaAssetTargetType;
  logLabel: string;
  errorMessage500: string;
  trustMediaEngineClientMessages?: boolean;
  bestEffortRegister?: boolean;
}

/**
 * Un `File` sans `instanceof` : le handler peut recevoir un `File` d'un autre
 * royaume (runtime edge, polyfill, jsdom), et `instanceof File` le refuserait
 * à tort. Les gardes `type` évitent qu'un champ texte nommé `file` aille jusqu'à `arrayBuffer`.
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

function hasSupabaseAuth(client: unknown): client is {
  auth: {
    getUser: () => Promise<{ data: { user: UploadHandlerUser | null }; error: unknown }>;
  };
} {
  return (
    typeof client === 'object' &&
    client !== null &&
    'auth' in client &&
    typeof (client as { auth?: { getUser?: unknown } }).auth?.getUser === 'function'
  );
}

/**
 * Factory mutualisée pour les routes Next.js d'upload d'images (`core`, `studio`,
 * `admin`, `tenants`) : auth/RBAC → validation formulaire → preflight Go
 * (`POST /v1/media-assets/preflight`) avant lecture mémoire/Sharp/OpenAI →
 * moteur média → enregistrement CAS (`POST /v1/media-assets`).
 */
export function createUploadHandler<TSupabase>(config: UploadHandlerConfig<TSupabase>) {
  const allowedFolders = new Set(config.allowedFolders);

  return async function POST(request: NextRequest): Promise<NextResponse> {
    try {
      let supabase: TSupabase;
      let user: UploadHandlerUser | null = null;

      if (config.resolveUser) {
        user = await config.resolveUser();
        if (!user) {
          return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }
        if (config.requiredRole && user.role !== config.requiredRole) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        supabase = await config.createClient();
      } else {
        supabase = await config.createClient();
        if (!hasSupabaseAuth(supabase)) {
          throw new Error('Client Supabase sans auth.getUser()');
        }
        const {
          data: { user: authUser },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError || !authUser) {
          return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }
        user = authUser;
      }

      const formData = await request.formData();
      const rawFile = formData.get('file');
      const rawFolder = formData.get('folder');
      const folder = (
        typeof rawFolder === 'string' && rawFolder ? rawFolder : config.defaultFolder
      ) as ImageFolder;

      if (!isUploadedFile(rawFile)) {
        return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
      }
      if (!allowedFolders.has(folder)) {
        return NextResponse.json({ error: 'Dossier de destination invalide' }, { status: 400 });
      }

      const targetType = config.resolveTargetType(folder);

      // Preflight Go avant buffer/Sharp/OpenAI : coupe les 400/413/429 sans coût CPU ni appel OpenAI.
      try {
        const preflight = (await config.goFetch<{ allowed?: boolean }>(
          '/v1/media-assets/preflight',
          {
            method: 'POST',
            body: {
              sizeBytes: rawFile.size,
              mimeType: rawFile.type,
              targetType,
            },
          }
        )) as { allowed?: boolean } | undefined;
        if (preflight?.allowed === false) {
          return NextResponse.json({ error: 'Téléversement refusé' }, { status: 403 });
        }
      } catch (preflightError: unknown) {
        const status = Number((preflightError as { status?: number })?.status ?? 0);
        if (status >= 400 && status < 500) {
          return NextResponse.json(
            {
              error:
                preflightError instanceof Error && preflightError.message
                  ? preflightError.message
                  : 'Requête invalide',
            },
            { status }
          );
        }
        // Tolérance transitoire si le endpoint preflight Go est temporairement injoignable :
        // l'enregistrement final POST /v1/media-assets recontrôle quota et throttle.
        console.warn(`[${config.logLabel}] preflight média indisponible :`, preflightError);
      }

      const arrayBuffer = await rawFile.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      let result: UploadMediaResult;
      try {
        result = await config.uploadAndProcessMedia(supabase, fileBuffer, rawFile.type, {
          folder,
          ownerId: user.id,
        });
      } catch (mediaError: unknown) {
        const mediaStatus = Number((mediaError as { status?: number })?.status ?? 0);
        const isValidation =
          (mediaError as { name?: string })?.name === 'MediaValidationError' ||
          (mediaStatus >= 400 && mediaStatus < 500);
        if (isValidation) {
          return NextResponse.json(
            {
              error:
                mediaError instanceof Error && mediaError.message
                  ? mediaError.message
                  : 'Image invalide.',
            },
            { status: mediaStatus >= 400 && mediaStatus < 500 ? mediaStatus : 400 }
          );
        }
        if (config.trustMediaEngineClientMessages) {
          const message =
            mediaError instanceof Error && mediaError.message
              ? mediaError.message
              : "Import de l'image impossible.";
          console.error(`❌ Erreur ${config.logLabel} (moteur média):`, message);
          return NextResponse.json({ error: message }, { status: 400 });
        }
        throw mediaError;
      }

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

      if (config.bestEffortRegister) {
        try {
          await config.goFetch('/v1/media-assets', { method: 'POST', body: assetPayload });
        } catch (regError: unknown) {
          console.warn('[upload] registre des médias indisponible :', regError);
        }
      } else {
        await config.goFetch('/v1/media-assets', { method: 'POST', body: assetPayload });
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
      const status = Number((error as { status?: number })?.status ?? 0);
      console.error(
        `❌ Erreur ${config.logLabel}:`,
        error instanceof Error ? error.message : error
      );
      if (status >= 400 && status < 500) {
        return NextResponse.json(
          { error: error instanceof Error && error.message ? error.message : 'Requête invalide' },
          { status }
        );
      }
      return NextResponse.json({ error: config.errorMessage500 }, { status: 500 });
    }
  };
}
