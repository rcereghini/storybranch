import {
  storySchema,
  GameError,
  type Story,
  type Save,
  type Stats,
  type Condition,
  type Effect,
} from "../contracts/index";
export const baseStats: Stats = {
  strength: 5,
  agility: 5,
  intellect: 5,
  resolve: 5,
  charisma: 5,
};
const compare = (a: number, op: "gte" | "lte" | "eq", b: number) =>
  op === "gte" ? a >= b : op === "lte" ? a <= b : a === b;
export function evaluate(c: Condition, s: Save): boolean {
  switch (c.kind) {
    case "roll":
      return (
        s.lastRoll?.pageId === c.pageId &&
        compare(s.lastRoll.value, c.op, c.value)
      );
    case "stat":
      return compare(s.stats[c.stat], c.op, c.value);
    case "key":
      return s.keys.includes(c.keyId) === c.present;
    case "item":
      return compare(s.items[c.itemId] ?? 0, c.op, c.quantity);
    case "all":
      return c.conditions.every((x) => evaluate(x, s));
    case "any":
      return c.conditions.some((x) => evaluate(x, s));
    case "not":
      return !evaluate(c.condition, s);
  }
}
function effects(s: Save, list: Effect[], once = false) {
  for (const e of list) {
    if (once && s.appliedEntryEffects.includes(e.id)) continue;
    switch (e.kind) {
      case "key":
        s.keys = s.keys.filter((k) => k !== e.keyId);
        if (e.present) s.keys.push(e.keyId);
        break;
      case "item": {
        const n = (s.items[e.itemId] ?? 0) + e.delta;
        if (n < 0 || n > 999)
          throw new GameError(
            "VALIDATION_FAILED",
            "Item quantity out of bounds.",
          );
        s.items[e.itemId] = n;
        break;
      }
      case "stat":
        s.stats[e.stat] = Math.max(1, Math.min(20, s.stats[e.stat] + e.delta));
        break;
      case "health":
        s.health = Math.max(0, Math.min(100, s.health + e.delta));
        break;
      case "milestone":
        if (!s.milestones.includes(e.milestoneId))
          s.milestones.push(e.milestoneId);
        break;
    }
    if (once) s.appliedEntryEffects.push(e.id);
  }
}
function enter(s: Save, story: Story) {
  const n = story.pages[s.pageId];
  if (!n) throw new GameError("VALIDATION_FAILED", "Missing destination.");
  effects(s, n.entryEffects, true);
  s.status = n.kind === "ending" ? "completed" : "active";
  return s;
}
export function start(
  story: Story,
  id: string,
  uid: string,
  stats: Stats,
  now: number,
  parent?: Save,
): Save {
  return enter(
    {
      id,
      playerUid: uid,
      storyId: story.id,
      versionId: story.versionId,
      rulesetVersion: story.rulesetVersion,
      pageId: story.entryPageId,
      revision: 0,
      status: "active",
      statsSnapshot: { ...stats },
      stats: { ...stats },
      keys: [],
      items: {},
      health: 100,
      milestones: [],
      appliedEntryEffects: [],
      parentPlaythroughId: parent?.id ?? null,
      parentRevision: parent?.revision ?? null,
      updatedAt: now,
    },
    story,
  );
}
export function transition(
  story: Story,
  input: Save,
  choiceId: string,
  revision: number,
  now: number,
  roll?: (sides: number) => number,
  action: "roll" | "continue" = "continue",
) {
  if (input.storyId !== story.id || input.versionId !== story.versionId)
    throw new GameError("VALIDATION_FAILED", "Version mismatch.");
  if (input.revision !== revision)
    throw new GameError(
      "STALE_REVISION",
      "Progress changed on another device. Reload current progress.",
    );
  const c = story.pages[input.pageId]?.choices.find((c) => c.id === choiceId);
  if (
    !c ||
    input.status !== "active" ||
    (c.availableWhen && !evaluate(c.availableWhen, input))
  )
    throw new GameError("VALIDATION_FAILED", "This choice is unavailable.");
  const s: Save = JSON.parse(JSON.stringify(input));
  if (action === "roll") {
    if (
      c.outcome.kind !== "dice" ||
      (s.lastRoll?.pending && s.lastRoll.pageId === s.pageId)
    )
      throw new GameError("VALIDATION_FAILED", "This page cannot roll again.");
    const value = roll?.(c.outcome.sides);
    if (!Number.isInteger(value) || value! < 1 || value! > c.outcome.sides)
      throw new GameError(
        "VALIDATION_FAILED",
        "A trusted dice result is required.",
      );
    s.lastRoll = {
      pageId: s.pageId,
      value: value!,
      sides: c.outcome.sides,
      target: c.outcome.target,
      passed: value! >= c.outcome.target,
      pending: true,
    };
    s.revision++;
    s.updatedAt = now;
    return {
      save: s,
      event: {
        choiceId,
        label: "Rolled dice",
        from: s.pageId,
        to: s.pageId,
        outcome: "rolled",
        revision: s.revision,
        at: now,
        roll: s.lastRoll,
      },
    };
  }
  for (const cost of c.costs) {
    if ((s.items[cost.itemId] ?? 0) < cost.quantity)
      throw new GameError("VALIDATION_FAILED", "Missing required items.");
    s.items[cost.itemId] -= cost.quantity;
  }
  let success = true;
  if (c.outcome.kind === "check")
    success = evaluate(c.outcome.condition, input);
  if (c.outcome.kind === "dice") {
    if (!s.lastRoll?.pending || s.lastRoll.pageId !== s.pageId)
      throw new GameError("VALIDATION_FAILED", "Roll before continuing.");
    success = s.lastRoll.passed;
    s.lastRoll.pending = false;
  }
  const r =
    c.outcome.kind === "direct"
      ? c.outcome.route
      : success
        ? c.outcome.success
        : c.outcome.failure;
  effects(s, r.effects);
  s.pageId = r.targetPageId;
  s.revision++;
  s.updatedAt = now;
  return {
    save: enter(s, story),
    event: {
      choiceId,
      label: c.label,
      from: input.pageId,
      to: s.pageId,
      outcome: success ? "success" : "failure",
      revision: s.revision,
      at: now,
      ...(c.outcome.kind === "dice" ? { roll: s.lastRoll } : {}),
    },
  };
}
export function validateStory(value: unknown): Story {
  const story = storySchema.parse(value);
  const pages = Object.values(story.pages);
  if (pages.length > 100 || !story.pages[story.entryPageId])
    throw new Error("Invalid graph entry or size");
  const effectIds = new Set<string>();
  for (const [key, n] of Object.entries(story.pages)) {
    if (
      key !== n.id ||
      new Set(n.choices.map((c) => c.id)).size !== n.choices.length
    )
      throw new Error("Duplicate or mismatched node/choice ID");
    if (n.kind === "ending" && n.choices.length)
      throw new Error("Ending has choices");
    const pageType = n.pageType;
    if (pageType.startsWith("video") && !n.video)
      throw new Error("Video page requires media");
    if (
      (pageType === "text" || pageType === "video") &&
      n.kind !== "ending" &&
      (n.choices.length !== 1 ||
        n.choices[0].outcome.kind !== "direct" ||
        n.choices[0].availableWhen ||
        n.choices[0].costs.length)
    )
      throw new Error("Linear page requires one unconditional next output");
    if (
      pageType === "dice" &&
      (n.choices.length !== 1 ||
        n.choices[0].outcome.kind !== "dice" ||
        n.choices[0].availableWhen ||
        n.choices[0].costs.length)
    )
      throw new Error("Dice page requires one roll output");
    for (const choice of n.choices)
      if (
        choice.outcome.kind === "dice" &&
        (pageType !== "dice" || choice.outcome.target > choice.outcome.sides)
      )
        throw new Error("Invalid dice page or threshold");
    for (const e of n.entryEffects) {
      if (effectIds.has(e.id)) throw new Error("Duplicate entry effect ID");
      effectIds.add(e.id);
    }
    for (const c of n.choices)
      for (const r of c.outcome.kind === "direct"
        ? [c.outcome.route]
        : [c.outcome.success, c.outcome.failure])
        if (!story.pages[r.targetPageId]) throw new Error("Dangling route");
  }
  function checkNamespaces(v: unknown): void {
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if (
        ["keyId", "itemId", "milestoneId"].includes(k) &&
        typeof x === "string" &&
        !x.startsWith(story.id + ":")
      )
        throw new Error("Foreign namespace without import contract");
      checkNamespaces(x);
    }
  }
  checkNamespaces(story);
  const seen = new Set<string>();
  function visit(id: string) {
    if (seen.has(id)) return;
    seen.add(id);
    for (const c of story.pages[id].choices)
      for (const r of c.outcome.kind === "direct"
        ? [c.outcome.route]
        : [c.outcome.success, c.outcome.failure])
        visit(r.targetPageId);
  }
  visit(story.entryPageId);
  if (!pages.some((n) => seen.has(n.id) && n.kind === "ending"))
    throw new Error("No reachable ending");
  return story;
}
