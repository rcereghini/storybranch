import type {
  DocumentData,
  DocumentReference,
  Firestore,
} from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";

// One-off copy from the old prefixed layout (storybranch/app/...) to the
// per-user layout in services/api/paths.ts. It only creates records, or moves
// a save forward to a higher revision; it never deletes the old records and
// never overwrites a newer one, so it is safe to run again after the new code
// is live to pick up anything written in between.
export const OLD_ROOT = "storybranch/app";

export type Outcome =
  | "create" // missing in the new layout
  | "update" // a save that moved on since the last copy
  | "same" // already copied, identical
  | "kept" // new layout already has a different (newer) version
  | "conflict"; // an immutable edition differs: needs a person
export type Report = {
  apply: boolean;
  counts: Record<string, Partial<Record<Outcome, number>>>;
  conflicts: string[];
  unmapped: string[];
};

type Doc = { path: string; data: DocumentData };

// Every document under the old root, with paths relative to it.
async function walk(db: Firestore): Promise<Doc[]> {
  const found: Doc[] = [];
  const visit = async (ref: DocumentReference, relative: string) => {
    const snapshot = await ref.get();
    if (snapshot.exists) found.push({ path: relative, data: snapshot.data()! });
    for (const sub of await ref.listCollections())
      for (const child of await sub.listDocuments())
        await visit(child, `${relative}/${sub.id}/${child.id}`);
  };
  for (const collection of await db.doc(OLD_ROOT).listCollections())
    for (const ref of await collection.listDocuments())
      await visit(ref, `${collection.id}/${ref.id}`);
  return found;
}

// New path and kind for an old record, or null when it has no home.
function place(
  doc: Doc,
  owners: Map<string, string>,
): { path: string; kind: string; data: DocumentData } | null {
  const s = doc.path.split("/");
  const shared = ["stories", "catalogue", "branches", "placements"];
  if (shared.includes(s[0]))
    return { path: doc.path, kind: s[0], data: doc.data };
  if (s[0] === "playerProfiles" && s.length === 2)
    return { path: `users/${s[1]}`, kind: "users", data: doc.data };
  if (s[0] === "playthroughs") {
    const uid = owners.get(s[1]);
    if (!uid) return null;
    const rest = s.slice(1).join("/");
    return {
      path: `users/${uid}/playthroughs/${rest}`,
      kind: s.length === 2 ? "playthroughs" : "events",
      data: doc.data,
    };
  }
  if (s[0] === "creatorDrafts" && s[2] === "stories" && s.length === 4)
    return {
      path: `users/${s[1]}/drafts/${s[3]}`,
      kind: "drafts",
      data: doc.data,
    };
  if (s[0] === "commandReceipts" && s.length === 2 && doc.data.actor)
    return {
      path: `users/${doc.data.actor}/receipts/${s[1]}`,
      kind: "receipts",
      data: {
        ...doc.data,
        expireAt: Timestamp.fromMillis(
          Number(doc.data.at ?? Date.now()) + 30 * 24 * 60 * 60 * 1000,
        ),
      },
    };
  // Uploaded clips would also need their Storage files moved; none exist on
  // the live project, so they are reported rather than half-migrated.
  return null;
}

// Key order differs between writes, so compare a sorted serialization.
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
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

export async function migrateLayout(
  db: Firestore,
  { apply }: { apply: boolean },
): Promise<Report> {
  const docs = await walk(db);
  const owners = new Map<string, string>();
  for (const d of docs) {
    const s = d.path.split("/");
    if (s[0] === "playthroughs" && s.length === 2 && d.data.playerUid)
      owners.set(s[1], d.data.playerUid);
  }
  const report: Report = { apply, counts: {}, conflicts: [], unmapped: [] };
  const writes: Array<{ path: string; data: DocumentData }> = [];
  for (const doc of docs) {
    const target = place(doc, owners);
    if (!target) {
      report.unmapped.push(doc.path);
      continue;
    }
    const existing = await db.doc(target.path).get();
    let outcome: Outcome;
    if (!existing.exists) outcome = "create";
    else if (same(existing.data(), target.data)) outcome = "same";
    else if (
      target.kind === "playthroughs" &&
      Number(target.data.revision) > Number(existing.data()!.revision)
    )
      outcome = "update";
    else if (target.kind === "stories" && target.path.includes("/versions/")) {
      outcome = "conflict";
      report.conflicts.push(target.path);
    } else outcome = "kept";
    const counts = (report.counts[target.kind] ??= {});
    counts[outcome] = (counts[outcome] ?? 0) + 1;
    if (outcome === "create" || outcome === "update") writes.push(target);
  }
  if (apply && !report.unmapped.length && !report.conflicts.length)
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch();
      for (const w of writes.slice(i, i + 400))
        batch.set(db.doc(w.path), w.data);
      await batch.commit();
    }
  return report;
}
