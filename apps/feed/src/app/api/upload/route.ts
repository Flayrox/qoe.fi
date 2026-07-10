import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@qoe/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check if the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    // Validate file size (e.g., max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File size exceeds 5MB limit" }, { status: 400 });
    }

    // Generate a unique filename using timestamp and a random string
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const fileExtension = file.name.split('.').pop() || 'png';
    // Path includes the user's ID for organization
    const filePath = `${user.id}/${timestamp}-${randomString}.${fileExtension}`;

    // Upload to Supabase Storage bucket 'articles-media'
    const { data, error } = await supabase
      .storage
      .from("articles-media")
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error("Supabase Storage Error:", error);
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
    }

    // Get the public URL for the uploaded image
    const { data: publicUrlData } = supabase
      .storage
      .from("articles-media")
      .getPublicUrl(filePath);

    let finalUrl = publicUrlData.publicUrl;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl && finalUrl.startsWith(supabaseUrl)) {
      finalUrl = finalUrl.replace(supabaseUrl, "https://cdn.qoe.fi");
    }

    return NextResponse.json({ 
      url: finalUrl 
    }, { status: 200 });

  } catch (error) {
    console.error("Upload API Route Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
