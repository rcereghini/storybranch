import { readFile, writeFile } from "node:fs/promises";
import { launchBrowser } from "./browser";
// Original, silent fixture animation. No remote assets or generation service.
const browser = await launchBrowser();
const tab = await browser.newPage();
await tab.evaluate("globalThis.__name = (fn) => fn");
const svg = await readFile("apps/web/public/media/harbor.svg", "utf8");
const bytes = await tab.evaluate(async (svg) => {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext("2d")!;
  const img = new Image();
  img.src = "data:image/svg+xml;base64," + btoa(svg);
  await img.decode();
  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp8",
    videoBitsPerSecond: 500000,
  });
  const chunks: Blob[] = [];
  const done = new Promise<Blob>((resolve) => {
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => resolve(new Blob(chunks));
  });
  recorder.start();
  const begin = performance.now();
  await new Promise<void>((resolve) => {
    function frame() {
      const t = (performance.now() - begin) / 1000;
      ctx.drawImage(img, 0, 0, 960, 540);
      ctx.fillStyle = `rgba(205,235,217,${0.03 + 0.02 * Math.sin(t)})`;
      ctx.fillRect(0, 0, 960, 540);
      ctx.strokeStyle = "rgba(160,209,192,.20)";
      for (let y = 380; y < 520; y += 22) {
        ctx.beginPath();
        ctx.moveTo(590 + Math.sin(t + y) * 15, y);
        ctx.lineTo(760 + Math.sin(t + y) * 15, y);
        ctx.stroke();
      }
      if (t < 6) requestAnimationFrame(frame);
      else resolve();
    }
    frame();
  });
  recorder.stop();
  return Array.from(new Uint8Array(await (await done).arrayBuffer()));
}, svg);
await writeFile("apps/web/public/media/harbor.webm", Buffer.from(bytes));
await browser.close();
console.log(`Generated harbor.webm (${bytes.length} bytes)`);
