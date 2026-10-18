import type { Firestore } from "firebase-admin/firestore";
import { baseStats } from "../../packages/domain/index";
import type { Features } from "../../packages/contracts/profile";
import { user } from "./paths";
// A new live account has no feature flags; local emulator accounts are
// created with every feature so development needs no setup.
export async function ensurePlayerProfile(
  db: Pick<Firestore, "doc" | "runTransaction">,
  uid: string,
  features?: Features,
) {
  const ref = db.doc(user(uid));
  await db.runTransaction(async (tx) => {
    if (!(await tx.get(ref)).exists)
      tx.create(ref, {
        stats: { ...baseStats, agility: 5 },
        rulesetVersion: "prototype-1",
        status: "active",
        ...(features ? { features } : {}),
      });
  });
}
