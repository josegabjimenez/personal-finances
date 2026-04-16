/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    ...defaultCache,
    {
      // Slowly-changing Firefly data → stale-while-revalidate
      matcher: ({ url }) =>
        url.pathname.startsWith("/api/firefly/accounts") ||
        url.pathname.startsWith("/api/firefly/budgets") ||
        url.pathname.startsWith("/api/firefly/budget-limits") ||
        url.pathname.startsWith("/api/firefly/categories") ||
        url.pathname.startsWith("/api/firefly/piggy-banks"),
      handler: new StaleWhileRevalidate({
        cacheName: "firefly-slow",
        plugins: [
          new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 5 }),
        ],
      }),
    },
    {
      // Fast-moving Firefly data → network first, short TTL fallback
      matcher: ({ url }) =>
        url.pathname.startsWith("/api/firefly/transactions") ||
        url.pathname.startsWith("/api/firefly/summary") ||
        url.pathname.startsWith("/api/firefly/insight"),
      handler: new NetworkFirst({
        cacheName: "firefly-live",
        networkTimeoutSeconds: 4,
        plugins: [
          new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 }),
        ],
      }),
    },
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
