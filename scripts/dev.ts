import "./local-env";
import { createServer } from "node:http";
import { createServer as vite } from "vite";
import { handle } from "../services/api/handler";
const api = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const c of req) {
      bytes += c.length;
      if (bytes > 4096) {
        res.writeHead(413).end();
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
    res.end(await response.text());
  } catch {
    res.writeHead(503).end("Local API unavailable");
  }
});
api.listen(3001, "127.0.0.1");
const web = await vite();
await web.listen();
web.printUrls();
