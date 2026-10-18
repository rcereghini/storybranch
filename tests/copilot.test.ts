import { expect, it } from "vitest";
import {
  copilotAvailable,
  copilotCommandSchema,
  copilotLimits,
  copilotRoute,
} from "../packages/contracts/copilot";

it("opens only known app pages, never play or shared pages", () => {
  for (const path of [
    "/",
    "/discover",
    "/adventures",
    "/studio",
    "/assets",
    "/assets/generate",
    "/assets/edit/clip-123",
    "/s/glass-harbor",
  ])
    expect(copilotRoute(path)).toBe(true);
  for (const path of [
    "/play/save-1",
    "/p/page/1",
    "https://example.com",
    "//example.com",
    "/studio?x=1",
    "/s/glass harbor",
    "/assets/edit/../x",
    "",
  ])
    expect(copilotRoute(path)).toBe(false);
});

it("is offered everywhere except during play and on shared pages", () => {
  expect(copilotAvailable("/studio")).toBe(true);
  expect(copilotAvailable("/s/glass-harbor")).toBe(true);
  expect(copilotAvailable("/play/save-1")).toBe(false);
  expect(copilotAvailable("/p/page/1")).toBe(false);
});

it("validates the message command", () => {
  const ok = {
    idempotencyKey: "key-1",
    text: "Where are my drafts?",
    context: { path: "/" },
  };
  expect(copilotCommandSchema.parse(ok).text).toBe("Where are my drafts?");
  expect(() =>
    copilotCommandSchema.parse({ ...ok, text: "   " }),
  ).toThrow();
  expect(() =>
    copilotCommandSchema.parse({
      ...ok,
      text: "x".repeat(copilotLimits.maxChars + 1),
    }),
  ).toThrow();
  expect(() => copilotCommandSchema.parse({ ...ok, extra: 1 })).toThrow();
});
