'use client';

import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';

interface ConfirmButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick'
> {
  confirmMessage: string;
  children: ReactNode;
}

export const ConfirmButton = ({
  confirmMessage,
  children,
  ...buttonProps
}: ConfirmButtonProps) => {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(confirmMessage)) {
      event.preventDefault();
    }
  };

  return (
    <button {...buttonProps} onClick={handleClick}>
      {children}
    </button>
  );
};
