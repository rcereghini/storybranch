import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { applyThemeMode, storedThemeMode, type ThemeMode } from "./theme-mode";

const modes: Array<[ThemeMode, string]> = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "System"],
];

// The account button and its popover: profile, the creator and admin areas,
// appearance and sign-out. A disclosure (not an ARIA menu) because it holds
// the appearance switch.
export function AccountMenu({
  avatar,
  name,
  email,
  unconfirmed,
  onResendConfirmation,
  isAdmin,
  onNavigate,
  onSignOut,
}: {
  avatar: ReactNode;
  name: string;
  email: string | null;
  // An email-and-password account that hasn't confirmed its address yet.
  unconfirmed: boolean;
  onResendConfirmation: () => Promise<string>;
  isAdmin: boolean;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ThemeMode>(storedThemeMode);
  // The resend result replaces the prompt in place.
  const [resend, setResend] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>(".menu-item")?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const item = (icon: IconName, label: string, run: () => void) => (
    <button
      className="menu-item"
      onClick={() => {
        setOpen(false);
        run();
      }}
    >
      <Icon name={icon} />
      {label}
    </button>
  );

  return (
    <div className="account" ref={root}>
      <button
        ref={trigger}
        className="account-trigger"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((value) => !value)}
      >
        {avatar}
      </button>
      {open && (
        <div className="account-menu" id="account-menu">
          <div className="account-menu-who">
            <strong>{name}</strong>
            {email && <span>{email}</span>}
            {unconfirmed && (
              <span className="account-confirm" role="status">
                {resend ?? "Email not confirmed."}
                {!resend && (
                  <button
                    className="account-confirm-button"
                    disabled={sending}
                    onClick={() => {
                      setSending(true);
                      onResendConfirmation()
                        .then(setResend)
                        .catch((error) => setResend((error as Error).message))
                        .finally(() => setSending(false));
                    }}
                  >
                    {sending ? "Sending…" : "Resend"}
                  </button>
                )}
              </span>
            )}
          </div>
          {item("profile", "Your profile", () => onNavigate("/"))}
          {item("assets", "Assets", () => onNavigate("/assets"))}
          {isAdmin && item("admin", "Admin", () => onNavigate("/admin"))}
          <p className="account-menu-section" id="appearance-label">
            Appearance
          </p>
          <div
            className="theme-switch"
            role="radiogroup"
            aria-labelledby="appearance-label"
          >
            {modes.map(([value, label]) => (
              <button
                key={value}
                role="radio"
                aria-checked={mode === value}
                onClick={() => {
                  setMode(value);
                  applyThemeMode(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {item("signOut", "Sign out", onSignOut)}
        </div>
      )}
    </div>
  );
}
