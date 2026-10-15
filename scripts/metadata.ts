import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { glassHarbor, catalogue } from "../fixtures/stories";
import { pageStories, pageCatalogue } from "../fixtures/page-stories";
import { sharePages } from "./share-pages";

// Absolute URLs are required by most link-preview crawlers.
const site = (
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://www.storybranch.com")
).replace(/\/$/, "");
const shell = await readFile("dist/index.html", "utf8");
const images = new Set(
  (await readdir("dist/og")).map((file) => file.replace(/\.png$/, "")),
);
const described = (id: string) =>
  [catalogue, ...pageCatalogue].find((entry) => entry.id === id)?.description ??
  "An interactive story on Storybranch.";
const pages = sharePages(
  shell,
  site,
  [glassHarbor, ...pageStories].map((story) => ({
    story,
    description: described(story.id),
  })),
  images,
);
pages.push({
  path: "u/storybranch",
  html: shell.replace(
    /<title>[^<]*<\/title>/,
    `<title>Storybranch Studio · Storybranch</title><meta property="og:title" content="Storybranch Studio"/><meta property="og:description" content="Original prototype adventures by Storybranch Studio."/><meta property="og:type" content="website"/>`,
  ),
});
for (const page of pages) {
  const dir = page.path ? `dist/${page.path}` : "dist";
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/index.html`, page.html);
}
console.log(`Share pages: ${pages.length} written for ${site}`);
