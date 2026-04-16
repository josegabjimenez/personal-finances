import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border">
          <WifiOff className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">You’re offline</h1>
        <p className="text-sm text-muted-foreground">
          Reconnect to refresh your data — cached pages will load automatically.
        </p>
      </div>
    </div>
  );
}
