import { useEffect, useState } from "react";
import type { Comic, StoryPage } from "../../../packages/contracts/index";
import {
  maxCast,
  type ComicStudio,
  type DraftRecord,
} from "../../../packages/contracts/authoring";
import {
  assetIdOf,
  assetRef,
  type ClipAsset,
  type UploadListing,
} from "../../../packages/contracts/media";
import { comicIssue } from "../../../packages/domain/index";
import { comicLimits } from "../../../packages/contracts/index";
import { ClipPicker } from "./ClipPicker";
import { ComicStrip } from "./ComicStrip";
import { PageImageDialog } from "./StudioAssist";
import {
  castInPanel,
  castPrompt,
  comicPanel,
  defaultComicStyle,
  panelPrompt,
  shortId,
} from "./studio-model";

type Api = <T>(path: string, body?: unknown) => Promise<T>;
type Panel = Comic["panels"][number];
type Edit = (update: (d: DraftRecord) => DraftRecord) => void;
const noStudio: ComicStudio = { style: "", cast: [] };
const layouts = [
  ["grid", "Square grid"],
  ["scroll", "Scrolling strip"],
] as const;
// An empty picker value removes the optional image field.
const withImage = <T extends { image?: string }>(item: T, image: string) => {
  const { image: _, ...rest } = item;
  return (image ? { ...rest, image } : rest) as T;
};
const imageUrl = (uploads: UploadListing | null, ref?: string) =>
  uploads?.items.find((a) => a.id === assetIdOf(ref))?.url;
export const panelImages = (comic: Comic, uploads: UploadListing | null) =>
  comic.panels.map((p) => imageUrl(uploads, p.image));

// The comic part of page settings: layout, panels, and the draft's cast and
// art style. Edits go through Studio's edit(), so they autosave and undo
// like any other draft change, and late generation results apply to the
// latest draft rather than the one this render saw.
export function ComicEditor({
  api,
  draft,
  page,
  uploads,
  busy,
  assistReason,
  selectedPanel,
  onSelectPanel,
  onEdit,
  onUploaded,
}: {
  api: Api;
  draft: DraftRecord;
  page: StoryPage;
  uploads: UploadListing | null;
  busy: boolean;
  assistReason: string | null;
  selectedPanel: string | null;
  onSelectPanel: (panelId: string | null) => void;
  onEdit: Edit;
  onUploaded: (asset: ClipAsset) => void;
}) {
  const [dialog, setDialog] = useState<{
    kind: "panel" | "cast";
    id: string;
  } | null>(null);
  useEffect(() => {
    if (selectedPanel)
      document
        .getElementById(`panel-editor-${selectedPanel}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [selectedPanel]);
  const comic = page.comic;
  if (!comic) return null;
  const studio = draft.comic ?? noStudio;
  const issue = comicIssue(page);

  const editComic = (update: (c: Comic) => Comic) =>
    onEdit((d) => {
      const current = d.story.pages[page.id];
      if (!current?.comic) return d;
      return {
        ...d,
        story: {
          ...d.story,
          pages: {
            ...d.story.pages,
            [page.id]: { ...current, comic: update(current.comic) },
          },
        },
      };
    });
  const editPanel = (id: string, update: (p: Panel) => Panel) =>
    editComic((c) => ({
      ...c,
      panels: c.panels.map((p) => (p.id === id ? update(p) : p)),
    }));
  const move = (index: number, by: number) =>
    editComic((c) => {
      const panels = [...c.panels];
      const [panel] = panels.splice(index, 1);
      panels.splice(index + by, 0, panel);
      return { ...c, panels };
    });
  const editStudio = (update: (s: ComicStudio) => ComicStudio) =>
    onEdit((d) => ({ ...d, comic: update(d.comic ?? noStudio) }));
  const editCast = (
    id: string,
    update: (c: ComicStudio["cast"][number]) => ComicStudio["cast"][number],
  ) =>
    editStudio((s) => ({
      ...s,
      cast: s.cast.map((c) => (c.id === id ? update(c) : c)),
    }));
  // Characters with a reference image can be offered to the generator.
  const references = studio.cast.flatMap((c) => {
    const assetId = assetIdOf(c.image);
    return assetId ? [{ assetId, name: c.name.trim() || "Unnamed" }] : [];
  });

  const panelIndex =
    dialog?.kind === "panel"
      ? comic.panels.findIndex((p) => p.id === dialog.id)
      : -1;
  const member =
    dialog?.kind === "cast"
      ? studio.cast.find((c) => c.id === dialog.id)
      : undefined;

  return (
    <div className="comic-editor">
      <h3>Comic</h3>
      <div className="disc-filter" role="group" aria-label="Comic layout">
        {layouts.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={comic.layout === value}
            onClick={() => editComic((c) => ({ ...c, layout: value }))}
          >
            {label}
          </button>
        ))}
      </div>
      <small className="muted">
        {comic.layout === "grid"
          ? `A square image of ${comicLimits.grid.join(" or ")} panels, easy to share as one picture.`
          : `${comicLimits.scroll[0]} to ${comicLimits.scroll[1]} panels read top to bottom, one at a time.`}
      </small>
      {/* Reserved line: the publishing rule, without shifting the editor. */}
      <p className="comic-issue" role="status">
        {issue ?? "Ready to preview and publish."}
      </p>

      <ol className="comic-panel-list">
        {comic.panels.map((panel, i) => {
          const url = imageUrl(uploads, panel.image);
          return (
            <li
              key={panel.id}
              id={`panel-editor-${panel.id}`}
              className="comic-panel-editor"
              aria-current={selectedPanel === panel.id || undefined}
              onFocus={() => onSelectPanel(panel.id)}
            >
              <div className="comic-panel-head">
                <strong>Panel {i + 1}</strong>
                <span>
                  <button
                    type="button"
                    aria-label={`Move panel ${i + 1} earlier`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move panel ${i + 1} later`}
                    disabled={i === comic.panels.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove panel ${i + 1}`}
                    disabled={comic.panels.length <= 1}
                    onClick={() => {
                      editComic((c) => ({
                        ...c,
                        panels: c.panels.filter((p) => p.id !== panel.id),
                      }));
                      onSelectPanel(null);
                    }}
                  >
                    ✕
                  </button>
                </span>
              </div>
              {url ? (
                <img className="comic-panel-thumb" src={url} alt="" />
              ) : (
                <span className="comic-panel-thumb comic-empty">No image</span>
              )}
              <label>
                What's in this panel
                <textarea
                  rows={2}
                  maxLength={400}
                  value={panel.alt ?? ""}
                  placeholder="Dana opens the fridge at 3am and finds the cat inside."
                  onChange={(e) =>
                    editPanel(panel.id, (p) => ({ ...p, alt: e.target.value }))
                  }
                />
                <small className="muted">
                  Describes the image for screen readers and starts its prompt.
                </small>
              </label>
              <label>
                Caption or dialogue
                <input
                  maxLength={200}
                  value={panel.caption ?? ""}
                  placeholder="Me: just checking"
                  onChange={(e) =>
                    editPanel(panel.id, (p) => ({
                      ...p,
                      caption: e.target.value,
                    }))
                  }
                />
              </label>
              <ClipPicker
                kind="image"
                label="Panel image"
                api={api}
                value={panel.image}
                uploads={uploads}
                disabled={busy}
                onChange={(image) =>
                  editPanel(panel.id, (p) => withImage(p, image))
                }
                onUploaded={onUploaded}
              />
              <button
                type="button"
                className="assist-button"
                disabled={busy}
                onClick={() => setDialog({ kind: "panel", id: panel.id })}
              >
                ✦ Generate panel image
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="btn btn-secondary btn-small"
        disabled={busy || comic.panels.length >= comicLimits.scroll[1]}
        onClick={() => {
          const added = comicPanel();
          editComic((c) => ({ ...c, panels: [...c.panels, added] }));
          onSelectPanel(added.id);
        }}
      >
        Add panel
      </button>

      <h3>Cast and style</h3>
      <p className="muted">
        Shared by every panel in this comic. Give each character a reference
        image, then generate panels at High quality to keep them looking the
        same.
      </p>
      <label>
        Art style
        <textarea
          rows={2}
          maxLength={300}
          value={studio.style}
          placeholder={defaultComicStyle}
          onChange={(e) => editStudio((s) => ({ ...s, style: e.target.value }))}
        />
      </label>
      <ul className="comic-cast-list">
        {studio.cast.map((c, i) => {
          const url = imageUrl(uploads, c.image);
          return (
            <li key={c.id} className="comic-cast-member">
              <div className="comic-panel-head">
                <strong>{c.name.trim() || `Character ${i + 1}`}</strong>
                <button
                  type="button"
                  aria-label={`Remove ${c.name.trim() || `character ${i + 1}`}`}
                  onClick={() =>
                    editStudio((s) => ({
                      ...s,
                      cast: s.cast.filter((x) => x.id !== c.id),
                    }))
                  }
                >
                  ✕
                </button>
              </div>
              {url && <img className="comic-cast-thumb" src={url} alt="" />}
              <label>
                Name
                <input
                  maxLength={60}
                  value={c.name}
                  onChange={(e) =>
                    editCast(c.id, (x) => ({ ...x, name: e.target.value }))
                  }
                />
              </label>
              <label>
                Looks like
                <textarea
                  rows={2}
                  maxLength={400}
                  value={c.description}
                  placeholder="A grumpy orange cat with a torn ear and a tiny red scarf."
                  onChange={(e) =>
                    editCast(c.id, (x) => ({
                      ...x,
                      description: e.target.value,
                    }))
                  }
                />
              </label>
              <ClipPicker
                kind="image"
                label="Reference image"
                api={api}
                value={c.image}
                uploads={uploads}
                disabled={busy}
                onChange={(image) => editCast(c.id, (x) => withImage(x, image))}
                onUploaded={onUploaded}
              />
              <button
                type="button"
                className="assist-button"
                disabled={busy || !c.name.trim()}
                onClick={() => setDialog({ kind: "cast", id: c.id })}
              >
                ✦ Generate character sheet
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="btn btn-secondary btn-small"
        disabled={busy || studio.cast.length >= maxCast}
        onClick={() =>
          editStudio((s) => ({
            ...s,
            cast: [
              ...s.cast,
              {
                id: `cast-${shortId()}`,
                name: `Character ${s.cast.length + 1}`,
                description: "",
              },
            ],
          }))
        }
      >
        Add character
      </button>

      {panelIndex >= 0 && (
        <PageImageDialog
          api={api}
          story={draft.story}
          description={draft.description}
          page={page}
          assistReason={assistReason}
          heading={`Generate panel ${panelIndex + 1}`}
          initialPrompt={panelPrompt(
            comic,
            panelIndex,
            studio.style,
            castInPanel(studio.cast, comic.panels[panelIndex]),
          )}
          initialAspect="1:1"
          cast={references}
          initialCast={castInPanel(studio.cast, comic.panels[panelIndex]).map(
            (c) => assetIdOf(c.image)!,
          )}
          placement="placed in this panel"
          onAttach={(asset) => {
            onUploaded(asset);
            editPanel(comic.panels[panelIndex].id, (p) =>
              withImage(p, assetRef(asset.id)),
            );
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {member && (
        <PageImageDialog
          api={api}
          story={draft.story}
          description={draft.description}
          page={page}
          assistReason={assistReason}
          heading={`Character sheet: ${member.name.trim()}`}
          initialPrompt={castPrompt(member, studio.style)}
          initialAspect="1:1"
          placement="used as this character's reference"
          onAttach={(asset) => {
            onUploaded(asset);
            editCast(member.id, (x) => withImage(x, assetRef(asset.id)));
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// The canvas for a comic draft: the strip as it will read, with panels to
// select for editing. It is an authoring view; Preview plays the page.
export function ComicWorkspace({
  page,
  uploads,
  selectedPanel,
  onSelectPanel,
  onShowMap,
}: {
  page: StoryPage;
  uploads: UploadListing | null;
  selectedPanel: string | null;
  onSelectPanel: (panelId: string) => void;
  onShowMap: () => void;
}) {
  if (!page.comic) return null;
  return (
    <div className="comic-workspace">
      <div className="comic-workspace-bar">
        <p className="muted">
          {page.comic.layout === "grid" ? "Square grid" : "Scrolling strip"} ·{" "}
          {page.comic.panels.length} panels · Select a panel to edit it
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={onShowMap}
        >
          Story map
        </button>
      </div>
      <div className="comic-workspace-stage">
        <ComicStrip
          comic={page.comic}
          images={panelImages(page.comic, uploads)}
          selected={selectedPanel ?? undefined}
          onPanel={onSelectPanel}
        />
      </div>
    </div>
  );
}
