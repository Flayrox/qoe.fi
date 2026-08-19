/**
 * 🛡️ Backend Content Moderation (OpenAI)
 * =====================================================================
 * Screens text or images using OpenAI's Moderation API (omni-moderation-latest).
 * Returns true if the content is safe, or throws an error / returns false if flagged.
 *
 * Safe-by-default design:
 * - If OPENAI_API_KEY is missing, "sk-mock", or empty, skips check and logs a warning.
 *   This prevents breaking local development or setups where the key isn't provided.
 * =====================================================================
 */

export async function moderateImage(
  file: File | Blob
): Promise<{ safe: boolean; reason?: string }> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey === 'sk-mock' || apiKey.startsWith('sk-...')) {
    console.warn(
      '⚠️ OpenAI Moderation: OPENAI_API_KEY is not configured or is mocked. Skipping moderation check.'
    );
    return { safe: true };
  }

  try {
    // Convert File/Blob to base64 for multimodal OpenAI Moderation API
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');
    const mimeType = file.type || 'image/jpeg';

    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI Moderation API Error:', response.status, errorData);
      // Fail open on transient network/API issues to avoid completely blocking users
      return { safe: true };
    }

    const result = await response.json();
    const results = result.results?.[0];

    if (results?.flagged) {
      // Extract flagged categories
      const flaggedCategories = Object.entries(results.categories || {})
        .filter(([, flagged]) => flagged)
        .map(([category]) => category)
        .join(', ');

      return {
        safe: false,
        reason: `Content violates safety policy. Flagged categories: ${flaggedCategories}`,
      };
    }

    return { safe: true };
  } catch (err) {
    console.error('Failed to run OpenAI moderation:', err);
    return { safe: true }; // Fail open for resilience
  }
}
