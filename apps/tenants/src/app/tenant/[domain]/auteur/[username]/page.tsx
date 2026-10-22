import { permanentRedirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ domain: string; username: string }>;
}

/**
 * Ancienne URL française conservée pour les liens externes et le SEO.
 * La route canonique est désormais /author/[username].
 */
export default async function LegacyAuthorRedirect({ params }: PageProps) {
  const { username } = await params;
  permanentRedirect(`/author/${encodeURIComponent(decodeURIComponent(username))}`);
}
