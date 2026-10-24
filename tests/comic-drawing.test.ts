import { it, expect, vi } from "vitest";
import type { DraftRecord } from "../packages/contracts/authoring";
import {
  counts,
  currentDrawing,
  dismissDrawing,
  placeImage,
  retryDrawing,
  setPlacer,
  startDrawing,
  withDrawnImages,
  type Drawing,
} from "../apps/web/src/comic-drawing";
import { applyComicScript, comicTemplate } from "../apps/web/src/studio-model";

const script = {
  title: "Mute Button",
  description: "",
  cast: [{ name: "Mo", description: "Orange cat" }],
  panels: [1, 2, 3, 4].map((n) => ({ alt: `Mo, beat ${n}`, caption: "" })),
};
const draft = (): DraftRecord =>
  applyComicScript(
    {
      story: comicTemplate("story-comic"),
      description: "",
      revision: 1,
      publishedVersionId: null,
      comic: { style: "", cast: [] },
    },
    "comic",
    script,
    { layout: "grid", style: "Ink" },
  );
const settle = async (until: () => boolean) => {
  for (let i = 0; i < 50 && !until(); i++)
    await new Promise((r) => setTimeout(r, 5));
};

it("draws in the background, sheets first, and places images in their draft", async () => {
  const start = draft();
  const requests: Array<{ prompt: string; referenceIds?: string[] }> = [];
  let refuse = true;
  const api = vi.fn(async (_path: string, body?: unknown) => {
    const command = body as { prompt: string; referenceIds?: string[] };
    requests.push(command);
    if (refuse && command.prompt.startsWith("Panel 3")) {
      refuse = false;
      return {
        id: "j",
        status: "failed",
        kind: "image",
        prompt: "",
        createdAt: 0,
        message: "Blocked",
      };
    }
    const id = `generated-${requests.length}xxxxxx`;
    return {
      id,
      status: "ready",
      kind: "image",
      prompt: "",
      createdAt: 0,
      asset: { id, url: `https://x/${id}` },
    };
  });
  let open = start;
  const placed: string[] = [];
  setPlacer((drawing, job, image) => {
    placed.push(job.label);
    open = placeImage(open, drawing, job, image);
  });
  startDrawing(api as never, start, "comic", "Mute Button");
  expect(currentDrawing()).toMatchObject({
    running: true,
    title: "Mute Button",
  });
  expect(currentDrawing()!.jobs.map((j) => j.label)).toEqual([
    "Mo (character)",
    "Panel 1",
    "Panel 2",
    "Panel 3",
    "Panel 4",
  ]);
  await settle(() => currentDrawing()?.running === false);
  // The character sheet comes first, and panels follow it as a reference.
  expect(requests[0].prompt).toContain("Character reference sheet");
  const sheet = open.comic!.cast[0].image!;
  expect(sheet).toMatch(/^asset:generated-1/);
  expect(
    requests.slice(1).every((r) => r.referenceIds?.[0] === sheet.slice(6)),
  ).toBe(true);
  expect(placed).toHaveLength(4); // sheet + 3 panels; panel 3 was refused
  expect(counts(currentDrawing()!)).toEqual({ done: 4, failed: 1 });
  expect(currentDrawing()!.jobs[3].message).toBe("Blocked");
  const panels = open.story.storyNodes.comic.comic!.panels;
  expect(panels.filter((p) => p.image)).toHaveLength(3);
  // A draft opened later gets the same images.
  const reopened = withDrawnImages(start);
  expect(
    reopened.story.storyNodes.comic.comic!.panels.filter((p) => p.image),
  ).toHaveLength(3);
  expect(withDrawnImages(reopened)).toBe(reopened);
  // Retrying the refused panel draws only it.
  retryDrawing(api as never, open);
  await settle(() => currentDrawing()?.running === false);
  expect(open.story.storyNodes.comic.comic!.panels.every((p) => p.image)).toBe(
    true,
  );
  expect(requests).toHaveLength(6);
  dismissDrawing();
  expect(currentDrawing()).toBeNull();
  expect(withDrawnImages(start)).toBe(start);
  setPlacer(null);
});

it("only places an image in the draft it was drawn for", () => {
  const d = draft();
  const other = { ...d, story: { ...d.story, id: "story-other" } };
  const panel = d.story.storyNodes.comic.comic!.panels[0];
  const job = { kind: "panel" as const, targetId: panel.id };
  expect(
    placeImage(
      other,
      { storyId: "story-comic", storyNodeId: "comic" },
      job,
      "asset:generated-a",
    ),
  ).toBe(other);
  const placed = placeImage(
    d,
    { storyId: "story-comic", storyNodeId: "comic" },
    job,
    "asset:generated-a",
  );
  expect(placed.story.storyNodes.comic.comic!.panels[0].image).toBe(
    "asset:generated-a",
  );
  expect(
    placeImage(
      placed,
      { storyId: "story-comic", storyNodeId: "comic" },
      job,
      "asset:generated-a",
    ),
  ).toBe(placed);
  expect(
    counts({ jobs: [{ status: "done" }, { status: "failed" }] } as Drawing),
  ).toEqual({ done: 1, failed: 1 });
});
