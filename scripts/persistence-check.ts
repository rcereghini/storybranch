import "./local-env";
import { db, auth } from "../services/api/firebase";
import { createHash } from "node:crypto";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const saves = await db
  .collectionGroup("playthroughs")
  .orderBy("__name__")
  .get();
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
const snapshot = {
  saveCount: saves.size,
  saveHash: createHash("sha256")
    .update(canonical(saves.docs.map((d) => d.data())))
    .digest("hex"),
  receiptCount: (await db.collectionGroup("receipts").count().get()).data()
    .count,
  authCount: (await auth.listUsers()).users.length,
};
await mkdir("test-results", { recursive: true });
if (process.argv[2] === "capture")
  await writeFile("test-results/persistence.json", JSON.stringify(snapshot));
else
  assert.deepEqual(
    snapshot,
    JSON.parse(await readFile("test-results/persistence.json", "utf8")),
  );
console.log(
  process.argv[2] === "capture"
    ? "Captured persistence snapshot."
    : "Restart persistence PASS: saves byte-equivalent, receipt count and auth identities preserved.",
  snapshot,
);
