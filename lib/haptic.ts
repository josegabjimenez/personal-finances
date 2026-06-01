export type HapticStyle = "light" | "medium";

// navigator.vibrate() works on Android PWA/Chrome.
// iOS Safari/WebKit still does not expose a true haptics API for web PWAs,
// so this gracefully no-ops there while preserving tactile feedback on
// platforms that support the Vibration API.
export function haptic(style: HapticStyle = "light") {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(style === "light" ? 8 : 18);
  } catch {
    // ignore — some browsers throw in restricted contexts
  }
}
