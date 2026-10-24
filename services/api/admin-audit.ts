import { createHash, randomUUID } from "node:crypto";
import type { DocumentSnapshot, Transaction } from "firebase-admin/firestore";
import { GameError } from "../../packages/contracts/index";
import type {
  AdminAuditEntry,
  AdminAuditPage,
  AdminAuditQuery,
} from "../../packages/contracts/admin";
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

// The activity log, newest first, 50 entries a page. Filtering by type or
// text would need a composite index alongside the time order, so the server
// walks the log in time order and filters as it goes, reading at most 1,000
// entries per page; the cursor is the last entry it read.
const pageSize = 50;
const maxScan = 1000;
export async function auditPage(
  query: AdminAuditQuery,
): Promise<AdminAuditPage> {
  const q = query.q.toLowerCase();
  let last: DocumentSnapshot | undefined;
  if (query.cursor) {
    last = await db.collection(AUDIT).doc(query.cursor).get();
    if (!last.exists)
      throw new GameError(
        "VALIDATION_FAILED",
        "That page is no longer available.",
      );
  }
  const items: AdminAuditEntry[] = [];
  let scanned = 0;
  let exhausted = false;
  while (items.length < pageSize && scanned < maxScan) {
    let batch = db.collection(AUDIT).orderBy("at", "desc").limit(200);
    if (last) batch = batch.startAfter(last);
    const docs = (await batch.get()).docs;
    for (const doc of docs) {
      last = doc;
      scanned++;
      const entry = { id: doc.id, ...doc.data() } as AdminAuditEntry;
      if (
        (!query.action || entry.action === query.action) &&
        (!q ||
          `${entry.actorEmail ?? ""} ${entry.actorUid} ${entry.target}`
            .toLowerCase()
            .includes(q))
      )
        items.push(entry);
      if (items.length === pageSize) break;
    }
    if (docs.length < 200 && items.length < pageSize) {
      exhausted = true;
      break;
    }
  }
  return { items, nextCursor: exhausted || !last ? null : last.id };
}
