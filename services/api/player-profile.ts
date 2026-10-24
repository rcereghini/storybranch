import type { Firestore } from "firebase-admin/firestore";
import { baseStats } from "../../packages/domain/index";
import type { Features } from "../../packages/contracts/profile";
import { user } from "./paths";
// A new live account has no feature flags; local emulator accounts are
// created with every member feature so development needs no setup.
// Resolves true only when this call created the profile.
export async function ensurePlayerProfile(
  db: Pick<Firestore, "doc" | "runTransaction">,
  uid: string,
  features?: Features,
) {
  const ref = db.doc(user(uid));
  return db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return false;
    tx.create(ref, {
      stats: { ...baseStats, agility: 5 },
      rulesetVersion: "prototype-1",
      status: "active",
      ...(features ? { features } : {}),
    });
    return true;
  });
}
