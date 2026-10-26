import { liveAccountKeys } from "./account-keys";
import type { Save, Stats } from "../../packages/contracts/index";
import {
  renderStoryNode,
  playerRun,
  playerInventory,
} from "../../packages/domain/player";
import { isResultStoryNode } from "../../packages/domain/index";
import { db } from "./firebase";
import { edition } from "./story-store";
import { storyNodeMedia, storyNodeImage } from "./uploads";

// Invalid stored data is a service failure, never a bad player command.
export function projectStoredPlayerData<T>(project: () => T): T {
  try {
    return project();
  } catch (cause) {
    throw new Error("Stored player data could not be projected.", { cause });
  }
}

export async function playerView(
  s: Save,
  uid: string,
  profile: { stats: Stats; achievements?: string[] },
) {
  const { story, clips, accountKeys } = await db.runTransaction(async (tx) => {
    const stored = await edition(tx, s.storyId, s.versionId);
    return {
      ...stored,
      accountKeys: await liveAccountKeys(tx, uid, stored.story),
    };
  });
  const storyNode = story.storyNodes[s.storyNodeId];
  const next =
    storyNode.choices.length === 1 &&
    !storyNode.choices[0].availableWhen &&
    !storyNode.choices[0].costs.length &&
    storyNode.choices[0].outcome.kind === "direct"
      ? story.storyNodes[storyNode.choices[0].outcome.route.targetStoryNodeId]
      : undefined;
  let branches: unknown[] = [];
  let featuredId: string | null = null;
  if (storyNode.branchLocation) {
    branches = (
      await db
        .collection("branches")
        .where("locationId", "==", storyNode.branchLocation)
        .limit(20)
        .get()
    ).docs.map((d) => {
      const branch = d.data();
      return { id: branch.id, title: branch.title, author: branch.author };
    });
    featuredId =
      (await db.doc(`placements/${storyNode.branchLocation}`).get()).data()
        ?.nominatedBranchId ?? null;
  }
  return projectStoredPlayerData(() => ({
    save: playerRun(s),
    inventory: playerInventory(story, s.items),
    story: {
      id: story.id,
      versionId: story.versionId,
      title: story.title,
    },
    user: {
      id: uid,
      stats: profile.stats,
      achievements: profile.achievements ?? [],
      saveSpots: [{ id: s.id, storyId: s.storyId, storyNodeId: s.storyNodeId }],
    },
    storyNode: renderStoryNode(storyNode, s, accountKeys),
    // Quiz results share as "my result" rather than an ending.
    result: isResultStoryNode(story, storyNode.id),
    media: storyNodeMedia(storyNode.video, clips),
    nextMedia: next?.storyNodeType.startsWith("video")
      ? storyNodeMedia(next.video, clips)
      : undefined,
    image: storyNodeImage(storyNode.image, clips),
    // Comic panel images, in panel order.
    ...(storyNode.comic
      ? {
          panels: storyNode.comic.panels.map((p) =>
            storyNodeImage(p.image, clips),
          ),
        }
      : {}),
    branches,
    featuredId,
  }));
}
