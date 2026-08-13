'use server';

import { subscribeToNewsletterAction } from '@qoe/api-client/actions/tenant';

export async function subscribeToNewsletter(formData: FormData) {
  const email = formData.get('email') as string;
  const creatorId = formData.get('creatorId') as string;

  if (!email || !creatorId) {
    return { error: 'Missing required fields.' };
  }

  const res = await subscribeToNewsletterAction({ email, creatorId });
  if (!res.ok) {
    return { error: res.error.message };
  }

  return { success: true };
}
