// =====================================================================
// ðŸ“¤ API Upload â€” apps/dashboard/src/app/api/articles/upload/route.ts
// =====================================================================
// ðŸ“– Upload d'images vers Supabase Storage (bucket "articles-media").
//    UtilisÃ© par l'Ã©diteur TipTap pour insÃ©rer des images dans les articles.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@qoe/supabase/server";
import { getCurrentUser } from "@qoe/auth/current-user";
import { LIMITS } from "@qoe/config";

const MAX_SIZE_BYTES = LIMITS.MAX_UPLOAD_SIZE_MB * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    // ðŸ” VÃ©rifie l'auth du crÃ©ateur
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    // ðŸ“¥ Parse le multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // âœ… Validation du type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    // âœ… Validation de la taille
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File size exceeds ${LIMITS.MAX_UPLOAD_SIZE_MB}MB limit` },
        { status: 400 }
      );
    }

    // ðŸ“ GÃ©nÃ¨re un nom de fichier unique pour ce crÃ©ateur
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const fileExtension = file.name.split(".").pop() || "png";
    const filePath = `${user.id}/${timestamp}-${randomString}.${fileExtension}`;

    // ðŸ“¤ Upload vers le bucket Supabase Storage "articles-media"
    const { data, error } = await supabase.storage
      .from("articles-media")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Supabase Storage Error:", error);
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
    }

    // ðŸ”— RÃ©cupÃ¨re l'URL publique de l'image
    const { data: publicUrlData } = supabase.storage
      .from("articles-media")
      .getPublicUrl(filePath);

    return NextResponse.json({ url: publicUrlData.publicUrl }, { status: 200 });
  } catch (error) {
    console.error("Upload API Route Error in Dashboard:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
