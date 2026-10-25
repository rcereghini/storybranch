import { it, expect, vi } from "vitest";
import { PlayerSession } from "../apps/web/src/player-session";
import { EditionCache } from "../services/api/edition-cache";
import { renderStoryNode, playerRun } from "../packages/domain/player";
import { baseStats, start } from "../packages/domain/index";
import { glassHarbor } from "../fixtures/stories";
import { ApiError } from "../packages/api-client/index";
import type { PlayerView } from "../packages/contracts/player";

const save = start(glassHarbor, "run", "user", baseStats, 0);
const view: PlayerView = {
  story: {
    id: glassHarbor.id,
    versionId: glassHarbor.versionId,
    title: glassHarbor.title,
  },
  user: { id: "user", stats: baseStats, achievements: [], saveSpots: [] },
  save: playerRun(save),
  storyNode: renderStoryNode(glassHarbor.storyNodes[save.storyNodeId], save),
  branches: [],
  featuredId: null,
};
const command = {
  path: "/playthroughs/run/choices",
  body: { idempotencyKey: "exact-retry" },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it("projects only presentation, evaluates hidden/locked outputs and omits private run data", () => {
  const node = structuredClone(glassHarbor.storyNodes[save.storyNodeId]);
  node.choices[0].availableWhen = {
    kind: "key",
    keyId: "glass-harbor:secret",
    present: true,
  };
  node.choices[0].unavailableDisplay = "hidden";
  expect(
    renderStoryNode(node, save).outputs.find(
      (o) => o.id === node.choices[0].id,
    ),
  ).toBeUndefined();
  node.choices[0].unavailableDisplay = "locked";
  expect(renderStoryNode(node, save).outputs[0].enabled).toBe(false);
  node.choices[0].availableWhen = undefined;
  node.choices[0].costs = [
    { itemId: "glass-harbor:coin", quantity: 2 },
    { itemId: "glass-harbor:coin", quantity: 2 },
  ];
  expect(
    renderStoryNode(node, { ...save, items: { "glass-harbor:coin": 3 } })
      .outputs[0].enabled,
  ).toBe(false);
  expect(
    renderStoryNode(node, { ...save, items: { "glass-harbor:coin": 4 } })
      .outputs[0].enabled,
  ).toBe(true);
  const serialized = JSON.stringify(renderStoryNode(node, save));
  for (const field of [
    "outcome",
    "targetStoryNodeId",
    "availableWhen",
    "entryEffects",
    "costs",
  ])
    expect(serialized).not.toContain(field);
  expect(playerRun({ ...save, scores: { secret: 10 } })).not.toHaveProperty(
    "scores",
  );
  expect(playerRun(save)).not.toHaveProperty("appliedEntryEffects");
});

it("uses one command response, blocks duplicate submissions and preserves exact unknown-outcome retry", async () => {
  const first = deferred<{ player: PlayerView }>();
  const api = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValue({ player: view });
  const session = new PlayerSession(api, () => "user|run");
  const submission = session.submit(command);
  await session.submit({ path: "wrong", body: {} });
  expect(api).toHaveBeenCalledTimes(1);
  first.reject(new TypeError("network lost after commit"));
  await expect(submission).rejects.toThrow();
  expect(session.snapshot().phase).toBe("retry");
  await session.submit({ path: "wrong", body: {} });
  expect(api.mock.calls[1]).toEqual([command.path, command.body]);
  expect(session.snapshot().view).toEqual(view);
  expect(session.snapshot().pending).toBeNull();
  expect(api).toHaveBeenCalledTimes(2); // No post-command GET.
});

it("ignores responses after account/navigation changes and out-of-order loads", async () => {
  let scope = "user|run";
  const a = deferred<PlayerView>(),
    b = deferred<PlayerView>();
  const api = vi
    .fn()
    .mockReturnValueOnce(a.promise)
    .mockReturnValueOnce(b.promise);
  const session = new PlayerSession(api, () => scope);
  const old = session.load("run"),
    recent = session.load("run");
  b.resolve({ ...view, save: { ...view.save, revision: 2 } });
  await recent;
  a.resolve(view);
  await old;
  expect(session.snapshot().view?.save.revision).toBe(2);
  const response = deferred<{ player: PlayerView }>();
  api.mockReturnValueOnce(response.promise);
  const submission = session.submit(command);
  scope = "other-user|other-run";
  session.reset();
  response.resolve({ player: view });
  await submission;
  expect(session.snapshot()).toEqual({
    view: null,
    pending: null,
    phase: "idle",
  });
});

it("requires reload after stale commands and keeps the previous frame on failure", async () => {
  const api = vi
    .fn()
    .mockResolvedValueOnce(view)
    .mockRejectedValueOnce(new ApiError("STALE_REVISION", "Reload"));
  const session = new PlayerSession(api, () => "user|run");
  await session.load("run");
  await expect(session.submit(command)).rejects.toThrow("Reload");
  expect(session.snapshot()).toMatchObject({
    view,
    phase: "stale",
    pending: null,
  });
  await session.submit(command);
  expect(api).toHaveBeenCalledTimes(2);
});

it("bounds edition caching, expires entries and isolates caller mutation", () => {
  let now = 0;
  const cache = new EditionCache<{ title: string }>(2, 10, () => now);
  const original = { title: "A" };
  cache.set("a", original);
  original.title = "changed";
  cache.set("b", { title: "B" });
  cache.get("a")!.title = "also changed";
  cache.set("c", { title: "C" });
  expect(cache.get("b")).toBeUndefined();
  expect(cache.get("a")).toEqual({ title: "A" });
  now = 10;
  expect(cache.get("a")).toBeUndefined();
});
