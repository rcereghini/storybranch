import { assistCommandSchema } from "../packages/contracts/assist";
import { describe, expect, it } from "vitest";
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
  expect(() => copilotCommandSchema.parse({ ...ok, text: "   " })).toThrow();
  expect(() =>
    copilotCommandSchema.parse({
      ...ok,
      text: "x".repeat(copilotLimits.maxChars + 1),
    }),
  ).toThrow();
  expect(() => copilotCommandSchema.parse({ ...ok, extra: 1 })).toThrow();
});

describe("Studio writing help requests", () => {
  const command = {
    idempotencyKey: "assist-1",
    action: "rewrite",
    instruction: "more suspense",
    story: { title: "The Glass Harbor", description: "" },
    page: {
      title: "Arrival",
      text: "You step off the ferry.",
      pageType: "text",
      ending: false,
      outputs: ["Continue"],
    },
    before: [],
  };
  it("accepts page context and rejects extra controls or oversized context", () => {
    expect(assistCommandSchema.safeParse(command).success).toBe(true);
    expect(
      assistCommandSchema.safeParse({ ...command, model: "other" }).success,
    ).toBe(false);
    expect(
      assistCommandSchema.safeParse({ ...command, action: "publish" }).success,
    ).toBe(false);
    expect(
      assistCommandSchema.safeParse({
        ...command,
        before: Array(4).fill({ title: "a", text: "b" }),
      }).success,
    ).toBe(false);
    expect(
      assistCommandSchema.safeParse({
        ...command,
        page: { ...command.page, text: "x".repeat(10001) },
      }).success,
    ).toBe(false);
  });
});
