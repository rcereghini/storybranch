import type { Story } from "../packages/contracts/index";
import { isResultStoryNode } from "../packages/domain/index";

// Link previews are static: crawlers read meta tags without running the app.
export type ShareStory = {
  story: Story;
  description: string;
};
export type ShareDocument = { path: string; html: string };

const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export const ogImage = (storyId: string, known: Set<string>) =>
  `/og/${known.has(storyId) ? storyId : "default"}.png`;

function tags(
  site: string,
  path: string,
  title: string,
  description: string,
  image: string,
  extra: Record<string, string> = {},
) {
  const meta = {
    "og:site_name": "Storybranch",
    "og:type": "website",
    "og:title": title,
    "og:description": description,
    "og:url": `${site}/${path}`.replace(/\/$/, ""),
    "og:image": `${site}${image}`,
    "og:image:width": "1200",
    "og:image:height": "630",
    "twitter:card": "summary_large_image",
  };
  return [
    `<title>${escape(title)} · Storybranch</title>`,
    `<meta name="description" content="${escape(description)}"/>`,
    ...Object.entries(meta).map(
      ([key, value]) =>
        `<meta ${key.startsWith("twitter:") ? "name" : "property"}="${key}" content="${escape(value)}"/>`,
    ),
    ...Object.entries(extra).map(
      ([key, value]) => `<meta name="${key}" content="${escape(value)}"/>`,
    ),
  ].join("");
}

// One view per story (/s/<id>) and per ending (/s/<id>/ending/<storyNodeId>).
// The ending view also names the ending for the app's "a friend reached" note.
export function shareDocuments(
  shell: string,
  site: string,
  stories: ShareStory[],
  images: Set<string>,
): ShareDocument[] {
  // Each view brings its own title and description in place of the shell's.
  const withTags = (head: string) =>
    shell
      .replace(/<meta\s+name="description"[^>]*>\s*/, "")
      .replace(/<title>[^<]*<\/title>/, head);
  const documents: ShareDocument[] = [
    {
      path: "",
      html: withTags(
        tags(
          site,
          "",
          "Storybranch",
          "Interactive stories where every choice leaves a trace. Play free in your browser.",
          "/og/default.png",
        ),
      ),
    },
  ];
  for (const { story, description } of stories) {
    const image = ogImage(story.id, images);
    documents.push({
      path: `s/${story.id}`,
      html: withTags(
        tags(site, `s/${story.id}`, story.title, description, image),
      ),
    });
    for (const document of Object.values(story.storyNodes)) {
      if (document.kind !== "ending") continue;
      const path = `s/${story.id}/ending/${document.id}`;
      // A quiz result reads "I got"; the app words its note to match.
      const result = isResultStoryNode(story, document.id);
      documents.push({
        path,
        html: withTags(
          tags(
            site,
            path,
            result
              ? `I got “${document.title}” in ${story.title}`
              : `I reached “${document.title}” in ${story.title}`,
            result
              ? "What will you get? Take the quiz free on Storybranch."
              : "Which ending will you find? Play free on Storybranch.",
            image,
            {
              "storybranch:ending": document.title,
              ...(result ? { "storybranch:result": "true" } : {}),
            },
          ),
        ),
      });
    }
  }
  return documents;
}
