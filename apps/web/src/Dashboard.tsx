import { useEffect, useState, type CSSProperties } from "react";
import { createApi } from "../../../packages/api-client/index";
import type { StatId } from "../../../packages/contracts/index";
import type {
  DashboardSummary,
  PlayerProfile,
  ProfileUpdate,
  StoryProgress,
} from "../../../packages/contracts/profile";
import { genreLabels } from "../../../packages/domain/dashboard";
import { auth } from "./firebase";
import { Avatar, avatars } from "./avatars";
import { ProfileEditor, draftOf, type ProfileDraft } from "./ProfileEditor";
import { StoryCover } from "./StoryCover";
import { accents } from "./theme";

const api = createApi(
  fetch,
  async () => auth.currentUser?.getIdToken() ?? null,
);
type StudioListing = {
  items: {
    id: string;
    title: string;
    revision: number;
    publishedVersionId: string | null;
  }[];
  canPublish: boolean;
};
const statLabels: Record<StatId, string> = {
  strength: "Strength",
  agility: "Agility",
  intellect: "Intellect",
  resolve: "Resolve",
  charisma: "Charisma",
};
// Shared stats start at 5; meters show them against a 10-point scale.
const STAT_SCALE = 10;
const ago = (at: number) => {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days} d ago` : new Date(at).toLocaleDateString();
};
function goal(story: StoryProgress) {
  const left = story.endingsTotal - story.endingsFound;
  if (story.status === "not-started") return "Begin your first journey";
  if (story.endingsTotal === 0)
    return story.status === "completed" ? "Story finished" : "In progress";
  if (left === 0) return "Every ending found";
  return story.status === "in-progress"
    ? `Reach an ending · ${left} still undiscovered`
    : `Find ${left} more ending${left === 1 ? "" : "s"}`;
}

export function Dashboard({
  profile,
  disabled,
  onProfileSaved,
  onResume,
  onStart,
  onNavigate,
}: {
  profile: PlayerProfile | null;
  disabled: boolean;
  onProfileSaved: (profile: PlayerProfile) => void;
  onResume: (saveId: string) => void;
  onStart: (storyId: string) => void;
  onNavigate: (path: string) => void;
}) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [studio, setStudio] = useState<StudioListing | null | "unavailable">(
    null,
  );
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const load = async () => {
    setLoadError("");
    try {
      const result = await api<{
        profile: PlayerProfile;
        summary: DashboardSummary;
      }>("/dashboard");
      setSummary(result.summary);
      onProfileSaved(result.profile);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load your dashboard.",
      );
    }
  };
  useEffect(() => {
    void load();
    api<StudioListing>("/studio?limit=50")
      .then(setStudio)
      .catch(() => setStudio("unavailable"));
  }, []);
  const save = async (update: ProfileUpdate) => {
    onProfileSaved(await api<PlayerProfile>("/profile", update));
    setDraft(null);
    // Favorite genres change recommendations.
    void load();
  };
  // While editing, the header previews the draft.
  const view = profile ? { ...profile, ...(draft ?? {}) } : null;
  const accent = view ? accents[view.accent].color : undefined;
  const [spotlight, ...others] = summary?.continue ?? [];
  const drafts = studio && studio !== "unavailable" ? studio.items : [];

  return (
    <div
      className="hub"
      style={accent ? ({ "--accent": accent } as CSSProperties) : undefined}
    >
      <section
        className={`hub-hero banner-${view?.bannerId ?? "harbor"}`}
        aria-labelledby="profile-name"
      >
        {view ? (
          <div className="hub-hero-inner">
            <Avatar
              id={view.avatarId}
              size={112}
              tint={view.avatarTint}
              frame={view.avatarFrame}
              label={`${avatars[view.avatarId].label} avatar`}
            />
            <div className="hub-identity">
              <p className="eyebrow">YOUR STORYBRANCH</p>
              <h1 id="profile-name">{view.displayName.trim() || "Player"}</h1>
              {view.tagline.trim() && <p className="tagline">{view.tagline}</p>}
              {view.favoriteGenres.length > 0 && (
                <ul className="chips" aria-label="Favorite genres">
                  {view.favoriteGenres.map((g) => (
                    <li key={g}>{genreLabels[g]}</li>
                  ))}
                </ul>
              )}
            </div>
            {!draft && (
              <button
                className="glass"
                onClick={() => setDraft(draftOf(profile!))}
              >
                Customize profile
              </button>
            )}
            {view.bio.trim() && <p className="bio">{view.bio}</p>}
          </div>
        ) : (
          <div
            className="hub-hero-inner placeholder-block"
            aria-hidden="true"
          />
        )}
      </section>

      {draft && (
        <ProfileEditor
          draft={draft}
          onDraft={setDraft}
          onSave={save}
          onCancel={() => setDraft(null)}
        />
      )}

      {loadError ? (
        <div className="notice error" role="alert">
          {loadError} <button onClick={() => void load()}>Retry</button>
        </div>
      ) : !summary ? (
        <div className="hub-grid" role="status">
          <span className="sr-only">Loading your dashboard…</span>
          <div
            className="panel span-8 placeholder-block tall"
            aria-hidden="true"
          />
          <div
            className="panel span-4 placeholder-block tall"
            aria-hidden="true"
          />
        </div>
      ) : (
        <div className="hub-grid">
          <section
            className="panel span-8 spotlight"
            aria-labelledby="continue-title"
          >
            <h2 id="continue-title" className="panel-title">
              Continue your story
            </h2>
            {spotlight ? (
              <>
                <button
                  className="spotlight-card"
                  aria-label={`Resume ${spotlight.title}`}
                  onClick={() => onResume(spotlight.saveId)}
                >
                  <StoryCover
                    storyId={spotlight.storyId}
                    title={spotlight.title}
                  />
                  <span className="spotlight-copy">
                    <small>
                      {spotlight.sideQuest ? "Side quest · " : ""}
                      {spotlight.title}
                    </small>
                    <strong>{spotlight.pageTitle}</strong>
                    <span className="muted">
                      Saved {ago(spotlight.updatedAt)}
                    </span>
                    <span className="pill-action">Resume ↗</span>
                  </span>
                </button>
                {others.length > 0 && (
                  <ul className="compact-list">
                    {others.map((entry) => (
                      <li key={entry.saveId}>
                        <button
                          aria-label={`Resume ${entry.title}`}
                          onClick={() => onResume(entry.saveId)}
                        >
                          <StoryCover
                            storyId={entry.storyId}
                            title={entry.title}
                            className="thumb"
                          />
                          <span>
                            <strong>{entry.pageTitle}</strong>
                            <small>
                              {entry.sideQuest ? "Side quest · " : ""}
                              {entry.title} · {ago(entry.updatedAt)}
                            </small>
                          </span>
                          <span aria-hidden="true">↗</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="empty-state">
                <p>Nothing in progress. Your next adventure is a click away.</p>
                <button
                  className="primary"
                  onClick={() => onNavigate("/discover")}
                >
                  Find a story
                </button>
              </div>
            )}
          </section>

          <section className="panel span-4" aria-labelledby="stats-title">
            <h2 id="stats-title" className="panel-title">
              Your progress
            </h2>
            <ul className="glance">
              {(
                [
                  ["Stories started", summary.totals.started],
                  ["Stories finished", summary.totals.completed],
                  ["Endings found", summary.totals.endingsFound],
                  ["Side quests", summary.totals.sideQuests],
                  ["Keys collected", summary.totals.keys],
                  ["Milestones", summary.totals.milestones],
                ] as const
              ).map(([label, value]) => (
                <li key={label}>
                  <b>{value}</b>
                  <span>{label}</span>
                </li>
              ))}
            </ul>
            {profile && (
              <dl className="stat-meters" aria-label="Shared stats">
                {(Object.keys(statLabels) as StatId[]).map((stat) => (
                  <div key={stat}>
                    <dt>{statLabels[stat]}</dt>
                    <dd>
                      <span className="track">
                        <span
                          className="meter"
                          style={{
                            width: `${Math.min(100, (profile.stats[stat] / STAT_SCALE) * 100)}%`,
                          }}
                        />
                      </span>
                      <b>{profile.stats[stat]}</b>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section className="span-12" aria-labelledby="goals-title">
            <div className="row-head">
              <h2 id="goals-title" className="panel-title">
                What you’re working toward
              </h2>
              <button className="ghost" onClick={() => onNavigate("/discover")}>
                Browse all stories ↗
              </button>
            </div>
            <div className="goal-grid">
              {summary.stories.map((story) => (
                <article key={story.storyId} className="goal-card">
                  <StoryCover storyId={story.storyId} title={story.title} />
                  <div className="goal-body">
                    <p className={`status-badge ${story.status}`}>
                      {story.status === "not-started"
                        ? "Not started"
                        : story.status === "in-progress"
                          ? "In progress"
                          : "Finished"}
                    </p>
                    <h3>{story.title}</h3>
                    {story.endingsTotal > 0 && (
                      <div
                        className="endings"
                        role="img"
                        aria-label={`${story.endingsFound} of ${story.endingsTotal} endings found`}
                      >
                        <span className="endings-track">
                          <span
                            style={{
                              width: `${(story.endingsFound / story.endingsTotal) * 100}%`,
                            }}
                          />
                        </span>
                        <span>
                          {story.endingsFound}/{story.endingsTotal} endings
                        </span>
                      </div>
                    )}
                    <p className="goal-next">{goal(story)}</p>
                    <div className="goal-actions">
                      {story.activeSaveId && (
                        <button
                          className="primary"
                          aria-label={`Resume ${story.title}`}
                          onClick={() => onResume(story.activeSaveId!)}
                        >
                          Resume ↗
                        </button>
                      )}
                      <button
                        className={story.activeSaveId ? "ghost" : "primary"}
                        disabled={disabled}
                        onClick={() => onStart(story.storyId)}
                      >
                        {story.status === "not-started"
                          ? `Play ${story.title} ↗`
                          : `Play ${story.title} again`}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel span-7" aria-labelledby="activity-title">
            <h2 id="activity-title" className="panel-title">
              Recent activity
            </h2>
            {summary.activity.length === 0 ? (
              <p className="muted">
                Your choices will appear here as you play.
              </p>
            ) : (
              <ol className="timeline">
                {summary.activity.map((item, i) => (
                  <li key={`${item.saveId}-${item.at}-${i}`}>
                    <span className="dot" aria-hidden="true" />
                    <span>
                      <strong>{item.label}</strong>
                      <small>
                        {item.title} · {ago(item.at)}
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section
            className="panel span-5 creator"
            aria-labelledby="creator-title"
          >
            <h2 id="creator-title" className="panel-title">
              Creator corner
            </h2>
            {studio === null ? (
              <div className="placeholder-block short" aria-hidden="true" />
            ) : studio === "unavailable" ? (
              <p className="muted">Studio is unavailable right now.</p>
            ) : (
              <>
                <div className="creator-stats">
                  <span>
                    <b>{drafts.length}</b> draft{drafts.length === 1 ? "" : "s"}
                  </span>
                  <span>
                    <b>{drafts.filter((d) => d.publishedVersionId).length}</b>{" "}
                    published
                  </span>
                </div>
                {drafts.length === 0 ? (
                  <p className="muted">
                    Write your own branching story with any page type.
                  </p>
                ) : (
                  <ul className="draft-list">
                    {drafts.slice(0, 3).map((d) => (
                      <li key={d.id}>
                        <strong>{d.title || "Untitled story"}</strong>
                        <small>
                          {d.publishedVersionId ? "Published" : "Private draft"}{" "}
                          · revision {d.revision}
                        </small>
                      </li>
                    ))}
                  </ul>
                )}
                <button className="ghost" onClick={() => onNavigate("/studio")}>
                  {drafts.length === 0 ? "Start creating ↗" : "Open Studio ↗"}
                </button>
              </>
            )}
          </section>

          {summary.recommendations.length > 0 && (
            <section className="span-12" aria-labelledby="recommend-title">
              <h2 id="recommend-title" className="panel-title">
                Recommended for you
              </h2>
              <div className="recommend-grid">
                {summary.recommendations.map((rec) => (
                  <article key={rec.storyId} className="recommend-card">
                    <StoryCover storyId={rec.storyId} title={rec.title} />
                    <div>
                      <p className="reason">{rec.reason}</p>
                      <h3>{rec.title}</h3>
                      <p className="muted">{rec.description}</p>
                      <button
                        className="ghost"
                        aria-label={`Start ${rec.title}`}
                        disabled={disabled}
                        onClick={() => onStart(rec.storyId)}
                      >
                        Start story ↗
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {summary.recentEndings.length > 0 && (
            <section className="span-12" aria-labelledby="endings-title">
              <h2 id="endings-title" className="panel-title">
                Endings collection
              </h2>
              <ul className="ending-badges">
                {summary.recentEndings.map((ending) => (
                  <li key={ending.saveId}>
                    <span className="gem" aria-hidden="true">
                      ◆
                    </span>
                    <span>
                      <strong>{ending.pageTitle}</strong>
                      <small>
                        {ending.title} ·{" "}
                        {new Date(ending.at).toLocaleDateString()}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
