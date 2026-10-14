import { useEffect, useState, type FormEvent } from "react";
import { createApi } from "../../../packages/api-client/index";
import type { StatId } from "../../../packages/contracts/index";
import {
  avatarIds,
  profileUpdateSchema,
  type AvatarId,
  type DashboardSummary,
  type PlayerProfile,
  type StoryProgress,
} from "../../../packages/contracts/profile";
import { auth } from "./firebase";
import { Avatar, avatars } from "./avatars";

const api = createApi(
  fetch,
  async () => auth.currentUser?.getIdToken() ?? null,
);
const statLabels: Record<StatId, string> = {
  strength: "Strength",
  agility: "Agility",
  intellect: "Intellect",
  resolve: "Resolve",
  charisma: "Charisma",
};
// Shared stats start at 5; the meter shows them against a 10-point scale.
const STAT_SCALE = 10;

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
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<AvatarId>("lantern");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
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
  }, []);
  const openEditor = () => {
    if (!profile) return;
    setName(profile.displayName);
    setAvatar(profile.avatarId);
    setFormError("");
    setEditing(true);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const update = profileUpdateSchema.safeParse({
      displayName: name,
      avatarId: avatar,
    });
    if (!update.success) {
      setFormError(update.error.issues[0]?.message ?? "Check your profile.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      onProfileSaved(await api<PlayerProfile>("/profile", update.data));
      setEditing(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Your profile was not saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard">
      <section className="profile-card" aria-labelledby="profile-name">
        {profile ? (
          <>
            <Avatar
              id={profile.avatarId}
              size={88}
              label={`${avatars[profile.avatarId].label} avatar`}
            />
            <div className="profile-identity">
              <p className="eyebrow">YOUR STORYBRANCH</p>
              <h1 id="profile-name">{profile.displayName}</h1>
              {!editing && (
                <button className="secondary" onClick={openEditor}>
                  Edit profile
                </button>
              )}
            </div>
            <dl className="stat-meters" aria-label="Shared stats">
              {(Object.keys(statLabels) as StatId[]).map((stat) => (
                <div key={stat}>
                  <dt>{statLabels[stat]}</dt>
                  <dd>
                    <span
                      className="meter"
                      style={{
                        width: `${Math.min(100, (profile.stats[stat] / STAT_SCALE) * 100)}%`,
                      }}
                    />
                    <b>{profile.stats[stat]}</b>
                  </dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <div className="placeholder profile-placeholder" aria-hidden="true" />
        )}
      </section>

      {editing && (
        <form className="profile-editor" onSubmit={save} noValidate>
          <h2>Edit profile</h2>
          <label>
            Display name
            <input
              value={name}
              maxLength={32}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
            />
          </label>
          <fieldset>
            <legend>Avatar</legend>
            <div className="avatar-picker">
              {avatarIds.map((id) => (
                <label key={id} className={id === avatar ? "chosen" : ""}>
                  <input
                    type="radio"
                    name="avatar"
                    value={id}
                    checked={id === avatar}
                    onChange={() => setAvatar(id)}
                  />
                  <Avatar id={id} size={56} />
                  <span>{avatars[id].label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="editor-actions">
            <button className="primary" disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loadError ? (
        <div className="notice error" role="alert">
          {loadError} <button onClick={() => void load()}>Retry</button>
        </div>
      ) : !summary ? (
        <div className="placeholder summary-placeholder" role="status">
          <span className="sr-only">Loading your dashboard…</span>
        </div>
      ) : (
        <>
          <section aria-labelledby="glance-title">
            <h2 id="glance-title" className="eyebrow">
              AT A GLANCE
            </h2>
            <ul className="glance">
              {[
                ["Stories started", summary.totals.started],
                ["Stories finished", summary.totals.completed],
                ["Endings found", summary.totals.endingsFound],
                ["Side quests", summary.totals.sideQuests],
                ["Keys collected", summary.totals.keys],
              ].map(([label, value]) => (
                <li key={label}>
                  <b>{value}</b>
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="continue-title">
            <h2 id="continue-title" className="eyebrow">
              WHERE YOU LEFT OFF
            </h2>
            {summary.continue.length === 0 ? (
              <p className="muted">
                Nothing in progress. Pick a story below to begin.
              </p>
            ) : (
              <div className="save-list">
                {summary.continue.map((entry) => (
                  <button
                    key={entry.saveId}
                    aria-label={`Resume ${entry.title}`}
                    onClick={() => onResume(entry.saveId)}
                  >
                    <span>
                      {entry.sideQuest ? "◇ Side quest" : `◆ ${entry.title}`}
                      <strong>{entry.pageTitle}</strong>
                      <small>
                        Saved {new Date(entry.updatedAt).toLocaleString()}
                      </small>
                    </span>
                    <span>Resume ↗</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="goals-title">
            <div className="section-heading">
              <div>
                <h2 id="goals-title" className="eyebrow">
                  WHAT YOU’RE WORKING TOWARD
                </h2>
              </div>
              <button
                className="secondary"
                onClick={() => onNavigate("/discover")}
              >
                Browse all stories
              </button>
            </div>
            <div className="goal-grid">
              {summary.stories.map((story) => (
                <article key={story.storyId} className="goal-card">
                  <p className={`goal-status ${story.status}`}>
                    {story.status === "not-started"
                      ? "NOT STARTED"
                      : story.status === "in-progress"
                        ? "IN PROGRESS"
                        : "FINISHED"}
                  </p>
                  <h3>{story.title}</h3>
                  <p className="muted">{story.description}</p>
                  {story.endingsTotal > 0 && (
                    <div
                      className="endings"
                      role="img"
                      aria-label={`${story.endingsFound} of ${story.endingsTotal} endings found`}
                    >
                      {Array.from({ length: story.endingsTotal }, (_, i) => (
                        <i
                          key={i}
                          className={i < story.endingsFound ? "found" : ""}
                        />
                      ))}
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
                      className={story.activeSaveId ? "secondary" : "primary"}
                      disabled={disabled}
                      onClick={() => onStart(story.storyId)}
                    >
                      {story.status === "not-started"
                        ? `Play ${story.title} ↗`
                        : `Play ${story.title} again`}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {summary.recentEndings.length > 0 && (
            <section aria-labelledby="endings-title">
              <h2 id="endings-title" className="eyebrow">
                RECENT ENDINGS
              </h2>
              <ul className="ending-list">
                {summary.recentEndings.map((ending) => (
                  <li key={ending.saveId}>
                    <strong>{ending.pageTitle}</strong>
                    <span>{ending.title}</span>
                    <small>{new Date(ending.at).toLocaleDateString()}</small>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
