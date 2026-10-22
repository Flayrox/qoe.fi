import { permanentRedirect } from 'next/navigation';

/**
 * Ancienne URL conservée pour les liens externes.
 * La route canonique est désormais /thoughts.
 */
export default async function LegacyNotesRedirect() {
  permanentRedirect('/thoughts');
}
