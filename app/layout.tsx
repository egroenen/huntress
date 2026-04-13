import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { NavigationProgressProvider } from '@/src/ui/navigation-progress';

import './globals.css';

export const metadata: Metadata = {
  title: 'huntress',
  description: 'Deterministic Arr re-search orchestrator',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <NavigationProgressProvider>{children}</NavigationProgressProvider>
      </body>
    </html>
  );
}
