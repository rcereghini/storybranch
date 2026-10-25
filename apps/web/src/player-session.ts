import type { PlayerView } from "../../../packages/contracts/player";
import { ApiError } from "../../../packages/api-client/index";

export type PendingCommand = { path: string; body: unknown };
type Api = <T>(path: string, body?: unknown) => Promise<T>;
export type SessionState = {
  view: PlayerView | null;
  pending: PendingCommand | null;
  phase: "idle" | "loading" | "submitting" | "ready" | "retry" | "stale";
};

// Owns request ordering and unknown-outcome retries, independently of React.
// scope includes both account and navigation; leaving a run invalidates its work.
export class PlayerSession {
  private sequence = 0;
  private listeners = new Set<() => void>();
  private state: SessionState = { view: null, pending: null, phase: "idle" };
  constructor(
    private api: Api,
    private scope: () => string,
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  reset() {
    ++this.sequence;
    this.update({ view: null, pending: null, phase: "idle" });
  }
  private accept(view: PlayerView) {
    const old = this.state.view;
    if (
      old?.save.id === view.save.id &&
      old.save.revision > view.save.revision
    ) {
      this.update({ phase: "ready", pending: null });
      return;
    }
    this.update({ view, phase: "ready", pending: null });
  }
  async load(id: string) {
    const sequence = ++this.sequence,
      scope = this.scope();
    this.update({ phase: "loading" });
    try {
      const view = await this.api<PlayerView>(`/playthroughs/${id}`);
      if (sequence !== this.sequence || scope !== this.scope()) return;
      this.accept(view);
    } catch (error) {
      if (sequence !== this.sequence || scope !== this.scope()) return;
      this.update({ phase: "retry" });
      throw error;
    }
  }
  async submit(command: PendingCommand): Promise<PlayerView | undefined> {
    if (["submitting", "loading", "stale"].includes(this.state.phase)) return;
    // Never replace an uncertain command with a newly generated idempotency key.
    command = this.state.pending ?? command;
    const sequence = ++this.sequence,
      scope = this.scope();
    this.update({ pending: command, phase: "submitting" });
    try {
      const { player } = await this.api<{ player: PlayerView }>(
        command.path,
        command.body,
      );
      if (sequence !== this.sequence || scope !== this.scope()) return;
      this.accept(player);
      return player;
    } catch (error) {
      if (sequence !== this.sequence || scope !== this.scope()) return;
      const definitive =
        error instanceof ApiError && error.code !== "UNAVAILABLE";
      this.update({
        pending: definitive ? null : command,
        phase:
          error instanceof ApiError && error.code === "STALE_REVISION"
            ? "stale"
            : "retry",
      });
      throw error;
    }
  }
}
