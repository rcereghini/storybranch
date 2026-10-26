import type { Transaction } from "firebase-admin/firestore";
import { GameError, type Story } from "../../packages/contracts/index";
import type {
  AchievementDefinition,
  AchievementClaim,
} from "../../packages/contracts/achievements";
import { db } from "./firebase";
import {
  liveAccountKeys as promotionalFacts,
  validateAccountKeys as validatePromotional,
} from "./promotional-keys";

const promotionalStory = (story: Story): Story => ({
  ...story,
  accountKeys: {
    version: 1,
    keys: (story.accountKeys?.keys ?? []).filter(
      (k) => k.source !== "achievement",
    ),
  },
});
const achievementKeys = (story: Story) =>
  (story.accountKeys?.keys ?? []).filter((k) => k.source === "achievement");
const definitionRef = (id: string) => db.doc(`achievementDefinitions/${id}`);
const authorized = (
  d: AchievementDefinition | undefined,
  story: Story,
  issuer: string | undefined,
) =>
  !!issuer &&
  d?.status === "approved" &&
  d.creatorUid === issuer &&
  !!d.consumerStoryIds?.includes(story.id);

export async function validateAccountKeys(
  tx: Transaction,
  story: Story,
  uid: string,
) {
  await validatePromotional(tx, promotionalStory(story), uid);
  for (const key of achievementKeys(story)) {
    const definition = (
      await tx.get(definitionRef(key.definitionId))
    ).data() as AchievementDefinition | undefined;
    if (!authorized(definition, story, uid))
      throw new GameError(
        "VALIDATION_FAILED",
        "Choose an approved achievement authorized for this Story.",
      );
  }
}

// Read only the declared dependencies. Facts are never stored in a run or cache.
export async function liveAccountKeys(
  tx: Transaction,
  uid: string,
  story: Story,
): Promise<string[]> {
  const facts = await promotionalFacts(tx, uid, promotionalStory(story));
  const keys = achievementKeys(story);
  if (!keys.length) return facts;
  const [root, ...definitions] = await tx.getAll(
    db.doc(`stories/${story.id}`),
    ...[...new Set(keys.map((k) => k.definitionId))].map(definitionRef),
  );
  const permitted = definitions
    .map((d) => d.data() as AchievementDefinition | undefined)
    .filter((d): d is AchievementDefinition =>
      authorized(d, story, root.data()?.creatorUid),
    );
  if (!permitted.length) return facts;
  const claims = await tx.getAll(
    ...[...new Set(permitted.map((d) => d.achievementId))].map((id) =>
      db.doc(`users/${uid}/achievementClaims/${id}`),
    ),
  );
  const earned = new Map(
    claims
      .filter((c) => c.exists)
      .map((c) => [c.id, c.data() as AchievementClaim]),
  );
  const originalById = new Map(
    definitions.map((d) => [
      d.id,
      d.data() as AchievementDefinition | undefined,
    ]),
  );
  const originalIds = [
    ...new Set([...earned.values()].map((c) => c.definitionId)),
  ].filter((id) => !originalById.has(id));
  const originals = originalIds.length
    ? await tx.getAll(...originalIds.map(definitionRef))
    : [];
  for (const d of originals)
    originalById.set(d.id, d.data() as AchievementDefinition | undefined);
  for (const d of permitted) {
    const claim = earned.get(d.achievementId);
    const original = claim && originalById.get(claim.definitionId);
    if (
      !claim ||
      original?.status !== "approved" ||
      original.creatorUid !== d.creatorUid ||
      original.achievementId !== d.achievementId ||
      original.storyId !== d.storyId ||
      original.storyNodeId !== d.storyNodeId ||
      claim.id !== d.achievementId ||
      claim.storyId !== original.storyId ||
      claim.storyNodeId !== original.storyNodeId ||
      claim.versionId !== original.versionId
    )
      continue;
    facts.push(
      ...keys.filter((k) => k.definitionId === d.id).map((k) => k.keyId),
    );
  }
  return [...new Set(facts)];
}
