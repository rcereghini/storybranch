import { useState, type FormEvent } from "react";
import {
  accentIds,
  avatarIds,
  bannerIds,
  frameIds,
  genreIds,
  profileUpdateSchema,
  type PlayerProfile,
  type ProfileUpdate,
} from "../../../packages/contracts/profile";
import { genreLabels } from "../../../packages/domain/dashboard";
import { Avatar, avatars } from "./avatars";
import { accents, banners, frames } from "./theme";

export type ProfileDraft = Required<ProfileUpdate>;
export const draftOf = (p: PlayerProfile): ProfileDraft => ({
  displayName: p.displayName,
  avatarId: p.avatarId,
  tagline: p.tagline,
  bio: p.bio,
  bannerId: p.bannerId,
  accent: p.accent,
  avatarTint: p.avatarTint,
  avatarFrame: p.avatarFrame,
  favoriteGenres: p.favoriteGenres,
});

const tabs = [
  ["identity", "Identity"],
  ["look", "Look"],
  ["interests", "Interests"],
] as const;
type Tab = (typeof tabs)[number][0];

// Edits a draft the dashboard previews live; nothing is stored until Save.
export function ProfileEditor({
  draft,
  onDraft,
  onSave,
  onCancel,
}: {
  draft: ProfileDraft;
  onDraft: (draft: ProfileDraft) => void;
  onSave: (update: ProfileUpdate) => Promise<void>;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<Tab>("identity");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) =>
    onDraft({ ...draft, [key]: value });
  const toggleGenre = (genre: (typeof genreIds)[number]) =>
    set(
      "favoriteGenres",
      draft.favoriteGenres.includes(genre)
        ? draft.favoriteGenres.filter((g) => g !== genre)
        : [...draft.favoriteGenres, genre],
    );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = profileUpdateSchema.safeParse(draft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue?.message ?? "Check your profile.");
      const field = String(issue?.path[0] ?? "");
      setTab(
        ["displayName", "tagline", "bio"].includes(field)
          ? "identity"
          : field === "favoriteGenres"
            ? "interests"
            : "look",
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(parsed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your profile was not saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="profile-editor" onSubmit={save} noValidate>
      <div className="editor-head">
        <h2>Customize your profile</h2>
        <div className="segmented" role="tablist" aria-label="Profile sections">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "identity" && (
        <div
          role="tabpanel"
          id="panel-identity"
          aria-labelledby="tab-identity"
          className="editor-panel"
        >
          <label className="field">
            <span>Display name</span>
            <input
              value={draft.displayName}
              maxLength={32}
              onChange={(e) => set("displayName", e.target.value)}
              autoComplete="nickname"
            />
            <small>{draft.displayName.trim().length}/32</small>
          </label>
          <label className="field">
            <span>Tagline</span>
            <input
              value={draft.tagline}
              maxLength={80}
              placeholder="Collector of quiet endings"
              onChange={(e) => set("tagline", e.target.value)}
            />
            <small>{draft.tagline.trim().length}/80</small>
          </label>
          <label className="field">
            <span>About you</span>
            <textarea
              value={draft.bio}
              maxLength={500}
              rows={4}
              placeholder="What kinds of stories pull you in?"
              onChange={(e) => set("bio", e.target.value)}
            />
            <small>
              {draft.bio.trim().length}/500 · only you can see your profile
            </small>
          </label>
        </div>
      )}

      {tab === "look" && (
        <div
          role="tabpanel"
          id="panel-look"
          aria-labelledby="tab-look"
          className="editor-panel"
        >
          <fieldset>
            <legend>Avatar</legend>
            <div className="choice-grid avatars">
              {avatarIds.map((id) => (
                <label
                  key={id}
                  className={`choice ${id === draft.avatarId ? "chosen" : ""}`}
                >
                  <input
                    type="radio"
                    name="avatar"
                    checked={id === draft.avatarId}
                    onChange={() => set("avatarId", id)}
                  />
                  <Avatar
                    id={id}
                    size={48}
                    tint={draft.avatarTint}
                    frame={draft.avatarFrame}
                  />
                  <span>{avatars[id].label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Avatar frame</legend>
            <div className="choice-row">
              {frameIds.map((id) => (
                <label
                  key={id}
                  className={`choice pill ${id === draft.avatarFrame ? "chosen" : ""}`}
                >
                  <input
                    type="radio"
                    name="frame"
                    checked={id === draft.avatarFrame}
                    onChange={() => set("avatarFrame", id)}
                  />
                  <Avatar
                    id={draft.avatarId}
                    size={26}
                    tint={draft.avatarTint}
                    frame={id}
                  />
                  <span>{frames[id]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Avatar color</legend>
            <div className="choice-row">
              <label
                className={`choice swatch ${draft.avatarTint === "preset" ? "chosen" : ""}`}
              >
                <input
                  type="radio"
                  name="tint"
                  checked={draft.avatarTint === "preset"}
                  onChange={() => set("avatarTint", "preset")}
                />
                <i style={{ background: avatars[draft.avatarId].tint }} />
                <span>Original</span>
              </label>
              {accentIds.map((id) => (
                <label
                  key={id}
                  className={`choice swatch ${draft.avatarTint === id ? "chosen" : ""}`}
                >
                  <input
                    type="radio"
                    name="tint"
                    checked={draft.avatarTint === id}
                    onChange={() => set("avatarTint", id)}
                  />
                  <i style={{ background: accents[id].color }} />
                  <span>{accents[id].label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Banner</legend>
            <div className="choice-grid banners">
              {bannerIds.map((id) => (
                <label
                  key={id}
                  className={`choice ${id === draft.bannerId ? "chosen" : ""}`}
                >
                  <input
                    type="radio"
                    name="banner"
                    checked={id === draft.bannerId}
                    onChange={() => set("bannerId", id)}
                  />
                  <i className={`banner-swatch banner-${id}`} />
                  <span>{banners[id]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Accent color</legend>
            <div className="choice-row">
              {accentIds.map((id) => (
                <label
                  key={id}
                  className={`choice swatch ${draft.accent === id ? "chosen" : ""}`}
                >
                  <input
                    type="radio"
                    name="accent"
                    aria-label={`${accents[id].label} accent`}
                    checked={draft.accent === id}
                    onChange={() => set("accent", id)}
                  />
                  <i style={{ background: accents[id].color }} />
                  <span aria-hidden="true">{accents[id].label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {tab === "interests" && (
        <div
          role="tabpanel"
          id="panel-interests"
          aria-labelledby="tab-interests"
          className="editor-panel"
        >
          <fieldset>
            <legend>Favorite genres · up to five</legend>
            <div className="choice-row">
              {genreIds.map((id) => {
                const on = draft.favoriteGenres.includes(id);
                return (
                  <label
                    key={id}
                    className={`choice pill ${on ? "chosen" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!on && draft.favoriteGenres.length >= 5}
                      onChange={() => toggleGenre(id)}
                    />
                    <span>{genreLabels[id]}</span>
                  </label>
                );
              })}
            </div>
            <p className="hint">
              Your dashboard recommends unplayed stories in these genres first.
            </p>
          </fieldset>
        </div>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="editor-actions">
        <button className="primary" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
