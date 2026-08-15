import { describe, expect, it } from 'vitest';
import { createEmailProvider } from './email-provider';
import { renderNotificationEmail } from './notification-email';

describe('notification email delivery preparation', () => {
  it('does not select a provider when EMAIL_PROVIDER is absent', () => {
    expect(createEmailProvider({}, {})).toBeNull();
  });

  it('resolves only a provider explicitly registered by the runtime', async () => {
    const sent: string[] = [];
    const provider = createEmailProvider(
      {
        fake: () => ({
          name: 'fake',
          send: async (message) => {
            sent.push(message.to);
            return { providerId: 'test-1' };
          },
        }),
      },
      { EMAIL_PROVIDER: 'fake' }
    );

    expect(provider?.name).toBe('fake');
    await provider?.send({
      to: 'reader@example.com',
      subject: 'Test',
      text: 'Test',
      html: '<p>Test</p>',
    });
    expect(sent).toEqual(['reader@example.com']);
  });

  it('renders an escaped contributor invitation with a decision link', () => {
    const email = renderNotificationEmail({
      type: 'ARTICLE_CONTRIBUTOR_INVITED',
      recipientEmail: 'reader@example.com',
      recipientName: '<Reader>',
      senderName: 'Sophie & équipe',
      articleTitle: 'Les <choix> éditoriaux',
      articleSlug: 'choix-editoriaux',
      publicBaseUrl: 'https://qoe.test',
    });

    expect(email.subject).toContain('invite');
    expect(email.html).toContain('&lt;Reader&gt;');
    expect(email.html).toContain('Les &lt;choix&gt; éditoriaux');
    expect(email.text).toContain('https://qoe.test/article/choix-editoriaux');
  });
});
