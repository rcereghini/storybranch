import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { glassHarbor, catalogue } from "../fixtures/stories";
import {
  storyNodeStories,
  storyNodeCatalogue,
} from "../fixtures/story-node-stories";
import { shareDocuments } from "./share-documents";

// Absolute URLs are required by most link-preview crawlers.
const site = (
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://www.storybranch.com")
).replace(/\/$/, "");
// A top-level folder named like an app view would be served instead of the
// app on refresh or a direct link (Vercel serves files before rewrites).
const appRoutes = [
  "assets",
  "discover",
  "adventures",
  "studio",
  "admin",
  "play",
  "p",
  "story-nodes",
];
const shadowed = (await readdir("dist")).filter((entry) =>
  appRoutes.includes(entry),
);
if (shadowed.length)
  throw new Error(`Build output shadows app views: ${shadowed.join(", ")}`);
const shell = await readFile("dist/index.html", "utf8");
const images = new Set(
  (await readdir("dist/og")).map((file) => file.replace(/\.png$/, "")),
);
const described = (id: string) =>
  [catalogue, ...storyNodeCatalogue].find((entry) => entry.id === id)
    ?.description ?? "An interactive story on Storybranch.";
const documents = shareDocuments(
  shell,
  site,
  [glassHarbor, ...storyNodeStories].map((story) => ({
    story,
    description: described(story.id),
  })),
  images,
);
documents.push({
  path: "u/storybranch",
  html: shell.replace(
    /<title>[^<]*<\/title>/,
    `<title>Storybranch Studio · Storybranch</title><meta property="og:title" content="Storybranch Studio"/><meta property="og:description" content="Original prototype adventures by Storybranch Studio."/><meta property="og:type" content="website"/>`,
  ),
});
for (const document of documents) {
  const dir = document.path ? `dist/${document.path}` : "dist";
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/index.html`, document.html);
}
console.log(`Share views: ${documents.length} written for ${site}`);
