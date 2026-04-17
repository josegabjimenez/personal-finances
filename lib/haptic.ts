// navigator.vibrate() works on Android PWA/Chrome.
// iOS Safari does not implement the Vibration API — calls are silently ignored.
export function haptic(style: "light" | "medium" = "light") {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(style === "light" ? 8 : 18);
  } catch {
    // ignore — some browsers throw in restricted contexts
  }
}
