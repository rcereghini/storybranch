import { useEffect, useState } from "react";
import type { LibraryPage } from "../../../packages/contracts/page-library";
import { placePage } from "../../../packages/contracts/page-library";
import type { SceneMedia } from "../../../packages/contracts/media";
import type {
  Save,
  Story as StoryData,
} from "../../../packages/contracts/index";
import { baseStats, start, transition } from "../../../packages/domain/index";
import { Story } from "./Story";
import { Page } from "./Page";
import { Button } from "./ui";
export function SharedPage({ path }: { path: string }) {
  const [record, setRecord] = useState<
    (LibraryPage & { media?: SceneMedia; image?: string }) | null
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
    void fetch(`/api/shared-pages/${id}/${revision}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("This shared page is unavailable.");
        const record = (await response.json()) as LibraryPage & {
          media?: SceneMedia;
          image?: string;
        };
        if (controller.signal.aborted) return;
        const story: StoryData = {
          id: "shared-page",
          versionId: `revision-${record.revision}`,
          title: record.content.title,
          rulesetVersion: "prototype-1",
          entryPageId: "page",
          pages: {
            page: placePage(record, "page", "ending"),
            ending: {
              id: "ending",
              title: "Page preview complete",
              transcript:
                "This is an individual page preview. Its outputs are connected separately in each story.",
              kind: "ending",
              pageType: "text",
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
    <section className="shared-page">
      <p className="eyebrow p-4">SHARED PAGE · ISOLATED PREVIEW</p>
      {error ? (
        <div role="alert">
          {error}
          <Button onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
        </div>
      ) : !preview ? (
        <div className="loading-overlay" role="status">
          Loading page…
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
          <Page
            page={preview.story.pages[preview.save.pageId]}
            media={record?.media}
            image={preview.save.pageId === "page" ? record?.image : undefined}
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
                  Replay page
                </Button>
                <a href="/discover">Discover stories</a>
              </>
            )}
          </Page>
        </Story>
      )}
    </section>
  );
}
