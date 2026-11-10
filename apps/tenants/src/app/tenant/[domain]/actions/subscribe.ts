'use server';

import { subscribeToNewsletterAction } from '@qoe/sdk/actions/tenant';

export async function subscribeToNewsletter(formData: FormData) {
  const email = formData.get('email') as string;
  const publisherId = formData.get('publisherId') as string;

  if (!email || !publisherId) {
    return { error: 'Missing required fields.' };
  }

  const res = await subscribeToNewsletterAction({ email, publisherId });
  if (!res.ok) {
    return { error: res.error.message };
  }

  return { success: true };
}
