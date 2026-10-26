import type { Transaction } from "firebase-admin/firestore";
import {
  GameError,
  type Save,
  type Story,
} from "../../packages/contracts/index";
import { db } from "./firebase";
import { edition } from "./story-store";
import { assertStoryEntry } from "./invitations";

// Shared by consent reads and the committing command: an offer is not authority.
export async function sideStory(
  tx: Transaction,
  uid: string,
  parent: Save,
  story: Story,
  branchId: string,
  expectedRevision: number,
  versionId?: string,
  storyId?: string,
) {
  if (parent.playerUid !== uid)
    throw new GameError("FORBIDDEN", "Adventure unavailable.");
  if (parent.revision !== expectedRevision)
    throw new GameError(
      "STALE_REVISION",
      "Progress changed on another device. Reload current progress.",
    );
  if (parent.parentPlaythroughId || parent.status !== "active")
    throw new GameError("FORBIDDEN", "Nested branches are unavailable.");
  const branch = (await tx.get(db.doc(`branches/${branchId}`))).data();
  const location = story.storyNodes[parent.storyNodeId]?.branchLocation;
  if (
    !location ||
    !branch ||
    branch.locationId !== location ||
    branch.sourceVersionId !== parent.versionId
  )
    throw new GameError(
      "VALIDATION_FAILED",
      "Branch unavailable at this location.",
    );
  if (
    (versionId && versionId !== branch.versionId) ||
    (storyId && storyId !== branch.storyId)
  )
    throw new GameError(
      "STALE_REVISION",
      "This side Story changed. Reload and review its imports again.",
    );
  const { story: child } = await edition(tx, branch.storyId, branch.versionId);
  await assertStoryEntry(tx, uid, child.id);
  return child;
}
