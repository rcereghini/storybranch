import type { StagedBattleStory } from "../../packages/contracts/battle-graph";
import type { PublishedClip } from "../../packages/contracts/media";
import type { BattleSave } from "../../packages/contracts/battle-player";
import { renderBattleNode } from "../../packages/domain/battle-view";
import { liveAccountKeys } from "./account-keys";
import type { Save, Stats } from "../../packages/contracts/index";
import {
  renderStoryNode,
  playerRun,
  playerInventory,
} from "../../packages/domain/player";
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
  return fullPlayerView(story, clips, accountKeys, s, uid, profile);
}

export async function fullPlayerView(
  story: StagedBattleStory,
  clips: Record<string, PublishedClip>,
  accountKeys: readonly string[],
  s: BattleSave,
  uid: string,
  profile: { stats: Stats; achievements?: string[] },
  allowSideStories = true,
) {
  const storyNode = story.storyNodes[s.storyNodeId];
  const next =
    storyNode.storyNodeType !== "battle" &&
    storyNode.choices.length === 1 &&
    !storyNode.choices[0].availableWhen &&
    !storyNode.choices[0].costs.length &&
    storyNode.choices[0].outcome.kind === "direct"
      ? story.storyNodes[storyNode.choices[0].outcome.route.targetStoryNodeId]
      : undefined;
  let branches: unknown[] = [];
  let featuredId: string | null = null;
  if (
    allowSideStories &&
    storyNode.storyNodeType !== "battle" &&
    storyNode.branchLocation
  ) {
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
    storyNode:
      storyNode.storyNodeType === "battle"
        ? renderBattleNode(storyNode, s)
        : renderStoryNode(storyNode, s, accountKeys, story.itemCatalogue),
    // Quiz results share as "my result" rather than an ending.
    result: Object.values(story.storyNodes).some(
      (n) =>
        n.storyNodeType !== "battle" &&
        n.choices.some(
          (c) =>
            c.outcome.kind === "reveal" &&
            c.outcome.results.some(
              (r) => r.route.targetStoryNodeId === storyNode.id,
            ),
        ),
    ),
    media:
      storyNode.storyNodeType !== "battle"
        ? storyNodeMedia(storyNode.video, clips)
        : undefined,
    nextMedia:
      next &&
      next.storyNodeType !== "battle" &&
      next.storyNodeType.startsWith("video")
        ? storyNodeMedia(next.video, clips)
        : undefined,
    image:
      storyNode.storyNodeType !== "battle"
        ? storyNodeImage(storyNode.image, clips)
        : undefined,
    // Comic panel images, in panel order.
    ...(storyNode.storyNodeType !== "battle" && storyNode.comic
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
