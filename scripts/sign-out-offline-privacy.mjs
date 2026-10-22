import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// Assessment, not a retention-policy test: fail on missing coverage/setup, record
// whether synthetic data survives. Never make production behavior pass by mocking it.
const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const playwrightModule = process.env.PRIVACY_PLAYWRIGHT_MODULE || "playwright";
const { chromium } = require(playwrightModule);
const playwrightVersion = require(path.join(path.dirname(require.resolve(playwrightModule)), "package.json")).version;
const demo = {
  password: "privacy-assessment-fake-password",
  secret: "privacy-assessment-fake-auth-secret-32-characters",
  token: "privacy-assessment-fake-firefly-token",
  account: "PRIVACY_DEMO_ACCOUNT",
  transaction: "PRIVACY_DEMO_TRANSACTION",
};
let work;
let output;
let app;
const children = new Set();
const contexts = new Set();
const pendingLaunches = new Set();
const upstreamCalls = [];
let upstreamFailure;
let interrupted = false;
let cleanupPromise;
let upstreamStartup;
let preparation;
const evidence = {
  sourceRevision: null,
  assessedAt: new Date().toISOString(),
  node: process.version,
  syntheticOnly: true,
  scenarios: [],
};

const groups = Array.from({ length: 51 }, (_, index) => ({
  type: "transactions", id: `privacy-demo-${index + 1}`,
  attributes: { transactions: [{
    type: "withdrawal", amount: "42.25", currency_code: "COP",
    description: `${demo.transaction}_${String(index + 1).padStart(2, "0")}`,
    date: "2026-01-10T12:00:00+00:00", transaction_journal_id: `demo-journal-${index + 1}`,
    source_name: demo.account, destination_name: "Synthetic shop",
  }] },
}));
const account = { type: "accounts", id: "privacy-demo-account", attributes: {
  name: demo.account, type: "asset", active: true,
  current_balance: "12345.67", currency_code: "COP",
} };
const upstream = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  upstreamCalls.push({ method: req.method, path: url.pathname, query: url.search });
  if (!["GET", "HEAD"].includes(req.method) || req.headers.authorization !== `Bearer ${demo.token}`) {
    upstreamFailure = new Error("Unexpected method or non-synthetic upstream authorization");
    res.writeHead(500); res.end("Synthetic fixture invariant failed"); return;
  }
  let body = { data: [], meta: { pagination: { total_pages: 1 } } };
  if (url.pathname === "/api/v1/accounts") {
    body.data = url.searchParams.get("type") === "liability" ? [] : [account];
  } else if (url.pathname.startsWith("/api/v1/accounts/")) {
    body = { data: account };
  } else if (url.pathname === "/api/v1/transactions") {
    const page = Number(url.searchParams.get("page") || 1);
    body = { data: page === 1 ? groups.slice(0, 50) : groups.slice(50), meta: { pagination: { total_pages: 2 } } };
  } else if (url.pathname === "/api/v1/summary/basic") body = {};
  res.writeHead(200, { "content-type": "application/json" });
  res.end(req.method === "HEAD" ? "" : JSON.stringify(body));
});

function ensureRunning() {
  if (interrupted) throw new Error("Assessment interrupted");
  if (upstreamFailure) throw upstreamFailure;
}
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}
async function unusedPort() {
  const server = createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function stopChild(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  const kill = (signal) => {
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  kill("SIGTERM");
  const controller = new AbortController();
  try {
    await Promise.race([exited, delay(5_000, undefined, { ref: false, signal: controller.signal })]);
    if (child.exitCode === null && child.signalCode === null) { kill("SIGKILL"); await exited; }
  } finally { controller.abort(); }
}
async function cleanup() {
  cleanupPromise ??= (async () => {
    await preparation?.catch(() => {});
    await upstreamStartup?.catch(() => {});
    await Promise.allSettled([...pendingLaunches]);
    const stopped = await Promise.allSettled([
      ...[...contexts].map((context) => context.close()),
      ...[...children].map(stopChild),
    ]);
    if (upstream.listening) {
      upstream.closeAllConnections();
      await new Promise((resolve) => upstream.close(resolve));
    }
    // Output survives cleanup; no app build, session, or browser profile is retained.
    if (work) {
      if (!output?.startsWith(`${work}${path.sep}`)) await rm(work, { recursive: true, force: true });
      else for (const name of ["app", "profiles", "home", "font-mock.cjs"]) {
        await rm(path.join(work, name), { recursive: true, force: true });
      }
    }
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
    const failures = stopped.filter((item) => item.status === "rejected").map((item) => item.reason);
    if (failures.length) throw new AggregateError(failures, "Privacy assessment cleanup failed");
  })();
  return cleanupPromise;
}
async function signalExit(code) {
  interrupted = true;
  try { await cleanup(); } finally { process.exit(code); }
}
const onInterrupt = () => { void signalExit(130); };
const onTerminate = () => { void signalExit(143); };
process.on("SIGINT", onInterrupt);
process.on("SIGTERM", onTerminate);

function childProcess(args, env, logName) {
  ensureRunning();
  const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), ...args], {
    cwd: app, env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  let logs = "";
  const capture = (data) => { logs += data.toString(); };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  child.on("error", (error) => { logs += `\n${error.message}`; });
  return { child, logs: () => logs, save: () => writeFile(path.join(output, logName), logs) };
}

async function prepareApp() {
  work = await mkdtemp(path.join(tmpdir(), "personal-finances-privacy-"));
  app = path.join(work, "app");
  output = path.resolve(process.env.PRIVACY_OUTPUT_DIR || path.join(work, "evidence"));
  assert.ok(output !== work && !output.startsWith(`${app}${path.sep}`));
  await mkdir(output, { recursive: true });
  evidence.sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  // Only tracked files; never read local .env files, .next, credentials, or git metadata.
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  for (const file of files) {
    ensureRunning();
    if (file.split("/").some((part) => part.startsWith(".env")) || file.startsWith("docs/")) continue;
    const target = path.join(app, file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(root, file), target);
  }
  await symlink(path.join(root, "node_modules"), path.join(app, "node_modules"), "dir");
  await mkdir(path.join(work, "home"), { recursive: true });
  // Next's own font test hook returns installed Geist files: no Google requests.
  const fonts = path.join(root, "node_modules/next/dist/next-devtools/server/font");
  const fontMock = path.join(work, "font-mock.cjs");
  await writeFile(fontMock, `module.exports = new Proxy({}, { get: (_, url) => {
    const mono = String(url).includes('Geist+Mono');
    return '@font-face { font-family: "' + (mono ? 'Geist Mono' : 'Geist') +
      '"; font-style: normal; font-weight: 100 900; src: url(' +
      ${JSON.stringify(fonts)} + '/' + (mono ? 'geist-mono-latin.woff2' : 'geist-latin.woff2') + ') format("woff2"); }';
  }});\n`);
  return fontMock;
}

async function launch(profile, offline = false) {
  ensureRunning();
  const pending = chromium.launchPersistentContext(profile, {
    channel: process.env.PRIVACY_BROWSER_CHANNEL || "chrome", headless: true,
    viewport: { width: 1280, height: 900 }, serviceWorkers: "allow", offline,
    env: { PATH: process.env.PATH, HOME: path.join(work, "home"), TMPDIR: tmpdir(), LANG: "en_US.UTF-8" },
    args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"],
  });
  pendingLaunches.add(pending);
  let context;
  try { context = await pending; contexts.add(context); }
  finally { pendingLaunches.delete(pending); }
  ensureRunning();
  evidence.browserVersion = context.browser()?.version();
  context.setDefaultTimeout(20_000);
  return context;
}
async function serviceWorkerState(page, required = false) {
  if (required) await page.waitForFunction(() => navigator.serviceWorker?.controller?.state === "activated");
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker?.getRegistration();
    return {
      controlled: !!navigator.serviceWorker.controller,
      controllerState: navigator.serviceWorker.controller?.state,
      activeState: registration?.active?.state,
      script: registration?.active ? new URL(registration.active.scriptURL).pathname : null,
    };
  }).catch((error) => ({ controlled: false, error: String(error).split("\n")[0] }));
}
async function inventory(page) {
  const worker = page.context().serviceWorkers()[0];
  const target = worker || page;
  return target.evaluate(async (markers) => {
    const result = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      const entries = [];
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        const type = response.headers.get("content-type") || "";
        const text = /json|text|javascript/.test(type) ? await response.text() : "";
        const hits = markers.filter((marker) => text.includes(marker));
        entries.push({ url: new URL(request.url).pathname + new URL(request.url).search,
          status: response.status, contentType: type, markers: hits });
      }
      result.push({ name, entryCount: entries.length, entries: entries.filter((entry) => entry.markers.length) });
    }
    return result;
  }, [demo.account, demo.transaction]).catch((error) => [{ error: String(error).split("\n")[0] }]);
}
async function snapshot(page, label) {
  const text = await page.locator("body").innerText();
  const url = new URL(page.url());
  const result = {
    label, url: ["http:", "https:"].includes(url.protocol) ? url.pathname + url.search : url.href,
    browserErrorVisible: text.includes("This site can’t be reached") || text.includes("This site can't be reached"),
    accountVisible: text.includes(demo.account),
    transactionVisible: text.includes(demo.transaction),
    page2TransactionVisible: text.includes(`${demo.transaction}_51`),
    signInVisible: await page.getByRole("button", { name: "Sign in", exact: true }).isVisible(),
    offlineFallbackVisible: text.includes("You're offline") || text.includes("You’re offline"),
    serviceWorker: await serviceWorkerState(page),
    caches: await inventory(page),
  };
  await page.screenshot({ path: path.join(output, `${label}.png`), fullPage: false });
  await writeFile(path.join(output, `${label}.json`), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}
async function goto(page, url) {
  try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }); }
  catch (error) {
    // An offline navigation failure is a valid finding; leave the existing page inspectable.
    if (!String(error).includes("net::ERR_")) throw error;
    return String(error).split("\n")[0];
  }
  await page.waitForTimeout(700);
  return null;
}
async function warm(context, baseUrl) {
  const page = context.pages()[0] || await context.newPage();
  await page.goto(`${baseUrl}/login?next=/accounts`);
  await page.getByLabel("Password").fill(demo.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByText(demo.account, { exact: true }).waitFor();
  assert.ok((await context.cookies()).some((cookie) => cookie.name === "pf_session"), "real production login must set a session");
  await serviceWorkerState(page, true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText(demo.account, { exact: true }).waitFor();
  await goto(page, `${baseUrl}/transactions?view=all`);
  await page.getByText(`${demo.transaction}_01`, { exact: true }).waitFor();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByText(`${demo.transaction}_51`, { exact: true }).waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByText(`${demo.transaction}_51`, { exact: true }).waitFor();
  // Explicitly warm one slow API as well; page 2 above uses the app's real browser API path.
  const api = await page.evaluate(async () => {
    const response = await fetch("/api/firefly/accounts?type=asset");
    return { status: response.status, text: await response.text() };
  });
  assert.equal(api.status, 200);
  assert.ok(api.text.includes(demo.account));
  await goto(page, `${baseUrl}/accounts`);
  await page.getByText(demo.account, { exact: true }).waitFor();
  await page.waitForTimeout(700);
  return page;
}
function expiredToken() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = `${encode({ alg: "HS256" })}.${encode({ v: 1, iat: now - 120, exp: now - 60 })}`;
  return `${payload}.${createHmac("sha256", demo.secret).update(payload).digest("base64url")}`;
}
async function scenario(kind, baseUrl) {
  console.log(`Checking ${kind}: authenticated warmup and active production service worker`);
  const profile = path.join(work, "profiles", kind);
  let context = await launch(profile);
  let page = await warm(context, baseUrl);
  const result = { kind, baseline: await snapshot(page, `${kind}-authenticated`), observations: [] };
  evidence.scenarios.push(result);
  assert.equal(result.baseline.accountVisible, true);
  assert.ok(result.baseline.caches.some((cache) => cache.entries.some((entry) => entry.markers.length)), "warmup must retain synthetic data in an observed cache");
  if (kind === "sign-out") {
    const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/auth/logout") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    await page.waitForURL("**/login");
    assert.ok(!(await context.cookies()).some((cookie) => cookie.name === "pf_session"), "logout must remove the session");
  } else if (kind === "expired-session") {
    const current = (await context.cookies()).find((cookie) => cookie.name === "pf_session");
    await context.addCookies([{ ...current, value: expiredToken(), expires: Math.floor(Date.now() / 1000) + 3600 }]);
  }
  // APIRequestContext bypasses the worker and never overwrites the browser document/API caches.
  const control = await context.request.get(`${baseUrl}/api/firefly/accounts?privacy-online-control=1`);
  result.onlineNetworkAuthStatus = control.status();
  assert.equal(control.status(), kind === "valid-session-control" ? 200 : 401, "real server must distinguish valid and lost sessions");
  const documentControl = await context.request.get(`${baseUrl}/accounts`, { maxRedirects: 0 });
  result.onlineNetworkDocumentStatus = documentControl.status();
  result.onlineNetworkDocumentLocation = documentControl.headers().location || null;
  assert.equal(documentControl.status(), kind === "valid-session-control" ? 200 : 307);
  result.upstreamCallsBeforeOffline = upstreamCalls.length;
  await context.setOffline(true);
  result.offlineProbe = await page.evaluate(async (kind) => {
    try {
      const r = await fetch(`/api/firefly/accounts?privacy-offline-probe=${kind}`, { signal: AbortSignal.timeout(3_000) });
      return { status: r.status, containsSyntheticMarker: (await r.text()).includes("PRIVACY_DEMO_ACCOUNT") };
    } catch (error) { return { error: String(error) }; }
  }, kind);
  assert.ok(result.offlineProbe.error, "the unique uncached browser API probe must fail offline, rather than return an online authentication response");
  assert.equal(result.offlineProbe.containsSyntheticMarker || false, false, "a unique uncached offline API probe must not retrieve financial data");
  result.cachedApiWhileOffline = await page.evaluate(async () => {
    try {
      const r = await fetch("/api/firefly/accounts?type=asset", { signal: AbortSignal.timeout(3_000) });
      return { status: r.status, containsSyntheticMarker: (await r.text()).includes("PRIVACY_DEMO_ACCOUNT") };
    } catch (error) { return { error: String(error) }; }
  });
  result.observations.push(await snapshot(page, `${kind}-offline-existing-page`));
  for (const route of ["/accounts", "/transactions?view=all"]) {
    const navigationError = await goto(page, `${baseUrl}${route}`);
    if (route.startsWith("/transactions")) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1_000);
    }
    const step = await snapshot(page, `${kind}-offline-${route.startsWith("/accounts") ? "accounts" : "transactions"}`);
    step.navigationError = navigationError;
    result.observations.push(step);
  }
  const newPage = await context.newPage();
  const newPageError = await goto(newPage, `${baseUrl}/accounts`);
  const fresh = await snapshot(newPage, `${kind}-offline-new-tab`);
  fresh.navigationError = newPageError;
  result.observations.push(fresh);
  await context.close(); contexts.delete(context);
  context = await launch(profile, true);
  page = context.pages()[0] || await context.newPage();
  const reopenError = await goto(page, `${baseUrl}/accounts`);
  const reopened = await snapshot(page, `${kind}-offline-browser-reopened`);
  reopened.navigationError = reopenError;
  result.observations.push(reopened);
  result.upstreamCallsAfterOffline = upstreamCalls.length;
  assert.equal(result.upstreamCallsAfterOffline, result.upstreamCallsBeforeOffline, "offline phase must make no upstream requests, including worker requests");
  await context.close(); contexts.delete(context);
  await writeFile(path.join(output, "privacy-observations.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`${kind}: online server auth ${control.status()}; offline account visible=${reopened.accountVisible}; stored caches=${reopened.caches.length}`);
}

try {
  preparation = prepareApp();
  const fontMock = await preparation;
  ensureRunning();
  upstreamStartup = listen(upstream);
  const upstreamPort = await upstreamStartup;
  ensureRunning();
  const port = await unusedPort();
  const baseUrl = `http://localhost:${port}`;
  const env = {
    PATH: process.env.PATH, HOME: path.join(work, "home"), TMPDIR: tmpdir(),
    NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontMock,
    FIREFLY_BASE_URL: `http://127.0.0.1:${upstreamPort}`, FIREFLY_TOKEN: demo.token,
    APP_PASSWORD: demo.password, AUTH_SECRET: demo.secret,
  };
  console.log("Building isolated tracked source (no env files, synthetic settings, local fonts)");
  const build = childProcess(["build", "--webpack"], env, "build.log");
  const [code] = await once(build.child, "exit");
  await build.save();
  assert.equal(code, 0, `production build failed; see ${path.join(output, "build.log")}`);
  ensureRunning();
  assert.ok((await readFile(path.join(app, "public/sw.js"), "utf8")).includes("apis"), "production worker must be generated");
  const server = childProcess(["start", "--hostname", "127.0.0.1", "--port", String(port)], env, "server.log");
  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      ensureRunning();
      if (server.child.exitCode !== null) throw new Error(server.logs());
      try {
        const response = await fetch(`${baseUrl}/api/firefly/accounts`, { signal: AbortSignal.timeout(500) });
        await response.arrayBuffer();
        if (response.status === 401) { ready = true; break; }
      } catch { /* wait for the local production listener */ }
      await delay(150);
    }
    assert.ok(ready, "production server must reject unauthenticated API reads before browser checks");
    evidence.browser = `Playwright ${playwrightVersion}; installed ${process.env.PRIVACY_BROWSER_CHANNEL || "chrome"}`;
    await scenario("valid-session-control", baseUrl);
    await scenario("sign-out", baseUrl);
    await scenario("expired-session", baseUrl);
    ensureRunning();
    evidence.upstreamCalls = upstreamCalls;
    assert.ok(upstreamCalls.some((call) => call.path === "/api/v1/transactions" && new URLSearchParams(call.query).get("page") === "2"));
    await writeFile(path.join(output, "privacy-observations.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`Assessment complete. Synthetic evidence: ${output}`);
  } finally { await server.save(); }
} catch (error) {
  if (!interrupted) {
    if (output) await writeFile(path.join(output, "privacy-observations.json"), `${JSON.stringify({ ...evidence, failure: String(error) }, null, 2)}\n`).catch(() => {});
    console.error(error); console.error(`Evidence/logs: ${output}`); process.exitCode = 1;
  }
} finally { await cleanup(); }
