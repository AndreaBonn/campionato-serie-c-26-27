import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../../docs/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://andreabonn.github.io";
const PAGE = `${ORIGIN}/campionato-serie-c-26-27/data.json`;

// The browser around the worker: Cache Storage held in a Map, the network as a function.
function loadWorker({ network = () => Promise.resolve(new Response("live")), stored = {} } = {}) {
  const handlers = {};
  const storage = new Map(Object.entries(stored).map(([name, entries]) => [name, new Map(entries)]));
  const calls = { fetch: [], skipWaiting: 0, claimed: 0 };
  const cacheFor = (name) => {
    if (!storage.has(name)) storage.set(name, new Map());
    const entries = storage.get(name);
    return {
      put: async (request, response) => entries.set(request.url, response),
      addAll: async (requests) => requests.forEach((r) => entries.set(r.url, new Response("shell"))),
    };
  };
  const worker = {
    location: new URL(PAGE),
    // relative URLs resolve against the worker's address, as in the browser
    Request: class extends Request {
      constructor(input, init) {
        super(typeof input === "string" ? new URL(input, PAGE).href : input, init);
      }
    },
    Response,
    URL,
    Promise,
    addEventListener: (type, handler) => (handlers[type] = handler),
    skipWaiting: () => calls.skipWaiting++,
    clients: { claim: async () => calls.claimed++ },
    fetch: (request, init) => {
      calls.fetch.push({ url: request.url, init });
      return network(request);
    },
    caches: {
      open: async (name) => cacheFor(name),
      keys: async () => [...storage.keys()],
      delete: async (name) => storage.delete(name),
      match: async (request) => {
        for (const entries of storage.values()) {
          if (entries.has(request.url)) return entries.get(request.url);
        }
        return undefined;
      },
    },
  };
  worker.self = worker;
  vm.runInNewContext(SOURCE, worker);
  return { handlers, storage, calls };
}

// Dispatch one fetch event; `answer` is undefined when the worker lets the browser handle it.
async function dispatchFetch(handlers, request) {
  const pending = [];
  let answer;
  handlers.fetch({
    request,
    respondWith: (promise) => (answer = promise),
    waitUntil: (promise) => pending.push(promise),
  });
  const response = answer && (await answer);
  await Promise.all(pending);
  return response;
}

async function dispatchLifecycle(handler, data) {
  let done;
  handler({ data, waitUntil: (promise) => (done = promise) });
  await done;
}

const offline = () => Promise.reject(new TypeError("Failed to fetch"));

test("online: the network answer is served, revalidated, and cached for offline use", async () => {
  const { handlers, storage, calls } = loadWorker();

  const response = await dispatchFetch(handlers, new Request(PAGE));

  assert.equal(await response.text(), "live");
  assert.equal(calls.fetch[0].init.cache, "no-cache");
  assert.ok(storage.get("cus-basket-dev").has(PAGE));
});

test("online with a stale copy in cache: the network answer wins", async () => {
  const { handlers } = loadWorker({ stored: { "cus-basket-dev": [[PAGE, new Response("stale")]] } });

  const response = await dispatchFetch(handlers, new Request(PAGE));

  assert.equal(await response.text(), "live");
});

test("offline: the cached copy is served", async () => {
  const { handlers } = loadWorker({
    network: offline,
    stored: { "cus-basket-dev": [[PAGE, new Response("cached")]] },
  });

  const response = await dispatchFetch(handlers, new Request(PAGE));

  assert.equal(await response.text(), "cached");
});

test("offline and never cached: a network error, not an empty success", async () => {
  const { handlers } = loadWorker({ network: offline });

  const response = await dispatchFetch(handlers, new Request(PAGE));

  assert.equal(response.type, "error");
});

test("an error answer is passed on but not cached over the last good copy", async () => {
  const { handlers, storage } = loadWorker({
    network: () => Promise.resolve(new Response("down", { status: 503 })),
  });

  const response = await dispatchFetch(handlers, new Request(PAGE));

  assert.equal(response.status, 503);
  assert.equal(storage.get("cus-basket-dev")?.has(PAGE) ?? false, false);
});

test("cross-origin and non-GET requests are left to the browser", async () => {
  const { handlers, calls } = loadWorker();
  const crossOrigin = new Request("https://fip.it/risultati/");
  const post = new Request(PAGE, { method: "POST", body: "x" });

  assert.equal(await dispatchFetch(handlers, crossOrigin), undefined);
  assert.equal(await dispatchFetch(handlers, post), undefined);
  assert.equal(calls.fetch.length, 0);
});

test("install caches the app shell and waits for the user before taking over", async () => {
  const { handlers, storage, calls } = loadWorker();

  await dispatchLifecycle(handlers.install);

  assert.ok(storage.get("cus-basket-dev").has(new URL("index.html", PAGE).href));
  assert.equal(calls.skipWaiting, 0);
});

test("the page's SKIP_WAITING message activates the waiting version, other messages do not", () => {
  const { handlers, calls } = loadWorker();

  handlers.message({ data: { type: "PING" } });
  handlers.message({ data: null });
  assert.equal(calls.skipWaiting, 0);

  handlers.message({ data: { type: "SKIP_WAITING" } });
  assert.equal(calls.skipWaiting, 1);
});

test("activate drops the caches of previous versions and claims open pages", async () => {
  const { handlers, storage, calls } = loadWorker({
    stored: { "cus-basket-old": [], "cus-basket-dev": [] },
  });

  await dispatchLifecycle(handlers.activate);

  assert.deepEqual([...storage.keys()], ["cus-basket-dev"]);
  assert.equal(calls.claimed, 1);
});
