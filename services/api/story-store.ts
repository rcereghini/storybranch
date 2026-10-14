import type { Transaction } from "firebase-admin/firestore";
import { db } from "./firebase";
import { GameError, type Story } from "../../packages/contracts/index";
import { validateStory } from "../../packages/domain/index";
export async function version(
  tx: Transaction,
  storyId: string,
  versionId: string,
): Promise<Story> {
  const ref = db.doc(`stories/${storyId}/versions/${versionId}`);
  const manifest = await tx.get(ref);
  if (!manifest.exists || !manifest.data()!.ready)
    throw new GameError("NOT_FOUND", "Story edition unavailable.");
  if (!manifest.data()!.entryPageId)
    throw new GameError(
      "NOT_FOUND",
      "This save uses an earlier prototype format. Start a new journey from Discover.",
    );
  const pages = await tx.get(ref.collection("pages"));
  const { manifestHash: _, ready: __, ...data } = manifest.data()!;
  return validateStory({
    ...data,
    pages: Object.fromEntries(pages.docs.map((n) => [n.id, n.data()])),
  });
}
