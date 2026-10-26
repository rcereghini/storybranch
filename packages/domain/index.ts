import {
  storySchema,
  comicLimits,
  GameError,
  type Story,
  type Save,
  type Stats,
  type Condition,
  type Effect,
  type Choice,
} from "../contracts/index";
// Every route a choice can take, whichever outcome the server selects.
export const routesOf = (c: Choice) =>
  c.outcome.kind === "direct"
    ? [c.outcome.route]
    : c.outcome.kind === "reveal"
      ? c.outcome.results.map((r) => r.route)
      : [c.outcome.success, c.outcome.failure];
// A quiz result is a StoryNode a reveal StoryNode can send the player to.
export const isResultStoryNode = (story: Story, storyNodeId: string) =>
  Object.values(story.storyNodes).some((p) =>
    p.choices.some(
      (c) =>
        c.outcome.kind === "reveal" &&
        c.outcome.results.some(
          (r) => r.route.targetStoryNodeId === storyNodeId,
        ),
    ),
  );
// Highest score wins; a tie goes to the result listed first.
function revealed(
  results: Extract<Choice["outcome"], { kind: "reveal" }>["results"],
  scores: Record<string, number>,
) {
  return results.reduce((best, r) =>
    (scores[r.scoreId] ?? 0) > (scores[best.scoreId] ?? 0) ? r : best,
  );
}
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
        s.lastRoll?.storyNodeId === c.storyNodeId &&
        compare(s.lastRoll.value, c.op, c.value)
      );
    case "stat":
      return compare(s.stats[c.stat], c.op, c.value);
    case "key":
      if (c.scope === "import")
        return (
          (s.keyImportSnapshot?.keys.some(
            (k) => k.keyId === c.keyId && k.present,
          ) ?? false) === c.present
        );
      return (
        (c.scope === "story"
          ? (s.storyProgressSnapshot?.keys ?? [])
          : s.keys
        ).includes(c.keyId) === c.present
      );
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
      case "score": {
        s.scores ??= {};
        s.scores[e.scoreId] = Math.max(
          0,
          Math.min(999, (s.scores[e.scoreId] ?? 0) + e.delta),
        );
        break;
      }
    }
    if (once) s.appliedEntryEffects.push(e.id);
  }
}
function enter(s: Save, story: Story) {
  const n = story.storyNodes[s.storyNodeId];
  if (!n) throw new GameError("VALIDATION_FAILED", "Missing destination.");
  effects(s, n.entryEffects, true);
  s.status = n.kind === "ending" ? "completed" : "active";
  if (s.status === "completed" && !s.completion) {
    const rewards = (n.leaf?.rewards ?? []).map((reward) => {
      if (!reward.keyId.startsWith(story.id + ":"))
        throw new GameError(
          "VALIDATION_FAILED",
          "StoryLeaf rewards must belong to this Story.",
        );
      const newlyGranted = !s.keys.includes(reward.keyId);
      if (newlyGranted) s.keys.push(reward.keyId);
      return { ...reward, newlyGranted };
    });
    s.completion = {
      version: 1,
      storyNodeId: n.id,
      revision: s.revision,
      at: s.updatedAt,
      summary: n.leaf?.summary ?? "",
      rewards,
    };
  }
  return s;
}
export function start(
  story: Story,
  id: string,
  uid: string,
  stats: Stats,
  now: number,
  parent?: Save,
  progress?: Save["storyProgressSnapshot"],
  imports?: Save["keyImportSnapshot"],
): Save {
  return enter(
    {
      id,
      playerUid: uid,
      storyId: story.id,
      versionId: story.versionId,
      rulesetVersion: story.rulesetVersion,
      storyNodeId: story.entryStoryNodeId,
      revision: 0,
      status: "active",
      statsSnapshot: { ...stats },
      stats: { ...stats },
      keys: [...(story.trunkContext?.initialKeys ?? [])],
      ...(imports ? { keyImportSnapshot: structuredClone(imports) } : {}),
      ...(progress
        ? {
            storyProgressSnapshot: {
              version: 1 as const,
              keys: [...progress.keys],
            },
          }
        : {}),
      items: {},
      health: 100,
      milestones: [],
      appliedEntryEffects: [],
      scores: {},
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
  const c = story.storyNodes[input.storyNodeId]?.choices.find(
    (c) => c.id === choiceId,
  );
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
      (s.lastRoll?.pending && s.lastRoll.storyNodeId === s.storyNodeId)
    )
      throw new GameError(
        "VALIDATION_FAILED",
        "This StoryNode cannot roll again.",
      );
    const value = roll?.(c.outcome.sides);
    if (!Number.isInteger(value) || value! < 1 || value! > c.outcome.sides)
      throw new GameError(
        "VALIDATION_FAILED",
        "A trusted dice result is required.",
      );
    s.lastRoll = {
      storyNodeId: s.storyNodeId,
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
        from: s.storyNodeId,
        to: s.storyNodeId,
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
    if (!s.lastRoll?.pending || s.lastRoll.storyNodeId !== s.storyNodeId)
      throw new GameError("VALIDATION_FAILED", "Roll before continuing.");
    success = s.lastRoll.passed;
    s.lastRoll.pending = false;
  }
  const r =
    c.outcome.kind === "direct"
      ? c.outcome.route
      : c.outcome.kind === "reveal"
        ? revealed(c.outcome.results, input.scores ?? {}).route
        : success
          ? c.outcome.success
          : c.outcome.failure;
  effects(s, r.effects);
  s.storyNodeId = r.targetStoryNodeId;
  s.revision++;
  s.updatedAt = now;
  return {
    save: enter(s, story),
    event: {
      choiceId,
      label: c.label,
      from: input.storyNodeId,
      to: s.storyNodeId,
      outcome: success ? "success" : "failure",
      revision: s.revision,
      at: now,
      ...(c.outcome.kind === "dice" ? { roll: s.lastRoll } : {}),
    },
  };
}
// A comic's panels replace the StoryNode's video and photo; every panel needs an
// image, and a grid must stay square. Studio shows the same message inline.
export function comicIssue(
  storyNode: Story["storyNodes"][string],
): string | null {
  const { comic } = storyNode;
  if (!comic || storyNode.video || storyNode.image)
    return "A comic StoryNode shows only its panels.";
  const count = comic.panels.length;
  const [min, max] = comicLimits.scroll;
  if (comic.layout === "grid" && !comicLimits.grid.includes(count as 4 | 9))
    return "A square grid needs 4 or 9 panels.";
  if (count < min || count > max)
    return `A strip needs ${min} to ${max} panels.`;
  if (new Set(comic.panels.map((p) => p.id)).size !== count)
    return "Each panel needs its own ID.";
  const empty = comic.panels.findIndex((p) => !p.image);
  return empty >= 0 ? `Add an image to panel ${empty + 1}.` : null;
}
export function validateStory(value: unknown): Story {
  const story = storySchema.parse(value);
  const storyNodes = Object.values(story.storyNodes);
  if (storyNodes.length > 100 || !story.storyNodes[story.entryStoryNodeId])
    throw new Error("Invalid graph entry or size");
  const effectIds = new Set<string>();
  if (
    story.trunkContext?.initialKeys.some(
      (key) => !key.startsWith(story.id + ":"),
    )
  )
    throw new Error("Foreign namespace without import contract");
  for (const [key, n] of Object.entries(story.storyNodes)) {
    if (
      key !== n.id ||
      new Set(n.choices.map((c) => c.id)).size !== n.choices.length
    )
      throw new Error("Duplicate or mismatched node/choice ID");
    if (n.kind === "ending" && n.choices.length)
      throw new Error("Ending has choices");
    if (n.leaf && n.kind !== "ending")
      throw new Error("Only a StoryLeaf can configure completion rewards.");
    const storyNodeType = n.storyNodeType;
    if (n.videoAdvance && storyNodeType !== "video")
      throw new Error(
        "Only linear video StoryNodes can configure automatic advance.",
      );
    if (storyNodeType.startsWith("video") && !n.video)
      throw new Error("Video StoryNode requires media");
    if (n.comic && storyNodeType !== "comic")
      throw new Error("Only a comic StoryNode can have panels");
    const comic = storyNodeType === "comic" && comicIssue(n);
    if (comic) throw new Error(`${n.title}: ${comic}`);
    if (
      (storyNodeType === "text" ||
        storyNodeType === "video" ||
        storyNodeType === "comic") &&
      n.kind !== "ending" &&
      (n.choices.length !== 1 ||
        n.choices[0].outcome.kind !== "direct" ||
        n.choices[0].availableWhen ||
        n.choices[0].costs.length)
    )
      throw new Error(
        "Linear StoryNode requires one unconditional next output",
      );
    if (
      storyNodeType === "dice" &&
      (n.choices.length !== 1 ||
        n.choices[0].outcome.kind !== "dice" ||
        n.choices[0].availableWhen ||
        n.choices[0].costs.length)
    )
      throw new Error("Dice StoryNode requires one roll output");
    if (
      storyNodeType === "reveal" &&
      (n.choices.length !== 1 ||
        n.choices[0].outcome.kind !== "reveal" ||
        n.choices[0].availableWhen ||
        n.choices[0].costs.length)
    )
      throw new Error("Reveal StoryNode requires one reveal output");
    for (const choice of n.choices) {
      if (
        choice.outcome.kind === "dice" &&
        (storyNodeType !== "dice" ||
          choice.outcome.target > choice.outcome.sides)
      )
        throw new Error("Invalid dice StoryNode or threshold");
      if (choice.outcome.kind === "reveal") {
        const { results } = choice.outcome;
        if (storyNodeType !== "reveal")
          throw new Error("Only a reveal StoryNode can reveal a result");
        if (new Set(results.map((r) => r.scoreId)).size !== results.length)
          throw new Error("Each result needs its own score");
        if (
          results.some(
            (r) =>
              story.storyNodes[r.route.targetStoryNodeId]?.kind === "scene",
          )
        )
          throw new Error("A quiz result must be an ending");
      }
    }
    for (const e of n.entryEffects) {
      if (effectIds.has(e.id)) throw new Error("Duplicate entry effect ID");
      effectIds.add(e.id);
    }
    for (const c of n.choices)
      for (const r of routesOf(c))
        if (!story.storyNodes[r.targetStoryNodeId])
          throw new Error("Dangling route");
  }
  function checkNamespaces(v: unknown): void {
    if (!v || typeof v !== "object") return;
    if (
      "kind" in v &&
      v.kind === "key" &&
      "scope" in v &&
      v.scope === "import" &&
      (!("keyId" in v) ||
        !story.keyImports?.keys.some((k) => k.keyId === v.keyId))
    )
      throw new Error("Imported key conditions require a declared alias.");
    if (
      "kind" in v &&
      v.kind === "key" &&
      "scope" in v &&
      v.scope === "story" &&
      (!("keyId" in v) ||
        !story.progression?.keys.some((k) => k.keyId === v.keyId))
    )
      throw new Error(
        "Story-scoped key conditions require a declared persistent key.",
      );
    for (const [k, x] of Object.entries(v)) {
      if (
        ["keyId", "itemId", "milestoneId", "scoreId"].includes(k) &&
        typeof x === "string" &&
        !x.startsWith(story.id + ":")
      )
        throw new Error("Foreign namespace without import contract");
      checkNamespaces(x);
    }
  }
  checkNamespaces(story);
  if (
    new Set(
      [
        ...(story.progression?.keys ?? []),
        ...(story.runKeyExports?.keys ?? []),
      ].flatMap((k) => k.exportToStoryIds ?? []),
    ).size > 20
  )
    throw new Error("At most 20 distinct key export destinations per Story.");
  for (const k of story.keyImports?.keys ?? []) {
    if (
      k.sourceStoryId === story.id ||
      !k.sourceKeyId.startsWith(k.sourceStoryId + ":")
    )
      throw new Error("Imports require another Story's namespaced key.");
  }
  const seen = new Set<string>();
  function visit(id: string) {
    if (seen.has(id)) return;
    seen.add(id);
    for (const c of story.storyNodes[id].choices)
      for (const r of routesOf(c)) visit(r.targetStoryNodeId);
  }
  visit(story.entryStoryNodeId);
  if (!storyNodes.some((n) => seen.has(n.id) && n.kind === "ending"))
    throw new Error("No reachable ending");
  return story;
}
