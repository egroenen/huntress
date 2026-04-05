export type IntegrationErrorCode = 'timeout' | 'network' | 'http' | 'invalid_response';

export class IntegrationError extends Error {
  readonly code: IntegrationErrorCode;
  readonly status: number | null;
  readonly endpoint: string;
  readonly body: unknown;

  constructor(input: {
    message: string;
    code: IntegrationErrorCode;
    endpoint: string;
    status?: number | null;
    body?: unknown;
    cause?: unknown;
  }) {
    super(input.message, input.cause ? { cause: input.cause } : undefined);
    this.name = 'IntegrationError';
    this.code = input.code;
    this.endpoint = input.endpoint;
    this.status = input.status ?? null;
    this.body = input.body ?? null;
  }
}

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export const joinUrl = (baseUrl: string, path: string): string => {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

export const requestJson = async <T>(
  url: string,
  schema: { parse: (input: unknown) => T },
  options: HttpRequestOptions = {}
): Promise<T> => {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestInit: RequestInit = {
      method: options.method ?? 'GET',
      signal: controller.signal,
    };

    if (options.headers) {
      requestInit.headers = options.headers;
    }

    if (options.body !== undefined) {
      requestInit.body = options.body;
    }

    const response = await fetch(url, requestInit);

    const parsedBody = await parseResponseBody(response);

    if (!response.ok) {
      throw new IntegrationError({
        message: `HTTP ${response.status} returned from ${url}`,
        code: 'http',
        endpoint: url,
        status: response.status,
        body: parsedBody,
      });
    }

    try {
      return schema.parse(parsedBody);
    } catch (error) {
      throw new IntegrationError({
        message: `Invalid response from ${url}`,
        code: 'invalid_response',
        endpoint: url,
        status: response.status,
        body: parsedBody,
        cause: error,
      });
    }
  } catch (error) {
    if (error instanceof IntegrationError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new IntegrationError({
        message: `Request to ${url} timed out after ${timeoutMs}ms`,
        code: 'timeout',
        endpoint: url,
        cause: error,
      });
    }

    throw new IntegrationError({
      message: `Network error while requesting ${url}`,
      code: 'network',
      endpoint: url,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
};
