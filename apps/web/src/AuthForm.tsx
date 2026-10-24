import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth, emulatorMode } from "./firebase";
import { ApiError, createApi } from "../../../packages/api-client/index";

function authMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error ? error.code : "";
  switch (code) {
    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled. You can try again.";
    case "auth/popup-blocked":
      return "Allow pop-ups for this site, then try Google again, or sign in with email.";
    case "auth/unauthorized-domain":
      return "Google sign-in is not configured for this address yet. Please use email or try again later.";
    case "auth/operation-not-allowed":
      return "This sign-in method is not available yet. Please try another method.";
    case "auth/email-already-in-use":
      return "Unable to create this account. Try signing in with your existing account.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return "Choose a stronger password with at least 8 characters, including uppercase, lowercase, a number and a symbol.";
    case "auth/account-exists-with-different-credential":
      return "Sign in using the original method for this email address.";
    case "auth/user-disabled":
      return "This account has been disabled. If you think this is a mistake, reply to any Storybranch email to reach us.";
    case "auth/network-request-failed":
      return "Could not connect. Check your connection and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait before trying again.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Sign-in failed. Check your email and password.";
    default:
      return "Authentication failed. Please try again shortly.";
  }
}

export function AuthForm({
  offline,
  onSuccess,
}: {
  offline: boolean;
  onSuccess: () => void;
}) {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState(
    emulatorMode ? "player@storybranch.test" : "",
  );
  const [password, setPassword] = useState(
    emulatorMode ? "HarborDemo123!" : "",
  );
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Forgot-password view: same dialog, one email field.
  const [reset, setReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  async function requestReset() {
    if (busy || offline) return;
    setError("");
    setBusy(true);
    try {
      await createApi(fetch, async () => null)("/account/password-reset", {
        email: email.trim(),
      });
      setResetSent(true);
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error.message
          : "Could not send the email. Please try again shortly.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (reset)
    return (
      <>
        <p className="eyebrow">FORGOT YOUR PASSWORD?</p>
        <h2 id="signin-title">Reset your password.</h2>
        <p>
          Enter the email you signed up with and we'll send you a link to choose
          a new password.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void requestReset();
          }}
          aria-busy={busy}
        >
          <label>
            Email
            <input
              autoFocus
              type="email"
              autoComplete="username"
              value={email}
              disabled={busy}
              onChange={(event) => {
                setEmail(event.target.value);
                setResetSent(false);
              }}
              required
            />
          </label>
          <button className="primary" disabled={busy || offline}>
            {busy ? "Sending…" : "Send reset link ↗"}
          </button>
        </form>
        {resetSent && (
          <p role="status">
            If there's a Storybranch account for that email, a reset link is on
            its way. Check your inbox and spam folder; the link expires in 1
            hour.
          </p>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <p>
          <button
            disabled={busy}
            onClick={() => {
              setReset(false);
              setResetSent(false);
              setError("");
            }}
          >
            Back to sign in
          </button>
        </p>
      </>
    );
  async function authenticate(google = false) {
    if (busy || offline) return;
    setError("");
    if (!google && signup && password !== confirmation) {
      setError("Your passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (google) {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        await signInWithPopup(auth, provider);
      } else if (signup) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      onSuccess();
    } catch (error) {
      setError(authMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="eyebrow">WELCOME, WAYFARER</p>
      <h2 id="signin-title">
        {signup ? "Your story starts here." : "Keep your place."}
      </h2>
      <p>
        {signup
          ? "Create an account to save your choices and return anytime."
          : "Sign in to save and resume your adventure."}
      </p>
      <button
        className="google-auth"
        disabled={busy || offline || import.meta.env.VITE_PHONE_PREVIEW === "1"}
        onClick={() => void authenticate(true)}
      >
        Continue with Google
      </button>
      <p className="auth-divider">or continue with email</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void authenticate();
        }}
        aria-busy={busy}
      >
        <label>
          Email
          <input
            autoFocus
            type="email"
            autoComplete="username"
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={signup ? 8 : undefined}
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {signup && (
          <>
            <small>Use at least 8 characters.</small>
            <label>
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmation}
                disabled={busy}
                onChange={(event) => setConfirmation(event.target.value)}
                required
              />
            </label>
          </>
        )}
        <button className="primary" disabled={busy || offline}>
          {busy ? "Connecting…" : signup ? "Create account ↗" : "Sign in ↗"}
        </button>
      </form>
      {!signup && (
        <p>
          <button
            disabled={busy}
            onClick={() => {
              setReset(true);
              setError("");
              setPassword("");
            }}
          >
            Forgot password?
          </button>
        </p>
      )}
      {offline && (
        <p role="status">
          Connect to the internet to sign in or create an account.
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <p>
        {signup ? "Already have an account?" : "New to Storybranch?"}{" "}
        <button
          disabled={busy}
          onClick={() => {
            setSignup(!signup);
            setError("");
            setPassword("");
            setConfirmation("");
          }}
        >
          {signup ? "Sign in instead" : "Create an account"}
        </button>
      </p>
      {emulatorMode && (
        <div className="demo-accounts">
          <small>LOCAL EMULATOR ACCOUNTS</small>
          <p>
            player@storybranch.test · agility 5<br />
            progressed@storybranch.test · agility 8<br />
            Password: HarborDemo123!
          </p>
          <button
            disabled={busy}
            onClick={() => {
              setSignup(false);
              setEmail(
                email.startsWith("player")
                  ? "progressed@storybranch.test"
                  : "player@storybranch.test",
              );
              setPassword("HarborDemo123!");
              setError("");
            }}
          >
            Switch demo character
          </button>
        </div>
      )}
    </>
  );
}
