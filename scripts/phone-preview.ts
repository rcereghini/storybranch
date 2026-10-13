import "./local-env";
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { handle } from "../services/api/handler";
if (process.env.STORYBRANCH_PHONE_PREVIEW !== "1")
  throw new Error("Phone preview must use isolated emulators");
const root = resolve("dist-phone");
await stat(resolve(root, "index.html"));
const key = randomBytes(32).toString("hex");
const expires = Date.now() + 8 * 60 * 60 * 1000;
const allowedAuth = new Set([
  "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword",
  "/identitytoolkit.googleapis.com/v1/accounts:lookup",
  "/securetoken.googleapis.com/v1/token",
]);
const equal = (candidate: string) =>
  candidate.length === key.length &&
  timingSafeEqual(Buffer.from(candidate), Buffer.from(key));
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".vtt": "text/vtt",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:4173");
    if (Date.now() > expires) {
      res.writeHead(410).end("Preview expired. Restart the preview server.");
      return;
    }
    if (
      url.pathname === "/preview-access" &&
      equal(url.searchParams.get("key") ?? "")
    ) {
      const secure =
        req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
      res.setHeader(
        "Set-Cookie",
        `sb_preview=${key}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`,
      );
      res.writeHead(303, { Location: "/" }).end();
      return;
    }
    const cookie =
      (req.headers.cookie ?? "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("sb_preview="))
        ?.slice(11) ?? "";
    if (!equal(cookie)) {
      res
        .writeHead(403)
        .end(
          "Private phone preview. Open the access link supplied for this test.",
        );
      return;
    }
    if (req.method === "POST" || req.method === "GET") {
      if (
        (allowedAuth.has(url.pathname) && req.method === "POST") ||
        url.pathname.startsWith("/api/")
      ) {
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 16384) {
            res.writeHead(413).end();
            return;
          }
          chunks.push(chunk);
        }
        const body = req.method === "POST" ? Buffer.concat(chunks) : undefined;
        const headers = {
          "content-type": req.headers["content-type"] ?? "application/json",
          ...(req.headers.authorization
            ? { authorization: req.headers.authorization }
            : {}),
        };
        const response = allowedAuth.has(url.pathname)
          ? await fetch(`http://127.0.0.1:9199${url.pathname}${url.search}`, {
              method: "POST",
              headers,
              body,
            })
          : await handle(
              new Request(url, { method: req.method, headers, body }),
            );
        res.writeHead(response.status, {
          "Content-Type":
            response.headers.get("content-type") ?? "application/json",
        });
        res.end(await response.text());
        return;
      }
    }
    if (!["GET", "HEAD"].includes(req.method ?? "")) {
      res.writeHead(405).end();
      return;
    }
    const path = decodeURIComponent(url.pathname);
    const spa =
      path === "/" ||
      path === "/adventures" ||
      /^\/(play|s|u)\/[a-zA-Z0-9/_-]+$/.test(path);
    if (!spa && !/^\/(assets|media)\/[a-zA-Z0-9_.-]+$/.test(path)) {
      res.writeHead(404).end();
      return;
    }
    const file = resolve(root, spa ? "index.html" : `.${path}`);
    if (!file.startsWith(root + sep)) {
      res.writeHead(404).end();
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      types[extname(file)] ?? "application/octet-stream",
    );
    res.setHeader("Accept-Ranges", "bytes");
    let start = 0,
      end = info.size - 1;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) {
        res.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end();
        return;
      }
      start = match[1]
        ? Number(match[1])
        : Math.max(0, info.size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
      if (start > end || start >= info.size) {
        res.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end();
        return;
      }
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${info.size}`);
    }
    res.setHeader("Content-Length", end - start + 1);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(file, { start, end })
      .on("error", () => res.destroy())
      .pipe(res);
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end();
  }
});
await writeFile(
  ".phone-preview.json",
  JSON.stringify({ key, expires, pid: process.pid }, null, 2),
);
server.listen(4173, "127.0.0.1", () =>
  console.log(
    "Phone gateway ready on loopback 4173. Access key stored in ignored .phone-preview.json. Expires in 8 hours.",
  ),
);
