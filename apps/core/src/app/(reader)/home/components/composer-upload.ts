// =====================================================================
// 📤 Envoi des images du compositeur vers /api/upload
// =====================================================================
// Extrait de `ThoughtComposer` pour être testable sans monter l'éditeur
// d'image (le seul chemin qui produit un `File` à envoyer).
// =====================================================================

export interface UploadableImage {
  url: string;
  file?: File;
}

/** Délai maximal d'un envoi d'image (ms) : un réseau figé ne bloque pas le fil. */
export const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Relit la valeur `imageUrl` d'un brouillon : une URL simple, ou un tableau
 * JSON d'URLs. Les entrées non textuelles sont écartées — sinon une image
 * `src="[object Object]"` part à la publication.
 */
export function parseImageUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  if (!raw.startsWith('[')) return [raw];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [raw];
  }
  if (!Array.isArray(parsed)) return [raw];

  return parsed.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export async function uploadComposerImages(images: UploadableImage[]): Promise<string[]> {
  const uploadedUrls: string[] = [];
  for (const img of images) {
    if (!img.file) {
      uploadedUrls.push(img.url);
      continue;
    }
    const formData = new FormData();
    formData.append('file', img.file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error("Erreur lors de l'envoi d'une image au serveur.");
    }
    // Réponse non typée (route Next) : une forme inattendue est une erreur
    // métier, pas un `TypeError` au milieu de la publication.
    const payload: unknown = await res.json().catch(() => null);
    const url =
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { url?: unknown }).url === 'string'
        ? (payload as { url: string }).url
        : null;
    if (!url) {
      throw new Error("L'upload de l'image a échoué.");
    }
    uploadedUrls.push(url);
  }
  return uploadedUrls;
}
