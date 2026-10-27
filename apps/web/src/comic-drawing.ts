import { useSyncExternalStore } from "react";
import type { OrdinaryDraftRecord as DraftRecord } from "../../../packages/contracts/authoring";
import type { ImageCommand } from "../../../packages/contracts/generation";
import {
  assetIdOf,
  assetRef,
  type ClipAsset,
} from "../../../packages/contracts/media";
import { ApiError } from "../../../packages/api-client/index";
import { generateImage } from "./StudioAssist";
import { castInPanel, castPrompt, drawPlan, panelPrompt } from "./studio-model";

// The comic companion's drawing, kept outside any component so it carries on
// when the dialog closes, the creator edits another StoryNode, or leaves Studio.
// Studio registers a placer that puts each image into the open draft; images
// for a draft that isn't open are placed when it is opened again. A reload
// stops placing (finished images stay in the asset library).

type Api = <T>(path: string, body?: unknown) => Promise<T>;
export type DrawJob = {
  key: string;
  kind: "cast" | "panel";
  targetId: string;
  label: string;
  status: "waiting" | "drawing" | "done" | "failed";
  message?: string;
  url?: string;
  image?: string;
  // Kept after an unanswered request so Retry reuses its key.
  command?: ImageCommand;
};
export type Drawing = {
  storyId: string;
  storyNodeId: string;
  title: string;
  jobs: DrawJob[];
  running: boolean;
};
export type Placer = (
  drawing: Drawing,
  job: DrawJob,
  image: string,
  asset: ClipAsset,
) => void;

// High quality is the tier that follows character references.
export const costPerImage = 0.15;
const parallel = 3;

let state: Drawing | null = null;
const listeners = new Set<() => void>();
const set = (next: Drawing | null) => {
  state = next;
  for (const listener of listeners) listener();
};
const patch = (key: string, change: Partial<DrawJob>) =>
  state &&
  set({
    ...state,
    jobs: state.jobs.map((j) => (j.key === key ? { ...j, ...change } : j)),
  });
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const currentDrawing = () => state;
export const useDrawing = () => useSyncExternalStore(subscribe, currentDrawing);

let placer: Placer | null = null;
export const setPlacer = (next: Placer | null) => {
  placer = next;
};

// Sets one drawn image on its panel or character, only in the draft it was
// drawn for. Unchanged when it is already there or its target was removed.
export function placeImage(
  d: DraftRecord,
  drawing: Pick<Drawing, "storyId" | "storyNodeId">,
  job: Pick<DrawJob, "kind" | "targetId">,
  image: string,
): DraftRecord {
  if (d.story.id !== drawing.storyId) return d;
  if (job.kind === "cast") {
    const member = d.comic?.cast.find((c) => c.id === job.targetId);
    if (!d.comic || !member || member.image === image) return d;
    return {
      ...d,
      comic: {
        ...d.comic,
        cast: d.comic.cast.map((c) => (c === member ? { ...c, image } : c)),
      },
    };
  }
  const storyNode = d.story.storyNodes[drawing.storyNodeId];
  const panel = storyNode?.comic?.panels.find((p) => p.id === job.targetId);
  if (!storyNode?.comic || !panel || panel.image === image) return d;
  return {
    ...d,
    story: {
      ...d.story,
      storyNodes: {
        ...d.story.storyNodes,
        [drawing.storyNodeId]: {
          ...storyNode,
          comic: {
            ...storyNode.comic,
            panels: storyNode.comic.panels.map((p) =>
              p === panel ? { ...p, image } : p,
            ),
          },
        },
      },
    },
  };
}
// Every finished image of the current drawing, for a draft being opened.
export const withDrawnImages = (d: DraftRecord) =>
  (state?.jobs ?? []).reduce(
    (draft, job) =>
      job.image && state ? placeImage(draft, state, job, job.image) : draft,
    d,
  );

// One job: the prompt comes from the draft as it stood when drawing started
// (or was retried), with the character sheets drawn so far as references.
async function drawOne(
  api: Api,
  job: DrawJob,
  base: DraftRecord,
  sheets: Map<string, string>,
) {
  const drawing = state!;
  const studio = base.comic ?? { style: "", cast: [] };
  const cast = studio.cast.map((c) => {
    const image = sheets.get(c.id) ?? c.image;
    return image ? { ...c, image } : c;
  });
  let command = job.command;
  if (!command) {
    let prompt = "";
    let referenceIds: string[] = [];
    if (job.kind === "cast") {
      const member = cast.find((c) => c.id === job.targetId);
      if (!member)
        return patch(job.key, { status: "failed", message: "Removed" });
      prompt = castPrompt(member, studio.style);
    } else {
      const comic = base.story.storyNodes[drawing.storyNodeId]?.comic;
      const index = comic?.panels.findIndex((p) => p.id === job.targetId) ?? -1;
      if (!comic || index < 0)
        return patch(job.key, { status: "failed", message: "Removed" });
      const inPanel = castInPanel(cast, comic.panels[index]);
      prompt = panelPrompt(comic, index, studio.style, inPanel);
      referenceIds = inPanel.map((c) => assetIdOf(c.image)!);
    }
    command = {
      idempotencyKey: crypto.randomUUID(),
      kind: "image",
      prompt,
      quality: "high",
      aspect: "1:1",
      ...(referenceIds.length ? { referenceIds } : {}),
    };
  }
  patch(job.key, { status: "drawing", message: undefined, command });
  try {
    const asset = (await generateImage(api, command))!;
    const image = assetRef(asset.id);
    if (job.kind === "cast") sheets.set(job.targetId, image);
    patch(job.key, {
      status: "done",
      url: asset.url,
      image,
      command: undefined,
    });
    placer?.(drawing, job, image, asset);
  } catch (e) {
    patch(job.key, {
      status: "failed",
      message: (e as Error).message,
      // Only an unanswered request keeps its key for Retry.
      command:
        e instanceof ApiError && e.code !== "UNAVAILABLE" ? undefined : command,
    });
  }
}

async function run(api: Api, keys: string[], base: DraftRecord) {
  const sheets = new Map<string, string>();
  // Character sheets first, so every panel can follow them.
  for (const kind of ["cast", "panel"] as const) {
    const queue = state!.jobs.filter(
      (j) => j.kind === kind && keys.includes(j.key),
    );
    await Promise.all(
      Array.from({ length: Math.min(parallel, queue.length) }, async () => {
        for (let job = queue.shift(); job; job = queue.shift())
          await drawOne(
            api,
            state!.jobs.find((j) => j.key === job.key)!,
            base,
            sheets,
          );
      }),
    );
  }
  set({ ...state!, running: false });
  notifyFinished(state!);
}

// Asked while the creator is clicking Draw it, so the browser allows it.
export function askToNotify() {
  if (
    typeof Notification !== "undefined" &&
    Notification.permission === "default"
  )
    void Notification.requestPermission().catch(() => {});
}
// A system notification when the creator isn't looking at Studio; Studio's
// own status pill shows the result otherwise.
function notifyFinished(drawing: Drawing) {
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted" ||
    (!document.hidden && placer)
  )
    return;
  const { done, failed } = counts(drawing);
  try {
    const note = new Notification(`${drawing.title} is drawn`, {
      body: failed
        ? `${done} of ${drawing.jobs.length} images drawn; ${failed} need another try.`
        : `All ${done} images are in your comic.`,
      tag: `comic-${drawing.storyId}`,
    });
    note.onclick = () => {
      focus();
      note.close();
    };
  } catch {
    // Some browsers only notify from a service worker; the pill still shows.
  }
}
export const counts = (drawing: Drawing) => ({
  done: drawing.jobs.filter((j) => j.status === "done").length,
  failed: drawing.jobs.filter((j) => j.status === "failed").length,
});

// Starts drawing everything the draft's comic still needs. One comic draws at
// a time.
export function startDrawing(
  api: Api,
  draft: DraftRecord,
  storyNodeId: string,
  title: string,
) {
  if (state?.running) return;
  const plan = drawPlan(draft, storyNodeId);
  const panels = draft.story.storyNodes[storyNodeId]?.comic?.panels ?? [];
  const jobs: DrawJob[] = [
    ...plan.cast.map((c) => ({
      key: `cast-${c.id}`,
      kind: "cast" as const,
      targetId: c.id,
      label: `${c.name} (character)`,
      status: "waiting" as const,
    })),
    ...plan.panels.map((p) => ({
      key: `panel-${p.id}`,
      kind: "panel" as const,
      targetId: p.id,
      label: `Panel ${panels.indexOf(p) + 1}`,
      status: "waiting" as const,
    })),
  ];
  if (!jobs.length) return;
  set({ storyId: draft.story.id, storyNodeId, title, jobs, running: true });
  void run(
    api,
    jobs.map((j) => j.key),
    draft,
  );
}
// Retries the failed jobs from the draft as it is now, so a description the
// creator changed is used.
export function retryDrawing(api: Api, draft: DraftRecord) {
  if (!state || state.running) return;
  const keys = state.jobs
    .filter((j) => j.status === "failed")
    .map((j) => j.key);
  if (!keys.length) return;
  set({
    ...state,
    running: true,
    jobs: state.jobs.map((j) =>
      keys.includes(j.key)
        ? { ...j, status: "waiting", message: undefined }
        : j,
    ),
  });
  void run(api, keys, draft);
}
export const dismissDrawing = () => {
  if (!state?.running) set(null);
};

// Leaving the StoryNode would stop placing images.
if (typeof addEventListener !== "undefined")
  addEventListener("beforeunload", (event) => {
    if (state?.running) event.preventDefault();
  });
