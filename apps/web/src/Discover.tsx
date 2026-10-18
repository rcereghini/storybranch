import { useMemo, useState } from "react";
import type { Save } from "../../../packages/contracts/index";
import { genreLabels, genreOf } from "../../../packages/domain/dashboard";
import type { GenreId } from "../../../packages/contracts/profile";
import { StoryCover } from "./StoryCover";
import { coverArt } from "./cover-palette";
import "./discover.css";

export type CatalogueEntry = {
  id: string;
  title: string;
  description: string;
  genre?: string;
  duration?: string;
  creator?: string;
  rating?: string;
};

// The public catalogue: the featured Glass Harbor hero and a searchable
// story library, and each story's page under /s/.
export function Discover({
  path,
  catalogue,
  saves,
  resume,
  disabled,
  catalogueReady,
  hasMore,
  moreDisabled,
  onMore,
  onStart,
  onResume,
  onNavigate,
}: {
  path: string;
  catalogue: CatalogueEntry[];
  saves: Save[];
  resume: Save | undefined;
  disabled: boolean;
  catalogueReady: boolean;
  hasMore: boolean;
  moreDisabled: boolean;
  onMore: () => void;
  onStart: (storyId?: string) => void;
  onResume: (saveId: string) => void;
  onNavigate: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<GenreId | "all">("all");
  // /s/<story>[/<slug>] is a story page; /s/<story>/ending/<page> is a shared
  // ending. The ending's title comes from its static link-preview page.
  const [, , detailId, ...rest] = path.split("/");
  const detail = path.startsWith("/s/") && !!detailId;
  // Creator stories have no preview page, so the title may be unknown.
  const sharedEnding =
    detail && rest[0] === "ending" && rest[1]
      ? (document
          .querySelector('meta[name="storybranch:ending"]')
          ?.getAttribute("content") ?? "")
      : null;
  const sharedResult = !!document.querySelector(
    'meta[name="storybranch:result"]',
  );
  const detailEntry = catalogue.find((c) => c.id === detailId);
  // The story page: Glass Harbor has richer house copy; other stories use
  // their catalogue entry.
  const story =
    detailId === "glass-harbor"
      ? {
          id: "glass-harbor",
          title: "The Glass Harbor",
          genre: "Mystery",
          duration: "5–10 min",
          creator: "Storybranch Studio",
          tagline: "A story that knows which way you turned.",
          description:
            "Climb the rooftops, earn a harbor pass, or follow a stranger into a smaller story. Your stats open routes. Your choices leave a record.",
          chips: ["Teen · mild peril", "Community paths open", "Full text transcripts"],
        }
      : detailEntry
        ? {
            id: detailEntry.id,
            title: detailEntry.title,
            genre: detailEntry.genre,
            duration: detailEntry.duration,
            creator: detailEntry.creator,
            tagline: "",
            description: detailEntry.description,
            chips: detailEntry.rating ? [detailEntry.rating] : [],
          }
        : null;
  const genres = useMemo(
    () =>
      [...new Set(catalogue.map((c) => genreOf(c.genre ?? "")))].filter(
        (g): g is GenreId => !!g,
      ),
    [catalogue],
  );
  const shown = catalogue.filter(
    (c) =>
      (genre === "all" || genreOf(c.genre ?? "") === genre) &&
      `${c.title} ${c.description}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const statusOf = (storyId: string) => {
    const own = saves.filter(
      (s) => s.storyId === storyId && !s.parentPlaythroughId,
    );
    const active = own.find((s) => s.status === "active");
    if (active)
      return { label: "In progress", className: "in-progress", active };
    if (own.length)
      return { label: "Finished", className: "completed", active: undefined };
    return null;
  };

  return (
    <div className="disc">
      {!detail && (
        <section className="disc-hero" aria-labelledby="featured-title">
          <div className="disc-hero-art" aria-hidden="true" />
          <div className="disc-hero-content">
            <p className="disc-hero-kicker">The first Storybranch original</p>
            <h1 id="featured-title">
              The Glass Harbor<span className="disc-hero-period">.</span>
            </h1>
            <p className="disc-hero-sub">
              Some cities keep secrets. This one is waiting for your next move.
            </p>
            <ul className="disc-hero-tags" aria-label="About this story">
              <li>Mystery</li>
              <li>5–10 min</li>
              <li>Choice-driven</li>
            </ul>
            <div className="disc-hero-actions">
              <button
                className="btn btn-primary"
                disabled={disabled || !catalogueReady}
                onClick={() => (resume ? onResume(resume.id) : onStart())}
              >
                {resume ? "Resume adventure" : "Begin your story"}
              </button>
              <button
                className="btn disc-hero-secondary"
                onClick={() => onNavigate("/s/glass-harbor")}
              >
                About this story
              </button>
            </div>
          </div>
        </section>
      )}

      {detail ? (
        <section className="disc-detail" id="story-detail">
          {sharedEnding !== null && (
            <p className="disc-shared" role="note">
              {sharedEnding && sharedResult ? (
                <>
                  A friend got <strong>{sharedEnding}</strong>. What will you
                  get?
                </>
              ) : sharedEnding ? (
                <>
                  A friend reached <strong>{sharedEnding}</strong>. Which ending
                  will you find?
                </>
              ) : (
                "A friend shared an ending from this story. Which one will you find?"
              )}
            </p>
          )}
          {story ? (
            <div className="disc-detail-layout">
              <StoryCover
                storyId={story.id}
                title={story.title}
                className="disc-detail-cover"
              />
              <div className="disc-detail-copy">
                <p className="disc-meta">
                  {[story.genre, story.duration, story.creator && `By ${story.creator}`]
                    .filter(Boolean)
                    .join(" · ") || "An interactive story"}
                </p>
                <h1>{story.title}</h1>
                {story.tagline && <p className="disc-tagline">{story.tagline}</p>}
                <p className="disc-description">{story.description}</p>
                {story.chips.length > 0 && (
                  <ul className="disc-chips">
                    {story.chips.map((chip) => (
                      <li key={chip}>{chip}</li>
                    ))}
                  </ul>
                )}
                <div className="disc-actions">
                  {statusOf(story.id)?.active ? (
                    <button
                      className="btn btn-primary"
                      onClick={() => onResume(statusOf(story.id)!.active!.id)}
                    >
                      Resume adventure
                    </button>
                  ) : null}
                  <button
                    className={
                      statusOf(story.id)?.active
                        ? "btn btn-secondary"
                        : "btn btn-primary"
                    }
                    disabled={disabled || !catalogueReady}
                    onClick={() => onStart(story.id)}
                  >
                    Start a new journey
                  </button>
                  <button
                    className="btn-link"
                    onClick={() => onNavigate("/discover")}
                  >
                    Browse all stories
                  </button>
                </div>
              </div>
            </div>
          ) : catalogueReady ? (
            <div className="disc-empty">
              <h1>This story isn’t available right now.</h1>
              <button
                className="btn btn-primary"
                onClick={() => onNavigate("/discover")}
              >
                Browse all stories
              </button>
            </div>
          ) : (
            <div className="placeholder-block tall" aria-hidden="true" />
          )}
        </section>
      ) : (
        <section
          className="disc-library"
          id="library"
          aria-labelledby="library-title"
        >
          <div className="disc-library-head">
            <div>
              <h2 id="library-title">Explore stories</h2>
              <p className="disc-muted">
                {catalogue.length} playable{" "}
                {catalogue.length === 1 ? "story" : "stories"}. Small worlds,
                meaningful choices.
              </p>
            </div>
            <div className="disc-tools">
              <label className="disc-search">
                <span className="sr-only">Search stories</span>
                <input
                  type="search"
                  placeholder="Search stories"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {genres.length > 0 && (
                <div
                  className="disc-filter"
                  role="group"
                  aria-label="Filter by genre"
                >
                  <button
                    aria-pressed={genre === "all"}
                    onClick={() => setGenre("all")}
                  >
                    All
                  </button>
                  {genres.map((g) => (
                    <button
                      key={g}
                      aria-pressed={genre === g}
                      onClick={() => setGenre(g)}
                    >
                      {genreLabels[g]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="disc-muted">No stories match. Try another search.</p>
          ) : (
            <div className="disc-grid">
              {shown.map((item) => {
                const status = statusOf(item.id);
                return (
                  <article className="disc-card" key={item.id}>
                    <StoryCover storyId={item.id} title={item.title} />
                    <div className="disc-card-body">
                      <p className="disc-meta">
                        {[item.genre, item.duration].filter(Boolean).join(" · ")}
                        {status && (
                          <span className={`disc-status ${status.className}`}>
                            {status.label}
                          </span>
                        )}
                      </p>
                      {/* A generated cover already shows the title. */}
                      {coverArt[item.id] && <h3>{item.title}</h3>}
                      <p className="disc-card-text">{item.description}</p>
                      <div className="disc-card-actions">
                        {status?.active ? (
                          <button
                            className="btn btn-primary btn-small"
                            aria-label={`Resume ${item.title}`}
                            onClick={() => onResume(status.active!.id)}
                          >
                            Resume
                          </button>
                        ) : (
                          <button
                            className="btn btn-primary btn-small"
                            aria-label={`Play ${item.title}`}
                            disabled={disabled}
                            onClick={() => onStart(item.id)}
                          >
                            Play
                          </button>
                        )}
                        <button
                          className="btn btn-secondary btn-small"
                          aria-label={`About ${item.title}`}
                          onClick={() => onNavigate(`/s/${item.id}`)}
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {hasMore && (
            <button
              className="btn btn-secondary disc-more"
              disabled={moreDisabled}
              onClick={onMore}
            >
              More stories
            </button>
          )}
        </section>
      )}
    </div>
  );
}
