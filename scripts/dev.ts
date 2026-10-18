import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
process.env.VITE_STORYBRANCH_MODE = process.env.STORYBRANCH_MODE ?? "firebase";
if (process.env.STORYBRANCH_MODE === "emulator") {
  process.env.VITE_STORYBRANCH_MODE = "emulator";
  await import("./local-env");
}
import { createServer } from "node:http";
import { createServer as vite } from "vite";
const { handle } = await import("../services/api/handler");
const api = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const c of req) {
      bytes += c.length;
      if (
        bytes >
        (req.url?.startsWith("/api/studio")
          ? 250000
          : req.url?.startsWith("/api/pages")
            ? 30000
            : req.url?.startsWith("/api/copilot")
              ? 12000
              : 4096)
      ) {
        res.writeHead(400, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            error: {
              code: "VALIDATION_FAILED",
              message: "Request is too large.",
            },
          }),
        );
        return;
      }
      chunks.push(c);
    }
    const response = await handle(
      new Request(`http://127.0.0.1:3001${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        ...(["GET", "HEAD"].includes(req.method!)
          ? {}
          : { body: Buffer.concat(chunks) }),
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    // Pass streamed replies (Copilot) through as they arrive.
    const reader = response.body?.getReader();
    for (let part = await reader?.read(); part && !part.done; part = await reader!.read())
      res.write(part.value);
    res.end();
  } catch {
    res.writeHead(503).end("Local API unavailable");
  }
});
api.listen(3001, "127.0.0.1");
const web = await vite();
await web.listen();
web.printUrls();
