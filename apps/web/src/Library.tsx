import { useEffect, useState } from "react";
import type { StoryPage } from "../../../packages/contracts/index";
import {
  contentOf,
  placePage,
  type LibraryPage,
} from "../../../packages/contracts/page-library";
import {
  imageTypes,
  videoTypes,
  type UploadListing,
} from "../../../packages/contracts/media";
import { ClipPicker } from "./ClipPicker";
import { Button, Panel } from "./ui";
import { copyLink } from "./share";
import { ApiError } from "../../../packages/api-client/index";
import { assetIdOf } from "../../../packages/contracts/media";
import { resolveFixtureMedia } from "../../../fixtures/media";
import { VideoGenerator } from "./VideoGenerator";
import { VideoEditor } from "./VideoEditor";
import "./video-workshop.css";
import "./assets.css";
import { uploadAsset } from "./asset-upload";
type Api = <T>(path: string, body?: unknown) => Promise<T>;
type PageRequest = { path: string; body: unknown; instanceId?: string };
const pageTypes = {
  text: { label: "Text page", icon: "Aa" },
  "text-options": { label: "Text with options", icon: "Aa" },
  video: { label: "Video page", icon: "▶" },
  "video-options": { label: "Video with options", icon: "▶" },
};

// A catalogue summary of content and output labels, not a separate page player.
function PageCardPreview({
  item,
  uploads,
}: {
  item: LibraryPage;
  uploads?: UploadListing | null;
}) {
  const [playing, setPlaying] = useState(false);
  const content = item.content;
  const type = pageTypes[content.pageType];
  const clipId = assetIdOf(content.video);
  const media = clipId
    ? uploads?.items.find((asset) => asset.id === clipId)?.media
    : resolveFixtureMedia(content.video ?? "");
  const photo = uploads?.items.find(
    (asset) => asset.id === assetIdOf(content.image),
  )?.url;
  return (
    <>
      <div className="library-card-meta">
        <span className="library-type">
          <span aria-hidden="true">{type.icon}</span>
          {type.label}
        </span>
        <span>Revision {item.revision}</span>
      </div>
      <div className="library-content-preview">
        {content.pageType.startsWith("video") ? (
          media ? (
            playing ? (
              <>
                <video
                  controls
                  playsInline
                  autoPlay
                  preload="metadata"
                  poster={photo ?? media.landscape.poster}
                  src={media.landscape.src}
                  aria-label={`Video preview: ${content.title}`}
                />
                <Button
                  className="library-preview-close"
                  onClick={() => setPlaying(false)}
                >
                  Close video preview
                </Button>
              </>
            ) : (
              <button
                type="button"
                className="library-video-preview"
                onClick={() => setPlaying(true)}
                aria-label={`Preview video: ${content.title}`}
              >
                {(photo ?? media.landscape.poster) && (
                  <img
                    src={photo ?? media.landscape.poster}
                    alt=""
                    loading="lazy"
                  />
                )}
                <span>▶ Preview video</span>
              </button>
            )
          ) : (
            <div className="library-media-unavailable">
              Video preview unavailable
            </div>
          )
        ) : photo ? (
          <img src={photo} alt="" loading="lazy" />
        ) : (
          <div className="library-text-preview" aria-hidden="true">
            Aa<span>Text page</span>
          </div>
        )}
      </div>
      <h3 title={content.title}>{content.title}</h3>
      <p className="library-excerpt">
        {content.transcript || "No text or transcript added yet."}
      </p>
      <p className="library-completion">
        {content.pageType.endsWith("options")
          ? `Choose from ${content.outputs.length} ${content.outputs.length === 1 ? "option" : "options"}`
          : content.pageType === "video" && content.videoAdvance !== "continue"
            ? "Continues automatically when the video ends"
            : `Continues when “${content.outputs[0].label}” is selected`}
      </p>
      <ul className="library-output-preview" aria-label="Output preview">
        {content.outputs.slice(0, 3).map((output) => (
          <li key={output.id} title={output.label}>
            {output.label}
          </li>
        ))}
        {content.outputs.length > 3 && (
          <li>+{content.outputs.length - 3} more</li>
        )}
      </ul>
    </>
  );
}

export function PageLibrary({
  api,
  page,
  disabled,
  onInsert,
  onSaved,
  uploads,
}: {
  api: Api;
  page?: StoryPage;
  disabled: boolean;
  onInsert: (page: StoryPage) => void;
  onSaved: (record: LibraryPage, instanceId: string) => void;
  uploads?: UploadListing | null;
}) {
  const [items, setItems] = useState<LibraryPage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PageRequest | null>(null);
  const load = async (more?: string) => {
    const list = await api<{ items: LibraryPage[]; nextCursor: string | null }>(
      `/pages${more ? `?cursor=${more}` : ""}`,
    );
    setItems((old) => (more ? [...old, ...list.items] : list.items));
    setCursor(list.nextCursor);
  };
  useEffect(() => {
    void load().catch((e) => setNotice(e.message));
  }, []);
  const send = async (request: PageRequest) => {
    setBusy(true);
    setPending(request);
    try {
      const record = await api<LibraryPage>(request.path, request.body);
      setPending(null);
      if (request.path.endsWith("/share"))
        setNotice(
          await copyLink(
            new URL(`/p/${record.id}/${record.revision}`, location.origin).href,
            "Page link",
          ),
        );
      else {
        if (request.instanceId) onSaved(record, request.instanceId);
        setNotice(`Saved page revision ${record.revision}.`);
      }
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code !== "UNAVAILABLE") setPending(null);
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel aria-label="Page library">
      <h2>Reusable pages</h2>
      <p>
        Save content once, place it in many stories, and connect its outputs in
        each story. Sharing publishes an isolated page preview.
      </p>
      <Button
        disabled={
          disabled ||
          busy ||
          !!pending ||
          !page ||
          page.pageType === "dice" ||
          page.pageType === "reveal"
        }
        onClick={() => {
          if (!page) return;
          try {
            const source = page.sourcePage;
            void send({
              instanceId: page.id,
              path: `/pages/${source?.id ?? crypto.randomUUID()}`,
              body: {
                idempotencyKey: crypto.randomUUID(),
                expectedRevision: source?.revision ?? 0,
                content: contentOf(page),
              },
            });
          } catch (e) {
            setNotice((e as Error).message);
          }
        }}
      >
        Save page to library
      </Button>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Panel key={item.id} className="library-page-card">
            <PageCardPreview item={item} uploads={uploads} />
            <div className="library-card-actions flex flex-wrap gap-2">
              <Button
                disabled={disabled || busy}
                onClick={() =>
                  onInsert(
                    placePage(
                      item,
                      `page-${crypto.randomUUID().slice(0, 8)}`,
                      "",
                    ),
                  )
                }
              >
                Use page
              </Button>
              <Button
                disabled={busy || !!pending}
                onClick={() =>
                  void send({
                    path: `/pages/${item.id}/share`,
                    body: {
                      idempotencyKey: crypto.randomUUID(),
                      revision: item.revision,
                    },
                  })
                }
              >
                Share page
              </Button>
            </div>
          </Panel>
        ))}
      </div>
      {cursor && (
        <Button
          disabled={busy}
          onClick={() => void load(cursor).catch((e) => setNotice(e.message))}
        >
          More pages
        </Button>
      )}
      {pending && (
        <Button disabled={busy} onClick={() => void send(pending)}>
          Retry page request
        </Button>
      )}
      <Button
        disabled={busy}
        onClick={() => void load().catch((e) => setNotice(e.message))}
      >
        Refresh library
      </Button>
      <p className="min-h-12" role="status">
        {notice}
      </p>
    </Panel>
  );
}

export function AssetLibrary({
  api,
  path,
  navigate,
  uid,
}: {
  api: Api;
  path: string;
  navigate: (path: string) => void;
  uid: string;
}) {
  const [uploads, setUploads] = useState<UploadListing | null>(null);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"all" | "video" | "image">("all");
  const load = () =>
    api<UploadListing>("/uploads")
      .then(setUploads)
      .catch((e) => setNotice(e.message));
  useEffect(() => {
    void load();
  }, []);
  const onAsset = (
    asset: import("../../../packages/contracts/media").ClipAsset,
  ) =>
    setUploads((old) =>
      old
        ? {
            ...old,
            items: [asset, ...old.items.filter((a) => a.id !== asset.id)],
          }
        : old,
    );
  if (path === "/assets/generate")
    return (
      <VideoGenerator
        api={api}
        uid={uid}
        uploads={uploads}
        onAsset={onAsset}
        onClose={() => navigate("/assets")}
      />
    );
  if (path.startsWith("/assets/edit/")) {
    const asset = uploads?.items.find((a) => a.id === path.split("/")[3]);
    return asset?.media ? (
      <VideoEditor
        key={asset.id}
        api={api}
        asset={asset}
        onSaved={onAsset}
        onClose={() => navigate("/assets")}
      />
    ) : (
      <Panel>
        <p>
          {uploads
            ? "This video is unavailable in your library."
            : "Loading video…"}
        </p>
        <p role="status">{notice}</p>
        <Button onClick={() => navigate("/assets")}>Back to assets</Button>
      </Panel>
    );
  }
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setNotice("");
    try {
      onAsset(await uploadAsset(api, file, setNotice));
      setNotice(`${file.name} is ready to use on any page.`);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const items = (uploads?.items ?? []).filter(
    (asset) =>
      filter === "all" ||
      (filter === "video") === asset.contentType.startsWith("video/"),
  );
  return (
    <section className="assets" aria-labelledby="assets-title">
      <div className="assets-head">
        <div>
          <h1 id="assets-title">Assets</h1>
          <p className="assets-muted">
            Your videos and photos. Upload or generate them once, then use them
            on any page.
          </p>
        </div>
        <div className="assets-actions">
          <label
            className={`btn btn-primary ${uploads?.enabled ? "" : "is-disabled"}`}
          >
            Upload video
            <input
              className="sr-only"
              type="file"
              aria-label="Upload a clip"
              accept={videoTypes.join(",")}
              disabled={!uploads?.enabled}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <label
            className={`btn btn-secondary ${uploads?.enabled ? "" : "is-disabled"}`}
          >
            Upload photo
            <input
              className="sr-only"
              type="file"
              aria-label="Upload a photo"
              accept={imageTypes.join(",")}
              disabled={!uploads?.enabled}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button
            className="btn btn-secondary"
            aria-label="Generate video"
            onClick={() => navigate("/assets/generate")}
          >
            Generate with AI
          </button>
        </div>
      </div>
      {/* Reserved line: upload progress and messages never shift the grid. */}
      <p className="assets-status" role="status">
        {uploads && !uploads.enabled ? uploads.reason : notice}
      </p>
      <div className="assets-toolbar">
        <div className="disc-filter" role="group" aria-label="Show">
          {(
            [
              ["all", "All"],
              ["video", "Videos"],
              ["image", "Photos"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="btn-link" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {!uploads ? (
        <div className="assets-grid" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="assets-card placeholder-block" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="assets-empty">
          <h2>
            {uploads.items.length === 0
              ? "No assets yet"
              : "Nothing of this type yet"}
          </h2>
          <p className="assets-muted">
            Upload an MP4 or WebM clip (up to 60 seconds) or a JPEG, PNG or WebP
            photo (up to 10 MB), or generate one with AI.
          </p>
        </div>
      ) : (
        <div className="assets-grid">
          {items.map((asset) => (
            <article key={asset.id} className="assets-card">
              <div className="assets-preview">
                {asset.url ? (
                  <img src={asset.url} alt={asset.fileName} loading="lazy" />
                ) : asset.media ? (
                  <video
                    controls
                    preload="metadata"
                    src={asset.media.landscape.src}
                  />
                ) : (
                  <span className="assets-pending">Processing…</span>
                )}
              </div>
              <div className="assets-card-body">
                <p className="assets-meta">
                  <span>
                    {asset.contentType.startsWith("video/") ? "Video" : "Photo"}
                  </span>
                  {asset.contentType.startsWith("video/") &&
                    asset.durationSeconds > 0 && (
                      <span>{Math.round(asset.durationSeconds)} s</span>
                    )}
                  <span>{(asset.bytes / 1024 / 1024).toFixed(1)} MB</span>
                  {asset.published && <span>In a published story</span>}
                </p>
                <h2 title={asset.fileName}>{asset.fileName}</h2>
                {asset.media && (
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => navigate(`/assets/edit/${asset.id}`)}
                  >
                    Edit video
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
