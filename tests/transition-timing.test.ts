import { afterEach, it, expect, vi } from "vitest";
import { TransitionTiming } from "../apps/web/src/transition-timing";

afterEach(() => vi.useRealTimers());

it("excludes hidden-tab starts and invalidates readiness after leaving a run", () => {
  vi.useFakeTimers();
  let visible = false;
  const timing = new TransitionTiming(
    () => performance.now(),
    () => visible,
  );
  const hidden = timing.begin("load");
  timing.received(hidden, "run", "text");
  timing.ready("run", "content-paint");
  expect(timing.snapshot()).toEqual([]);
  timing.cancel();
  visible = true;
  const load = timing.begin("load");
  timing.received(load, "run", "text");
  expect(timing.snapshot()).toEqual([]);
  timing.ready("run", "content-paint");
  expect(timing.snapshot()[0].outcome).toBe("content-paint");
});

it("separates request from presentation, ignores stale callbacks and contains no identities", () => {
  vi.useFakeTimers();
  let now = 0;
  const timing = new TransitionTiming(() => now);
  const attempt = timing.begin("command");
  now = 120;
  timing.received(attempt, "private-save-revision", "video");
  timing.ready("previous-save-revision", "video-frame");
  expect(timing.snapshot()).toEqual([]);
  now = 400;
  timing.ready("private-save-revision", "video-frame");
  timing.ready("private-save-revision", "video-frame");
  expect(timing.snapshot()).toEqual([
    {
      attempt: 1,
      operation: "command",
      storyNodeType: "video",
      outcome: "video-frame",
      requestMs: 120,
      presentationMs: 280,
      totalMs: 400,
    },
  ]);
  expect(JSON.stringify(timing.snapshot())).not.toContain("private");
  timing.snapshot()[0].totalMs = 999;
  expect(timing.snapshot()[0].totalMs).toBe(400);
  expect(vi.getTimerCount()).toBe(0);
});

it("distinguishes errors, cancellation, blocked playback and timeouts from readiness", () => {
  vi.useFakeTimers();
  const timing = new TransitionTiming();
  const old = timing.begin("load");
  const fresh = timing.begin("command");
  timing.end(old, "request-error");
  timing.received(fresh, "run", "video");
  timing.ready("run", "autoplay-blocked");
  const failure = timing.begin("command");
  timing.end(failure, "request-error");
  timing.begin("load");
  vi.advanceTimersByTime(30_000);
  expect(timing.snapshot().map((s) => s.outcome)).toEqual([
    "cancelled",
    "autoplay-blocked",
    "request-error",
    "timeout",
  ]);
  expect(timing.snapshot()[2].requestMs).toBeNull();
  expect(timing.snapshot()[3].totalMs).toBe(30_000);
});

it("bounds the buffer and recognizes already-presented revisions without waiting for another frame", () => {
  vi.useFakeTimers();
  const timing = new TransitionTiming();
  timing.ready("run", "content-paint");
  for (let i = 0; i < 60; i++) {
    const attempt = timing.begin("load");
    timing.received(attempt, "run", "text");
  }
  expect(timing.snapshot()).toHaveLength(50);
  expect(timing.snapshot()[0].attempt).toBe(11);
  expect(timing.snapshot().every((s) => s.outcome === "retained-view")).toBe(
    true,
  );
  expect(vi.getTimerCount()).toBe(0);
});
