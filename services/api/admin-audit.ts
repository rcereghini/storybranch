import { createHash, randomUUID } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { GameError } from "../../packages/contracts/index";
import type { AdminAuditEntry } from "../../packages/contracts/admin";
import { db } from "./firebase";
import * as paths from "./paths";

export const AUDIT = "adminAudit";
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");

// Runs one admin change in a transaction with an idempotency receipt and an
// audit entry, so a retry returns the first result instead of acting twice.
export async function run(
  actorUid: string,
  actorEmail: string | null,
  key: string,
  command: unknown,
  apply: (tx: Transaction) => Promise<{
    audit: Pick<AdminAuditEntry, "action" | "target" | "change">;
    result: unknown;
  }>,
) {
  const fingerprint = digest(JSON.stringify(command));
  const receipt = db.doc(paths.receipt(actorUid, "admin", key));
  return db.runTransaction(async (tx) => {
    const previous = await tx.get(receipt);
    if (previous.exists) {
      if (previous.data()!.fingerprint !== fingerprint)
        throw new GameError(
          "IDEMPOTENCY_CONFLICT",
          "This request key was used for another change.",
        );
      return previous.data()!.result;
    }
    const { audit, result } = await apply(tx);
    const at = Date.now();
    tx.create(db.collection(AUDIT).doc(randomUUID()), {
      at,
      actorUid,
      actorEmail,
      ...audit,
      change: JSON.parse(JSON.stringify(audit.change)),
    });
    tx.create(receipt, {
      actor: actorUid,
      fingerprint,
      result,
      at,
      ...paths.receiptExpiry(at),
    });
    return result;
  });
}
