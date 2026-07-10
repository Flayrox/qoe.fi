// =====================================================================
// 📤 API Upload — apps/dashboard/src/app/api/articles/upload/route.ts
// =====================================================================
// 📖 Upload d'images vers Supabase Storage (bucket "articles-media").
//    Utilisé par l'éditeur TipTap pour insérer des images dans les articles.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@qoe/supabase/server";
import { getCurrentUser } from "@qoe/auth/current-user";
import { LIMITS } from "@qoe/config";

const MAX_SIZE_BYTES = LIMITS.MAX_UPLOAD_SIZE_MB * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    // 🔐 Vérifie l'auth du créateur
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    // 📥 Parse le multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // ✅ Validation du type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    // ✅ Validation de la taille
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File size exceeds ${LIMITS.MAX_UPLOAD_SIZE_MB}MB limit` },
        { status: 400 }
      );
    }

    // 📝 Génère un nom de fichier unique pour ce créateur
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const fileExtension = file.name.split(".").pop() || "png";
    const filePath = `${user.id}/${timestamp}-${randomString}.${fileExtension}`;

    // 📤 Upload vers le bucket Supabase Storage "articles-media"
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

    // 🔗 Récupère l'URL publique de l'image
    const { data: publicUrlData } = supabase.storage
      .from("articles-media")
      .getPublicUrl(filePath);

    let finalUrl = publicUrlData.publicUrl;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl && finalUrl.startsWith(supabaseUrl)) {
      finalUrl = finalUrl.replace(supabaseUrl, "https://cdn.qoe.fi");
    }

    return NextResponse.json({ url: finalUrl }, { status: 200 });
  } catch (error) {
    console.error("Upload API Route Error in Dashboard:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
