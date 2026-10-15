import type { Transaction } from "firebase-admin/firestore";
import { db } from "./firebase";
import { GameError, type Story } from "../../packages/contracts/index";
import type { PublishedClip } from "../../packages/contracts/media";
import { validateStory } from "../../packages/domain/index";

// A published edition: its story plus the uploaded clips its pages use, keyed
// by clip ID. Clips are recorded at publish time so playback never needs the
// creator's private clip records.
export async function edition(
  tx: Transaction,
  storyId: string,
  versionId: string,
): Promise<{ story: Story; clips: Record<string, PublishedClip> }> {
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
  const { manifestHash: _, ready: __, clips = {}, ...data } = manifest.data()!;
  return {
    story: validateStory({
      ...data,
      pages: Object.fromEntries(pages.docs.map((n) => [n.id, n.data()])),
    }),
    clips,
  };
}

export async function version(
  tx: Transaction,
  storyId: string,
  versionId: string,
): Promise<Story> {
  return (await edition(tx, storyId, versionId)).story;
}
