import { requireUser } from "@qoe/auth/current-user"
import { redirect } from "next/navigation"
import { OnboardingWizard } from "@/features/onboarding/components/wizard"

export default async function OnboardingPage() {
  const user = await requireUser()

  // S'ils ont déjà passé l'onboarding, on les renvoie sur le dashboard
  if (user.hasCompletedOnboarding || user.subdomain) {
    redirect("/?already_onboarded=true")
  }

  return (
    <main className="min-h-screen bg-neutral-950">
      <OnboardingWizard />
    </main>
  )
}
