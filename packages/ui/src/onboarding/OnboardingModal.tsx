'use client';

import { useRouter } from 'next/navigation';
import { Dialog, DialogContent } from '../ui/dialog';
import { OnboardingFlow, type OnboardingFlowProps } from './OnboardingFlow';

export interface OnboardingModalProps extends OnboardingFlowProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /** false (défaut) = onboarding obligatoire : pas de fermeture tant qu'il n'est pas terminé. */
  dismissible?: boolean;
}

export function OnboardingModal({
  open,
  onOpenChange,
  dismissible = false,
  categories,
  suggestedCreators,
  onSubmit,
}: OnboardingModalProps) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={dismissible}
        className="sm:max-w-5xl sm:p-0 sm:gap-0 overflow-hidden"
      >
        <OnboardingFlow
          categories={categories}
          suggestedCreators={suggestedCreators}
          onSubmit={onSubmit}
          onDone={() => {
            onOpenChange?.(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
