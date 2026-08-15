export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

export interface EmailSendResult {
  providerId?: string;
}

/**
 * Minimal adapter contract for Resend, Postmark, SES, SMTP, or a self-hosted relay.
 * The application never imports a concrete vendor SDK.
 */
export interface EmailProvider {
  readonly name: string;
  send(message: OutboundEmail): Promise<EmailSendResult>;
}

export type EmailProviderFactory = (env: NodeJS.ProcessEnv) => EmailProvider;

/**
 * Resolve a provider only when the runtime explicitly registers one.
 * No provider is chosen by default, so development never sends email accidentally.
 */
export function createEmailProvider(
  registry: Record<string, EmailProviderFactory>,
  env: NodeJS.ProcessEnv = process.env
): EmailProvider | null {
  const providerName = env.EMAIL_PROVIDER?.trim();
  if (!providerName) return null;

  const factory = registry[providerName];
  if (!factory) {
    throw new Error(`Unsupported EMAIL_PROVIDER: ${providerName}`);
  }

  return factory(env);
}
