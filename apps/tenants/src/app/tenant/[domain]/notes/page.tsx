import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ domain: string }>;
}

export default async function TenantNotesRedirect({ params }: PageProps) {
  await params;
  redirect('./thoughts');
}
