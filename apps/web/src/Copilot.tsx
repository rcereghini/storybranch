import { useEffect, useRef, useState } from "react";
import { auth } from "./firebase";
import {
  copilotLimits,
  type CopilotEvent,
  type CopilotTranscript,
} from "../../../packages/contracts/copilot";
import "./copilot.css";

type Line = { role: "user" | "assistant"; text: string };
type Failed = { key: string; text: string; message: string };

const toolLabels: Record<string, string> = {
  navigate: "Opening the page…",
  list_catalogue: "Browsing the catalogue…",
  list_my_adventures: "Checking your adventures…",
  list_my_drafts: "Looking at your drafts…",
  get_draft: "Reading your draft…",
  list_my_assets: "Checking your assets…",
};
const newId = () => `t-${crypto.randomUUID()}`;
// The open thread is a per-browser convenience; it may be unavailable.
const remembered = (uid: string) => {
  try {
    return localStorage.getItem(`copilot-thread-${uid}`);
  } catch {
    return null;
  }
};
const remember = (uid: string, threadId: string) => {
  try {
    localStorage.setItem(`copilot-thread-${uid}`, threadId);
  } catch {
    // Without storage the next visit starts a new conversation.
  }
};

async function token() {
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

export function Copilot({
  uid,
  path,
  navigate,
  onClose,
}: {
  uid: string;
  path: string;
  navigate: (path: string) => void;
  onClose: () => void;
}) {
  const [threadId, setThreadId] = useState(() => remembered(uid) ?? newId());
  const [lines, setLines] = useState<Line[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [disabled, setDisabled] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState<Failed | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    remember(uid, threadId);
    let live = true;
    setLoaded(false);
    void (async () => {
      try {
        const t = await token();
        const response = await fetch(`/api/copilot/threads/${threadId}`, {
          headers: t ? { Authorization: `Bearer ${t}` } : {},
        });
        const body = await response.json();
        if (!live) return;
        if (!response.ok) throw new Error(body?.error?.message);
        const transcript = body as CopilotTranscript;
        setLines(transcript.messages);
        setDisabled(transcript.enabled ? null : transcript.reason);
        setFull(transcript.full);
      } catch (error) {
        if (live)
          setDisabled(
            (error as Error).message || "Copilot is unavailable right now.",
          );
      } finally {
        if (live) setLoaded(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [uid, threadId]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [lines, status]);

  useEffect(() => {
    field.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  const send = async (text: string, key: string = crypto.randomUUID()) => {
    setFailed(null);
    setBusy(true);
    setStatus("Thinking…");
    setLines((current) => [
      ...current,
      { role: "user", text },
      { role: "assistant", text: "" },
    ]);
    const append = (fragment: string) =>
      setLines((current) => {
        const next = current.slice();
        const last = next.at(-1)!;
        next[next.length - 1] = { ...last, text: last.text + fragment };
        return next;
      });
    const fail = (message: string) => {
      // Drop the unanswered exchange; Retry resends it with the same key.
      setLines((current) =>
        current.at(-1)?.text ? current : current.slice(0, -2),
      );
      setFailed({ key, text, message });
    };
    try {
      const t = await token();
      const response = await fetch(`/api/copilot/threads/${threadId}`, {
        method: "POST",
        headers: {
          ...(t ? { Authorization: `Bearer ${t}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey: key,
          text,
          context: { path: pathRef.current },
        }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        const message =
          body?.error?.message ?? "Copilot is unavailable right now.";
        if (/conversation is full/.test(message)) setFull(true);
        fail(message);
        return;
      }
      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();
      let buffer = "";
      let finished = false;
      for (let part = await reader.read(); !part.done; part = await reader.read()) {
        buffer += part.value;
        const rows = buffer.split("\n");
        buffer = rows.pop()!;
        for (const row of rows) {
          if (!row) continue;
          const event = JSON.parse(row) as CopilotEvent;
          if (event.type === "text") {
            setStatus("");
            append(event.text);
          } else if (event.type === "tool")
            setStatus(toolLabels[event.name] ?? "Working…");
          else if (event.type === "action") navigate(event.action.path);
          else if (event.type === "error") {
            finished = true;
            fail(event.message);
          } else finished = true;
        }
      }
      if (!finished) fail("The reply was interrupted.");
    } catch {
      fail("Copilot couldn't be reached. Check your connection.");
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void send(text);
  };

  const unavailable = !loaded || !!disabled || full;
  return (
    <aside className="copilot" aria-label="Copilot">
      <div className="copilot-head">
        <strong>Copilot</strong>
        <div>
          <button
            className="copilot-ghost"
            onClick={() => {
              setLines([]);
              setFailed(null);
              setThreadId(newId());
            }}
            disabled={busy}
          >
            New chat
          </button>
          <button
            className="copilot-ghost"
            onClick={onClose}
            aria-label="Close Copilot"
          >
            ×
          </button>
        </div>
      </div>
      <div className="copilot-log" ref={log} aria-live="polite" aria-busy={busy}>
        {loaded && !lines.length && !disabled && (
          <div className="copilot-hello">
            <p>Hi! I can find your drafts, adventures and assets, explain how Storybranch works, and take you where you need to go.</p>
            <div className="copilot-suggestions">
              {[
                "What can I do here?",
                "Show me my drafts",
                "How do I make a quiz?",
              ].map((suggestion) => (
                <button key={suggestion} onClick={() => void send(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {lines.map((line, index) =>
          line.text ? (
            <p key={index} className={`copilot-line copilot-${line.role}`}>
              {line.text}
            </p>
          ) : null,
        )}
      </div>
      {/* Reserved status space: notices replace each other, never push content. */}
      <div className="copilot-status" role="status">
        {disabled ? (
          <span>{disabled}</span>
        ) : full ? (
          <span>This conversation is full. Start a new chat to continue.</span>
        ) : failed ? (
          <span className="copilot-error">
            {failed.message}{" "}
            <button
              className="copilot-link"
              onClick={() => void send(failed.text, failed.key)}
              disabled={busy}
            >
              Retry
            </button>
          </span>
        ) : (
          <span>{status}</span>
        )}
      </div>
      <form
        className="copilot-compose"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={field}
          value={input}
          rows={2}
          maxLength={copilotLimits.maxChars}
          placeholder={unavailable ? "" : "Ask Copilot…"}
          aria-label="Message Copilot"
          disabled={unavailable}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button type="submit" disabled={unavailable || busy || !input.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
