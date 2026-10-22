import { permanentRedirect } from 'next/navigation';

/**
 * Ancienne URL française conservée pour les liens externes et le SEO.
 * La route canonique est désormais /team.
 */
export default async function LegacyTeamRedirect() {
  permanentRedirect('/team');
}
