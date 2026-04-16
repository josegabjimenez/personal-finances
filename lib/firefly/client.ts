import "server-only";

export class FireflyError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Firefly III request failed with ${status}`);
    this.status = status;
    this.body = body;
    this.name = "FireflyError";
  }
}
export class FireflyAuthError extends FireflyError {
  constructor(body: unknown) {
    super(401, body, "Firefly III rejected the token (401)");
    this.name = "FireflyAuthError";
  }
}
export class FireflyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FireflyConfigError";
  }
}

type SearchParamValue = string | number | boolean | null | undefined;

export interface FireflyFetchOptions {
  searchParams?: Record<string, SearchParamValue>;
  revalidate?: number | false;
  tags?: string[];
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

function getConfig() {
  const baseUrl = process.env.FIREFLY_BASE_URL;
  const token = process.env.FIREFLY_TOKEN;
  if (!baseUrl || !token) {
    throw new FireflyConfigError(
      "FIREFLY_BASE_URL and FIREFLY_TOKEN must be set. Copy .env.local.example to .env.local and fill them in."
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

function buildUrl(baseUrl: string, path: string, searchParams?: Record<string, SearchParamValue>) {
  const cleanedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl}/api/v1${cleanedPath}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

/**
 * Server-side fetch wrapper for Firefly III.
 * - Injects base URL + bearer token
 * - Tags responses for cache revalidation
 * - Throws typed errors
 */
export async function fireflyFetch<T = unknown>(
  path: string,
  opts: FireflyFetchOptions = {}
): Promise<T> {
  const { baseUrl, token } = getConfig();
  const url = buildUrl(baseUrl, path, opts.searchParams);

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.api+json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    next:
      opts.revalidate === false
        ? undefined
        : {
            revalidate: opts.revalidate ?? 60,
            tags: ["firefly", ...(opts.tags ?? [])],
          },
    cache: opts.revalidate === false ? "no-store" : undefined,
  });

  if (!res.ok) {
    let errorBody: unknown = null;
    try {
      errorBody = await res.json();
    } catch {
      try {
        errorBody = await res.text();
      } catch {
        // ignore
      }
    }
    if (res.status === 401 || res.status === 403) {
      throw new FireflyAuthError(errorBody);
    }
    throw new FireflyError(res.status, errorBody);
  }

  return (await res.json()) as T;
}

/**
 * Raw version that returns the Response object, for the proxy route handler
 * to pass through status, headers, and body as-is.
 */
export async function fireflyProxy(
  path: string,
  init: { method: string; search: URLSearchParams; body?: BodyInit | null }
): Promise<Response> {
  const { baseUrl, token } = getConfig();
  const cleanedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl}/api/v1${cleanedPath}`);
  for (const [k, v] of init.search) url.searchParams.set(k, v);

  return fetch(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.api+json",
    },
    body: init.body ?? undefined,
    cache: "no-store",
  });
}
