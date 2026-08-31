import { notFound } from 'next/navigation';
import AccountSettingsRoute from '../page';

const sections = new Set(['account', 'privacy', 'appearance', 'data', 'security']);

export default async function AccountSettingsSectionRoute({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return AccountSettingsRoute();
}
