import { describe, it, expect } from "vitest";
import {
  generationCommand,
  imageCommandProblem,
  type ImageCommand,
} from "../packages/contracts/generation";
import { cropRect } from "../apps/web/src/video-export";
describe("generation requests", () => {
  it("requires owned-asset IDs instead of client URLs and rejects extra provider controls", () => {
    const command = {
      idempotencyKey: "request-1",
      kind: "video",
      prompt: "A traveler enters the gate",
      firstId: "first",
      lastId: "last",
    };
    expect(generationCommand.safeParse(command).success).toBe(true);
    expect(
      generationCommand.safeParse({
        ...command,
        firstId: "https://attacker.test/image.png",
      }).success,
    ).toBe(false);
    expect(
      generationCommand.safeParse({ ...command, enable_safety_checker: false })
        .success,
    ).toBe(false);
    expect(
      generationCommand.safeParse({ ...command, lastId: undefined }).success,
    ).toBe(false);
  });
  it("offers two image tiers and keeps references to high quality", () => {
    const image: ImageCommand = {
      idempotencyKey: "request-2",
      kind: "image",
      prompt: "A courier under a broken lighthouse",
      quality: "high",
      aspect: "9:16",
      referenceIds: ["a", "b", "c"],
    };
    expect(generationCommand.safeParse(image).success).toBe(true);
    expect(imageCommandProblem(image)).toBeNull();
    expect(
      generationCommand.safeParse({ ...image, referenceIds: ["a", "b", "c", "d"] })
        .success,
    ).toBe(false);
    expect(generationCommand.safeParse({ ...image, aspect: "4:3" }).success).toBe(
      false,
    );
    expect(
      generationCommand.safeParse({ ...image, quality: undefined }).success,
    ).toBe(false);
    expect(imageCommandProblem({ ...image, quality: "draft" })).toBe(
      "Reference images need High quality.",
    );
  });
  it("computes portrait crop and respects framing at either edge", () => {
    const left = cropRect(1920, 1080, { aspect: "9:16", x: 0, y: 50 });
    const right = cropRect(1920, 1080, { aspect: "9:16", x: 100, y: 50 });
    expect(left.w / left.h).toBeCloseTo(9 / 16);
    expect(left.x).toBe(0);
    expect(right.x + right.w).toBe(1920);
    expect(cropRect(1920, 1080, { aspect: "original", x: 50, y: 50 })).toEqual({
      x: 0,
      y: 0,
      w: 1920,
      h: 1080,
    });
  });
});
