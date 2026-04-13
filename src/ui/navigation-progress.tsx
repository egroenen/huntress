'use client';

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

interface PendingNavigation {
  href: string;
  label: string;
}

interface NavigationProgressContextValue {
  pendingNavigation: PendingNavigation | null;
  startNavigation: (input: PendingNavigation) => void;
}

const NavigationProgressContext =
  createContext<NavigationProgressContextValue | null>(null);

export const NavigationProgressProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const pathname = usePathname();
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const activePendingNavigation =
    pendingNavigation && pendingNavigation.href !== pathname ? pendingNavigation : null;

  const value = useMemo<NavigationProgressContextValue>(
    () => ({
      pendingNavigation: activePendingNavigation,
      startNavigation: (input) => {
        setPendingNavigation(input);
      },
    }),
    [activePendingNavigation]
  );

  return (
    <NavigationProgressContext.Provider value={value}>
      {children}
    </NavigationProgressContext.Provider>
  );
};

export const useNavigationProgress = (): NavigationProgressContextValue => {
  const context = useContext(NavigationProgressContext);

  if (!context) {
    throw new Error('useNavigationProgress must be used within NavigationProgressProvider');
  }

  return context;
};
