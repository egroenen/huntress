'use client';

import { useId } from 'react';

interface SuppressionSelectAllProps {
  targetSelector?: string;
}

export const SuppressionSelectAll = ({
  targetSelector = '[data-suppression-selectable="true"]',
}: SuppressionSelectAllProps) => {
  const checkboxId = useId();

  return (
    <input
      id={checkboxId}
      type="checkbox"
      aria-label="Select all visible suppressions"
      className="table-select-checkbox"
      onChange={(event) => {
        const nextChecked = event.currentTarget.checked;
        document.querySelectorAll<HTMLInputElement>(targetSelector).forEach((input) => {
          input.checked = nextChecked;
        });
      }}
    />
  );
};
