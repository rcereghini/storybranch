// Renders the 1200x630 link-preview images in apps/web/public/og/ with local
// Chrome. Rerun after adding a seeded story or changing its title.
import { mkdir, readFile } from "node:fs/promises";
import { launchBrowser } from "./browser";
import { glassHarbor, catalogue } from "../fixtures/stories";
import { pageCatalogue } from "../fixtures/page-stories";
import {
  coverArt,
  coverPalette,
  monogram,
} from "../apps/web/src/cover-palette";

const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const cards = [
  {
    id: glassHarbor.id,
    title: glassHarbor.title,
    description: catalogue.description,
  },
  ...pageCatalogue.map((entry) => ({
    id: entry.id,
    title: entry.title,
    description: entry.description,
  })),
  {
    id: "default",
    title: "Storybranch",
    description: "Interactive stories where every choice leaves a trace.",
  },
];

async function art(id: string, title: string) {
  const src = coverArt[id];
  if (src) {
    const svg = await readFile(`apps/web/public${src}`, "utf8");
    return `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"/>`;
  }
  const { top, bottom, ink } = coverPalette(id);
  return `<div class="generated" style="background:radial-gradient(circle at 78% 18%, ${ink}40, transparent 45%), linear-gradient(160deg, ${top}, ${bottom});color:${ink}">${escape(monogram(title))}</div>`;
}

const html = (card: (typeof cards)[number], cover: string) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; background: #101516;
  color: #f3efe5; font-family: "Segoe UI", system-ui, sans-serif; }
.card { position: relative; display: grid; grid-template-columns: 1fr 520px;
  height: 100%; background: radial-gradient(900px 500px at 100% 0%, #a7e9cf14, transparent 60%), #101516; }
.copy { display: flex; flex-direction: column; justify-content: center; gap: 22px; padding: 64px 56px 64px 72px; }
.eyebrow { font: 600 18px/1 Consolas, monospace; letter-spacing: 4px; color: #a7e9cf; }
h1 { font: 400 76px/1.02 Georgia, serif; letter-spacing: -1px; }
p { font-size: 27px; line-height: 1.4; color: #c8d3cf; max-width: 560px; }
.foot { margin-top: 18px; display: flex; align-items: center; gap: 14px; font-size: 22px; color: #a2b0ad; }
.foot b { color: #f3efe5; font-weight: 650; }
.cover { position: relative; overflow: hidden; }
.cover img { width: 100%; height: 100%; object-fit: cover; }
.cover::before { content: ""; position: absolute; inset: 0; z-index: 1;
  background: linear-gradient(90deg, #101516 0%, transparent 35%); }
.generated { width: 100%; height: 100%; display: grid; place-items: center;
  font: 400 240px/1 Georgia, serif; }
</style></head><body><div class="card">
<div class="copy">
  <div class="eyebrow">${card.id === "default" ? "CHOOSE YOUR WAY" : "AN INTERACTIVE STORY"}</div>
  <h1>${escape(card.title)}</h1>
  <p>${escape(card.description)}</p>
  <div class="foot"><b>⌘ storybranch</b><span>· Play free in your browser</span></div>
</div>
<div class="cover">${cover}</div>
</div></body></html>`;

await mkdir("apps/web/public/og", { recursive: true });
const browser = await launchBrowser();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
  });
  for (const card of cards) {
    await page.setContent(html(card, await art(card.id, card.title)));
    await page.screenshot({ path: `apps/web/public/og/${card.id}.png` });
    console.log(`og/${card.id}.png`);
  }
} finally {
  await browser.close();
}
