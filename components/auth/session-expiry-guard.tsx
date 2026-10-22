"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  isOfflineSessionRevoked,
  updateOfflineSessionState,
} from "@/lib/auth/client-session";

const LOCAL_SESSION_REVOKED_KEY = "pf_session_revoked";

function isLocallyRevoked(): boolean {
  try {
    return localStorage.getItem(LOCAL_SESSION_REVOKED_KEY) === "1";
  } catch {
    return false;
  }
}

export function SessionExpiryGuard({
  expiresAt,
  children,
}: {
  expiresAt: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [revoked, setRevoked] = React.useState(
    () => !Number.isFinite(expiresAt) || expiresAt <= Date.now()
  );

  React.useEffect(() => {
    let handled = false;
    const revoke = (notifyWorker: boolean) => {
      if (handled) return;
      handled = true;
      setRevoked(true);
      queryClient.clear();
      if (notifyWorker) void updateOfflineSessionState("PF_SESSION_EXPIRED");
      router.replace("/login?reason=session-ended");
      router.refresh();
    };

    const checkExpiry = () => {
      if (isLocallyRevoked()) {
        revoke(false);
      } else if (Date.now() >= expiresAt) {
        revoke(true);
      } else {
        void isOfflineSessionRevoked().then((workerRevoked) => {
          if (workerRevoked) revoke(false);
        });
      }
    };
    const timeout = window.setTimeout(
      checkExpiry,
      Math.max(0, expiresAt - Date.now())
    );
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkExpiry();
    };
    const onPageShow = () => checkExpiry();
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === LOCAL_SESSION_REVOKED_KEY &&
        event.newValue === "1"
      ) {
        revoke(false);
      }
    };
    const onWorkerMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === "PF_PRIVATE_SESSION_REVOKED") revoke(false);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("storage", onStorage);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    checkExpiry();

    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("storage", onStorage);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    };
  }, [expiresAt, queryClient, router]);

  if (revoked) {
    return (
      <div className="min-h-screen" role="status" aria-live="polite">
        Your session has ended. Returning to sign in…
      </div>
    );
  }

  return children;
}
