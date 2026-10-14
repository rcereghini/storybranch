import { it, expect } from "vitest";
import { conditionSchema } from "../packages/contracts/index";
import {
  baseStats,
  start,
  transition,
  evaluate,
  validateStory,
} from "../packages/domain/index";
import { glassHarbor, stories } from "../fixtures/stories";
it("rejects unbounded condition nesting and unknown operators", () => {
  expect(
    conditionSchema.safeParse({
      kind: "stat",
      stat: "agility",
      op: "execute",
      value: 8,
    }).success,
  ).toBe(false);
  let c: unknown = { kind: "key", keyId: "glass-harbor:pass", present: true };
  for (let i = 0; i < 7; i++) c = { kind: "not", condition: c };
  expect(conditionSchema.safeParse(c).success).toBe(false);
});
it("routes agility 7 to capture and agility 8 to success", () => {
  for (const agility of [7, 8]) {
    let s = start(glassHarbor, "test", "user", { ...baseStats, agility }, 0);
    s = transition(glassHarbor, s, "market", 0, 1).save;
    expect(transition(glassHarbor, s, "escape", 1, 2).save.pageId).toBe(
      agility === 8 ? "success" : "guard",
    );
  }
});
it("locks pass routes, rejects foreign keys, unlocks correct key and rewards entry once", () => {
  let s = start(glassHarbor, "test", "user", baseStats, 0);
  s.keys = ["other:harbor-pass"];
  expect(() => transition(glassHarbor, s, "pass", 0, 1)).toThrow("unavailable");
  s = transition(glassHarbor, s, "courier", 0, 1).save;
  s = transition(glassHarbor, s, "dock", 1, 2).save;
  s = transition(glassHarbor, s, "courier", 2, 3).save;
  expect(s.items["glass-harbor:token"]).toBe(1);
  s = transition(glassHarbor, s, "dock", 3, 4).save;
  expect(transition(glassHarbor, s, "pass", 4, 5).save.status).toBe(
    "completed",
  );
});
it("isolates child inventory, keys, health and stat snapshots", () => {
  const parent = start(glassHarbor, "parent", "user", baseStats, 0);
  parent.keys = ["glass-harbor:harbor-pass"];
  const before = JSON.stringify(parent);
  const child = start(stories[1], "child", "user", parent.stats, 1, parent);
  child.stats.agility = 20;
  child.health = 1;
  child.items["bell-diver:coin"] = 3;
  expect(JSON.stringify(parent)).toBe(before);
  expect(child.keys).toEqual(["bell-diver:secret"]);
  expect(child.parentRevision).toBe(0);
});
it("rejects dangling routes and foreign effects", () => {
  const s = structuredClone(glassHarbor);
  s.pages.dock.choices[0].outcome = {
    kind: "direct",
    route: { targetPageId: "missing", effects: [] },
  };
  expect(() => validateStory(s)).toThrow("Dangling");
  const foreign = structuredClone(glassHarbor);
  foreign.pages.dock.entryEffects = [
    { id: "bad", kind: "key", keyId: "other:pass", present: true },
  ];
  expect(() => validateStory(foreign)).toThrow("Foreign");
});
it("evaluates composed conditions and rejects stale state without mutation", () => {
  const s = start(glassHarbor, "id", "user", baseStats, 0);
  expect(
    evaluate(
      {
        kind: "all",
        conditions: [
          {
            kind: "not",
            condition: {
              kind: "key",
              keyId: "glass-harbor:pass",
              present: true,
            },
          },
          {
            kind: "any",
            conditions: [{ kind: "stat", stat: "agility", op: "eq", value: 5 }],
          },
        ],
      },
      s,
    ),
  ).toBe(true);
  expect(() => transition(glassHarbor, s, "market", 2, 1)).toThrow(
    "another device",
  );
  expect(s.revision).toBe(0);
});
import { pageStories } from "../fixtures/page-stories";
it("routes trusted dice outcomes deterministically and retains results for later pages", () => {
  const story = pageStories[1];
  const initial = start(story, "dice-save", "player", baseStats, 0);
  const atRoll = transition(story, initial, "roll", 0, 1).save;
  const passRoll = transition(story, atRoll, "roll", 1, 2, () => 10, "roll");
  expect(passRoll.save.pageId).toBe("roll");
  expect(() =>
    transition(story, passRoll.save, "roll", 2, 3, () => 20, "roll"),
  ).toThrow();
  const passed = transition(story, passRoll.save, "roll", 2, 3);
  const failRoll = transition(story, atRoll, "roll", 1, 2, () => 9, "roll");
  const failed = transition(story, failRoll.save, "roll", 2, 3);
  expect(passed.save.pageId).toBe("signal");
  expect(failed.save.pageId).toBe("shelter");
  expect(passed.save.lastRoll).toMatchObject({ value: 10, passed: true });
  expect(passed.save.keys).toContain("storm-signal:restored");
  expect(
    evaluate(
      { kind: "roll", pageId: "roll", op: "gte", value: 10 },
      passed.save,
    ),
  ).toBe(true);
  expect(
    evaluate(
      { kind: "roll", pageId: "other", op: "gte", value: 10 },
      passed.save,
    ),
  ).toBe(false);
  expect(atRoll.lastRoll).toBeUndefined();
  expect(() => transition(story, atRoll, "roll", 1, 2)).toThrow();
  expect(() =>
    transition(story, atRoll, "roll", 1, 2, () => 21, "roll"),
  ).toThrow();
});
it("enforces explicit page types and one-output linear pages", () => {
  const story = structuredClone(pageStories[0]);
  story.pages.letter.choices.push(story.pages.hall.choices[0]);
  expect(() => validateStory(story)).toThrow("Linear page");
  const missing = structuredClone(pageStories[0]) as any;
  delete missing.pages.letter.pageType;
  expect(() => validateStory(missing)).toThrow();
});
