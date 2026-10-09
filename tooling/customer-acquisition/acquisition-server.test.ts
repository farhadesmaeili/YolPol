import {request} from "node:http";
import {once} from "node:events";
import {describe, expect, it} from "vitest";
import {createAcquisitionHttpServer} from "./api";

describe("acquisition HTTP transport", () => {
  it("rejects unsupported request construction without crashing the process", async () => {
    const server = createAcquisitionHttpServer(async () => Response.json({status: "ok"}));
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test listener.");
    const send = (method: string, path = "/health/live") => new Promise<number>((resolve, reject) => {
      const call = request({host: "127.0.0.1", port: address.port, method, path}, (response) => {
        response.resume(); response.on("end", () => resolve(response.statusCode ?? 0));
      });
      call.on("error", reject); call.end();
    });
    try {
      expect(await send("TRACE")).toBe(400);
      expect(await send("GET", "http://untrusted.example/")).toBe(400);
      expect(await send("GET")).toBe(200);
    } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  });
});
