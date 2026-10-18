import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, emulatorMode } from "./firebase";
import { AuthForm } from "./AuthForm";
import { createApi, ApiError } from "../../../packages/api-client/index";
import type { Save, Story } from "../../../packages/contracts/index";
import "./style.css";
import { Page } from "./Page";
import { Studio } from "./Studio";
import { AssetLibrary } from "./Library";
import { SharedPage } from "./SharedPage";
import { Story as StoryContainer } from "./Story";
import type { StoryUser } from "../../../packages/contracts/index";
import { ShareStory } from "./ShareStory";
import type { SceneMedia } from "../../../packages/contracts/media";
import type { PlayerProfile } from "../../../packages/contracts/profile";
import { Dashboard } from "./Dashboard";
import { Discover, type CatalogueEntry } from "./Discover";
import { Adventures } from "./Adventures";
import { Avatar } from "./avatars";
import { accents } from "./theme";
import { Copilot } from "./Copilot";
import { Admin } from "./Admin";
import { copilotAvailable } from "../../../packages/contracts/copilot";
import "./hub.css";
const api = createApi(fetch, async () =>
  auth.currentUser ? auth.currentUser.getIdToken() : null,
);
type Branch = { id: string; title: string; author: string };
type Player = {
  story: { id: string; title: string; versionId: string };
  user: StoryUser;
  media?: SceneMedia;
  nextMedia?: SceneMedia;
  image?: string;
  save: Save;
  page: Story["pages"][string];
  result?: boolean;
  branches: Branch[];
  featuredId: string | null;
};
type Event = {
  roll?: Save["lastRoll"];
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
    [savesError, setSavesError] = useState(false),
    [stale, setStale] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine),
    [login, setLogin] = useState(false),
    [events, setEvents] = useState<Event[]>([]),
    [logCursor, setLogCursor] = useState<string | null>(null),
    [logOpen, setLogOpen] = useState(false),
    [pending, setPending] = useState<Pending | null>(null),
    [catalogueItems, setCatalogueItems] = useState<CatalogueEntry[]>([]),
    [catalogueCursor, setCatalogueCursor] = useState<string | null>(null),
    [catalogueReady, setCatalogueReady] = useState(false),
    [studioDirty, setStudioDirty] = useState(false),
    [loadedKey, setLoadedKey] = useState<string | null>(null),
    [copilotOpen, setCopilotOpen] = useState(false),
    [profile, setProfile] = useState<PlayerProfile | null>(null);
  // Identifies what the latest refresh() must load: this page for this user.
  const loadKey = `${path}|${user?.uid ?? ""}`;
  // Offered only to accounts with the flag, on a deployment with the key.
  const copilotEnabled = !!user && !!profile?.features?.copilot;
  const isAdmin = !!user && !!profile?.features?.admin;
  const navigate = (p: string) => {
    if (
      p !== path &&
      studioDirty &&
      !confirm("Leave Studio and discard unsaved changes?")
    )
      return;
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
          '[role="dialog"] button:not(:disabled), [role="dialog"] input:not(:disabled)',
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
      setSavesError(false);
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
    try {
      const r = await api<{ items: Save[]; nextCursor: string | null }>(
        `/playthroughs${cursor ? `?cursor=${cursor}` : ""}`,
      );
      if (auth.currentUser?.uid !== requestingUid) return;
      setSaves((old) => (cursor ? [...old, ...r.items] : r.items));
      setSaveCursor(r.nextCursor);
      setSavesError(false);
    } catch {
      if (auth.currentUser?.uid === requestingUid) setSavesError(true);
    }
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
    if (!catalogueItems.length) {
      const catalogue = await api<{ items: CatalogueEntry[] }>(
        "/catalogue",
      ).catch(() => null);
      if (catalogue) setCatalogueItems(catalogue.items);
    }
    setStale(false);
    setError("");
  };
  const refresh = async () => {
    const key = loadKey;
    setBusy(true);
    setError("");
    try {
      if (path.startsWith("/play/")) await loadPlayer(path.split("/")[2]);
      else {
        const catalogue = await api<{
          items: CatalogueEntry[];
          nextCursor: string | null;
        }>("/catalogue");
        setCatalogueItems(catalogue.items);
        setCatalogueCursor(catalogue.nextCursor);
        const ready = catalogue.items.length > 0;
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
      setLoadedKey(key);
    }
  };
  const loadMoreCatalogue = async () => {
    setBusy(true);
    try {
      const next = await api<{
        items: CatalogueEntry[];
        nextCursor: string | null;
      }>(`/catalogue?cursor=${catalogueCursor}`);
      setCatalogueItems((old) => [
        ...new Map(
          [...old, ...next.items].map((item) => [item.id, item]),
        ).values(),
      ]);
      setCatalogueCursor(next.nextCursor);
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    setPlayer(null);
    setPending(null);
    if (!path.startsWith("/play/") || user) void refresh();
  }, [path, user]);
  // The chosen accent themes the shell; the story player keeps its own colors.
  useEffect(() => {
    const root = document.documentElement.style;
    if (profile) root.setProperty("--accent", accents[profile.accent].color);
    else root.removeProperty("--accent");
  }, [profile?.accent]);
  // The header shows the player's chosen name and avatar on every page.
  useEffect(() => {
    setProfile(null);
    if (!user) return;
    const uid = user.uid;
    api<PlayerProfile>("/profile")
      .then((p) => {
        if (auth.currentUser?.uid === uid) setProfile(p);
      })
      .catch(() => {});
  }, [user]);
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
    } catch (e) {
      report(e);
      if (e instanceof ApiError && e.code !== "UNAVAILABLE") setPending(null);
    } finally {
      setBusy(false);
    }
  };
  const start = (storyId = player?.save.storyId ?? "glass-harbor") => {
    if (!user) {
      setLogin(true);
      return;
    }
    void command({
      path: "/playthroughs",
      body: {
        idempotencyKey: crypto.randomUUID(),
        payload: { storyId },
      },
    });
  };
  const choose = (choiceId: string, action?: "roll" | "continue") =>
    player &&
    command({
      path: `/playthroughs/${player.save.id}/choices`,
      body: {
        idempotencyKey: crypto.randomUUID(),
        expectedRevision: player.save.revision,
        payload: { choiceId, ...(action ? { action } : {}) },
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
  // Until Firebase restores the session, a signed-in player looks signed out,
  // so start() would open the sign-in dialog instead of starting the story.
  // Overlapping refreshes (StrictMode, then the auth change) each clear busy,
  // so also wait until the refresh for the current page and user has finished.
  const disabled =
    busy ||
    offline ||
    stale ||
    !!pending ||
    !authReady ||
    loadedKey !== loadKey;
  const resume = saves.find(
    (s) => !s.parentPlaythroughId && s.status === "active",
  );
  return (
    <>
      <header
        className={
          path.startsWith("/play/") || path.startsWith("/p/")
            ? "immersive-header"
            : undefined
        }
      >
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
        {(path.startsWith("/play/") || path.startsWith("/p/")) && (
          <button className="player-exit" onClick={() => navigate("/discover")}>
            Discover
          </button>
        )}
        <nav aria-label="Main">
          {user && (
            <button
              className={path === "/" ? "nav-active" : ""}
              onClick={() => navigate("/")}
            >
              Dashboard
            </button>
          )}
          <button
            className={
              path === "/discover" || (!user && path === "/")
                ? "nav-active"
                : ""
            }
            onClick={() => navigate(user ? "/discover" : "/")}
          >
            Discover
          </button>
          <button
            className={path === "/adventures" ? "nav-active" : ""}
            onClick={() => navigate("/adventures")}
          >
            My adventures
          </button>
          <button
            className={path === "/studio" ? "nav-active" : ""}
            onClick={() => navigate("/studio")}
          >
            Create
          </button>
          <button
            className={path === "/assets" || path.startsWith("/assets/") ? "nav-active" : ""}
            onClick={() => navigate("/assets")}
          >
            Assets
          </button>
          {isAdmin && (
            <button
              className={path === "/admin" ? "nav-active" : ""}
              onClick={() => navigate("/admin")}
            >
              Admin
            </button>
          )}
        </nav>
        {user ? (
          <div className="account">
            {copilotEnabled && copilotAvailable(path) && (
              <button
                className="copilot-toggle"
                aria-expanded={copilotOpen}
                aria-label="Copilot"
                onClick={() => setCopilotOpen((open) => !open)}
              >
                ✦<span className="copilot-toggle-label"> Copilot</span>
              </button>
            )}
            <button
              className="account-chip"
              aria-label="Open your dashboard"
              onClick={() => navigate("/")}
            >
              {profile ? (
                <Avatar
                  id={profile.avatarId}
                  tint={profile.avatarTint}
                  frame={profile.avatarFrame}
                  size={30}
                />
              ) : (
                <span className="avatar">◈</span>
              )}
              <span className="account-name">
                {profile?.displayName ?? user.displayName ?? "Player"}
              </span>
            </button>
            <button
              className="sign-out"
              onClick={() => {
                if (
                  !studioDirty ||
                  confirm("Sign out and discard unsaved changes?")
                )
                  void signOut(auth);
              }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <button className="account sign-in" onClick={() => setLogin(true)}>
            Sign in
          </button>
        )}
      </header>
      <main
        className={`${playing ? "playback-active" : ""} ${path.startsWith("/play/") || path.startsWith("/p/") ? "immersive-player" : ""}`}
        aria-busy={busy}
      >
        <div aria-live="polite" className="app-notices">
          {user && savesError && !path.startsWith("/play/") && (
            <div className="notice error" role="alert">
              Your saved-adventure list could not be loaded. Please retry.
              <button
                disabled={busy || offline}
                onClick={() => void loadSaves()}
              >
                Retry saved adventures
              </button>
            </div>
          )}
          {offline && (
            <div className="notice">
              You’re offline. Read the current scene; reconnect to save a
              choice.
            </div>
          )}
          {busy && (
            <div
              className={
                path.startsWith("/play/") && player
                  ? "sr-only"
                  : "loading-overlay"
              }
              role="status"
            >
              <span className="loading-card">
                {pending
                  ? player
                    ? "Saving your choice…"
                    : "Starting your adventure…"
                  : "Loading your adventure…"}
              </span>
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
        {path.startsWith("/p/") ? (
          <SharedPage key={path} path={path} />
        ) : path === "/assets" || path.startsWith("/assets/") ? (
          user ? (
            <AssetLibrary key={user.uid} api={api} path={path} navigate={navigate} uid={user.uid} />
          ) : (
            <section className="empty">
              <h1>Your asset library</h1>
              <button onClick={() => setLogin(true)}>Sign in to upload</button>
            </section>
          )
        ) : path === "/admin" ? (
          isAdmin ? (
            <Admin api={api} uid={user!.uid} navigate={navigate} />
          ) : user && !profile ? (
            <div className="placeholder summary-placeholder" aria-hidden="true" />
          ) : (
            <section className="empty">
              <h1>Admins only</h1>
              <p>This area is for Storybranch admins.</p>
            </section>
          )
        ) : path === "/studio" ? (
          user ? (
            <Studio
              key={user.uid}
              onPlay={start}
              onDirtyChange={setStudioDirty}
            />
          ) : (
            <section className="empty">
              <h1>Create your own story.</h1>
              <button className="primary" onClick={() => setLogin(true)}>
                Sign in to create
              </button>
            </section>
          )
        ) : path.startsWith("/play/") ? (
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
              <StoryContainer
                story={player.story}
                user={player.user}
                save={player.save}
              >
                <div className="player-heading">
                  <div>
                    <p className="eyebrow">
                      {player.save.parentPlaythroughId
                        ? "COMMUNITY SIDE QUEST"
                        : player.story.title}{" "}
                      <span> / EDITION {player.save.versionId}</span>
                    </p>
                    <p className="player-series">
                      Pages shaped by your choices.
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
                    <Page
                      transitioning={busy}
                      onPlaybackChange={setPlaying}
                      disabled={disabled}
                      onOutput={(output) =>
                        choose(output.choiceId, output.action)
                      }
                      page={player.page}
                      result={player.result}
                      media={player.media}
                      nextMedia={player.nextMedia}
                      image={player.image}
                    >
                      <section className="choices" aria-label="Story choices">
                        {player.save.status === "completed" && (
                          <>
                            <p>
                              {player.result
                                ? "Your result is saved in your story log. Retaking the quiz starts a separate save."
                                : "This ending is saved in your story log. A new journey starts a separate save."}
                            </p>
                            {!player.save.parentPlaythroughId && (
                              <button
                                disabled={disabled}
                                onClick={() => start()}
                              >
                                {player.result
                                  ? "Take the quiz again"
                                  : "Begin another journey"}{" "}
                                <span>↗</span>
                              </button>
                            )}
                            <button onClick={() => navigate("/adventures")}>
                              Back to my adventures
                            </button>
                            {player.save.parentPlaythroughId ? (
                              <button
                                onClick={() =>
                                  navigate(
                                    `/play/${player.save.parentPlaythroughId}`,
                                  )
                                }
                              >
                                Return to parent story
                              </button>
                            ) : (
                              catalogueItems
                                .filter(
                                  (item) => item.id !== player.save.storyId,
                                )
                                .slice(0, 2)
                                .map((item) => (
                                  <button
                                    key={item.id}
                                    disabled={disabled}
                                    onClick={() => start(item.id)}
                                  >
                                    Try {item.title} ↗
                                  </button>
                                ))
                            )}
                          </>
                        )}
                      </section>
                    </Page>
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
                {/* Side quests start only from their branch location, so
                    a public link to one would lead nowhere. */}
                {!player.save.parentPlaythroughId && (
                  <div className="player-share">
                    <ShareStory
                      storyId={player.save.storyId}
                      storyTitle={player.story.title}
                      ending={
                        player.page.kind === "ending"
                          ? {
                              pageId: player.page.id,
                              title: player.page.title,
                              result: player.result,
                            }
                          : undefined
                      }
                      media={player.media}
                    />
                  </div>
                )}
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
                            {e.roll
                              ? ` · d${e.roll.sides}: ${e.roll.value} (target ${e.roll.target})`
                              : ""}
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
              </StoryContainer>
            )}
          </>
        ) : path === "/" && (user || !authReady) ? (
          user ? (
            <Dashboard
              key={user.uid}
              profile={profile}
              disabled={disabled}
              onProfileSaved={setProfile}
              onResume={(saveId) => navigate(`/play/${saveId}`)}
              onStart={(storyId) => start(storyId)}
              onNavigate={navigate}
            />
          ) : (
            <div
              className="placeholder summary-placeholder"
              aria-hidden="true"
            />
          )
        ) : path === "/adventures" ? (
          <Adventures
            signedIn={!!user}
            loaded={loadedKey === loadKey}
            saves={saves}
            savesError={savesError}
            catalogue={catalogueItems}
            hasMore={!!saveCursor}
            onLoadMore={() => void loadSaves(saveCursor!).catch(report)}
            onResume={(saveId) => navigate(`/play/${saveId}`)}
            onSignIn={() => setLogin(true)}
            onDiscover={() => navigate("/discover")}
          />
        ) : (
          <Discover
            path={path}
            catalogue={catalogueItems}
            saves={saves}
            resume={resume}
            disabled={disabled}
            catalogueReady={catalogueReady}
            hasMore={!!catalogueCursor}
            moreDisabled={busy || offline}
            onMore={() => void loadMoreCatalogue()}
            onStart={(storyId) => start(storyId)}
            onResume={(saveId) => navigate(`/play/${saveId}`)}
            onNavigate={navigate}
          />
        )}
      </main>
      <footer>
        <span className="brand">⌘ storybranch</span>
        <span>Made of moments. Shaped by you.</span>
        <span>STORYBRANCH · CREATOR ALPHA</span>
      </footer>
      {copilotOpen && copilotEnabled && user && copilotAvailable(path) && (
        <Copilot
          key={user.uid}
          uid={user.uid}
          path={path}
          navigate={navigate}
          onClose={() => setCopilotOpen(false)}
        />
      )}
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
            <AuthForm offline={offline} onSuccess={() => setLogin(false)} />
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
