import { legacyStoryStorage } from "../packages/contracts/legacy-story-format";
import "./local-env";
import { createHash } from "node:crypto";
import { db, auth, config } from "../services/api/firebase";
import { user } from "../services/api/paths";
import { stories, branches, catalogue } from "../fixtures/stories";
import {
  storyNodeStories,
  storyNodeCatalogue,
} from "../fixtures/story-node-stories";
import { baseStats } from "../packages/domain/index";
import { allFeatures, memberFeatures } from "../packages/contracts/profile";
async function fixture(path: string, data: Record<string, unknown>) {
  const ref = db.doc(path);
  if (config.mode === "emulator") {
    await ref.set(data);
    return;
  }
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (!existing.exists) tx.create(ref, data);
    // Promote only the known retired prototype pointers, never a newer publication.
    else if (
      (["v1", legacyStoryStorage.fixtureEdition].includes(
        existing.data()?.publishedVersionId,
      ) &&
        data.publishedVersionId === "story-nodes-v1") ||
      (["v1", legacyStoryStorage.fixtureEdition].includes(
        existing.data()?.versionId,
      ) &&
        data.versionId === "story-nodes-v1")
    )
      tx.set(ref, data);
  });
}
for (const story of [...stories, ...storyNodeStories]) {
  const ref = db.doc(`stories/${story.id}/versions/${story.versionId}`);
  const hash = createHash("sha256").update(JSON.stringify(story)).digest("hex");
  await db.runTransaction(async (tx) => {
    const old = await tx.get(ref);
    if (old.exists) {
      if (old.data()!.manifestHash !== hash)
        throw new Error("Immutable fixture changed: publish a new version ID.");
      return;
    }
    const { storyNodes, ...manifest } = story;
    tx.create(ref, { ...manifest, manifestHash: hash, ready: true });
    for (const n of Object.values(storyNodes))
      tx.create(ref.collection("storyNodes").doc(n.id), n);
  });
  await fixture(`stories/${story.id}`, { publishedVersionId: story.versionId });
}
await fixture("catalogue/glass-harbor", catalogue);
for (const entry of storyNodeCatalogue)
  await fixture(`catalogue/${entry.id}`, entry);
for (const branch of branches) await fixture(`branches/${branch.id}`, branch);
await fixture("placements/harbor-market", {
  nominatedBranchId: "bell-diver",
  holderUid: "branch-author-1",
  revision: 0,
});
if (config.mode === "emulator") {
  for (const [uid, agility] of [
    ["player", 5],
    ["progressed", 8],
    ["free-creator", 5],
    ["paid-test-creator", 5],
    ["branch-author-1", 5],
    ["branch-author-2", 5],
    ["moderator", 5],
  ] as const) {
    try {
      await auth.getUser(uid);
    } catch {
      await auth.createUser({
        uid,
        email: `${uid}@storybranch.test`,
        password: "HarborDemo123!",
        displayName: uid,
      });
    }
    const ref = db.doc(user(uid));
    if (!(await ref.get()).exists)
      await ref.create({
        stats: { ...baseStats, agility },
        rulesetVersion: "prototype-1",
        status: "active",
        features: uid === "player" ? allFeatures : memberFeatures,
      });
    // Local accounts from before feature flags get them too; player is the
    // local admin.
    else
      await ref.set(
        { features: uid === "player" ? allFeatures : memberFeatures },
        { merge: true },
      );
  }
  console.log(
    "Local fixtures ready. player@storybranch.test / HarborDemo123! (agility 5); progressed@storybranch.test (agility 8).",
  );
} else
  console.log(
    "Storybranch sample content ready in storybranch/app. No Auth users or demo passwords were created.",
  );
