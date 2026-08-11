import { StarterPackDetailView } from "@/components/social/StarterPackDetailView";

export const metadata = {
  title: "Starter Pack | qoe.fi",
  description: "Consultez les membres de ce Starter Pack et abonnez-vous en 1 clic.",
};

export default async function StarterPackDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  return (
    <main className="w-full min-h-screen border-r border-border bg-background">
      <StarterPackDetailView packId={resolvedParams.id} />
    </main>
  );
}
