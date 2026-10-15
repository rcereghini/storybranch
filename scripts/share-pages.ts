import type { Story } from "../packages/contracts/index";
import { isResultPage } from "../packages/domain/index";

// Link previews are static: crawlers read meta tags without running the app.
export type ShareStory = {
  story: Story;
  description: string;
};
export type SharePage = { path: string; html: string };

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

// One page per story (/s/<id>) and per ending (/s/<id>/ending/<pageId>).
// The ending page also names the ending for the app's "a friend reached" note.
export function sharePages(
  shell: string,
  site: string,
  stories: ShareStory[],
  images: Set<string>,
): SharePage[] {
  // Each page brings its own title and description in place of the shell's.
  const withTags = (head: string) =>
    shell
      .replace(/<meta\s+name="description"[^>]*>\s*/, "")
      .replace(/<title>[^<]*<\/title>/, head);
  const pages: SharePage[] = [
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
    pages.push({
      path: `s/${story.id}`,
      html: withTags(
        tags(site, `s/${story.id}`, story.title, description, image),
      ),
    });
    for (const page of Object.values(story.pages)) {
      if (page.kind !== "ending") continue;
      const path = `s/${story.id}/ending/${page.id}`;
      // A quiz result reads "I got"; the app words its note to match.
      const result = isResultPage(story, page.id);
      pages.push({
        path,
        html: withTags(
          tags(
            site,
            path,
            result
              ? `I got “${page.title}” in ${story.title}`
              : `I reached “${page.title}” in ${story.title}`,
            result
              ? "What will you get? Take the quiz free on Storybranch."
              : "Which ending will you find? Play free on Storybranch.",
            image,
            {
              "storybranch:ending": page.title,
              ...(result ? { "storybranch:result": "true" } : {}),
            },
          ),
        ),
      });
    }
  }
  return pages;
}
