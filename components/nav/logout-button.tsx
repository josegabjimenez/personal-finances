"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateOfflineSessionState } from "@/lib/auth/client-session";

export function LogoutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  async function handleLogout() {
    queryClient.clear();
    await updateOfflineSessionState("PF_SESSION_SIGNED_OUT");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // The local sign-out still revokes offline access when the network is down.
    }
    router.replace("/login");
    router.refresh();
  }
  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full justify-start gap-2"
      onClick={handleLogout}
    >
      <LogOut className="h-4 w-4" />
      Sign out
    </Button>
  );
}
