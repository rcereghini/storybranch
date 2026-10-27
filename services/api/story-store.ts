import {
  stagedBattleStorySchema,
  type StagedBattleStory,
} from "../../packages/contracts/battle-graph";
import { battleContractVersion } from "../../packages/contracts/battle-player";
import { EditionCache } from "./edition-cache";
import type { DocumentData, Transaction } from "firebase-admin/firestore";
import { db } from "./firebase";
import { GameError, type Story } from "../../packages/contracts/index";
import type { PublishedClip } from "../../packages/contracts/media";
import { validateStory } from "../../packages/domain/index";
import {
  legacyStoryStorage,
  readStoryData,
} from "../../packages/contracts/legacy-story-format";

const cache = new EditionCache<{
  story: Story;
  clips: Record<string, PublishedClip>;
}>();

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
  if (manifest.data()!.battleContract)
    throw new GameError(
      "VALIDATION_FAILED",
      "Update the player before opening this battle edition.",
    );
  const stored = readStoryData<DocumentData>(manifest.data());
  if (!stored.entryStoryNodeId)
    throw new GameError(
      "NOT_FOUND",
      "This save uses an earlier prototype format. Start a new journey from Discover.",
    );
  const cacheKey = `${ref.path}:${manifest.updateTime!.seconds}:${manifest.updateTime!.nanoseconds}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const collection = Object.hasOwn(manifest.data()!, "entryStoryNodeId")
    ? "storyNodes"
    : legacyStoryStorage.nodes;
  const storyNodes = await tx.get(ref.collection(collection));
  const { manifestHash: _, ready: __, clips = {}, ...data } = stored;
  const loaded = {
    story: validateStory({
      ...data,
      storyNodes: Object.fromEntries(
        storyNodes.docs.map((n) => [n.id, readStoryData(n.data())]),
      ),
    }),
    clips,
  };
  cache.set(cacheKey, loaded);
  return loaded;
}

export async function version(
  tx: Transaction,
  storyId: string,
  versionId: string,
): Promise<Story> {
  return (await edition(tx, storyId, versionId)).story;
}

// Player-only negotiation. Authoring continues to use edition(), which rejects combat.
export async function playerEdition(
  tx: Transaction,
  storyId: string,
  versionId: string,
  battleCapable = false,
): Promise<{
  story: StagedBattleStory;
  clips: Record<string, PublishedClip>;
  battle: boolean;
}> {
  const ref = db.doc(`stories/${storyId}/versions/${versionId}`);
  const manifest = await tx.get(ref);
  if (!manifest.exists || manifest.data()!.ready !== true)
    throw new GameError("NOT_FOUND", "Story edition unavailable.");
  if (!manifest.data()!.battleContract)
    return { ...(await edition(tx, storyId, versionId)), battle: false };
  if (
    !battleCapable ||
    manifest.data()!.battleContract !== battleContractVersion
  )
    throw new GameError(
      "VALIDATION_FAILED",
      "Update the player before opening this battle edition.",
    );
  const nodes = await tx.get(ref.collection("storyNodes"));
  const {
    ready: _,
    battleContract: __,
    clips = {},
    manifestHash: ___,
    ...data
  } = manifest.data()!;
  const story = stagedBattleStorySchema.parse({
    ...data,
    storyNodes: Object.fromEntries(nodes.docs.map((n) => [n.id, n.data()])),
  });
  if (story.id !== storyId || story.versionId !== versionId)
    throw new Error("Stored edition identity mismatch.");
  return { story, clips, battle: true };
}
