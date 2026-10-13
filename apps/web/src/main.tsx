import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth, emulatorMode } from "./firebase";
import { createApi, ApiError } from "../../../packages/api-client/index";
import { evaluate } from "../../../packages/domain/index";
import type { Save, Story } from "../../../packages/contracts/index";
import "./style.css";
import { ScenePlayer } from "./ScenePlayer";
import { ShareStory } from "./ShareStory";
import type { SceneMedia } from "../../../packages/contracts/media";
const api = createApi(fetch, async () =>
  auth.currentUser ? auth.currentUser.getIdToken() : null,
);
type Branch = { id: string; title: string; author: string };
type Player = {
  media?: SceneMedia;
  save: Save;
  node: Story["nodes"][string];
  branches: Branch[];
  featuredId: string | null;
};
type Event = {
  label: string;
  to: string;
  outcome?: string;
  revision: number;
  at: number;
};
type Pending = { path: string; body: unknown };
function App() {
  const [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(false),
    [path, setPath] = useState(location.pathname),
    [saves, setSaves] = useState<Save[]>([]),
    [saveCursor, setSaveCursor] = useState<string | null>(null),
    [player, setPlayer] = useState<Player | null>(null),
    [playing, setPlaying] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stale, setStale] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine),
    [login, setLogin] = useState(false),
    [email, setEmail] = useState(emulatorMode ? "player@storybranch.test" : ""),
    [password, setPassword] = useState(emulatorMode ? "HarborDemo123!" : ""),
    [events, setEvents] = useState<Event[]>([]),
    [logCursor, setLogCursor] = useState<string | null>(null),
    [logOpen, setLogOpen] = useState(false),
    [pending, setPending] = useState<Pending | null>(null),
    [catalogueReady, setCatalogueReady] = useState(false);
  const navigate = (p: string) => {
    history.pushState({}, "", p);
    setPath(p);
    setError("");
    setLogOpen(false);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    if (!login) return;
    const previous = document.activeElement as HTMLElement | null;
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLogin(false);
      if (event.key !== "Tab") return;
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"] button:not(:disabled), [role="dialog"] input',
        ),
      );
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, [login]);
  useEffect(() => {
    const pop = () => setPath(location.pathname);
    const online = () => setOffline(!navigator.onLine);
    window.addEventListener("popstate", pop);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      setPlayer(null);
      setSaves([]);
      setPending(null);
    });
    return () => {
      unsub();
      window.removeEventListener("popstate", pop);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, []);
  const report = (e: unknown) => {
    setError(
      e instanceof Error ? e.message : "Unable to connect. Please retry.",
    );
    setStale(e instanceof ApiError && e.code === "STALE_REVISION");
  };
  const loadSaves = async (cursor?: string) => {
    const requestingUid = auth.currentUser?.uid;
    const r = await api<{ items: Save[]; nextCursor: string | null }>(
      `/playthroughs${cursor ? `?cursor=${cursor}` : ""}`,
    );
    if (auth.currentUser?.uid !== requestingUid) return;
    setSaves((old) => (cursor ? [...old, ...r.items] : r.items));
    setSaveCursor(r.nextCursor);
  };
  const loadPlayer = async (id: string) => {
    const requestingUid = auth.currentUser?.uid;
    const p = await api<Player>(`/playthroughs/${id}`);
    if (
      auth.currentUser?.uid !== requestingUid ||
      location.pathname !== `/play/${id}`
    )
      return;
    setPlayer(p);
    setStale(false);
    setError("");
  };
  const refresh = async () => {
    setBusy(true);
    try {
      if (path.startsWith("/play/")) await loadPlayer(path.split("/")[2]);
      else {
        const catalogue = await api<{ items: Array<{ id: string }> }>(
          "/catalogue",
        );
        const ready = catalogue.items.some(
          (item) => item.id === "glass-harbor",
        );
        setCatalogueReady(ready);
        if (!ready)
          throw new Error(
            emulatorMode
              ? "No adventures are seeded yet. Run pnpm seed, then retry."
              : "The story library is not ready yet. Please try again shortly.",
          );
        if (user) await loadSaves();
      }
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    setPlayer(null);
    setPending(null);
    if (!path.startsWith("/play/") || user) void refresh();
  }, [path, user]);
  const command = async (p: Pending) => {
    if (offline || busy) return;
    const requestingUid = auth.currentUser?.uid;
    setPending(p);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ save: Save }>(p.path, p.body);
      if (auth.currentUser?.uid !== requestingUid) return;
      setPending(null);
      if (path !== `/play/${result.save.id}`)
        navigate(`/play/${result.save.id}`);
      else await loadPlayer(result.save.id);
      await loadSaves();
    } catch (e) {
      report(e);
      if (e instanceof ApiError && e.code !== "UNAVAILABLE") setPending(null);
    } finally {
      setBusy(false);
    }
  };
  const start = () => {
    if (!user) {
      setLogin(true);
      return;
    }
    void command({
      path: "/playthroughs",
      body: {
        idempotencyKey: crypto.randomUUID(),
        payload: { storyId: "glass-harbor" },
      },
    });
  };
  const choose = (choiceId: string) =>
    player &&
    command({
      path: `/playthroughs/${player.save.id}/choices`,
      body: {
        idempotencyKey: crypto.randomUUID(),
        expectedRevision: player.save.revision,
        payload: { choiceId },
      },
    });
  const branch = (branchId: string) =>
    player &&
    command({
      path: `/playthroughs/${player.save.id}/branches`,
      body: {
        idempotencyKey: crypto.randomUUID(),
        expectedRevision: player.save.revision,
        payload: { branchId },
      },
    });
  const showLog = async (cursor?: string) => {
    if (!player) return;
    setLogOpen(true);
    try {
      const r = await api<{ items: Event[]; nextCursor: string | null }>(
        `/playthroughs/${player.save.id}/events${cursor ? `?cursor=${cursor}` : ""}`,
      );
      setEvents((old) => (cursor ? [...old, ...r.items] : r.items));
      setLogCursor(r.nextCursor);
    } catch (e) {
      report(e);
    }
  };
  const disabled = busy || offline || stale || !!pending;
  const resume = saves.find(
    (s) => !s.parentPlaythroughId && s.status === "active",
  );
  return (
    <>
      <header>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          <span className="brand-mark">⌘</span> storybranch
          <span className="alpha">LOCAL ALPHA</span>
        </a>
        <nav aria-label="Main">
          <button
            className={path === "/" ? "nav-active" : ""}
            onClick={() => navigate("/")}
          >
            Discover
          </button>
          <button
            className={path === "/adventures" ? "nav-active" : ""}
            onClick={() => navigate("/adventures")}
          >
            My adventures
          </button>
        </nav>
        <button
          className="account"
          onClick={() => (user ? void signOut(auth) : setLogin(true))}
        >
          {user ? `${user.displayName ?? "Player"} · Sign out` : "Sign in"}
          <span className="avatar">{user ? "◈" : "↗"}</span>
        </button>
      </header>
      <main className={playing ? "playback-active" : undefined}>
        <div aria-live="polite">
          {offline && (
            <div className="notice">
              You’re offline. Read the current scene; reconnect to save a
              choice.
            </div>
          )}
          {busy && (
            <div className="notice subtle" role="status">
              {pending ? "Saving your choice…" : "Loading your adventure…"}
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}{" "}
              <button
                onClick={() =>
                  pending ? void command(pending) : void refresh()
                }
                disabled={busy || offline}
              >
                {stale
                  ? "Reload current progress"
                  : pending
                    ? "Retry same request"
                    : "Retry"}
              </button>
            </div>
          )}
        </div>
        {path.startsWith("/play/") ? (
          <>
            {!user && authReady && (
              <section className="empty">
                <h1>Your adventure is saved.</h1>
                <p>Sign in to open this private playthrough.</p>
                <button className="primary" onClick={() => setLogin(true)}>
                  Sign in
                </button>
              </section>
            )}
            {player && user && (
              <>
                <div className="player-heading">
                  <div>
                    <p className="eyebrow">
                      {player.save.parentPlaythroughId
                        ? "COMMUNITY SIDE QUEST"
                        : "THE GLASS HARBOR"}{" "}
                      <span> / EDITION {player.save.versionId}</span>
                    </p>
                    <p className="player-series">
                      A city of secrets. Your way out.
                    </p>
                  </div>
                  <div>
                    <span className="saved">
                      ✓ Saved · revision {player.save.revision}
                    </span>
                    <button onClick={() => void showLog()}>Story log</button>
                  </div>
                </div>
                {player.save.parentPlaythroughId && (
                  <button
                    className="back"
                    onClick={() =>
                      navigate(`/play/${player.save.parentPlaythroughId}`)
                    }
                  >
                    ← Return to main adventure
                  </button>
                )}
                <div className="player-grid">
                  <section>
                    <ScenePlayer
                      onPlaybackChange={setPlaying}
                      sceneId={`${player.save.id}-${player.save.revision}`}
                      node={player.node}
                      media={player.media}
                    >
                      <section className="choices" aria-label="Story choices">
                        <p className="eyebrow">
                          {player.save.status === "completed"
                            ? "YOUR STORY, REMEMBERED"
                            : "WHAT WILL YOU DO?"}
                        </p>
                        {player.node.choices.map((c, i) => {
                          const locked =
                            !!c.availableWhen &&
                            !evaluate(c.availableWhen, player.save);
                          if (locked && c.unavailableDisplay === "hidden")
                            return null;
                          return (
                            <button
                              key={c.id}
                              disabled={disabled || locked}
                              onClick={() => void choose(c.id)}
                            >
                              <span className="choice-number">
                                {locked ? "⌑" : String(i + 1).padStart(2, "0")}
                              </span>
                              <span>
                                {c.label}
                                {c.hint && (
                                  <small>
                                    {locked ? "Locked · " : ""}
                                    {c.hint}
                                  </small>
                                )}
                              </span>
                              <span className="arrow">
                                {locked ? "Locked" : "↗"}
                              </span>
                            </button>
                          );
                        })}
                        {player.save.status === "completed" && (
                          <>
                            <p>
                              This ending is saved in your story log. A new
                              journey starts a separate save.
                            </p>
                            <button disabled={disabled} onClick={start}>
                              Begin another journey <span>↗</span>
                            </button>
                            <button onClick={() => navigate("/adventures")}>
                              Back to my adventures
                            </button>
                          </>
                        )}
                      </section>
                    </ScenePlayer>
                    {player.branches.length > 0 && (
                      <section className="community">
                        <p className="eyebrow">
                          A DIFFERENT PATH · COMMUNITY SIDE QUESTS
                        </p>
                        {player.branches
                          .filter((b) => b.id === player.featuredId)
                          .map((b) => (
                            <button
                              disabled={disabled}
                              key={b.id}
                              onClick={() => void branch(b.id)}
                            >
                              <span>
                                <small>
                                  FEATURED · BY {b.author.toUpperCase()}
                                </small>
                                {b.title}
                              </span>
                              <span>↗</span>
                            </button>
                          ))}
                        <details>
                          <summary>
                            More community stories (
                            {
                              player.branches.filter(
                                (b) => b.id !== player.featuredId,
                              ).length
                            }
                            )
                          </summary>
                          {player.branches
                            .filter((b) => b.id !== player.featuredId)
                            .map((b) => (
                              <button
                                disabled={disabled}
                                key={b.id}
                                onClick={() => void branch(b.id)}
                              >
                                {b.title}
                                <small>by {b.author} ↗</small>
                              </button>
                            ))}
                        </details>
                        <p>
                          Your main adventure stays here. Side-quest items and
                          keys stay in that side quest.
                        </p>
                      </section>
                    )}
                  </section>
                  <details className="character-panel">
                    <summary>Your character &amp; keepsakes</summary>
                    <aside>
                      <p className="eyebrow">YOUR CHARACTER</p>
                      <h2>The wayfarer</h2>
                      <p className="muted">
                        Starting profile preserved for this journey.
                      </p>
                      <dl className="stats">
                        {Object.entries(player.save.stats).map(([s, v]) => (
                          <div key={s}>
                            <dt>{s}</dt>
                            <dd>
                              {v}
                              <span
                                className="stat-bar"
                                style={{ width: `${v * 4}px` }}
                              />
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <hr />
                      <p className="eyebrow">KEYS & KEEPSAKES</p>
                      {player.save.keys.length ? (
                        player.save.keys.map((k) => (
                          <p className="key" key={k}>
                            ◇ {k.split(":")[1].replaceAll("-", " ")}
                          </p>
                        ))
                      ) : (
                        <p className="muted">No keys discovered yet.</p>
                      )}
                      {Object.entries(player.save.items).map(([k, v]) => (
                        <p className="key" key={k}>
                          {k.split(":")[1]} × {v}
                        </p>
                      ))}
                      {player.save.milestones.length > 0 && (
                        <p className="saved">
                          ✦{" "}
                          {player.save.milestones
                            .map((x) => x.split(":")[1].replaceAll("-", " "))
                            .join(", ")}
                        </p>
                      )}
                      <p className="edition">
                        Pinned to {player.save.storyId} /{" "}
                        {player.save.versionId}
                        <br />
                        Ruleset {player.save.rulesetVersion}
                      </p>
                    </aside>
                  </details>
                </div>
                <div className="player-share">
                  <ShareStory
                    storyId={player.save.storyId}
                    media={player.media}
                  />
                </div>
                {logOpen && (
                  <section className="log">
                    <div className="section-heading">
                      <h2>Your story log</h2>
                      <button onClick={() => setLogOpen(false)}>Close</button>
                    </div>
                    <ol>
                      {events.map((e) => (
                        <li key={e.revision}>
                          <span>
                            {new Date(e.at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>{" "}
                          {e.label}{" "}
                          <small>
                            → {e.to}
                            {e.outcome ? ` · ${e.outcome}` : ""}
                          </small>
                        </li>
                      ))}
                    </ol>
                    {logCursor && (
                      <button onClick={() => void showLog(logCursor)}>
                        Load more events
                      </button>
                    )}
                  </section>
                )}
              </>
            )}
          </>
        ) : path === "/adventures" ? (
          <section className="library">
            <p className="eyebrow">YOUR JOURNEYS</p>
            <h1>Pick up the thread.</h1>
            {!user ? (
              <button className="primary" onClick={() => setLogin(true)}>
                Sign in to see your saves
              </button>
            ) : saves.length === 0 ? (
              <p>
                No adventures yet. Your first choice is waiting.{" "}
                <button onClick={() => navigate("/")}>Discover</button>
              </p>
            ) : (
              <div className="save-list">
                {saves.map((s) => (
                  <button key={s.id} onClick={() => navigate(`/play/${s.id}`)}>
                    <span>
                      {s.parentPlaythroughId
                        ? "◇ Side quest"
                        : "◆ The Glass Harbor"}
                      <strong>{s.nodeId.replaceAll("-", " ")}</strong>
                      <small>
                        {s.status} · {s.versionId} ·{" "}
                        {new Date(s.updatedAt).toLocaleString()}
                      </small>
                    </span>
                    <span>Resume ↗</span>
                  </button>
                ))}
              </div>
            )}
            {saveCursor && (
              <button onClick={() => void loadSaves(saveCursor).catch(report)}>
                Load more adventures
              </button>
            )}
          </section>
        ) : (
          <>
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
                    onClick={() =>
                      resume ? navigate(`/play/${resume.id}`) : start()
                    }
                  >
                    {resume ? "Resume adventure" : "Begin your story"}{" "}
                    <span>↗</span>
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      document
                        .getElementById("about")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    Explore the story ↓
                  </button>
                </div>
                <p className="hero-note">One harbor. Many ways home.</p>
              </div>
              <div className="hero-index">
                <span>01 / 01</span>
                <i />
                <span>THE GLASS HARBOR</span>
              </div>
            </section>
            <section className="intro-strip">
              <span>EVERY CHOICE LEAVES A TRACE</span>
              <p>Watch a scene. Trust your instincts. Find your own ending.</p>
              <span>✦</span>
            </section>
            {resume && (
              <section className="continue">
                <p className="eyebrow">CONTINUE PLAYING</p>
                <button onClick={() => navigate(`/play/${resume.id}`)}>
                  <img src="/media/harbor.svg" alt="" />
                  <span>
                    <strong>The Glass Harbor</strong>
                    <small>
                      {resume.nodeId} · Saved{" "}
                      {new Date(resume.updatedAt).toLocaleDateString()}
                    </small>
                  </span>
                  <span>Resume ↗</span>
                </button>
              </section>
            )}
            <section className="discover" id="about">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">SMALL WORLDS. MEANINGFUL CHOICES.</p>
                  <h2>Your next adventure</h2>
                </div>
                <span className="muted">01 playable story</span>
              </div>
              <div className="story-row">
                <button
                  className="story-card"
                  onClick={() => navigate("/s/glass-harbor/the-glass-harbor")}
                >
                  <div className="card-art">
                    <img
                      src="/media/harbor.svg"
                      alt="An illustrated lighthouse above a misty harbor"
                    />
                    <span>STORYBRANCH ORIGINAL</span>
                    <b>↗</b>
                  </div>
                  <div className="card-copy">
                    <small>MYSTERY / 5–10 MIN</small>
                    <h3>The Glass Harbor</h3>
                    <p>By Storybranch Studio</p>
                    <span>Teen · mild peril · Community paths open</span>
                  </div>
                </button>
                <div className="editorial">
                  <span className="editorial-icon">◇</span>
                  <h3>
                    A story that knows
                    <br />
                    which way you turned.
                  </h3>
                  <p>
                    Climb the rooftops, earn a harbor pass, or follow a stranger
                    into a smaller story. Your stats open routes. Your choices
                    leave a record.
                  </p>
                  <p className="muted">
                    Local prototype · original placeholder film and art · full
                    text transcripts
                  </p>
                  {path.startsWith("/s/") && (
                    <button
                      className="primary"
                      disabled={disabled || !catalogueReady}
                      onClick={start}
                    >
                      Start a new journey ↗
                    </button>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
      <footer>
        <span className="brand">⌘ storybranch</span>
        <span>Made of moments. Shaped by you.</span>
        <span>LOCAL PROTOTYPE · M0 / M1</span>
      </footer>
      {login && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="signin-title"
          >
            <button
              className="modal-close"
              onClick={() => setLogin(false)}
              aria-label="Close sign in"
            >
              ×
            </button>
            <p className="eyebrow">WELCOME, WAYFARER</p>
            <h2 id="signin-title">Keep your place.</h2>
            <p>Sign in to save and resume your adventure.</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await signInWithEmailAndPassword(auth, email, password);
                  setLogin(false);
                } catch {
                  setError(
                    emulatorMode
                      ? "Sign-in failed. Check your credentials and that the Auth emulator is running."
                      : "Sign-in failed. Check your email and password, then try again.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Email
                <input
                  autoFocus
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <button className="primary" disabled={busy || offline}>
                Sign in ↗
              </button>
            </form>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            {emulatorMode && (
              <div className="demo-accounts">
                <small>LOCAL EMULATOR ACCOUNTS</small>
                <p>
                  player@storybranch.test · agility 5<br />
                  progressed@storybranch.test · agility 8<br />
                  Password: HarborDemo123!
                </p>
                <button
                  onClick={() =>
                    setEmail(
                      email.startsWith("player")
                        ? "progressed@storybranch.test"
                        : "player@storybranch.test",
                    )
                  }
                >
                  Switch demo character
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
