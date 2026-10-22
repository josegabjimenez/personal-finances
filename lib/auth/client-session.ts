const LOCAL_SESSION_REVOKED_KEY = "pf_session_revoked";

export async function updateOfflineSessionState(
  type: "PF_SESSION_ACTIVE" | "PF_SESSION_SIGNED_OUT" | "PF_SESSION_EXPIRED"
): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (type === "PF_SESSION_ACTIVE") {
      localStorage.removeItem(LOCAL_SESSION_REVOKED_KEY);
    } else {
      localStorage.setItem(LOCAL_SESSION_REVOKED_KEY, "1");
    }
  } catch {
    // The service worker still persists the state when browser storage is blocked.
  }
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  let worker = navigator.serviceWorker.controller;
  if (!worker) {
    try {
      worker = (await navigator.serviceWorker.getRegistration())?.active ?? null;
    } catch {
      return;
    }
  }
  if (!worker) return;

  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    let timeout = 0;
    const finish = () => {
      window.clearTimeout(timeout);
      channel.port1.close();
      resolve();
    };
    timeout = window.setTimeout(finish, 1_000);
    channel.port1.onmessage = () => {
      finish();
    };
    try {
      worker.postMessage({ type }, [channel.port2]);
    } catch {
      finish();
    }
  });
}

export async function isOfflineSessionRevoked(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const worker = navigator.serviceWorker.controller ?? registration?.active;
    if (!worker) return false;

    return await new Promise<boolean>((resolve) => {
      const channel = new MessageChannel();
      let timeout = 0;
      const finish = (revoked: boolean) => {
        window.clearTimeout(timeout);
        channel.port1.close();
        resolve(revoked);
      };
      timeout = window.setTimeout(() => finish(false), 1_000);
      channel.port1.onmessage = (event: MessageEvent<{ revoked?: boolean }>) => {
        finish(event.data?.revoked === true);
      };
      try {
        worker.postMessage({ type: "PF_SESSION_STATUS" }, [channel.port2]);
      } catch {
        finish(false);
      }
    });
  } catch {
    return false;
  }
}
