'use server';

import { subscribeToNewsletterAction } from '@qoe/api-client/actions/tenant';

export async function subscribeToNewsletter(formData: FormData) {
  const email = formData.get('email') as string;
  const publicationId = formData.get('publicationId') as string;

  if (!email || !publicationId) {
    return { error: 'Missing required fields.' };
  }

  const res = await subscribeToNewsletterAction({ email, publicationId });
  if (!res.ok) {
    return { error: res.error.message };
  }

  return { success: true };
}
