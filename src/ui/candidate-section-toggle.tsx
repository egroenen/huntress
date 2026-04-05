'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

export const CandidateSectionToggle = ({
  app,
  collapsed,
}: {
  app: 'sonarr' | 'radarr';
  collapsed: boolean;
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const label = collapsed ? 'Expand section' : 'Collapse section';

  return (
    <button
      type="button"
      className="console-link console-link-button"
      aria-expanded={!collapsed}
      aria-controls={`${app}-candidates-table`}
      disabled={isPending}
      onClick={() => {
        const params = new URLSearchParams(searchParams.toString());
        const key = app === 'sonarr' ? 'sonarrCollapsed' : 'radarrCollapsed';

        if (collapsed) {
          params.delete(key);
        } else {
          params.set(key, '1');
        }

        const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;

        startTransition(() => {
          router.replace(nextUrl as never, { scroll: false });
        });
      }}
    >
      {isPending ? 'Updating…' : label}
    </button>
  );
};
