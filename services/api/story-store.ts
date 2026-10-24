import type { DocumentData, Transaction } from "firebase-admin/firestore";
import { db } from "./firebase";
import { GameError, type Story } from "../../packages/contracts/index";
import type { PublishedClip } from "../../packages/contracts/media";
import { validateStory } from "../../packages/domain/index";
import {
  legacyStoryStorage,
  readStoryData,
} from "../../packages/contracts/legacy-story-format";

// A published edition: its story plus the uploaded clips its StoryNodes use, keyed
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
  const stored = readStoryData<DocumentData>(manifest.data());
  if (!stored.entryStoryNodeId)
    throw new GameError(
      "NOT_FOUND",
      "This save uses an earlier prototype format. Start a new journey from Discover.",
    );
  const collection = Object.hasOwn(manifest.data()!, "entryStoryNodeId")
    ? "storyNodes"
    : legacyStoryStorage.nodes;
  const storyNodes = await tx.get(ref.collection(collection));
  const { manifestHash: _, ready: __, clips = {}, ...data } = stored;
  return {
    story: validateStory({
      ...data,
      storyNodes: Object.fromEntries(
        storyNodes.docs.map((n) => [n.id, readStoryData(n.data())]),
      ),
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
