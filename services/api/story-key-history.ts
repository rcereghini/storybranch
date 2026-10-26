import { FieldPath } from "firebase-admin/firestore";
import { GameError } from "../../packages/contracts/index";
import type {
  StoryProgressHistory,
  StoryKeyHistory,
} from "../../packages/contracts/story-progress";
import { db } from "./firebase";

export async function storyKeyHistory(
  request: Request,
  uid: string,
  segments: string[],
  cursor: string | null,
): Promise<StoryProgressHistory | StoryKeyHistory> {
  if (request.method !== "GET")
    throw new GameError("NOT_FOUND", "Route not found.");
  const progress = db.collection(`users/${uid}/storyProgress`);
  if (segments.length === 2) {
    let query = progress.orderBy(FieldPath.documentId()).limit(20);
    if (cursor) query = query.startAfter(cursor);
    const records = await query.get();
    return {
      items: records.docs.map((record) => ({
        storyId: record.id,
        title: record.data().storyTitle ?? record.id.replaceAll("-", " "),
        completions: record.data().completions ?? 0,
      })),
      nextCursor: records.size === 20 ? records.docs.at(-1)!.id : null,
    };
  }
  if (segments.length !== 4 || segments[3] !== "keys")
    throw new GameError("NOT_FOUND", "Route not found.");
  const storyId = segments[2];
  const afterKey = new URL(request.url).searchParams.get("afterKey");
  if (
    afterKey !== null &&
    (afterKey.length > 100 ||
      !/^[a-z0-9-]+:[a-z0-9-]+$/.test(afterKey) ||
      !afterKey.startsWith(`${storyId}:`))
  )
    throw new GameError("VALIDATION_FAILED", "Invalid Story key cursor.");
  let query = progress
    .doc(storyId)
    .collection("keys")
    .orderBy(FieldPath.documentId())
    .limit(20);
  if (afterKey) query = query.startAfter(afterKey);
  const records = await query.get();
  return {
    items: records.docs.map<StoryKeyHistory["items"][number]>((record) => {
      const grant = record.data();
      return {
        keyId: record.id,
        label: grant.label,
        earnedAt: grant.at,
        versionId: grant.versionId,
        runId: grant.runId,
        source: grant.achievement ? "achievement" : "completion-count",
      };
    }),
    nextCursor: records.size === 20 ? records.docs.at(-1)!.id : null,
  };
}
