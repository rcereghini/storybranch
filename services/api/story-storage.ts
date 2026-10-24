import type { DocumentData, Transaction } from "firebase-admin/firestore";
import { db } from "./firebase";
import {
  legacyStoryStorage,
  readStoryData,
} from "../../packages/contracts/legacy-story-format";

// New writes use the canonical collection. Pinned legacy revisions remain
// available without modifying or copying their immutable documents.
export async function libraryRecord(suffix: string, tx?: Transaction) {
  const current = db.doc(`storyNodeLibrary/${suffix}`);
  const old = db.doc(`${legacyStoryStorage.library}/${suffix}`);
  const snapshot = tx ? await tx.get(current) : await current.get();
  if (snapshot.exists) return readStoryData<DocumentData>(snapshot.data());
  const legacy = tx ? await tx.get(old) : await old.get();
  return legacy.exists ? readStoryData<DocumentData>(legacy.data()) : undefined;
}
