'use client';

import type {
  AnchorHTMLAttributes,
  FormHTMLAttributes,
  MouseEvent,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

interface QueryFilterFormProps
  extends Omit<FormHTMLAttributes<HTMLFormElement>, 'action' | 'children' | 'method'> {
  action: string;
  children: ReactNode;
  replace?: boolean;
  pendingMessage?: string | null;
  autoSubmitOnChange?: boolean;
  persistenceCookieName?: string | undefined;
  persistedQueryKeys?: readonly string[] | undefined;
}

interface QueryFilterLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'href'> {
  children: ReactNode;
  href: string;
  replace?: boolean;
  persistenceCookieName?: string | undefined;
  persistedQueryKeys?: readonly string[] | undefined;
}

const PERSISTED_QUERY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

const buildSubmissionUrl = (form: HTMLFormElement): string => {
  const url = new URL(form.action, window.location.href);
  const formData = new FormData(form);
  const formKeys = new Set<string>();

  for (const key of formData.keys()) {
    if (formKeys.has(key)) {
      continue;
    }

    formKeys.add(key);
    url.searchParams.delete(key);
  }

  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmedValue = value.trim();

    if (!trimmedValue) {
      continue;
    }

    url.searchParams.append(key, trimmedValue);
  }

  return `${url.pathname}${url.search}${url.hash}`;
};

const persistQueryState = (
  nextUrl: string,
  cookieName: string | undefined,
  persistedQueryKeys: readonly string[] | undefined
) => {
  if (!cookieName || !persistedQueryKeys?.length) {
    return;
  }

  const url = new URL(nextUrl, window.location.href);
  const payload = Object.fromEntries(
    persistedQueryKeys.map((key) => [key, url.searchParams.get(key) ?? ''])
  );
  const hasPersistedValue = Object.values(payload).some((value) => value !== '');

  if (!hasPersistedValue) {
    document.cookie = `${cookieName}=; path=/; max-age=0; samesite=lax`;
    return;
  }

  document.cookie =
    `${cookieName}=${encodeURIComponent(JSON.stringify(payload))}; ` +
    `path=/; max-age=${PERSISTED_QUERY_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
};

const shouldHandleClientNavigation = (
  event: MouseEvent<HTMLAnchorElement>,
  target: string | undefined
): boolean => {
  if (event.defaultPrevented) {
    return false;
  }

  if (event.button !== 0) {
    return false;
  }

  if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
    return false;
  }

  if (target && target !== '_self') {
    return false;
  }

  return true;
};

export const QueryFilterForm = ({
  action,
  children,
  autoSubmitOnChange = false,
  className,
  persistenceCookieName,
  persistedQueryKeys,
  replace = true,
  pendingMessage = 'Updating results...',
  onChange,
  onSubmit,
  ...props
}: QueryFilterFormProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigateWithForm = (form: HTMLFormElement) => {
    const nextUrl = buildSubmissionUrl(form);
    persistQueryState(nextUrl, persistenceCookieName, persistedQueryKeys);

    startTransition(() => {
      if (replace) {
        router.replace(nextUrl as never, { scroll: false });
        return;
      }

      router.push(nextUrl as never, { scroll: false });
    });
  };

  return (
    <form
      {...props}
      action={action}
      method="get"
      className={['query-filter-form', className].filter(Boolean).join(' ')}
      aria-busy={isPending}
      data-pending={isPending ? 'true' : 'false'}
      onChange={(event) => {
        onChange?.(event);

        if (event.defaultPrevented || !autoSubmitOnChange || isPending) {
          return;
        }

        const target = event.target;

        if (!(target instanceof HTMLSelectElement)) {
          return;
        }

        navigateWithForm(event.currentTarget);
      }}
      onSubmit={(event) => {
        onSubmit?.(event);

        if (event.defaultPrevented) {
          return;
        }

        event.preventDefault();
        navigateWithForm(event.currentTarget);
      }}
    >
      <fieldset className="query-filter-form__fieldset" disabled={isPending}>
        {children}
      </fieldset>
      {pendingMessage !== null ? (
        <p className="query-filter-form__status" aria-live="polite" aria-atomic="true">
          {isPending ? pendingMessage : ''}
        </p>
      ) : null}
    </form>
  );
};

export const QueryFilterLink = ({
  children,
  className,
  href,
  onClick,
  persistenceCookieName,
  persistedQueryKeys,
  replace = true,
  target,
  ...props
}: QueryFilterLinkProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <a
      {...props}
      href={href}
      target={target}
      className={['query-filter-link', className].filter(Boolean).join(' ')}
      aria-busy={isPending}
      aria-disabled={isPending || undefined}
      data-pending={isPending ? 'true' : 'false'}
      onClick={(event) => {
        onClick?.(event);

        if (!shouldHandleClientNavigation(event, target)) {
          return;
        }

        event.preventDefault();
        persistQueryState(href, persistenceCookieName, persistedQueryKeys);

        startTransition(() => {
          if (replace) {
            router.replace(href as never, { scroll: false });
            return;
          }

          router.push(href as never, { scroll: false });
        });
      }}
    >
      {children}
    </a>
  );
};
