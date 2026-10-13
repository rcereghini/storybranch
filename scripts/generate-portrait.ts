import { readFile, writeFile } from "node:fs/promises";
import { launchBrowser } from "./browser";
// New delivery rendition IDs: never overwrite the published landscape source.
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  await page.evaluate("globalThis.__name = (fn) => fn");
  const svg = await readFile(
    "apps/web/public/media/harbor-portrait-v1.svg",
    "utf8",
  );
  for (const social of [false, true]) {
    const bytes = await page.evaluate(
      async ({ svg, social }) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1920;
        const ctx = canvas.getContext("2d")!;
        const img = new Image();
        img.src = "data:image/svg+xml;base64," + btoa(svg);
        await img.decode();
        const type = "video/mp4;codecs=avc1.42001f";
        if (!MediaRecorder.isTypeSupported(type))
          throw new Error("This browser cannot create H.264 MP4.");
        const stream = canvas.captureStream(24);
        const recorder = new MediaRecorder(stream, {
          mimeType: type,
          videoBitsPerSecond: 2500000,
        });
        const chunks: Blob[] = [];
        const done = new Promise<Blob>((resolve) => {
          recorder.ondataavailable = (e) => chunks.push(e.data);
          recorder.onstop = () =>
            resolve(new Blob(chunks, { type: "video/mp4" }));
        });
        recorder.start();
        const begin = performance.now();
        await new Promise<void>((resolve) => {
          function frame() {
            const t = (performance.now() - begin) / 1000;
            ctx.drawImage(img, 0, 0, 1080, 1920);
            ctx.fillStyle = `rgba(205,235,217,${0.015 + 0.01 * Math.sin(t)})`;
            ctx.fillRect(0, 0, 1080, 1920);
            ctx.strokeStyle = "rgba(170,213,194,.20)";
            for (let y = 1090; y < 1570; y += 65) {
              ctx.beginPath();
              ctx.moveTo(520 + Math.sin(t + y) * 15, y);
              ctx.lineTo(780 + Math.sin(t + y) * 15, y);
              ctx.stroke();
            }
            if (social) {
              const gradient = ctx.createLinearGradient(0, 630, 0, 1300);
              gradient.addColorStop(0, "#0b171c00");
              gradient.addColorStop(0.45, "#0b171ccc");
              gradient.addColorStop(1, "#0b171c00");
              ctx.fillStyle = gradient;
              ctx.fillRect(0, 630, 1080, 670);
              ctx.textAlign = "center";
              ctx.fillStyle = "#a7e9cf";
              ctx.font = "28px monospace";
              ctx.fillText("STORYBRANCH", 510, 780);
              ctx.fillStyle = "#f3efe5";
              ctx.font = "66px Georgia";
              ctx.fillText("The Glass Harbor", 510, 880);
              ctx.font = "38px Georgia";
              ctx.fillText("One signal. Many ways home.", 510, 970);
              ctx.font = "30px sans-serif";
              ctx.fillStyle = "#d2e6dc";
              ctx.fillText("Which path would you take?", 510, 1050);
              ctx.font = "22px monospace";
              ctx.fillText("LOCAL PROTOTYPE · SILENT PREVIEW", 510, 1140);
            }
            if (t < 6) requestAnimationFrame(frame);
            else resolve();
          }
          frame();
        });
        recorder.stop();
        const data = Array.from(
          new Uint8Array(await (await done).arrayBuffer()),
        );
        stream.getTracks().forEach((track) => track.stop());
        return data;
      },
      { svg, social },
    );
    const name = social ? "harbor-social-v1.mp4" : "harbor-portrait-v1.mp4";
    await writeFile(`apps/web/public/media/${name}`, Buffer.from(bytes));
    console.log(`${name}: ${bytes.length} bytes`);
  }
} finally {
  await browser.close();
}
