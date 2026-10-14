import { useMemo, useState } from "react";
import type { Save } from "../../../packages/contracts/index";
import { genreLabels, genreOf } from "../../../packages/domain/dashboard";
import type { GenreId } from "../../../packages/contracts/profile";
import { StoryCover } from "./StoryCover";

export type CatalogueEntry = {
  id: string;
  title: string;
  description: string;
  genre?: string;
  duration?: string;
  creator?: string;
  rating?: string;
};

// The public catalogue: the featured Glass Harbor hero, a searchable story
// library, and the Glass Harbor detail view under /s/.
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
  const detail = path.startsWith("/s/");
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
    <div className="discover-page">
      <section className="hero">
        <div className="hero-art" />
        <div className="hero-content">
          <p className="eyebrow">
            <span className="live-dot" /> THE FIRST STORYBRANCH ORIGINAL
          </p>
          <h1>
            The Glass
            <br />
            <em>Harbor</em>
            <span className="title-period">.</span>
          </h1>
          <p className="hero-subtitle">
            Some cities keep secrets.
            <br />
            This one is waiting for your next move.
          </p>
          <div className="tags">
            <span>MYSTERY</span>
            <span>5–10 MIN</span>
            <span>CHOICE-DRIVEN</span>
          </div>
          <div className="hero-actions">
            <button
              className="primary"
              disabled={disabled || !catalogueReady}
              onClick={() => (resume ? onResume(resume.id) : onStart())}
            >
              {resume ? "Resume adventure" : "Begin your story"} <span>↗</span>
            </button>
            <button
              className="secondary"
              onClick={() =>
                document
                  .getElementById(detail ? "story-detail" : "library")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Explore the story ↓
            </button>
          </div>
          <p className="hero-note">One harbor. Many ways home.</p>
        </div>
      </section>

      {detail ? (
        <section className="story-detail" id="story-detail">
          <StoryCover
            storyId="glass-harbor"
            title="The Glass Harbor"
            className="detail-cover"
          />
          <div className="detail-copy">
            <p className="eyebrow">
              MYSTERY · 5–10 MIN · BY STORYBRANCH STUDIO
            </p>
            <h2>A story that knows which way you turned.</h2>
            <p>
              Climb the rooftops, earn a harbor pass, or follow a stranger into
              a smaller story. Your stats open routes. Your choices leave a
              record.
            </p>
            <ul className="chips">
              <li>Teen · mild peril</li>
              <li>Community paths open</li>
              <li>Full text transcripts</li>
            </ul>
            <div className="detail-actions">
              <button
                className="primary"
                disabled={disabled || !catalogueReady}
                onClick={() => onStart()}
              >
                Start a new journey ↗
              </button>
              <button className="ghost" onClick={() => onNavigate("/discover")}>
                Browse all stories
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section
          className="library-section"
          id="library"
          aria-labelledby="library-title"
        >
          <div className="row-head">
            <div>
              <p className="eyebrow">SMALL WORLDS. MEANINGFUL CHOICES.</p>
              <h2 id="library-title">Your next adventure</h2>
            </div>
            <span className="muted">{catalogue.length} playable stories</span>
          </div>
          <div className="library-tools">
            <label className="search">
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
                className="segmented"
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
          {shown.length === 0 ? (
            <p className="muted">No stories match. Try another search.</p>
          ) : (
            <div className="story-grid">
              {shown.map((item) => {
                const status = statusOf(item.id);
                return (
                  <article className="story-tile" key={item.id}>
                    <StoryCover storyId={item.id} title={item.title} />
                    <div className="story-tile-body">
                      <div className="meta">
                        {item.genre && <span>{item.genre}</span>}
                        {item.duration && <span>{item.duration}</span>}
                        {status && (
                          <span className={`status-badge ${status.className}`}>
                            {status.label}
                          </span>
                        )}
                      </div>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                      <div className="tile-actions">
                        {status?.active ? (
                          <button
                            className="primary"
                            aria-label={`Resume ${item.title}`}
                            onClick={() => onResume(status.active!.id)}
                          >
                            Resume ↗
                          </button>
                        ) : (
                          <button
                            className="primary"
                            disabled={disabled}
                            onClick={() => onStart(item.id)}
                          >
                            Play {item.title} ↗
                          </button>
                        )}
                        {item.id === "glass-harbor" && (
                          <button
                            className="ghost"
                            onClick={() =>
                              onNavigate("/s/glass-harbor/the-glass-harbor")
                            }
                          >
                            Details
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {hasMore && (
            <button
              className="ghost more"
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
