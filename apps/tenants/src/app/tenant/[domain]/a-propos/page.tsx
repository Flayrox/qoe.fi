import { permanentRedirect } from 'next/navigation';

/**
 * Ancienne URL française conservée pour les liens externes et le SEO.
 * La route canonique est désormais /about.
 */
export default async function LegacyAboutRedirect() {
  permanentRedirect('/about');
}
