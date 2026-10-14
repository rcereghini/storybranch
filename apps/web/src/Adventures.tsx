import type { Save } from "../../../packages/contracts/index";
import type { CatalogueEntry } from "./Discover";
import { StoryCover } from "./StoryCover";

// docs/03: My Adventures separates active main stories, side quests and
// completed stories.
export function Adventures({
  signedIn,
  loaded,
  saves,
  savesError,
  catalogue,
  hasMore,
  onLoadMore,
  onResume,
  onSignIn,
  onDiscover,
}: {
  signedIn: boolean;
  // False until the first save-list load for this player finishes.
  loaded: boolean;
  saves: Save[];
  savesError: boolean;
  catalogue: CatalogueEntry[];
  hasMore: boolean;
  onLoadMore: () => void;
  onResume: (saveId: string) => void;
  onSignIn: () => void;
  onDiscover: () => void;
}) {
  const titleOf = (s: Save) =>
    catalogue.find((c) => c.id === s.storyId)?.title ??
    s.storyId.replaceAll("-", " ");
  const groups = [
    {
      id: "active",
      title: "In progress",
      items: saves.filter(
        (s) => !s.parentPlaythroughId && s.status === "active",
      ),
    },
    {
      id: "side",
      title: "Side quests",
      items: saves.filter((s) => s.parentPlaythroughId),
    },
    {
      id: "done",
      title: "Finished",
      items: saves.filter(
        (s) => !s.parentPlaythroughId && s.status === "completed",
      ),
    },
  ].filter((g) => g.items.length > 0);

  return (
    <section className="adventures-page" aria-labelledby="adventures-title">
      <p className="eyebrow">YOUR JOURNEYS</p>
      <h1 id="adventures-title">Pick up the thread.</h1>
      {!signedIn ? (
        <div className="empty-state">
          <p>
            Sign in to keep every journey, side quest and ending in one place.
          </p>
          <button className="primary" onClick={onSignIn}>
            Sign in to see your saves
          </button>
        </div>
      ) : !loaded && saves.length === 0 ? (
        <ul className="adventure-list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="placeholder-block row-placeholder" />
          ))}
        </ul>
      ) : savesError && saves.length === 0 ? (
        <p className="muted">
          Your saved adventures will appear when the list is available.
        </p>
      ) : saves.length === 0 ? (
        <div className="empty-state">
          <p>No adventures yet. Your first choice is waiting.</p>
          <button className="primary" onClick={onDiscover}>
            Discover
          </button>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.id} className="adventure-group">
            <h2 className="panel-title">
              {group.title} <span className="count">{group.items.length}</span>
            </h2>
            <ul className="adventure-list">
              {group.items.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => onResume(s.id)}
                    aria-label={`Resume ${titleOf(s)}`}
                  >
                    <StoryCover
                      storyId={s.storyId}
                      title={titleOf(s)}
                      className="thumb"
                    />
                    <span className="adventure-copy">
                      <small>{titleOf(s)}</small>
                      <strong>
                        {s.pageId
                          ? s.pageId.replaceAll("-", " ")
                          : "Earlier prototype · start a new journey"}
                      </strong>
                      <span className="muted">
                        Edition {s.versionId} ·{" "}
                        {new Date(s.updatedAt).toLocaleString()}
                      </span>
                    </span>
                    <span className="pill-action">
                      {s.status === "completed" ? "Revisit ↗" : "Resume ↗"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {hasMore && (
        <button className="ghost more" onClick={onLoadMore}>
          Load more adventures
        </button>
      )}
    </section>
  );
}
