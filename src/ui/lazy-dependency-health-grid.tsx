'use client';

import { useEffect, useState } from 'react';

import type { DependencyHealthCard } from '@/src/ui/operator-console';
import { DependencyHealthGrid } from '@/src/ui/operator-console';

const LoadingDependencyGrid = () => (
  <div className="console-inline-loading">
    <span className="console-content__spinner" aria-hidden="true" />
    <div>
      <strong>Loading dependency health...</strong>
      <small>Fetching live probe results.</small>
    </div>
  </div>
);

export const LazyDependencyHealthGrid = () => {
  const [dependencies, setDependencies] = useState<DependencyHealthCard[] | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    let active = true;

    void fetch('/api/console/dependencies', {
      cache: 'no-store',
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Dependency request failed with status ${response.status}`);
        }

        return (await response.json()) as {
          dependencyCards?: DependencyHealthCard[];
        };
      })
      .then((payload) => {
        if (!active) {
          return;
        }

        setDependencies(payload.dependencyCards ?? []);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setDependencies([]);
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, []);

  if (dependencies === null) {
    return <LoadingDependencyGrid />;
  }

  return <DependencyHealthGrid dependencies={dependencies} />;
};
