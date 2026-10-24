import { readStoryData } from "../../packages/contracts/legacy-story-format";
import { FieldPath, type DocumentData } from "firebase-admin/firestore";
import { db } from "./firebase";
import { GameError, type Save } from "../../packages/contracts/index";
import { profileUpdateSchema } from "../../packages/contracts/profile";
import {
  outlineKey,
  summarizeDashboard,
  type ActivityEvent,
  type CatalogueOutline,
  type StoryOutline,
} from "../../packages/domain/dashboard";
import { projectProfile } from "./profile-projection";
import { version } from "./story-store";
import * as paths from "./paths";

// The dashboard summarizes at most this many recent saves.
const DASHBOARD_SAVES = 100;
// Activity reads the last few story-log events of the latest saves.
const ACTIVITY_SAVES = 4;
const ACTIVITY_PER_SAVE = 4;

export async function profileRoutes(
  request: Request,
  uid: string,
  segments: string[],
  data: DocumentData,
  tokenName?: string,
) {
  if (segments.length !== 2)
    throw new GameError("NOT_FOUND", "Route not found.");
  if (segments[1] === "profile" && request.method === "POST") {
    const raw = await request.text();
    if (raw.length > 4096)
      throw new GameError("VALIDATION_FAILED", "Profile update too large.");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new GameError("VALIDATION_FAILED", "Invalid JSON.");
    }
    const parsed = profileUpdateSchema.safeParse(body);
    if (!parsed.success)
      throw new GameError(
        "VALIDATION_FAILED",
        parsed.error.issues[0]?.message ?? "Invalid profile.",
      );
    // Only presentation fields change; stats and status stay server-owned.
    // Omitted optional fields keep their stored values.
    const changes = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    );
    await db.doc(paths.user(uid)).update(changes);
    return projectProfile(uid, { ...data, ...changes }, tokenName);
  }
  if (request.method !== "GET")
    throw new GameError("NOT_FOUND", "Route not found.");
  const profile = projectProfile(uid, data, tokenName);
  if (segments[1] === "profile") return profile;

  const [savesSnapshot, catalogueSnapshot] = await Promise.all([
    db
      .collection(paths.saves(uid))
      .orderBy("updatedAt", "desc")
      .orderBy(FieldPath.documentId(), "desc")
      .limit(DASHBOARD_SAVES)
      .get(),
    db.collection("catalogue").orderBy(FieldPath.documentId()).limit(50).get(),
  ]);
  // Retired prototype saves have no storyNodeId and cannot be resumed.
  const saves = savesSnapshot.docs
    .map((d) => readStoryData<Save>(d.data()))
    .filter((s) => s.storyNodeId);
  const catalogue: CatalogueOutline[] = catalogueSnapshot.docs
    .map((d) => d.data())
    .filter((c) => c.versionId ?? c.publishedVersionId)
    .map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description ?? "",
      genre: typeof c.genre === "string" ? c.genre : "",
      duration: typeof c.duration === "string" ? c.duration : "",
      // Seeded entries name versionId; Studio publications publishedVersionId.
      versionId: c.versionId ?? c.publishedVersionId,
      hidden: c.hidden === true,
    }));

  const editions = new Map<string, [string, string]>();
  for (const s of saves)
    editions.set(outlineKey(s.storyId, s.versionId), [s.storyId, s.versionId]);
  for (const c of catalogue)
    editions.set(outlineKey(c.id, c.versionId), [c.id, c.versionId]);
  const outlines = new Map<string, StoryOutline>();
  await Promise.all(
    [...editions].map(async ([key, [storyId, versionId]]) => {
      try {
        const story = await db.runTransaction((tx) =>
          version(tx, storyId, versionId),
        );
        outlines.set(key, {
          title: story.title,
          storyNodes: Object.fromEntries(
            Object.entries(story.storyNodes).map(([storyNodeId, storyNode]) => [
              storyNodeId,
              { title: storyNode.title, kind: storyNode.kind },
            ]),
          ),
        });
      } catch {
        // An unavailable edition still lists its saves, by id.
      }
    }),
  );
  // Recent story-log entries from the most recently played saves.
  const events: ActivityEvent[] = (
    await Promise.all(
      saves.slice(0, ACTIVITY_SAVES).map(async (s) =>
        (
          await db
            .collection(paths.events(uid, s.id))
            .orderBy("at", "desc")
            .limit(ACTIVITY_PER_SAVE)
            .get()
        ).docs.map((d) => ({
          saveId: s.id,
          label: String(d.data().label ?? ""),
          at: Number(d.data().at ?? 0),
        })),
      ),
    )
  ).flat();
  return {
    profile,
    summary: summarizeDashboard(
      saves,
      outlines,
      catalogue,
      events,
      profile.favoriteGenres,
    ),
  };
}
