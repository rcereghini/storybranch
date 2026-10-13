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
  const n = story.nodes[s.nodeId];
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
      nodeId: story.entryNodeId,
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
) {
  if (input.storyId !== story.id || input.versionId !== story.versionId)
    throw new GameError("VALIDATION_FAILED", "Version mismatch.");
  if (input.revision !== revision)
    throw new GameError(
      "STALE_REVISION",
      "Progress changed on another device. Reload current progress.",
    );
  const c = story.nodes[input.nodeId]?.choices.find((c) => c.id === choiceId);
  if (
    !c ||
    input.status !== "active" ||
    (c.availableWhen && !evaluate(c.availableWhen, input))
  )
    throw new GameError("VALIDATION_FAILED", "This choice is unavailable.");
  const s: Save = JSON.parse(JSON.stringify(input));
  for (const cost of c.costs) {
    if ((s.items[cost.itemId] ?? 0) < cost.quantity)
      throw new GameError("VALIDATION_FAILED", "Missing required items.");
    s.items[cost.itemId] -= cost.quantity;
  }
  const success =
    c.outcome.kind === "direct" || evaluate(c.outcome.condition, input);
  const r =
    c.outcome.kind === "direct"
      ? c.outcome.route
      : success
        ? c.outcome.success
        : c.outcome.failure;
  effects(s, r.effects);
  s.nodeId = r.targetNodeId;
  s.revision++;
  s.updatedAt = now;
  return {
    save: enter(s, story),
    event: {
      choiceId,
      label: c.label,
      from: input.nodeId,
      to: s.nodeId,
      outcome: success ? "success" : "failure",
      revision: s.revision,
      at: now,
    },
  };
}
export function validateStory(value: unknown): Story {
  const story = storySchema.parse(value);
  const nodes = Object.values(story.nodes);
  if (nodes.length > 100 || !story.nodes[story.entryNodeId])
    throw new Error("Invalid graph entry or size");
  const effectIds = new Set<string>();
  for (const [key, n] of Object.entries(story.nodes)) {
    if (
      key !== n.id ||
      new Set(n.choices.map((c) => c.id)).size !== n.choices.length
    )
      throw new Error("Duplicate or mismatched node/choice ID");
    if (n.kind === "ending" && n.choices.length)
      throw new Error("Ending has choices");
    for (const e of n.entryEffects) {
      if (effectIds.has(e.id)) throw new Error("Duplicate entry effect ID");
      effectIds.add(e.id);
    }
    for (const c of n.choices)
      for (const r of c.outcome.kind === "direct"
        ? [c.outcome.route]
        : [c.outcome.success, c.outcome.failure])
        if (!story.nodes[r.targetNodeId]) throw new Error("Dangling route");
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
    for (const c of story.nodes[id].choices)
      for (const r of c.outcome.kind === "direct"
        ? [c.outcome.route]
        : [c.outcome.success, c.outcome.failure])
        visit(r.targetNodeId);
  }
  visit(story.entryNodeId);
  if (!nodes.some((n) => seen.has(n.id) && n.kind === "ending"))
    throw new Error("No reachable ending");
  return story;
}
