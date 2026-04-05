import type { ReactNode } from 'react';

import { formatReasonCodeLabel } from '@/src/ui/formatters';

import { normalizeBadgeStatus } from './helpers';

export const StatusBadge = ({
  status,
  children,
  title,
  ariaLabel,
}: {
  status: string;
  children?: ReactNode;
  title?: string;
  ariaLabel?: string;
}) => {
  const normalizedStatus = normalizeBadgeStatus(status);

  return (
    <span
      className={`status-badge status-badge--${normalizedStatus}`}
      title={title}
      aria-label={ariaLabel}
    >
      {children ?? status.replace('_', ' ')}
    </span>
  );
};

export const ReasonCodeBadge = ({ reasonCode }: { reasonCode: string }) => {
  return (
    <code
      className="reason-code"
      title={`${formatReasonCodeLabel(reasonCode)} (${reasonCode})`}
    >
      {formatReasonCodeLabel(reasonCode)}
    </code>
  );
};
