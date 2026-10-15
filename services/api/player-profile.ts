import type { Firestore } from "firebase-admin/firestore";
import { baseStats } from "../../packages/domain/index";
import { user } from "./paths";
export async function ensurePlayerProfile(
  db: Pick<Firestore, "doc" | "runTransaction">,
  uid: string,
) {
  const ref = db.doc(user(uid));
  await db.runTransaction(async (tx) => {
    if (!(await tx.get(ref)).exists)
      tx.create(ref, {
        stats: { ...baseStats, agility: 5 },
        rulesetVersion: "prototype-1",
        status: "active",
      });
  });
}
