import type { StoryNode } from "../../../packages/contracts/index";

export type Readiness =
  | "video-frame"
  | "playing-fallback"
  | "content-paint"
  | "autoplay-blocked"
  | "media-error"
  | "retained-view";
type Outcome = Readiness | "request-error" | "stale" | "cancelled" | "timeout";
export type TransitionSample = {
  attempt: number;
  operation: "load" | "command";
  storyNodeType?: StoryNode["storyNodeType"];
  outcome: Outcome;
  requestMs: number | null;
  presentationMs: number | null;
  totalMs: number;
};

// Browser-local diagnostics. Run identity is used only to reject stale callbacks;
// it is never included in samples or passed to an analytics provider.
export class TransitionTiming {
  private sequence = 0;
  private lastReadyKey?: string;
  private samples: TransitionSample[] = [];
  private pending?: {
    attempt: number;
    operation: "load" | "command";
    start: number;
    response?: number;
    key?: string;
    storyNodeType?: StoryNode["storyNodeType"];
  };
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private now = () => performance.now(),
    private visible = () => typeof document === "undefined" || !document.hidden,
  ) {}
  snapshot = (): TransitionSample[] =>
    this.samples.map((sample) => ({ ...sample }));
  begin(operation: "load" | "command") {
    if (this.pending) this.end(this.pending.attempt, "cancelled");
    const attempt = ++this.sequence;
    if (!this.visible()) {
      this.lastReadyKey = undefined;
      return attempt;
    }
    this.pending = { attempt, operation, start: this.now() };
    this.timer = setTimeout(() => this.end(attempt, "timeout"), 30_000);
    return attempt;
  }
  received(
    attempt: number,
    key: string,
    storyNodeType: StoryNode["storyNodeType"],
  ) {
    if (this.pending?.attempt !== attempt) return;
    Object.assign(this.pending, { response: this.now(), key, storyNodeType });
    if (this.lastReadyKey === key) this.end(attempt, "retained-view");
  }
  ready(key: string, outcome: Readiness) {
    if (!this.visible()) return;
    if (["video-frame", "playing-fallback", "content-paint"].includes(outcome))
      this.lastReadyKey = key;
    else if (this.lastReadyKey === key) this.lastReadyKey = undefined;
    if (this.pending?.key === key) this.end(this.pending.attempt, outcome);
  }
  cancel() {
    this.lastReadyKey = undefined;
    if (this.pending) this.end(this.pending.attempt, "cancelled");
  }
  end(attempt: number, outcome: Outcome) {
    const pending = this.pending;
    if (!pending || pending.attempt !== attempt) return;
    const end = this.now();
    this.pending = undefined;
    clearTimeout(this.timer);
    const elapsed = (from: number, to: number) =>
      Math.round(Math.max(0, to - from));
    this.samples.push({
      attempt,
      operation: pending.operation,
      storyNodeType: pending.storyNodeType,
      outcome,
      requestMs:
        pending.response === undefined
          ? null
          : elapsed(pending.start, pending.response),
      presentationMs:
        pending.response === undefined ? null : elapsed(pending.response, end),
      totalMs: elapsed(pending.start, end),
    });
    if (this.samples.length > 50) this.samples.shift();
  }
}

export const transitionTiming = new TransitionTiming();
declare global {
  interface Window {
    storybranchTransitionTimings: () => TransitionSample[];
  }
}
if (typeof window !== "undefined") {
  window.storybranchTransitionTimings = transitionTiming.snapshot;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) transitionTiming.cancel();
  });
  window.addEventListener("pagehide", () => transitionTiming.cancel());
}
