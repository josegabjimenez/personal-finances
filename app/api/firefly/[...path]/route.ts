import { NextRequest, NextResponse } from "next/server";
import { fireflyProxy, FireflyConfigError } from "@/lib/firefly/client";

export const runtime = "nodejs";

// Allow-list of Firefly API path prefixes the app can call.
// Any request outside this list returns 404 to limit blast radius if the
// session cookie is ever leaked.
const ALLOWED_PREFIXES = [
  "about",
  "summary",
  "insight",
  "chart",
  "transactions",
  "accounts",
  "budgets",
  "budget-limits",
  "categories",
  "piggy-banks",
  "tags",
  "currencies",
];

function isAllowed(path: string) {
  return ALLOWED_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`)
  );
}

async function handle(req: NextRequest, path: string[]) {
  const fullPath = path.join("/");
  if (!isAllowed(fullPath)) {
    return NextResponse.json({ error: "Path not allowed" }, { status: 404 });
  }
  try {
    const res = await fireflyProxy(fullPath, {
      method: req.method,
      search: req.nextUrl.searchParams,
      body: ["GET", "HEAD"].includes(req.method) ? null : await req.text(),
    });
    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
        "cache-control": "private, max-age=0",
      },
    });
  } catch (err) {
    if (err instanceof FireflyConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path);
}
