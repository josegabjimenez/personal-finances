/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const SESSION_EXPIRATION_HEADER = "X-PF-Session-Expires-At";
const PRIVATE_CONTENT_CACHE = "private-session-content";
const PRIVATE_CONTROL_CACHE = "private-session-control";
const PRIVATE_STATE_URL = new URL("/__pf_session_state__", self.location.origin);
const PRIVATE_CACHE_NAMES = [
  PRIVATE_CONTENT_CACHE,
  // Remove caches created by the previous worker, including its default rules.
  "others",
  "pages-rsc",
  "apis",
  "firefly-slow",
  "firefly-live",
];

async function privateSessionIsRevoked(): Promise<boolean> {
  const controlCache = await caches.open(PRIVATE_CONTROL_CACHE);
  return (await controlCache.match(PRIVATE_STATE_URL)) !== undefined;
}

async function setPrivateSessionRevoked(): Promise<void> {
  const controlCache = await caches.open(PRIVATE_CONTROL_CACHE);
  await controlCache.put(PRIVATE_STATE_URL, new Response("revoked"));
}

async function clearPrivateContentCaches(): Promise<void> {
  await Promise.all(PRIVATE_CACHE_NAMES.map((name) => caches.delete(name)));
}

async function notifyClientsSessionRevoked(): Promise<void> {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clients) {
    client.postMessage({ type: "PF_PRIVATE_SESSION_REVOKED" });
  }
}

async function revokePrivateSession(): Promise<void> {
  await setPrivateSessionRevoked();
  await clearPrivateContentCaches();
  // The revocation marker lives in its own cache and survives cache cleanup.
  await setPrivateSessionRevoked();
  await notifyClientsSessionRevoked();
}

function isPrivateContentRequest(request: Request, url: URL): boolean {
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return false;
  }
  if (
    url.pathname === "/login" ||
    url.pathname === "/offline" ||
    url.pathname === "/api/auth/login" ||
    url.pathname === "/api/auth/logout" ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/_next/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    return false;
  }
  return (
    request.mode === "navigate" ||
    request.headers.has("rsc") ||
    url.searchParams.has("_rsc") ||
    url.pathname.startsWith("/api/")
  );
}

const privateSessionCachePlugin = {
  async fetchDidSucceed({ response }: { response: Response }) {
    const expiresAt = Number(response.headers.get(SESSION_EXPIRATION_HEADER));
    const sessionWasRejected =
      (!Number.isFinite(expiresAt) && response.status < 500) ||
      (Number.isFinite(expiresAt) && expiresAt <= Date.now());
    if (sessionWasRejected) {
      await revokePrivateSession();
    }
    return response;
  },
  async cacheWillUpdate({ response }: { response: Response }) {
    const expiresAt = Number(response.headers.get(SESSION_EXPIRATION_HEADER));
    if (
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() ||
      (await privateSessionIsRevoked())
    ) {
      return null;
    }
    return response;
  },
  async cachedResponseWillBeUsed({
    cachedResponse,
  }: {
    cachedResponse?: Response | null;
  }) {
    if (!cachedResponse) return null;
    const expiresAt = Number(
      cachedResponse.headers.get(SESSION_EXPIRATION_HEADER)
    );
    if (await privateSessionIsRevoked()) return null;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await revokePrivateSession();
      return null;
    }
    return cachedResponse;
  },
};

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  const message = (event as MessageEvent).data as { type?: string } | null;
  if (!message?.type) return;

  if (
    message.type === "PF_SESSION_SIGNED_OUT" ||
    message.type === "PF_SESSION_EXPIRED"
  ) {
    event.waitUntil(
      revokePrivateSession().then(() => {
        event.ports[0]?.postMessage({ ok: true });
      })
    );
  } else if (message.type === "PF_SESSION_ACTIVE") {
    event.waitUntil(
      clearPrivateContentCaches()
        .then(() => caches.open(PRIVATE_CONTROL_CACHE))
        .then((cache) => cache.delete(PRIVATE_STATE_URL))
        .then(() => {
          event.ports[0]?.postMessage({ ok: true });
        })
    );
  } else if (message.type === "PF_SESSION_STATUS") {
    event.waitUntil(
      privateSessionIsRevoked().then((revoked) => {
        event.ports[0]?.postMessage({ revoked });
      })
    );
  }
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(clearPrivateContentCaches());
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      // Cached financial content is usable offline only until its JWT expires.
      matcher: ({ request, url }) => isPrivateContentRequest(request, url),
      handler: new NetworkFirst({
        cacheName: PRIVATE_CONTENT_CACHE,
        networkTimeoutSeconds: 4,
        plugins: [
          privateSessionCachePlugin,
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
        ],
      }),
    },
    ...defaultCache,
    {
      // App icons
      matcher: ({ url }) => url.pathname.startsWith("/icons/"),
      handler: new CacheFirst({
        cacheName: "app-icons",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 20,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
        ],
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
