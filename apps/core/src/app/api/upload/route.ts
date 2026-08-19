import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@qoe/supabase/server';
import { uploadImage, IMAGE_FOLDERS, type ImageFolder } from '@qoe/supabase/storage';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FOLDERS = new Set(Object.values(IMAGE_FOLDERS));

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check if the user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as ImageFolder | null) || IMAGE_FOLDERS.articles;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 10MB limit' }, { status: 400 });
    }

    if (!ALLOWED_FOLDERS.has(folder)) {
      return NextResponse.json({ error: 'Invalid folder' }, { status: 400 });
    }

    // Upload to Supabase Storage via the shared helper
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
