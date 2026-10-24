import { useEffect, useState } from "react";
import {
  applyActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { auth } from "./firebase";

// Where system email links land (/account/action?mode=…&oobCode=…): confirm
// an email address or choose a new password, in Storybranch's own page.
// The one-time code is read once and removed from the address bar.
type State =
  | { kind: "checking" }
  | { kind: "reset"; email: string }
  | { kind: "done"; title: string; text: string }
  | { kind: "invalid"; text: string };

const initial = (() => {
  const params = new URLSearchParams(location.search);
  return { mode: params.get("mode"), code: params.get("oobCode") };
})();

// A code works once, so it is checked once per page load, however many
// times the view mounts.
let checked: Promise<State> | null = null;
async function check(): Promise<State> {
  const { mode, code } = initial;
  if (!code) return { kind: "invalid", text: "This link is incomplete." };
  if (mode === "resetPassword")
    try {
      return {
        kind: "reset",
        email: await verifyPasswordResetCode(auth, code),
      };
    } catch {
      return {
        kind: "invalid",
        text: "This reset link has expired or was already used. Request a new one from the sign-in form.",
      };
    }
  if (mode === "verifyEmail")
    try {
      await applyActionCode(auth, code);
      await auth.currentUser?.reload();
      return {
        kind: "done",
        title: "Email confirmed.",
        text: "Thanks! Your Storybranch account is all set.",
      };
    } catch {
      return {
        kind: "invalid",
        text: "This confirmation link has expired or was already used.",
      };
    }
  return { kind: "invalid", text: "This link isn't one we recognize." };
}

export function AccountAction({
  navigate,
  onSignIn,
}: {
  navigate: (path: string) => void;
  onSignIn: () => void;
}) {
  const [state, setState] = useState<State>({ kind: "checking" });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    history.replaceState(history.state, "", "/account/action");
    let live = true;
    void (checked ??= check()).then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, []);

  async function save() {
    if (busy || !initial.code) return;
    setError("");
    if (password !== confirmation) {
      setError("Your passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(auth, initial.code, password);
      setState({
        kind: "done",
        title: "Password changed.",
        text: "Sign in with your new password to pick up where you left off.",
      });
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error ? error.code : "";
      setError(
        code === "auth/weak-password" ||
          code === "auth/password-does-not-meet-requirements"
          ? "Choose a stronger password with at least 8 characters, including uppercase, lowercase, a number and a symbol."
          : code === "auth/expired-action-code" ||
              code === "auth/invalid-action-code"
            ? "This reset link has expired. Request a new one from the sign-in form."
            : "Could not change your password. Please try again shortly.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account-action">
      {/* The card keeps its place while the link is checked. */}
      <section className="modal" aria-busy={state.kind === "checking"}>
        {state.kind === "checking" ? (
          <div className="account-action-placeholder" aria-hidden="true" />
        ) : state.kind === "reset" ? (
          <>
            <p className="eyebrow">ACCOUNT</p>
            <h1>Choose a new password.</h1>
            <p>For {state.email}</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
              aria-busy={busy}
            >
              <label>
                New password
                <input
                  autoFocus
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <small>Use at least 8 characters.</small>
              <label>
                Confirm new password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  disabled={busy}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save new password ↗"}
              </button>
            </form>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="eyebrow">ACCOUNT</p>
            <h1 role={state.kind === "invalid" ? "alert" : undefined}>
              {state.kind === "done" ? state.title : "This link didn't work."}
            </h1>
            <p>{state.text}</p>
            <div className="account-action-links">
              {state.kind === "done" && !auth.currentUser ? (
                <button className="primary" onClick={onSignIn}>
                  Sign in ↗
                </button>
              ) : (
                <button
                  className="primary"
                  onClick={() => navigate("/discover")}
                >
                  Find a story ↗
                </button>
              )}
              {state.kind === "invalid" && (
                <button onClick={onSignIn}>Go to sign in</button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
