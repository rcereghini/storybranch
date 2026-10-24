import { useEffect, useState } from "react";
import { createApi } from "../../../packages/api-client/index";
import type { StatId } from "../../../packages/contracts/index";
import type {
  DashboardSummary,
  PlayerProfile,
  ProfileUpdate,
} from "../../../packages/contracts/profile";
import { genreLabels } from "../../../packages/domain/dashboard";
import { auth } from "./firebase";
import { Avatar, avatars } from "./avatars";
import { ProfileEditor, draftOf, type ProfileDraft } from "./ProfileEditor";
import { StoryCover } from "./StoryCover";
import { coverArt } from "./cover-palette";
import { endingLink, shareLink } from "./share";
import "./dashboard.css";

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
const greeting = () => {
  const hour = new Date().getHours();
  return hour < 5 || hour >= 18
    ? "Good evening"
    : hour < 12
      ? "Good morning"
      : "Good afternoon";
};

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
  const [shareStatus, setShareStatus] = useState("");
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
  const [spotlight, ...others] = summary?.continue ?? [];
  const drafts = studio && studio !== "unavailable" ? studio.items : [];

  const name = view?.displayName.trim() || "Player";
  const progressOf = (storyId: string) =>
    summary?.stories.find((s) => s.storyId === storyId);
  const spotlightProgress = spotlight
    ? progressOf(spotlight.storyId)
    : undefined;

  return (
    <div className="dash">
      <section className="dash-top">
        <div className="dash-main">
          <div className="dash-greeting">
            <p>{greeting()}</p>
            <h1>Welcome back, {name}</h1>
          </div>
          {loadError ? (
            <div className="notice error" role="alert">
              {loadError} <button onClick={() => void load()}>Retry</button>
            </div>
          ) : !summary ? (
            <div className="dash-card placeholder-block tall" role="status">
              <span className="sr-only">Loading your dashboard…</span>
            </div>
          ) : spotlight ? (
            <article className="dash-card dash-continue">
              <StoryCover storyId={spotlight.storyId} title={spotlight.title} />
              <div className="dash-continue-body">
                <p className="dash-kicker">
                  Continue · {spotlight.sideQuest ? "Side quest · " : ""}
                  {spotlight.title}
                </p>
                <h2>{spotlight.storyNodeTitle}</h2>
                <p className="dash-muted">Saved {ago(spotlight.updatedAt)}</p>
                {spotlightProgress && spotlightProgress.endingsTotal > 0 && (
                  <div
                    className="dash-progress"
                    role="img"
                    aria-label={`${spotlightProgress.endingsFound} of ${spotlightProgress.endingsTotal} endings found`}
                  >
                    <span className="dash-track">
                      <span
                        style={{
                          width: `${Math.max(4, (spotlightProgress.endingsFound / spotlightProgress.endingsTotal) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className="dash-muted">
                      {spotlightProgress.endingsFound} of{" "}
                      {spotlightProgress.endingsTotal} endings
                    </span>
                  </div>
                )}
                <div className="dash-actions">
                  <button
                    className="btn btn-primary"
                    aria-label={`Resume ${spotlight.title}`}
                    onClick={() => onResume(spotlight.saveId)}
                  >
                    Resume story
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => onNavigate("/adventures")}
                  >
                    All adventures
                  </button>
                </div>
              </div>
            </article>
          ) : (
            <article className="dash-card dash-empty">
              <h2>Pick your first story</h2>
              <p className="dash-muted">
                Every choice opens a different path. Start one and it will wait
                for you here.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => onNavigate("/discover")}
              >
                Find a story
              </button>
            </article>
          )}
          {others.length > 0 && (
            <ul className="dash-also" aria-label="Also in progress">
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
                      <strong>{entry.storyNodeTitle}</strong>
                      <small>
                        {entry.sideQuest ? "Side quest · " : ""}
                        {entry.title} · {ago(entry.updatedAt)}
                      </small>
                    </span>
                    <span className="dash-also-go">Resume</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside
          className="dash-card dash-profile"
          aria-labelledby="profile-name"
        >
          <div className={`dash-banner banner-${view?.bannerId ?? "harbor"}`} />
          {view ? (
            <div className="dash-identity">
              <Avatar
                id={view.avatarId}
                size={72}
                tint={view.avatarTint}
                frame={view.avatarFrame}
                label={`${avatars[view.avatarId].label} avatar`}
              />
              <div className="dash-identity-text">
                <h2 id="profile-name">{name}</h2>
                {view.tagline.trim() && <p>{view.tagline}</p>}
              </div>
              {!draft && (
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => setDraft(draftOf(profile!))}
                >
                  Edit profile
                </button>
              )}
            </div>
          ) : (
            <div className="placeholder-block short" aria-hidden="true" />
          )}
          {view && view.favoriteGenres.length > 0 && (
            <ul className="dash-chips" aria-label="Favorite genres">
              {view.favoriteGenres.map((g) => (
                <li key={g}>{genreLabels[g]}</li>
              ))}
            </ul>
          )}
          {view?.bio.trim() && <p className="dash-bio">{view.bio}</p>}
          {summary && (
            <ul className="dash-stats" aria-label="Your progress">
              {(
                [
                  ["Stories started", summary.totals.started],
                  ["Endings found", summary.totals.endingsFound],
                  ["Side quests", summary.totals.sideQuests],
                ] as const
              ).map(([label, value]) => (
                <li key={label}>
                  <b>{value}</b>
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          )}
          {profile && (
            <dl className="dash-meters" aria-label="Shared stats">
              {(Object.keys(statLabels) as StatId[]).map((stat) => (
                <div key={stat}>
                  <dt>{statLabels[stat]}</dt>
                  <dd>
                    <span className="dash-track">
                      <span
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
        </aside>
      </section>

      {draft && (
        <ProfileEditor
          draft={draft}
          onDraft={setDraft}
          onSave={save}
          onCancel={() => setDraft(null)}
        />
      )}

      {summary && summary.recommendations.length > 0 && (
        <section aria-labelledby="next-title" className="dash-section">
          <div className="dash-section-head">
            <h2 id="next-title">Up next for you</h2>
            <button
              className="btn-link"
              onClick={() => onNavigate("/discover")}
            >
              Browse all stories
            </button>
          </div>
          <div className="dash-cards">
            {summary.recommendations.map((rec) => (
              <article key={rec.storyId} className="dash-card dash-story">
                <StoryCover storyId={rec.storyId} title={rec.title} />
                <div className="dash-story-body">
                  <p className="dash-reason">{rec.reason}</p>
                  {/* A generated cover already shows the title. */}
                  {coverArt[rec.storyId] && <h3>{rec.title}</h3>}
                  <p className="dash-muted">{rec.description}</p>
                  <button
                    className="btn btn-secondary"
                    aria-label={`Start ${rec.title}`}
                    disabled={disabled}
                    onClick={() => onStart(rec.storyId)}
                  >
                    Start story
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {summary && summary.recentEndings.length > 0 && (
        <section aria-labelledby="endings-title" className="dash-section">
          <div className="dash-section-head">
            <h2 id="endings-title">Endings you found</h2>
          </div>
          <ul className="dash-endings">
            {summary.recentEndings.map((ending) => (
              <li key={ending.saveId} className="dash-card">
                <span>
                  <strong>{ending.storyNodeTitle}</strong>
                  <small>
                    {ending.title} · {new Date(ending.at).toLocaleDateString()}
                  </small>
                </span>
                {/* Side-quest endings have no public story StoryNode. */}
                {summary.stories.some((s) => s.storyId === ending.storyId) && (
                  <button
                    className="btn btn-secondary btn-small"
                    aria-label={`Share ${ending.storyNodeTitle}`}
                    onClick={async () =>
                      setShareStatus(
                        await shareLink(
                          {
                            title: `${ending.storyNodeTitle} · ${ending.title}`,
                            text: `I reached “${ending.storyNodeTitle}” in ${ending.title}. Which ending will you find?`,
                            url: endingLink(ending.storyId, ending.storyNodeId),
                          },
                          "Ending link",
                        ),
                      )
                    }
                  >
                    Share
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="dash-muted" role="status">
            {shareStatus}
          </p>
        </section>
      )}

      <section className="dash-bottom">
        <div className="dash-card dash-studio" aria-labelledby="studio-title">
          <div>
            <h2 id="studio-title">Your studio</h2>
            {studio === null ? (
              <p className="dash-studio-muted">Loading your drafts…</p>
            ) : studio === "unavailable" ? (
              <p className="dash-studio-muted">
                Studio is unavailable right now.
              </p>
            ) : drafts.length === 0 ? (
              <p className="dash-studio-muted">
                No drafts yet. Write a branching story or a personality quiz.
              </p>
            ) : (
              <ul className="dash-drafts">
                {drafts.slice(0, 3).map((d) => (
                  <li key={d.id}>
                    <strong>{d.title || "Untitled story"}</strong>
                    <small>
                      {d.publishedVersionId ? "Published" : "Private draft"} ·
                      revision {d.revision}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            className="btn btn-coral"
            onClick={() => onNavigate("/studio")}
          >
            {drafts.length === 0 ? "Start creating" : "Open Studio"}
          </button>
        </div>
        <div
          className="dash-card dash-activity"
          aria-labelledby="activity-title"
        >
          <h2 id="activity-title">Recent activity</h2>
          {!summary ? null : summary.activity.length === 0 ? (
            <p className="dash-muted">
              Your choices will appear here as you play.
            </p>
          ) : (
            <ol>
              {summary.activity.map((item, i) => (
                <li key={`${item.saveId}-${item.at}-${i}`}>
                  <span className="dash-dot" aria-hidden="true" />
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
        </div>
      </section>
    </div>
  );
}
