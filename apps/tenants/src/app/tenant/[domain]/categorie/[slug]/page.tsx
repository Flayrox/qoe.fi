import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ domain: string; slug: string }>;
}

export default async function LegacyCategoryRedirect({ params }: PageProps) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  redirect(`/${encodeURIComponent(decodedSlug)}`);
}
