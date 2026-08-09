import { useQuery } from '@tanstack/react-query';
import { subscriptionKeys } from '../query-keys';

export interface SubscriptionStatusData {
  isMember: boolean;
  isPaidSubscriber: boolean;
  tierId?: string | null;
  status?: string | null;
}

/**
 * Hook for checking and caching subscriber entitlements for the current reader on a creator site.
 */
export function useSubscriptionStatus(creatorId: string, email?: string | null) {
  return useQuery<SubscriptionStatusData>({
    queryKey: subscriptionKeys.status(creatorId, email || undefined),
    queryFn: async () => {
      if (!creatorId) {
        return { isMember: false, isPaidSubscriber: false, tierId: null, status: null };
      }

      const params = new URLSearchParams({ creatorId });
      if (email) params.append('email', email);

      const response = await fetch(`/api/subscriptions/entitlement?${params.toString()}`);
      if (!response.ok) {
        return { isMember: false, isPaidSubscriber: false, tierId: null, status: null };
      }

      const data = await response.json();
      return data.data || { isMember: false, isPaidSubscriber: false, tierId: null, status: null };
    },
    enabled: Boolean(creatorId),
    staleTime: 5 * 60 * 1000, // Cache entitlement for 5 minutes
  });
}
