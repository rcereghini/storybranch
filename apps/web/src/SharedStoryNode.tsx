import { useEffect, useState } from "react";
import type { LibraryStoryNode } from "../../../packages/contracts/story-node-library";
import { placeStoryNode } from "../../../packages/contracts/story-node-library";
import type { SceneMedia } from "../../../packages/contracts/media";
import type {
  Save,
  Story as StoryData,
} from "../../../packages/contracts/index";
import { baseStats, start, transition } from "../../../packages/domain/index";
import { Story } from "./Story";
import { StoryNode } from "./StoryNode";
import { Button } from "./ui";
export function SharedStoryNode({ path }: { path: string }) {
  const [record, setRecord] = useState<
    (LibraryStoryNode & { media?: SceneMedia; image?: string }) | null
  >(null);
  const [preview, setPreview] = useState<{
    story: StoryData;
    save: Save;
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setPreview(null);
    const [, , id, revision] = path.split("/");
    void fetch(`/api/shared-story-nodes/${id}/${revision}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("This shared StoryNode is unavailable.");
        const record = (await response.json()) as LibraryStoryNode & {
          media?: SceneMedia;
          image?: string;
        };
        if (controller.signal.aborted) return;
        const story: StoryData = {
          id: "shared-story-node",
          versionId: `revision-${record.revision}`,
          title: record.content.title,
          rulesetVersion: "prototype-1",
          entryStoryNodeId: "storyNode",
          storyNodes: {
            storyNode: placeStoryNode(record, "storyNode", "ending"),
            ending: {
              id: "ending",
              title: "StoryNode preview complete",
              transcript:
                "This is an individual StoryNode preview. Its outputs are connected separately in each story.",
              kind: "ending",
              storyNodeType: "text",
              entryEffects: [],
              choices: [],
            },
          },
        };
        setRecord(record);
        setPreview({
          story,
          save: start(story, "preview", "visitor", baseStats, Date.now()),
        });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [path, attempt]);
  return (
    <section className="shared-story-node">
      <p className="eyebrow p-4">SHARED STORYNODE · ISOLATED PREVIEW</p>
      {error ? (
        <div role="alert">
          {error}
          <Button onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
        </div>
      ) : !preview ? (
        <div className="loading-overlay" role="status">
          Loading StoryNode…
        </div>
      ) : (
        <Story
          story={preview.story}
          save={preview.save}
          user={{
            id: "visitor",
            stats: baseStats,
            achievements: [],
            saveSpots: [],
          }}
        >
          <StoryNode
            storyNode={preview.story.storyNodes[preview.save.storyNodeId]}
            media={record?.media}
            image={
              preview.save.storyNodeId === "storyNode"
                ? record?.image
                : undefined
            }
            disabled={false}
            transitioning={false}
            onPlaybackChange={() => {}}
            onOutput={(output) =>
              setPreview(
                (current) =>
                  current && {
                    ...current,
                    save: transition(
                      current.story,
                      current.save,
                      output.choiceId,
                      current.save.revision,
                      Date.now(),
                      () => 1,
                    ).save,
                  },
              )
            }
          >
            {preview.save.status === "completed" && (
              <>
                <Button
                  onClick={() =>
                    setPreview({
                      ...preview,
                      save: start(
                        preview.story,
                        "preview",
                        "visitor",
                        baseStats,
                        Date.now(),
                      ),
                    })
                  }
                >
                  Replay StoryNode
                </Button>
                <a href="/discover">Discover stories</a>
              </>
            )}
          </StoryNode>
        </Story>
      )}
    </section>
  );
}
