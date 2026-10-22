import { NextResponse, type NextRequest } from "next/server";
import { getSessionExpiresAt, SESSION_COOKIE } from "@/lib/auth/session";

const PUBLIC_PATHS = [
  "/login",
  "/offline",
  "/api/auth/login",
  "/api/auth/logout",
  "/manifest.webmanifest",
  "/sw.js",
  "/favicon.ico",
  "/icon.svg",
  "/robots.txt",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  if (pathname.startsWith("/icons/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/swe-worker-")) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const expiresAt = await getSessionExpiresAt(token);
  if (expiresAt !== null && expiresAt > Date.now()) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-pf-session-expires-at", String(expiresAt));
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set("X-PF-Session-Expires-At", String(expiresAt));
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)"],
};
