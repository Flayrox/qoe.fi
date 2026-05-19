'use client';

import './patch-console';
import { TolgeeBase } from './shared';
import {
  CachePublicRecord,
  TolgeeProvider,
  TolgeeStaticData,
} from '@tolgee/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

type Props = {
  language: string;
  staticData: TolgeeStaticData | CachePublicRecord[];
  children: React.ReactNode;
};

const tolgee = TolgeeBase().init();

export const TolgeeNextProvider = ({
  language,
  staticData,
  children,
}: Props) => {
  const router = useRouter();

  useEffect(() => {
    // Refresh server components after in-context translation changes
    const { unsubscribe } = tolgee.on('permanentChange', () => {
      router.refresh();
    });
    return () => unsubscribe();
  }, [router]);

  return (
    <TolgeeProvider
      tolgee={tolgee}
      fallback={null}
      ssr={{ language, staticData }}
    >
      {children}
    </TolgeeProvider>
  );
};
