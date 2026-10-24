import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.RETRY_PLAYWRIGHT_MODULE || "playwright");
const demo = {
  secret: "retry-regression-fake-auth-secret-32-characters",
  token: "retry-regression-fake-firefly-token",
};
const work = await mkdtemp(path.join(tmpdir(), "personal-finances-retry-"));
const app = path.join(work, "app");
const children = [];
let browser;
let upstreamFailure;
const calls = [];
const errors = [];
const diagnostics = [];
const scenarios = [];
const output = process.env.RETRY_OUTPUT_DIR ? path.resolve(process.env.RETRY_OUTPUT_DIR) : null;

function group(id, keep = true) {
  return { type: "transactions", id: `retry-demo-${id}`, attributes: { transactions: [{
    type: "withdrawal", amount: "10.00", currency_code: "COP",
    description: `RETRY_${keep ? "KEEP" : "HIDDEN"}_${id}`,
    date: "2026-01-10T12:00:00Z", transaction_journal_id: `retry-journal-${id}`,
    source_name: "Synthetic account", destination_name: "Synthetic shop",
    category_name: "Synthetic category", tags: ["synthetic-tag"],
  }] } };
}
const upstream = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method !== "GET" || req.headers.authorization !== `Bearer ${demo.token}`) {
    upstreamFailure = new Error("Unexpected method or non-synthetic upstream authorization");
    res.writeHead(500); res.end(); return;
  }
  let body = { data: [], meta: { pagination: { total_pages: 1 } } };
  // Ignore unrelated synthetic reads caused by Next's navigation prefetches.
  if (url.pathname === "/api/v1/transactions" &&
      url.searchParams.get("type") === "withdrawal" && url.searchParams.get("limit") === "50") {
    const page = Number(url.searchParams.get("page") || 1);
    calls.push({ page, type: url.searchParams.get("type") });
    if (page === 2 && calls.filter((c) => c.page === 2).length === 1) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Synthetic transient failure" })); return;
    }
    body = { data: page === 1
      ? Array.from({ length: 50 }, (_, i) => group(String(i + 1).padStart(3, "0"), i % 2 === 0))
      : page === 2 ? [group("051"), group("052", false)] : [],
    meta: { pagination: { total_pages: 3 } } };
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
});
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(server.address().port); });
  });
}
async function unusedPort() {
  const server = createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function command(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: app, env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let logs = "";
  child.stdout.on("data", (data) => { logs += data; });
  child.stderr.on("data", (data) => { logs += data; });
  child.on("error", (error) => { logs += error.message; });
  return { child, logs: () => logs };
}
async function check(label, args, env) {
  console.log(label);
  const run = command(args, env);
  const [code] = await once(run.child, "exit");
  if (output) await writeFile(path.join(output, `${label}.log`), run.logs());
  assert.equal(code, 0, `${label} failed:\n${run.logs()}`);
}
function sessionToken() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = `${encode({ alg: "HS256" })}.${encode({ v: 1, iat: now, exp: now + 3600 })}`;
  return `${payload}.${createHmac("sha256", demo.secret).update(payload).digest("base64url")}`;
}
async function context(baseUrl, controlled = false) {
  const ctx = await browser.newContext({ serviceWorkers: "allow", viewport: { width: 1280, height: 900 } });
  ctx.setDefaultTimeout(15_000);
  await ctx.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === baseUrl ? route.continue() : route.abort("blockedbyclient");
  });
  await ctx.addCookies([{ name: "pf_session", value: sessionToken(), url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
  if (controlled) await ctx.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    const state = window.__retry = { requests: [], observers: [] };
    window.fetch = (input, init) => {
      const url = String(input);
      if (!url.startsWith("/__retry-fixture/")) return originalFetch(input, init);
      return new Promise((resolve, reject) => state.requests.push({ url, signal: init?.signal, resolve, reject }));
    };
    window.IntersectionObserver = class {
      constructor(callback) { this.callback = callback; state.observers.push(this); }
      observe(target) {
        this.target = target;
        // Target pagination, independently of Next Link's prefetch observers.
        this.list = !!target.closest("#retry-list") && target.classList.contains("py-6");
        this.active = true;
      }
      disconnect() { this.active = false; }
      unobserve() { this.active = false; }
      takeRecords() { return []; }
    };
    state.trigger = (stale = false, times = 1) => {
      const matches = state.observers.filter((observer) => observer.list && (stale || observer.active));
      const observer = stale ? matches[0] : matches.at(-1);
      if (!observer) throw new Error("Expected a list observer");
      for (let i = 0; i < times; i++) observer.callback([{ isIntersecting: true, target: observer.target }]);
    };
    // Deliberately ignore AbortSignal: late fetch/json success or rejection must be harmless.
    state.respond = (index, body, status = 200) => state.requests[index].resolve({ ok: status < 400, status, json: async () => body });
    state.fail = (index) => state.requests[index].reject(new TypeError("Synthetic connection failure"));
  });
  const page = await ctx.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") diagnostics.push(message.text()); });
  page.on("requestfailed", (request) => diagnostics.push({ url: request.url(), error: request.failure()?.errorText }));
  return { ctx, page };
}
async function waitRequests(page, count) {
  await page.waitForFunction((n) => window.__retry.requests.length === n, count);
}
async function respond(page, index, data, totalPages = 3) {
  await page.evaluate(({ index, data, totalPages }) => window.__retry.respond(index, { data, meta: { pagination: { total_pages: totalPages } } }), { index, data, totalPages });
}
async function fixture(baseUrl) {
  const { ctx, page } = await context(baseUrl, true);
  await page.goto(`${baseUrl}/retry-harness`);
  await page.getByText("RETRY_KEEP_OLD", { exact: true }).waitFor();
  await page.waitForFunction(() => window.__retry.observers.some((o) => o.active && o.list));
  return { ctx, page };
}
async function record(label, run) {
  await run(); scenarios.push(label); console.log(`PASS ${label}`);
}

let cleanupPromise;
function cleanup() {
  cleanupPromise ??= (async () => {
    await browser?.close();
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      const exited = once(child, "exit");
      try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 5000);
      await exited; clearTimeout(timer);
    }
    if (upstream.listening) { upstream.closeAllConnections(); await new Promise((resolve) => upstream.close(resolve)); }
    await rm(work, { recursive: true, force: true });
  })();
  return cleanupPromise;
}
const interrupt = () => { void cleanup().finally(() => process.exit(130)); };
const terminate = () => { void cleanup().finally(() => process.exit(143)); };
process.once("SIGINT", interrupt);
process.once("SIGTERM", terminate);

try {
  if (output) await mkdir(output, { recursive: true });
  // Copy tracked source plus these explicit task files; never read env or other local files.
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  files.push("scripts/transaction-loading-retry.mjs", "scripts/fixtures/transaction-loading-retry-page.tsx");
  for (const file of new Set(files)) {
    if (file.split("/").some((part) => part.startsWith(".env")) || file.startsWith("docs/")) continue;
    const dest = path.join(app, file);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(path.join(root, file), dest);
  }
  await symlink(path.join(root, "node_modules"), path.join(app, "node_modules"), "dir");
  await mkdir(path.join(work, "home"));
  // Fail fast on a missing browser, before the expensive build checks.
  browser = await chromium.launch({ channel: process.env.RETRY_BROWSER_CHANNEL, headless: true,
    executablePath: process.env.RETRY_BROWSER_EXECUTABLE,
    env: { PATH: process.env.PATH, HOME: path.join(work, "home"), TMPDIR: tmpdir() },
    args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"] });
  const fontMock = path.join(work, "font-mock.cjs");
  const fontDir = path.join(root, "node_modules/next/dist/next-devtools/server/font");
  await writeFile(fontMock, `module.exports = new Proxy({}, { get: (_, url) => {
    const mono = String(url).includes('Geist+Mono');
    return '@font-face { font-family: "' + (mono ? 'Geist Mono' : 'Geist') +
      '"; font-style: normal; font-weight: 100 900; src: url(' +
      ${JSON.stringify(fontDir)} + '/' + (mono ? 'geist-mono-latin.woff2' : 'geist-latin.woff2') + ') format("woff2"); }';
  }});`);
  execFileSync(process.execPath, ["--check", fontMock]);
  const port = await unusedPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const upstreamPort = await listen(upstream);
  const env = {
    PATH: process.env.PATH, HOME: path.join(work, "home"), TMPDIR: tmpdir(),
    NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontMock,
    FIREFLY_BASE_URL: `http://127.0.0.1:${upstreamPort}`, FIREFLY_TOKEN: demo.token,
    APP_PASSWORD: "retry-regression-fake-password", AUTH_SECRET: demo.secret,
  };
  await check("lint", [path.join(root, "node_modules/eslint/bin/eslint.js"), "."], env);
  // Build the exact product source first; only then add the isolated component harness.
  await check("production-build", [path.join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"], env);
  await check("typecheck", [path.join(root, "node_modules/typescript/bin/tsc"), "--noEmit"], env);
  const harnessDir = path.join(app, "app/(app)/retry-harness");
  await mkdir(harnessDir, { recursive: true });
  await copyFile(path.join(root, "scripts/fixtures/transaction-loading-retry-page.tsx"), path.join(harnessDir, "page.tsx"));
  await check("harness-build", [path.join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"], env);
  const server = command([path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], env);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.child.exitCode !== null) throw new Error(server.logs());
    try {
      const response = await fetch(`${baseUrl}/api/firefly/transactions`, { signal: AbortSignal.timeout(500) });
      await response.arrayBuffer();
      if (response.status === 401) { ready = true; break; }
    } catch { /* local listener starting */ }
    await delay(100);
  }
  assert.ok(ready, "local production server must enforce authentication");

  await record("real route: HTTP failure preserves rows and filters, Retry repeats page 2 once, final page completes", async () => {
    const { ctx, page } = await context(baseUrl);
    const search = new URLSearchParams({ view: "all", q: "RETRY_KEEP", type: "withdrawal", account: "Synthetic account", category: "Synthetic category", tag: "synthetic-tag" });
    await page.goto(`${baseUrl}/transactions?${search}`);
    await page.getByText("RETRY_KEEP_001", { exact: true }).waitFor();
    // FilterBar debounces its initial URL synchronization for 300ms.
    await delay(500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    const rows = page.locator('main a[href^="/transactions/"]');
    assert.equal(await rows.count(), 25);
    assert.equal(await page.getByPlaceholder("Search transactions…").inputValue(), "RETRY_KEEP");
    assert.equal(new URL(page.url()).searchParams.toString(), search.toString());
    assert.equal((await page.locator("main").innerText()).includes("No transactions match"), false);
    await delay(200); // A visible failed sentinel must stay paused until Retry.
    assert.deepEqual(calls.filter((c) => c.page > 1).map((c) => c.page), [2]);
    await page.getByRole("button", { name: "Retry", exact: true }).evaluate((button) => { for (let i = 0; i < 5; i++) button.click(); });
    await page.getByText("RETRY_KEEP_051", { exact: true }).waitFor();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByText("26 transaction entries", { exact: true }).waitFor();
    await page.getByText("All matching transactions in this view", { exact: true }).waitFor();
    assert.equal(await rows.count(), 26);
    assert.deepEqual(calls.filter((c) => c.page > 1).map((c) => c.page), [2, 2, 3]);
    assert.ok(calls.every((c) => c.type === "withdrawal"));
    assert.equal(await page.getByRole("button", { name: "Retry", exact: true }).count(), 0);
    assert.equal(await page.getByText("Loading…", { exact: true }).count(), 0);
    if (output) await page.screenshot({ path: path.join(output, "recovered-transactions.png"), fullPage: false });
    await ctx.close();
  });

  await record("network rejection: retained rows, synchronous retry lock, exact page, filtered empty page continues", async () => {
    const { ctx, page } = await fixture(baseUrl);
    await page.evaluate(() => window.__retry.trigger(false, 5)); await waitRequests(page, 1);
    await page.evaluate(() => window.__retry.fail(0));
    await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    await page.getByText("RETRY_KEEP_OLD", { exact: true }).waitFor();
    await page.evaluate(() => window.__retry.trigger(true, 5)); await waitRequests(page, 1);
    await page.getByRole("button", { name: "Retry", exact: true }).evaluate((button) => { for (let i = 0; i < 5; i++) button.click(); });
    await waitRequests(page, 2);
    assert.deepEqual(await page.evaluate(() => window.__retry.requests.map((r) => r.url)), Array(2).fill("/__retry-fixture/old?type=withdrawal&page=2"));
    await respond(page, 1, [group("FILTERED", false)]);
    await page.getByText("1 transaction entry", { exact: true }).waitFor();
    await page.waitForFunction(() => window.__retry.observers.some((o) => o.active && o.list));
    await page.evaluate(() => window.__retry.trigger()); await waitRequests(page, 3);
    await respond(page, 2, []);
    await page.getByText("1 transaction entry", { exact: true }).waitFor();
    await page.getByText("All matching transactions in this view", { exact: true }).waitFor();
    await page.evaluate(() => window.__retry.trigger(true, 5)); await waitRequests(page, 3);
    await ctx.close();
  });

  for (const change of ["Replace initial groups", "Change fetch URL"]) {
    for (const lateResult of ["success", "failure", "json"]) {
      await record(`${change}: stale ${lateResult} and queued observer cannot overwrite new request`, async () => {
        const { ctx, page } = await fixture(baseUrl);
        await page.evaluate(() => window.__retry.trigger()); await waitRequests(page, 1);
        if (lateResult === "json") await page.evaluate(() => {
          const request = window.__retry.requests[0];
          request.resolve({ ok: true, json: () => new Promise((resolve) => { window.__retry.finishJson = resolve; }) });
        });
        await page.getByRole("button", { name: change, exact: true }).click();
        await page.getByText("RETRY_KEEP_NEW", { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => window.__retry.requests[0].signal.aborted), true);
        await page.evaluate(() => window.__retry.trigger(true, 5)); await waitRequests(page, 1);
        await page.waitForFunction(() => window.__retry.observers.some((o) => o.active && o.list));
        await page.evaluate(() => window.__retry.trigger()); await waitRequests(page, 2);
        if (lateResult === "failure") await page.evaluate(() => window.__retry.fail(0));
        else if (lateResult === "json") await page.evaluate((data) => window.__retry.finishJson({ data, meta: { pagination: { total_pages: 3 } } }), [group("STALE")]);
        else await respond(page, 0, [group("STALE")]);
        await page.getByText("Loading…", { exact: true }).waitFor();
        await page.evaluate(() => window.__retry.trigger(true, 5)); await waitRequests(page, 2);
        await respond(page, 1, [group("CURRENT")], 2);
        await page.getByText("RETRY_KEEP_CURRENT", { exact: true }).waitFor();
        assert.equal(await page.getByText("RETRY_KEEP_STALE", { exact: true }).count(), 0);
        assert.equal(await page.getByText("RETRY_KEEP_OLD", { exact: true }).count(), 0);
        assert.equal(await page.locator('#retry-list a[href^="/transactions/"]').count(), 2);
        await ctx.close();
      });
    }
  }
  await record("unmount aborts and ignores a late success", async () => {
    const { ctx, page } = await fixture(baseUrl);
    await page.evaluate(() => window.__retry.trigger()); await waitRequests(page, 1);
    await page.getByRole("button", { name: "Unmount list", exact: true }).click();
    assert.equal(await page.evaluate(() => window.__retry.requests[0].signal.aborted), true);
    await respond(page, 0, [group("STALE")]);
    await page.evaluate(() => window.__retry.trigger(true)); await waitRequests(page, 1);
    assert.equal(await page.locator("#retry-list").innerText(), "");
    await ctx.close();
  });
  await record("single page has no loading, Retry, or extra request", async () => {
    const { ctx, page } = await fixture(baseUrl);
    await page.getByRole("button", { name: "Single page", exact: true }).click();
    await page.getByText("1 transaction entry", { exact: true }).waitFor();
    await page.getByText("All matching transactions in this view", { exact: true }).waitFor();
    await page.evaluate(() => window.__retry.trigger(true, 5)); await waitRequests(page, 0);
    assert.equal(await page.getByRole("button", { name: "Retry", exact: true }).count(), 0);
    await ctx.close();
  });
  assert.equal(upstreamFailure, undefined);
  assert.deepEqual(errors, [], "no uncaught browser errors");
  if (output) await writeFile(path.join(output, "observations.json"), JSON.stringify({ syntheticOnly: true, browserVersion: browser.version(), scenarios, upstreamCalls: calls, browserErrors: errors }, null, 2) + "\n");
  console.log(`Passed ${scenarios.length} synthetic regression scenarios; lint, typecheck, and production build passed.`);
} catch (error) {
  if (output) {
    const pages = [];
    for (const ctx of browser?.contexts() || []) for (const page of ctx.pages()) {
      pages.push({ path: new URL(page.url()).pathname, text: await page.locator("body").innerText().catch(() => ""),
        scroll: await page.evaluate(() => ({ top: scrollY, height: innerHeight, body: document.body.scrollHeight, scripts: document.scripts.length })).catch(() => null) });
      await page.screenshot({ path: path.join(output, `failure-${pages.length}.png`), timeout: 3000 }).catch(() => {});
    }
    await writeFile(path.join(output, "failure.json"), JSON.stringify({ error: String(error), upstreamCalls: calls, browserErrors: errors, diagnostics, pages }, null, 2));
  }
  throw error;
} finally {
  await cleanup();
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", terminate);
}
