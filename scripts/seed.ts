import "./local-env";
import { createHash } from "node:crypto";
import { db, auth } from "../services/api/firebase";
import { stories, branches, catalogue } from "../fixtures/stories";
import { baseStats } from "../packages/domain/index";
for (const story of stories) {
  const ref = db.doc(`stories/${story.id}/versions/${story.versionId}`);
  const hash = createHash("sha256").update(JSON.stringify(story)).digest("hex");
  await db.runTransaction(async (tx) => {
    const old = await tx.get(ref);
    if (old.exists) {
      if (old.data()!.manifestHash !== hash)
        throw new Error("Immutable fixture changed: publish a new version ID.");
      return;
    }
    const { nodes, ...manifest } = story;
    tx.create(ref, { ...manifest, manifestHash: hash, ready: true });
    for (const n of Object.values(nodes))
      tx.create(ref.collection("nodes").doc(n.id), n);
  });
  await db
    .doc(`stories/${story.id}`)
    .set({ publishedVersionId: story.versionId });
}
await db.doc("catalogue/glass-harbor").set(catalogue);
for (const branch of branches)
  await db.doc(`branches/${branch.id}`).set(branch);
await db.doc("placements/harbor-market").set({
  nominatedBranchId: "bell-diver",
  holderUid: "branch-author-1",
  revision: 0,
});
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
  const ref = db.doc(`playerProfiles/${uid}`);
  if (!(await ref.get()).exists)
    await ref.create({
      stats: { ...baseStats, agility },
      rulesetVersion: "prototype-1",
      status: "active",
    });
}
console.log(
  "Local fixtures ready. player@storybranch.test / HarborDemo123! (agility 5); progressed@storybranch.test (agility 8).",
);
