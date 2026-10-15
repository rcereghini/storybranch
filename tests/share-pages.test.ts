import { it, expect } from "vitest";
import { sharePages } from "../scripts/share-pages";
import { glassHarbor } from "../fixtures/stories";
import { pageStories } from "../fixtures/page-stories";

const shell = `<html><head><meta
      name="description"
      content="Shell description"
    /><title>Storybranch · Choose your way</title></head><body></body></html>`;
const site = "https://www.storybranch.com";

it("writes a preview page per story and per ending with absolute tags", () => {
  const pages = sharePages(
    shell,
    site,
    [glassHarbor, ...pageStories].map((story) => ({
      story,
      description: `${story.title} description`,
    })),
    new Set(["glass-harbor", "default"]),
  );
  const byPath = new Map(pages.map((p) => [p.path, p.html]));
  const endings = [glassHarbor, ...pageStories].flatMap((s) =>
    Object.values(s.pages)
      .filter((p) => p.kind === "ending")
      .map((p) => `s/${s.id}/ending/${p.id}`),
  );
  expect(endings.length).toBeGreaterThan(2);
  for (const path of ["", "s/glass-harbor", "s/clockwork-door", ...endings])
    expect(byPath.has(path)).toBe(true);

  const story = byPath.get("s/glass-harbor")!;
  expect(story).toContain('property="og:title" content="The Glass Harbor"');
  expect(story).toContain(`content="${site}/s/glass-harbor"`);
  expect(story).toContain(`content="${site}/og/glass-harbor.png"`);
  expect(story).toContain('name="twitter:card" content="summary_large_image"');
  expect(story).not.toContain("Choose your way</title>");
  expect(story.match(/name="description"/g)).toHaveLength(1);
  expect(story).not.toContain("Shell description");
  // Stories without a rendered image fall back to the default card.
  expect(byPath.get("s/clockwork-door")).toContain(`${site}/og/default.png`);

  const ending = byPath.get(endings[0])!;
  expect(ending).toMatch(/og:title" content="I reached “[^"]+” in /);
  expect(ending).toContain('name="storybranch:ending"');
  expect(byPath.get("")).toContain(`property="og:url" content="${site}"`);
});

it("escapes story text inside meta attributes", () => {
  const [, page] = sharePages(
    shell,
    site,
    [
      {
        story: {
          ...glassHarbor,
          id: "x",
          title: 'A "quoted" <b>title</b> & co',
        },
        description: "d",
      },
    ],
    new Set(),
  );
  expect(page.html).toContain(
    "A &quot;quoted&quot; &lt;b&gt;title&lt;/b&gt; &amp; co",
  );
  expect(page.html).not.toContain("<b>title</b>");
});
