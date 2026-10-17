import type { Story, StoryPage } from "../contracts/index";
import type { PagePositions } from "../contracts/authoring";

export type PageConnection = {
  choiceId: string;
  slot: number;
  label: string;
  target: string;
};
export function connections(page: StoryPage): PageConnection[] {
  return page.choices.flatMap((c) => {
    const o = c.outcome;
    const base = { choiceId: c.id };
    if (o.kind === "direct")
      return [
        { ...base, slot: 0, label: c.label, target: o.route.targetPageId },
      ];
    if (o.kind === "reveal")
      return o.results.map((r, slot) => ({
        ...base,
        slot,
        label: r.scoreId.split(":").at(-1) ?? c.label,
        target: r.route.targetPageId,
      }));
    return [
      {
        ...base,
        slot: 0,
        label: `${c.label} · Pass`,
        target: o.success.targetPageId,
      },
      {
        ...base,
        slot: 1,
        label: `${c.label} · Fail`,
        target: o.failure.targetPageId,
      },
    ];
  });
}
export function connectPage(
  story: Story,
  source: string,
  edge: Pick<PageConnection, "choiceId" | "slot">,
  target: string,
): Story {
  const page = story.pages[source];
  if (!page || !story.pages[target])
    throw new Error("Choose an existing destination page.");
  const c = page.choices.find((c) => c.id === edge.choiceId);
  if (
    !c ||
    !connections(page).some(
      (e) => e.choiceId === edge.choiceId && e.slot === edge.slot,
    )
  )
    throw new Error("This output no longer exists.");
  if (c.outcome.kind === "reveal" && story.pages[target].kind !== "ending")
    throw new Error("Quiz results must connect to an ending.");
  const choices = page.choices.map((c) => {
    if (c.id !== edge.choiceId) return c;
    const o = c.outcome;
    if (o.kind === "direct")
      return {
        ...c,
        outcome: { ...o, route: { ...o.route, targetPageId: target } },
      };
    if (o.kind === "reveal")
      return {
        ...c,
        outcome: {
          ...o,
          results: o.results.map((r, i) =>
            i === edge.slot
              ? { ...r, route: { ...r.route, targetPageId: target } }
              : r,
          ),
        },
      };
    const key = edge.slot === 0 ? "success" : "failure";
    return {
      ...c,
      outcome: { ...o, [key]: { ...o[key], targetPageId: target } },
    };
  });
  return {
    ...story,
    pages: { ...story.pages, [source]: { ...page, choices } },
  };
}
export const graphCardHeight = (page: StoryPage) =>
  116 + Math.max(1, connections(page).length) * 34;
// Breadth-first columns keep shared destinations and cycles finite; disconnected
// pages occupy a separate final column until the creator connects them.
export function arrangePages(story: Story): PagePositions {
  const depth = new Map<string, number>();
  const queue = [story.entryPageId];
  depth.set(story.entryPageId, 0);
  for (let i = 0; i < queue.length; i++) {
    const page = story.pages[queue[i]];
    if (!page) continue;
    for (const edge of connections(page))
      if (story.pages[edge.target] && !depth.has(edge.target)) {
        depth.set(edge.target, depth.get(page.id)! + 1);
        queue.push(edge.target);
      }
  }
  const endingColumn =
    Math.max(
      0,
      ...Object.values(story.pages)
        .filter((p) => p.kind !== "ending")
        .map((p) => depth.get(p.id) ?? 0),
    ) + 1;
  for (const page of Object.values(story.pages))
    if (
      page.kind === "ending" &&
      depth.has(page.id) &&
      page.id !== story.entryPageId
    )
      depth.set(page.id, endingColumn);
  const last = Math.max(0, ...depth.values()) + 1;
  const lanes = new Map<number, number>();
  return Object.fromEntries(
    Object.values(story.pages).map((page) => {
      let column = depth.get(page.id) ?? last;
      while ((lanes.get(column) ?? 40) > 48000) column++;
      const y = lanes.get(column) ?? 40;
      lanes.set(column, y + graphCardHeight(page) + 64);
      return [page.id, { x: 40 + column * 350, y }];
    }),
  );
}
