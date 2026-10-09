import {createServer} from "node:http";
import {Readable} from "node:stream";
import {createCustomerAcquisitionService} from "../../src/composition/customer-acquisition/customer-acquisition-service";

export function createAcquisitionHttpServer(handle: (request: Request) => Promise<Response>) {
  const server = createServer({maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 5000, keepAliveTimeout: 2000}, (incoming, outgoing) => {
    const timeout = setTimeout(() => { outgoing.writeHead(408).end(); incoming.destroy(); }, 10000);
    void Promise.resolve().then(async () => {
      if (!incoming.url?.startsWith("/") || incoming.url.startsWith("//") || !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(incoming.method ?? "")) {
        outgoing.writeHead(400).end(); return;
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(",") : value);
      const init: RequestInit & {duplex?: "half"} = {method: incoming.method, headers};
      if (incoming.method !== "GET" && incoming.method !== "HEAD") { init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>; init.duplex = "half"; }
      const response = await handle(new Request(`http://customer-acquisition-api:8080${incoming.url}`, init));
      if (outgoing.writableEnded) return;
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    }).catch(() => { if (!outgoing.writableEnded) outgoing.writeHead(503).end(); }).finally(() => clearTimeout(timeout));
  });
  server.maxConnections = 32;
  return server;
}

export function startAcquisitionApi() {
  const runtime = createCustomerAcquisitionService();
  const server = createAcquisitionHttpServer(runtime.handle);
  server.listen(8080, "0.0.0.0");
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => { void runtime.close().catch(() => { process.exitCode = 1; }); });
    setTimeout(() => server.closeAllConnections(), 11000).unref();
  };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  return server;
}

if (require.main === module) {
  try { startAcquisitionApi(); }
  catch { console.error('{"event":"acquisition.startup_failed"}'); process.exitCode = 1; }
}
