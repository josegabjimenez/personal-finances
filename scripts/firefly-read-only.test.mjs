import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import vm from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const synthetic = {
  token: "synthetic-firefly-token-only",
  password: "synthetic-test-password-only",
  secret: "synthetic-test-auth-secret-at-least-32-characters",
};
const upstreamCalls = [];
const fixture = { data: [{ id: "demo-account", attributes: { name: "Synthetic account" } }] };
const upstream = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  upstreamCalls.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body });
  const limited = new URL(req.url, "http://127.0.0.1").pathname === "/api/v1/categories";
  res.writeHead(limited ? 429 : 200, {
    "content-type": limited ? "application/problem+json" : "application/json",
  });
  res.end(JSON.stringify(limited ? { error: "Synthetic rate limit" } : fixture));
});

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

async function stopNext(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  const kill = (signal) => {
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  kill("SIGTERM");
  const timeout = new AbortController();
  try {
    await Promise.race([exited, delay(5_000, undefined, { ref: false, signal: timeout.signal })]);
    if (child.exitCode === null && child.signalCode === null) {
      kill("SIGKILL");
      await exited;
    }
  } finally {
    timeout.abort();
  }
}

async function waitForNext(child, baseUrl, logs) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next exited before the API was ready.\n${logs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/firefly/accounts`, {
        signal: AbortSignal.timeout(1_000),
      });
      await response.arrayBuffer();
      if (response.status === 401) return;
    } catch {
      // Startup and the first middleware compilation may take a moment.
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for the local API.\n${logs()}`);
}

async function checkHttp(baseUrl) {
  const request = (path, init = {}) => fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  for (const cookie of [undefined, "pf_session=invalid-synthetic-session"]) {
    const response = await request("/api/firefly/accounts", {
      headers: cookie ? { cookie } : {},
    });
    assert.equal(response.status, 401, "missing/invalid sessions must be rejected");
    await response.arrayBuffer();
    assert.equal(upstreamCalls.length, 0, "authentication rejection must precede upstream access");
  }

  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: synthetic.password }),
  });
  assert.equal(login.status, 200, "the separate login POST must remain functional");
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("pf_session="), "login must issue a real signed test session");
  await login.arrayBuffer();
  const headers = { cookie };

  const read = await request("/api/firefly/accounts/demo-account/transactions?page=2&limit=5&q=synthetic%20query", { headers });
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("content-type"), "application/json");
  assert.equal(read.headers.get("cache-control"), "private, max-age=0");
  assert.deepEqual(await read.json(), fixture, "GET must preserve the upstream response body");
  assert.equal(upstreamCalls.length, 1);
  const call = upstreamCalls.at(-1);
  const calledUrl = new URL(call.url, "http://127.0.0.1");
  assert.equal(calledUrl.pathname, "/api/v1/accounts/demo-account/transactions");
  assert.deepEqual(Object.fromEntries(calledUrl.searchParams), { page: "2", limit: "5", q: "synthetic query" });
  assert.equal(call.method, "GET");
  assert.equal(call.authorization, `Bearer ${synthetic.token}`);
  assert.equal(call.body, "");

  const limited = await request("/api/firefly/categories", { headers });
  assert.equal(limited.status, 429, "upstream error status must remain intact");
  assert.equal(limited.headers.get("content-type"), "application/problem+json");
  assert.deepEqual(await limited.json(), { error: "Synthetic rate limit" });

  const head = await request("/api/firefly/accounts", { method: "HEAD", headers });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal(upstreamCalls.at(-1).method, "HEAD", "Next's automatic HEAD fallback must stay read-only");

  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const before = upstreamCalls.length;
    const denied = await request("/api/firefly/accounts", {
      method,
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: "Synthetic rejected write" }),
    });
    assert.equal(denied.status, 405, `${method} must be rejected at the HTTP boundary`);
    await denied.arrayBuffer();
    assert.equal(upstreamCalls.length, before, `${method} must not reach Firefly`);
  }

  const beforeOptions = upstreamCalls.length;
  const options = await request("/api/firefly/accounts", { method: "OPTIONS", headers });
  assert.equal(options.status, 204);
  assert.deepEqual(options.headers.get("allow")?.split(/,\s*/).sort(), ["GET", "HEAD", "OPTIONS"]);
  await options.arrayBuffer();
  assert.equal(upstreamCalls.length, beforeOptions, "OPTIONS must not be forwarded");

  for (const path of ["/api/firefly/users", "/api/firefly/accounts-evil"]) {
    const before = upstreamCalls.length;
    const denied = await request(path, { headers });
    assert.equal(denied.status, 404, "paths outside the existing allowlist must stay blocked");
    await denied.arrayBuffer();
    assert.equal(upstreamCalls.length, before);
  }

  const beforeLogout = upstreamCalls.length;
  const logout = await request("/api/auth/logout", { method: "POST", headers });
  assert.equal(logout.status, 200, "the separate logout POST must remain functional");
  assert.match(logout.headers.get("set-cookie") ?? "", /pf_session=;.*Max-Age=0/i);
  await logout.arrayBuffer();
  assert.equal(upstreamCalls.length, beforeLogout);
  assert.ok(upstreamCalls.every((entry) => ["GET", "HEAD"].includes(entry.method)));
  console.log("HTTP boundary: real sessions, GET/HEAD, local OPTIONS, denied writes/paths, and auth POST routes verified");
}

async function checkSharedClient() {
  const source = await readFile(new URL("../lib/firefly/client.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const env = {};
  const calls = [];
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: compiledModule,
    exports: compiledModule.exports,
    require: (name) => {
      assert.equal(name, "server-only", "client test should not silently mock another dependency");
      return {};
    },
    process: { env },
    URL,
    URLSearchParams,
    TextEncoder,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ synthetic: true }), {
        headers: { "content-type": "application/json" },
      });
    },
  }, { filename: "lib/firefly/client.ts" });
  const { fireflyFetch, fireflyProxy, FireflyReadOnlyError } = compiledModule.exports;
  assert.equal(typeof FireflyReadOnlyError, "function");
  const reject = async (operation, label) => {
    await assert.rejects(operation, (error) => error instanceof FireflyReadOnlyError, label);
    assert.equal(calls.length, 0, `${label}: denial must happen before fetch`);
  };
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    await reject(() => fireflyFetch("/accounts", { method }), `shared fetch rejects ${method} before missing-config checks`);
    await reject(() => fireflyProxy("accounts", { method, search: new URLSearchParams() }), `proxy rejects ${method} before missing-config checks`);
  }
  for (const body of ["", "{}", false, 0, {}]) {
    await reject(() => fireflyFetch("/accounts", { body }), "shared fetch rejects a supplied body");
    await reject(() => fireflyProxy("accounts", { method: "GET", search: new URLSearchParams(), body }), "proxy rejects a supplied body");
  }

  env.FIREFLY_BASE_URL = "http://127.0.0.1:1";
  env.FIREFLY_TOKEN = synthetic.token;
  assert.deepEqual(await fireflyFetch("/accounts", {
    searchParams: { page: 2, query: "synthetic query" },
    revalidate: false,
  }), { synthetic: true });
  assert.equal(calls.at(-1).url, "http://127.0.0.1:1/api/v1/accounts?page=2&query=synthetic+query");
  assert.equal(calls.at(-1).init.method, "GET");
  assert.equal(calls.at(-1).init.body, undefined);
  await fireflyProxy("accounts", { method: "HEAD", search: new URLSearchParams("page=2") });
  assert.equal(calls.at(-1).init.method, "HEAD");
  assert.equal(calls.at(-1).init.body, undefined);
  console.log("Shared client: unsafe verbs and supplied bodies rejected before configuration/network; safe reads preserved");
}

let next;
let logs = "";
let upstreamStartup;
let cleanupPromise;
let stopping = false;
let interrupted = false;

function ensureRunning() {
  if (stopping) throw new Error("Test interrupted during startup.");
}

function cleanup() {
  stopping = true;
  cleanupPromise ??= (async () => {
    // A signal can arrive while listen() is pending. Wait for it to settle so
    // the callback cannot open the fake server after cleanup has finished.
    await upstreamStartup?.catch(() => {});
    try {
      await stopNext(next);
    } finally {
      if (upstream.listening) {
        upstream.closeAllConnections();
        await new Promise((resolve) => upstream.close(resolve));
      }
      process.removeListener("SIGINT", onInterrupt);
      process.removeListener("SIGTERM", onTerminate);
    }
  })();
  return cleanupPromise;
}

async function handleSignal(exitCode) {
  if (interrupted) return;
  interrupted = true;
  process.exitCode = exitCode;
  try {
    await cleanup();
  } catch (error) {
    console.error("Failed to clean up interrupted test:", error);
  } finally {
    process.exit(exitCode);
  }
}

const onInterrupt = () => { void handleSignal(130); };
const onTerminate = () => { void handleSignal(143); };
process.on("SIGINT", onInterrupt);
process.on("SIGTERM", onTerminate);

try {
  upstreamStartup = listen(upstream);
  const upstreamPort = await upstreamStartup;
  ensureRunning();
  const appPort = await unusedPort();
  ensureRunning();
  const baseUrl = `http://127.0.0.1:${appPort}`;
  next = spawn(process.execPath, [
    fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)),
    "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(appPort),
  ], {
    cwd: root,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      FIREFLY_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      FIREFLY_TOKEN: synthetic.token,
      APP_PASSWORD: synthetic.password,
      AUTH_SECRET: synthetic.secret,
    },
  });
  next.on("error", (error) => { logs += `\n${error.message}`; });
  const capture = (chunk) => { logs = (logs + chunk.toString()).slice(-20_000); };
  next.stdout.on("data", capture);
  next.stderr.on("data", capture);
  await waitForNext(next, baseUrl, () => logs);
  ensureRunning();
  await checkHttp(baseUrl);
  await checkSharedClient();
  console.log("Firefly read-only regression passed using synthetic data and loopback servers only");
} catch (error) {
  if (!interrupted) {
    console.error(error);
    process.exitCode = 1;
  }
} finally {
  await cleanup();
}
