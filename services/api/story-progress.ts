import type { Transaction } from "firebase-admin/firestore";
import type { Save, Story } from "../../packages/contracts/index";
import type { AchievementDefinition } from "../../packages/contracts/achievements";
import { db } from "./firebase";

const progressRef = (uid: string, storyId: string) =>
  db.doc(`users/${uid}/storyProgress/${storyId}`);

// Reads only the pinned edition's allowlisted definitions, never another Story.
export async function storyProgressSnapshot(
  tx: Transaction,
  uid: string,
  story: Story,
) {
  const definitions = story.progression?.keys ?? [];
  const grants = await Promise.all(
    definitions.map((k) =>
      tx.get(progressRef(uid, story.id).collection("keys").doc(k.keyId)),
    ),
  );
  return {
    version: 1 as const,
    keys: definitions.filter((_, i) => grants[i].exists).map((k) => k.keyId),
  };
}

// Prepare all reads before any award writes, including the achievement service.
// The returned writer participates in the same transaction as save/event/receipt.
export async function prepareStoryProgress(
  tx: Transaction,
  uid: string,
  story: Story,
  save: Save,
  achievement?: AchievementDefinition,
) {
  if (!save.completion || save.completion.revision !== save.revision)
    return () => {};
  const root = progressRef(uid, story.id);
  const receipt = root.collection("completions").doc(save.id);
  const previous = await tx.get(receipt);
  if (previous.exists) {
    save.completion.storyKeys = previous.data()!.storyKeys;
    return () => {};
  }
  const state = await tx.get(root);
  const completions = Math.min(
    Number.MAX_SAFE_INTEGER,
    (state.data()?.completions ?? 0) + 1,
  );
  const eligible = (story.progression?.keys ?? []).filter((k) =>
    k.afterCompletions !== undefined
      ? k.afterCompletions <= completions
      : k.achievementStoryNodeId === save.storyNodeId &&
        achievement?.status === "approved" &&
        achievement.storyId === story.id &&
        achievement.versionId === story.versionId &&
        achievement.storyNodeId === save.storyNodeId &&
        !!achievement.rewardKeys?.some(
          (r) => r.keyId === k.keyId && r.label === k.label,
        ),
  );
  const refs = eligible.map((k) => root.collection("keys").doc(k.keyId));
  const existing = await Promise.all(refs.map((ref) => tx.get(ref)));
  const newlyGranted = eligible.filter((_, i) => !existing[i].exists);
  const storyKeys = newlyGranted.map(({ keyId, label }) => ({ keyId, label }));
  save.completion.storyKeys = storyKeys;
  return () => {
    tx.set(root, {
      version: 1,
      completions,
      storyTitle: story.title,
      updatedAt: save.updatedAt,
    });
    tx.create(receipt, {
      version: 1,
      runId: save.id,
      versionId: save.versionId,
      at: save.updatedAt,
      storyKeys,
    });
    eligible.forEach((definition, i) => {
      if (!existing[i].exists)
        tx.create(refs[i], {
          version: 1,
          ...definition,
          ...(definition.achievementStoryNodeId && achievement
            ? {
                achievement: {
                  definitionId: achievement.id,
                  definitionRevision: achievement.revision,
                  achievementId: achievement.achievementId,
                },
              }
            : {}),
          runId: save.id,
          versionId: save.versionId,
          at: save.updatedAt,
        });
    });
  };
}
