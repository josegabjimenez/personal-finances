import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// Real production routes, fake authentication and loopback-only synthetic data.
// Optional UX_* inputs select installed tooling/output; no application env is read.
const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.UX_PLAYWRIGHT_MODULE || "playwright");
const demo = { secret: "ux-pilot-synthetic-auth-secret-32-characters", token: "ux-pilot-synthetic-firefly-token" };
const work = await mkdtemp(path.join(tmpdir(), "personal-finances-ux-"));
const app = path.join(work, "app");
const output = process.env.UX_OUTPUT_DIR ? path.resolve(process.env.UX_OUTPUT_DIR) : null;
const children = [];
const calls = [];
const errors = [];
const diagnostics = [];
const scenarios = [];
let browser;
let upstreamFailure;
let retryArmed = false;
let retryFailed = false;

function split(id, type, amount, currency = "COP", keep = true, date = "2024-01-10") {
  return {
    type, amount: String(amount), currency_code: currency,
    description: `UX_${keep ? "KEEP" : "HIDDEN"}_${id}`,
    date: `${date}T12:00:00Z`, transaction_journal_id: `ux-journal-${id}`,
    source_id: type === "deposit" ? "synthetic-employer" : "synthetic-account",
    source_name: type === "deposit" ? "Synthetic employer" : "Synthetic account",
    destination_id: type === "withdrawal" ? "synthetic-shop" : "synthetic-account",
    destination_name: type === "withdrawal" ? "Synthetic shop" : "Synthetic account",
    category_id: keep ? "synthetic-category" : "hidden-category",
    category_name: keep ? "Synthetic category" : "Hidden category",
    tags: keep ? ["synthetic-tag"] : ["hidden-tag"],
  };
}
function group(id, splits) { return { type: "transactions", id, attributes: { transactions: splits } }; }
function initialGroups(date) {
  return [group("ux-mixed", [
    split("expense-cop", "withdrawal", 100, "COP", true, date),
    split("hidden", "withdrawal", 20, "COP", false, date),
    split("income-cop", "deposit", 500, "COP", true, date),
    split("transfer", "transfer", 900, "COP", true, date),
    split("expense-usd", "withdrawal", 10, "USD", true, date),
    split("income-usd", "deposit", 25, "USD", true, date),
  ])];
}
function nextGroups() {
  return [group("ux-appended", [
    split("appended", "withdrawal", 30),
    split("hidden-appended", "withdrawal", 99, "USD", false),
  ])];
}
const category = { type: "categories", id: "synthetic-category", attributes: { name: "Synthetic category" } };
const account = { type: "accounts", id: "synthetic-account", attributes: {
  name: "Synthetic account", type: "asset", currency_code: "COP", current_balance: "1234",
} };
const upstream = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method !== "GET" || req.headers.authorization !== `Bearer ${demo.token}`) {
    upstreamFailure = new Error("Unexpected method or non-synthetic upstream authorization");
    res.writeHead(500); res.end(); return;
  }
  const call = { path: url.pathname, ...Object.fromEntries(url.searchParams) };
  calls.push(call);
  let body = { data: [], meta: { pagination: { total_pages: 1 } } };
  if (url.pathname === "/api/v1/accounts") body.data = [account];
  else if (url.pathname === "/api/v1/accounts/synthetic-account") body = { data: account };
  else if (url.pathname === "/api/v1/categories") body.data = [category];
  else if (url.pathname === "/api/v1/categories/synthetic-category") body = { data: category };
  else if (url.pathname === "/api/v1/tags") body.data = [{ type: "tags", id: "synthetic-tag", attributes: { tag: "synthetic-tag" } }];
  else if (url.pathname === "/api/v1/insight/expense/category") {
    const historical = url.searchParams.get("start") === "2011-04-01";
    body = [{ id: category.id, name: category.attributes.name, currency_code: "COP", difference_float: historical ? -444 : -123 }];
  } else if (/^\/api\/v1\/(transactions|accounts\/synthetic-account\/transactions|categories\/synthetic-category\/transactions)$/.test(url.pathname)) {
    const page = Number(url.searchParams.get("page") || 1);
    const all = !url.searchParams.has("start") && !url.searchParams.has("end");
    if (retryArmed && all && url.pathname === "/api/v1/transactions" && page === 2 && !retryFailed) {
      retryFailed = true;
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Synthetic transient failure" })); return;
    }
    let groups = page === 1 ? initialGroups(url.searchParams.get("start") || "2024-01-10") : page === 2 ? nextGroups() : [];
    const type = url.searchParams.get("type");
    if (type) groups = groups.map((g) => ({ ...g, attributes: { transactions: g.attributes.transactions.filter((s) => s.type === type) } }));
    body = { data: groups, meta: { pagination: { total_pages: all || url.searchParams.get("start") === "2012-02-01" ? 3 : 1 } } };
  } else if (url.pathname === "/api/v1/transactions/ux-mixed") body = { data: initialGroups("2024-01-10")[0] };
  else if (url.pathname === "/api/v1/transactions/ux-appended") body = { data: nextGroups()[0] };
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
  const child = spawn(process.execPath, args, { cwd: app, env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
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
async function context(baseUrl, mobile = false) {
  const ctx = await browser.newContext({ serviceWorkers: "allow", viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  ctx.setDefaultTimeout(15_000);
  await ctx.route("**/*", (route) => new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort("blockedbyclient"));
  await ctx.addCookies([{ name: "pf_session", value: sessionToken(), url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
  // Make page visibility deterministic without replacing app fetches or adding a route.
  // This lets the production list show its partial summary before the next page.
  await ctx.addInitScript(() => {
    window.__uxObservers = [];
    window.IntersectionObserver = class {
      constructor(callback) { this.callback = callback; window.__uxObservers.push(this); }
      observe(target) { this.target = target; this.active = true; }
      disconnect() { this.active = false; }
      unobserve() { this.active = false; }
      takeRecords() { return []; }
    };
    window.__uxLoadMore = () => {
      const observer = window.__uxObservers.filter((o) => o.active && o.target?.closest("main") && o.target.classList.contains("py-6")).at(-1);
      if (!observer) throw new Error("Expected the active transaction pagination sentinel");
      observer.callback([{ isIntersecting: true, target: observer.target }]);
    };
  });
  const page = await ctx.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") diagnostics.push(message.text()); });
  return { ctx, page };
}
async function chooseMonth(page, month) {
  await page.getByRole("button", { name: /^Select month, currently / }).click();
  await page.getByRole("heading", { name: "Select month", exact: true }).waitFor();
  await page.getByLabel("Choose month", { exact: true }).fill(month);
  await page.getByRole("button", { name: "Go to month", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("start") === `${month}-01`);
  await page.getByRole("heading", { name: "Select month", exact: true }).waitFor({ state: "hidden" });
}
function assertQuery(page, expected, pathName) {
  const url = new URL(page.url());
  if (pathName) assert.equal(url.pathname, pathName);
  for (const [key, value] of Object.entries(expected)) assert.equal(url.searchParams.get(key), value, key);
}
function currentReturn(page) {
  const url = new URL(page.url());
  const params = new URLSearchParams();
  const keys = url.pathname === "/transactions"
    ? ["view", "start", "end", "q", "type", "account", "category", "tag"]
    : ["view", "start", "end", "month"];
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value) params.set(key, value);
  }
  return `${url.pathname}?${params}`;
}
async function openAndBack(page, description, expectedHref, expectRowOnReturn = true) {
  const row = page.locator('main a[href^="/transactions/"]').filter({ has: page.getByText(description, { exact: true }) });
  const href = await row.getAttribute("href");
  assert.equal(new URL(href, page.url()).searchParams.get("returnTo"), expectedHref);
  await row.click();
  const back = page.getByRole("link", { name: "Back", exact: true });
  await back.waitFor();
  assert.equal(await back.getAttribute("href"), expectedHref);
  await back.click();
  await page.waitForURL((url) => url.pathname + url.search === expectedHref);
  if (expectRowOnReturn) await page.getByText(description, { exact: true }).waitFor();
}
const money = (amount, currency) => new Intl.NumberFormat("es-CO", { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
async function assertSummary(page, { heading, count, totals, partial = false }) {
  const summary = page.getByTestId("transaction-summary");
  await summary.getByText(heading, { exact: true }).waitFor();
  await summary.getByText(`${count} transaction ${count === 1 ? "entry" : "entries"}`, { exact: true }).waitFor();
  await summary.getByText("Each displayed split counts once.", { exact: true }).waitFor();
  await summary.getByText(partial ? "Loaded matches only · More transactions to load" : "All matching transactions in this view", { exact: true }).waitFor();
  for (const [currency, amount] of Object.entries(totals)) await summary.getByText(money(amount, currency), { exact: true }).waitFor();
  return summary;
}
async function record(label, run) { await run(); scenarios.push(label); console.log(`PASS ${label}`); }

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
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  for (const file of new Set(files)) {
    if (file.split("/").some((part) => part.startsWith(".env")) || file.startsWith("docs/")) continue;
    const dest = path.join(app, file);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(path.join(root, file), dest);
  }
  await symlink(path.join(root, "node_modules"), path.join(app, "node_modules"), "dir");
  await mkdir(path.join(work, "home"));
  browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL, executablePath: process.env.UX_BROWSER_EXECUTABLE, headless: true,
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
  const port = await unusedPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const upstreamPort = await listen(upstream);
  const env = { PATH: process.env.PATH, HOME: path.join(work, "home"), TMPDIR: tmpdir(), NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1", NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontMock,
    FIREFLY_BASE_URL: `http://127.0.0.1:${upstreamPort}`, FIREFLY_TOKEN: demo.token,
    APP_PASSWORD: "ux-pilot-synthetic-password", AUTH_SECRET: demo.secret };
  await check("production-build", [path.join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"], env);
  const server = command([path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], env);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.child.exitCode !== null) throw new Error(server.logs());
    try {
      const response = await fetch(`${baseUrl}/api/firefly/transactions`, { signal: AbortSignal.timeout(500) });
      await response.arrayBuffer();
      if (response.status === 401) { ready = true; break; }
    } catch { /* loopback listener starting */ }
    await delay(100);
  }
  assert.ok(ready, "production app still enforces authentication");

  await record("arbitrary historical month preserves filters, journal identity, Back, and explicit All/current actions", async () => {
    const { ctx, page } = await context(baseUrl);
    const filters = { q: "UX_KEEP", type: "withdrawal", account: "Synthetic account", category: "Synthetic category", tag: "synthetic-tag" };
    await page.goto(`${baseUrl}/transactions?${new URLSearchParams(filters)}`);
    await chooseMonth(page, "2011-04");
    const period = { start: "2011-04-01", end: "2011-04-30" };
    assertQuery(page, { ...filters, ...period, view: null });
    assert.ok(calls.some((c) => c.path === "/api/v1/transactions" && c.start === period.start && c.end === period.end));
    await page.getByRole("button", { name: "Remove type filter: Expenses", exact: true }).waitFor();
    const origin = currentReturn(page);
    await openAndBack(page, "UX_KEEP_expense-usd", origin);
    await page.getByRole("link", { name: "All transactions", exact: true }).click();
    await page.waitForURL((u) => u.searchParams.get("view") === "all");
    assertQuery(page, { ...filters, start: null, end: null });
    await page.getByRole("link", { name: "This month", exact: true }).click();
    await page.waitForURL((u) => u.searchParams.has("start") && !u.searchParams.has("view"));
    const current = await page.evaluate(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`);
    assertQuery(page, { ...filters, start: current });
    await ctx.close();
  });

  await record("custom From/To dates remain exact across cross-month detail Back and filter removal", async () => {
    const { ctx, page } = await context(baseUrl);
    await page.goto(`${baseUrl}/transactions?view=all&q=UX_KEEP&type=withdrawal&account=Synthetic+account&category=Synthetic+category&tag=synthetic-tag`);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByLabel("From", { exact: true }).fill("2024-01-10");
    await page.getByLabel("To", { exact: true }).fill("2024-02-12");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await page.waitForURL((u) => u.searchParams.get("end") === "2024-02-12");
    await page.getByText("From 2024-01-10 to 2024-02-12", { exact: true }).waitFor();
    assertQuery(page, { start: "2024-01-10", end: "2024-02-12", view: null });
    const origin = currentReturn(page);
    await openAndBack(page, "UX_KEEP_expense-cop", origin);
    await page.getByRole("button", { name: "Remove category filter: Synthetic category", exact: true }).click();
    await page.waitForURL((u) => !u.searchParams.has("category"));
    assertQuery(page, { start: "2024-01-10", end: "2024-02-12", q: "UX_KEEP", type: "withdrawal", account: "Synthetic account", tag: "synthetic-tag" });
    await page.getByText("From 2024-01-10 to 2024-02-12", { exact: true }).waitFor();
    await ctx.close();
  });

  for (const entity of ["accounts/synthetic-account", "categories/synthetic-category"]) {
    await record(`${entity}: historical picker, exact custom range, All view, and transaction Back preserve context`, async () => {
      const { ctx, page } = await context(baseUrl);
      await page.goto(`${baseUrl}/${entity}`);
      await chooseMonth(page, "2011-04");
      assertQuery(page, { start: "2011-04-01", end: "2011-04-30" }, `/${entity}`);
      await openAndBack(page, "UX_KEEP_expense-cop", new URL(page.url()).pathname + new URL(page.url()).search);
      await page.goto(`${baseUrl}/${entity}?start=2024-01-10&end=2024-02-12`);
      await page.getByText("From 2024-01-10 to 2024-02-12", { exact: true }).waitFor();
      await openAndBack(page, "UX_KEEP_expense-cop", `/${entity}?start=2024-01-10&end=2024-02-12`);
      await page.getByRole("link", { name: "All transactions", exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("view") === "all");
      await openAndBack(page, "UX_KEEP_expense-usd", `/${entity}?view=all`);
      assert.ok(calls.some((c) => c.path === `/api/v1/${entity}/transactions` && c.start === "2011-04-01" && c.end === "2011-04-30"));
      await ctx.close();
    });
  }

  await record("category overview selected month drives data, visible labels, detail link, and Categories Back", async () => {
    const { ctx, page } = await context(baseUrl);
    await page.goto(`${baseUrl}/categories`);
    await chooseMonth(page, "2011-04");
    await page.getByText("Where your money went in April 2011.", { exact: true }).waitFor();
    await page.getByText(money(444, "COP"), { exact: true }).first().waitFor();
    const link = page.getByRole("link").filter({ has: page.getByText("Synthetic category", { exact: true }) });
    assert.equal(await link.getAttribute("href"), "/categories/synthetic-category?start=2011-04-01&end=2011-04-30");
    await link.click();
    await page.getByRole("heading", { name: "Synthetic category", exact: true }).waitFor();
    const back = page.locator("main").getByRole("link", { name: "Categories", exact: true });
    assert.equal(await back.getAttribute("href"), "/categories?start=2011-04-01&end=2011-04-30");
    await back.click();
    await page.getByText("Where your money went in April 2011.", { exact: true }).waitFor();
    assert.ok(calls.some((c) => c.path === "/api/v1/insight/expense/category" && c.start === "2011-04-01" && c.end === "2011-04-30"));
    await ctx.close();
  });

  await record("monthly totals distinguish net, income, expense, currencies, split matching, and transfer exclusion", async () => {
    const { ctx, page } = await context(baseUrl);
    const period = "start=2024-01-01&end=2024-01-31";
    await page.goto(`${baseUrl}/transactions?${period}`);
    const net = await assertSummary(page, { heading: "Net total", count: 6, totals: { COP: 380, USD: 15 } });
    await net.getByText("Income minus expenses. Transfers excluded.", { exact: true }).waitFor();
    await page.goto(`${baseUrl}/transactions?${period}&q=UX_KEEP&type=withdrawal&account=Synthetic+account&category=Synthetic+category&tag=synthetic-tag`);
    await assertSummary(page, { heading: "Expense total", count: 2, totals: { COP: -100, USD: -10 } });
    await page.goto(`${baseUrl}/transactions?${period}&type=deposit`);
    await assertSummary(page, { heading: "Income total", count: 2, totals: { COP: 500, USD: 25 } });
    await page.goto(`${baseUrl}/transactions?${period}&type=transfer`);
    const transfer = page.getByTestId("transaction-summary");
    await transfer.getByText("Transfers do not contribute to net totals.", { exact: true }).waitFor();
    assert.equal(await transfer.getByText(money(900, "COP"), { exact: true }).count(), 0);
    await page.goto(`${baseUrl}/transactions?${period}&q=UX_KEEP_transfer`);
    await page.getByTestId("transaction-summary").getByText("Transfers do not contribute to net totals.", { exact: true }).waitFor();
    assert.equal(await page.getByTestId("transaction-summary").getByText("Net total", { exact: true }).count(), 0);
    await page.goto(`${baseUrl}/transactions?view=all&q=UX_DOES_NOT_EXIST`);
    const empty = await assertSummary(page, { heading: "Net total", count: 0, totals: {}, partial: true });
    await empty.getByText("No income or expenses loaded.", { exact: true }).waitFor();
    await ctx.close();
  });

  await record("category month alias retains the same period through transaction Back", async () => {
    const { ctx, page } = await context(baseUrl);
    await page.goto(`${baseUrl}/categories/synthetic-category?month=2011-04`);
    await page.getByRole("button", { name: "Select month, currently April 2011", exact: true }).waitFor();
    await openAndBack(page, "UX_KEEP_expense-cop", "/categories/synthetic-category?month=2011-04");
    await ctx.close();
  });

  for (const route of ["transactions", "accounts/synthetic-account", "categories/synthetic-category"]) {
    await record(`${route}: multi-page historical range keeps date and page-size constraints while loading`, async () => {
      const { ctx, page } = await context(baseUrl);
      const first = calls.length;
      await page.goto(`${baseUrl}/${route}?start=2012-02-01&end=2012-02-29`);
      await page.getByTestId("transaction-summary").getByText("Loaded matches only · More transactions to load", { exact: true }).waitFor();
      await page.evaluate(() => window.__uxLoadMore());
      await page.getByText("UX_KEEP_appended", { exact: true }).waitFor();
      const second = calls.slice(first).find((c) => c.path === `/api/v1/${route}` + (route === "transactions" ? "" : "/transactions") && c.page === "2");
      assert.ok(second, "historical next page reached the synthetic upstream");
      assert.equal(second.limit, "500");
      assert.equal(second.start, "2012-02-01");
      assert.equal(second.end, "2012-02-29");
      await page.evaluate(() => window.__uxLoadMore());
      await page.getByTestId("transaction-summary").getByText("All matching transactions in this view", { exact: true }).waitFor();
      await ctx.close();
    });
  }

  await record("loaded filtered totals stay intact on failure, retry the same page, append once, and mark final scope", async () => {
    const { ctx, page } = await context(baseUrl);
    retryArmed = true;
    const first = calls.length;
    const query = "view=all&q=UX_KEEP&account=Synthetic+account&category=Synthetic+category&tag=synthetic-tag";
    await page.goto(`${baseUrl}/transactions?${query}`);
    await assertSummary(page, { heading: "Net total", count: 5, totals: { COP: 400, USD: 15 }, partial: true });
    await page.evaluate(() => window.__uxLoadMore());
    await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    await assertSummary(page, { heading: "Net total", count: 5, totals: { COP: 400, USD: 15 }, partial: true });
    assertQuery(page, { view: "all", q: "UX_KEEP", account: "Synthetic account", category: "Synthetic category", tag: "synthetic-tag" });
    await page.getByRole("button", { name: "Retry", exact: true }).evaluate((button) => { for (let i = 0; i < 5; i++) button.click(); });
    await page.getByText("UX_KEEP_appended", { exact: true }).waitFor();
    await assertSummary(page, { heading: "Net total", count: 6, totals: { COP: 370, USD: 15 }, partial: true });
    await page.evaluate(() => window.__uxLoadMore());
    await assertSummary(page, { heading: "Net total", count: 6, totals: { COP: 370, USD: 15 } });
    assert.deepEqual(calls.slice(first).filter((c) => c.path === "/api/v1/transactions" && Number(c.page) > 1).map((c) => Number(c.page)), [2, 2, 3]);
    await openAndBack(page, "UX_KEEP_appended", `/transactions?${query}`, false);
    retryArmed = false;
    await ctx.close();
  });

  await record("390px historical month picker and explicit All/current actions fit without horizontal overflow", async () => {
    const { ctx, page } = await context(baseUrl, true);
    await page.goto(`${baseUrl}/transactions`);
    await chooseMonth(page, "2011-04");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole("link", { name: "All transactions", exact: true }).click();
    await page.waitForURL((u) => u.searchParams.get("view") === "all");
    await page.getByRole("link", { name: "This month", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (output) await page.screenshot({ path: path.join(output, "mobile-all-transactions.png"), fullPage: false });
    await ctx.close();
  });

  assert.equal(upstreamFailure, undefined);
  assert.deepEqual(errors, [], "no uncaught browser errors");
  if (output) await writeFile(path.join(output, "observations.json"), JSON.stringify({ syntheticOnly: true, browserVersion: browser.version(), scenarios, upstreamCalls: calls, browserErrors: errors }, null, 2) + "\n");
  console.log(`Passed ${scenarios.length} synthetic UX scenarios against the production build.`);
} catch (error) {
  if (output) {
    const pages = [];
    for (const ctx of browser?.contexts() || []) for (const page of ctx.pages()) {
      pages.push({ url: page.url(), text: await page.locator("body").innerText().catch(() => "") });
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
