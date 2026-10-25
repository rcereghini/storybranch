import type { Save, Stats } from "../../packages/contracts/index";
import { renderStoryNode, playerRun } from "../../packages/domain/player";
import { isResultStoryNode } from "../../packages/domain/index";
import { db } from "./firebase";
import { edition } from "./story-store";
import { storyNodeMedia, storyNodeImage } from "./uploads";

export async function playerView(
  s: Save,
  uid: string,
  profile: { stats: Stats; achievements?: string[] },
  projected: boolean,
) {
  const { story, clips } = await db.runTransaction((tx) =>
    edition(tx, s.storyId, s.versionId),
  );
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
      return projected
        ? { id: branch.id, title: branch.title, author: branch.author }
        : branch;
    });
    featuredId =
      (await db.doc(`placements/${storyNode.branchLocation}`).get()).data()
        ?.nominatedBranchId ?? null;
  }
  return {
    save: projected ? playerRun(s) : s,
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
    storyNode: projected ? renderStoryNode(storyNode, s) : storyNode,
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
  };
}
